package com.jayunsu22.sitenote.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import java.time.LocalDate

class ScheduleWidget : AppWidgetProvider() {

    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) mgr.updateAppWidget(id, frame(ctx, id))
        mgr.notifyAppWidgetViewDataChanged(ids, R.id.list)
        RefreshWorker.schedule(ctx)
    }

    // 처음 위젯을 올렸을 때 — 저장본이 없거나 오래됐을 수 있으니 바로 한 번 받아 온다
    override fun onEnabled(ctx: Context) {
        RefreshWorker.schedule(ctx)
        RefreshWorker.now(ctx)
    }

    // 목록·달력 위젯을 다 치웠으면 30분마다 받아 오는 것도 멈춘다
    override fun onDisabled(ctx: Context) { if (!Widgets.anyPlaced(ctx)) RefreshWorker.cancel(ctx) }

    override fun onReceive(ctx: Context, intent: Intent) {
        super.onReceive(ctx, intent)
        if (intent.action == ACTION_WEEK) {
            val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return
            val d = intent.getIntExtra(Widgets.EXTRA_DELTA, 0)
            Store.setWeekOffset(ctx, id, if (d == 0) 0 else Store.weekOffset(ctx, id) + d)
            // 위쪽(머리줄·주간 띠)만 다시 그린다 — 목록까지 다시 붙이면 내려 둔 스크롤이 맨 위로 튄다
            AppWidgetManager.getInstance(ctx).partiallyUpdateAppWidget(id, frame(ctx, id, withList = false))
            return
        }
        if (intent.action == Widgets.ACTION_REFRESH) Widgets.onRefreshTapped(ctx)
    }

    companion object {
        const val ACTION_WEEK = "com.jayunsu22.sitenote.widget.WEEK"
        const val EXTRA_URL = "url"

        private val STRIPS = intArrayOf(R.drawable.strip_0, R.drawable.strip_1)
        private val SCH = intArrayOf(R.color.sch1, R.color.sch2)   // 청록 · 먹색 (앱과 같다)

        private val CELL = intArrayOf(R.id.cell0, R.id.cell1, R.id.cell2, R.id.cell3, R.id.cell4, R.id.cell5, R.id.cell6)
        private val WD = intArrayOf(R.id.wd0, R.id.wd1, R.id.wd2, R.id.wd3, R.id.wd4, R.id.wd5, R.id.wd6)
        private val DN = intArrayOf(R.id.dn0, R.id.dn1, R.id.dn2, R.id.dn3, R.id.dn4, R.id.dn5, R.id.dn6)
        private val CT = intArrayOf(R.id.ct0, R.id.ct1, R.id.ct2, R.id.ct3, R.id.ct4, R.id.ct5, R.id.ct6)

        fun updateAll(ctx: Context) {
            val mgr = AppWidgetManager.getInstance(ctx)
            val ids = mgr.getAppWidgetIds(ComponentName(ctx, ScheduleWidget::class.java))
            if (ids.isEmpty()) return
            for (id in ids) mgr.updateAppWidget(id, frame(ctx, id))
            mgr.notifyAppWidgetViewDataChanged(ids, R.id.list)
        }

        /** 저장해 둔 백업으로 오늘 기준 일정을 계산한다. 저장본이 없거나 깨졌으면 null */
        fun load(ctx: Context, today: LocalDate = LocalDate.now(), weekOffset: Int = 0): Board? {
            val json = Store.json(ctx) ?: return null
            return runCatching { build(json, today, weekOffset = weekOffset) }.getOrNull()
        }

        /** 위젯 틀: 머리줄 · 이번 주 띠 · 목록(행은 ScheduleRowsService 가 채운다) */
        fun frame(ctx: Context, widgetId: Int, given: Board? = null, withList: Boolean = true): RemoteViews {
            val v = RemoteViews(ctx.packageName, R.layout.widget_schedule)
            val off = given?.weekOffset ?: Store.weekOffset(ctx, widgetId)
            val board = given ?: load(ctx, weekOffset = off)
            val hasKey = Store.key(ctx).isNotEmpty()

            // 머리줄 — 언제 받아 온 내용인지 늘 보여준다. 위젯은 백업본이라 몇 분 늦을 수 있다
            val today0 = board?.today ?: LocalDate.now()
            val shownSun = sundayOf(today0).plusWeeks(off.toLong())
            v.setTextViewText(R.id.updated,
                // 다른 주를 볼 때는 그 주가 언제인지가 먼저다 (날짜 숫자만으로는 몇 월인지 모른다)
                if (off != 0 && !Widgets.refreshing) "${shortDate(shownSun)} – ${shortDate(shownSun.plusDays(6))}"
                else Widgets.fetchedLabel(ctx))
            v.setTextColor(R.id.updated, ctx.c(if (off != 0) R.color.text else R.color.faint))
            v.setViewVisibility(R.id.thisWeek, if (off != 0) View.VISIBLE else View.GONE)
            v.setOnClickPendingIntent(R.id.prevWeek, weekIntent(ctx, widgetId, -1))
            v.setOnClickPendingIntent(R.id.nextWeek, weekIntent(ctx, widgetId, +1))
            v.setOnClickPendingIntent(R.id.thisWeek, weekIntent(ctx, widgetId, 0))
            val err = Store.lastError(ctx)
            val notice = Widgets.notice(ctx)
            v.setTextViewText(R.id.notice, notice)
            v.setViewVisibility(R.id.notice, if (notice.isEmpty()) View.GONE else View.VISIBLE)

            // 이번 주 띠
            val today = today0
            val week = board?.week ?: (0L until 7L).map { DayCell(shownSun.plusDays(it), 0) }
            week.forEachIndexed { i, cell -> paintCell(ctx, v, i, cell, today) }

            // 누르는 곳: 제목·주간 띠 → 앱 일정 화면, ⟳ → 새로 받기
            // 키가 없으면 어디를 눌러도 이 앱 설정으로 (거기서 키를 넣는다)
            val openTop = if (hasKey) Widgets.viewUrl(ctx, Store.scheduleUrl(), 1) else Widgets.openSettings(ctx)
            v.setOnClickPendingIntent(R.id.title, openTop)
            v.setOnClickPendingIntent(R.id.week, openTop)
            v.setOnClickPendingIntent(R.id.notice, if (hasKey && err.isEmpty()) openTop else Widgets.openSettings(ctx))
            v.setOnClickPendingIntent(R.id.empty, if (hasKey) openTop else Widgets.openSettings(ctx))
            v.setOnClickPendingIntent(R.id.refresh, Widgets.refreshIntent(ctx, ScheduleWidget::class.java))

            v.setTextViewText(R.id.empty, when {
                !hasKey -> "앱을 열어 백업키를 넣어 주세요"
                board == null -> "아직 불러온 일정이 없습니다\n⟳ 를 눌러 주세요"
                else -> "앞으로 잡힌 일정이 없습니다"
            })

            if (withList) {
                // 목록: 행마다 누르면 그 현장을 앱에서 연다.
                // 안드로이드 14 부터 '바꿀 수 있는 PendingIntent' 에 암시적 인텐트를 못 쓴다 —
                // 그래서 우리 앱의 OpenActivity 를 거쳐 주소를 연다
                val svc = Intent(ctx, ScheduleRowsService::class.java)
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                svc.data = Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME))   // 위젯마다 다른 어댑터로 잡히게
                v.setRemoteAdapter(R.id.list, svc)
                v.setEmptyView(R.id.list, R.id.empty)
                v.setPendingIntentTemplate(R.id.list, PendingIntent.getActivity(
                    ctx, 2, Intent(ctx, OpenActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE))
            }
            return v
        }

        private fun paintCell(ctx: Context, v: RemoteViews, i: Int, cell: DayCell, today: LocalDate) {
            val isToday = cell.date == today
            val past = cell.date.isBefore(today)
            val wdName = weekdayOf(cell.date)
            v.setTextViewText(WD[i], wdName)
            // 1일에만 달을 붙인다 — 띠가 달을 넘어가면 '1' 이 어느 달 1일인지 모른다 (앱과 같다)
            v.setTextViewText(DN[i], withMark(ctx, if (cell.date.dayOfMonth == 1) shortDate(cell.date) else cell.date.dayOfMonth.toString(), cell.services, isToday))
            v.setInt(CELL[i], "setBackgroundResource", when {
                isToday -> R.drawable.cell_today
                cell.count > 0 && past -> R.drawable.cell_has_past
                cell.count > 0 -> R.drawable.cell_has
                else -> R.drawable.cell_none
            })
            v.setTextColor(WD[i], when {
                isToday -> ctx.c(R.color.white)
                past -> ctx.c(R.color.faint)
                wdName == "일" -> ctx.c(R.color.sun)
                wdName == "토" -> ctx.c(R.color.sat)
                else -> ctx.c(R.color.muted)
            })
            v.setTextColor(DN[i], ctx.c(if (isToday) R.color.white else if (past) R.color.faint else R.color.text))

            // 건수 배지 — 앱과 같은 규칙: 1건 파랑, 2건 이상 빨강(특별관리), 지난 날 회색,
            // 없는 날은 점선 동그라미(= 넣을 수 있는 날). 오늘 칸은 파란 바탕이라 흰 배지
            val n = cell.count
            v.setTextViewText(CT[i], if (n > 0) n.toString() else "")
            when {
                n == 0 && past -> v.setViewVisibility(CT[i], View.INVISIBLE)
                n == 0 -> {
                    v.setViewVisibility(CT[i], View.VISIBLE)
                    v.setInt(CT[i], "setBackgroundResource", R.drawable.ring)
                }
                else -> {
                    v.setViewVisibility(CT[i], View.VISIBLE)
                    v.setInt(CT[i], "setBackgroundResource", when {
                        isToday -> R.drawable.badge_white
                        past -> R.drawable.badge_gray
                        n >= 2 -> R.drawable.badge_red
                        else -> R.drawable.badge_blue
                    })
                    v.setTextColor(CT[i], when {
                        isToday -> ctx.c(if (n >= 2) R.color.danger else R.color.sat)
                        past -> ctx.c(R.color.badge_past_text)
                        else -> ctx.c(R.color.white)
                    })
                }
            }
        }

        /** 목록 한 줄. i 는 목록 차례 — 앱처럼 청록·먹색을 번갈아 쓴다. AS·추가작업은 늘 호박색.
         *  줄은 재활용되므로(reapply) 어느 종류가 바꾸는 표시든 모든 줄에서 다시 정한다 */
        fun row(ctx: Context, r: Row, i: Int): RemoteViews {
            val v = RemoteViews(ctx.packageName, R.layout.widget_row)
            val svc = r.kind != RowKind.SITE
            val ci = i % 2
            val tint = ctx.c(if (svc) R.color.svc else SCH[ci])
            v.setInt(R.id.strip, "setBackgroundResource", if (svc) R.drawable.strip_as else STRIPS[ci])
            v.setTextViewText(R.id.whenText, r.whenText)
            v.setTextViewText(R.id.span, r.spanText)
            v.setViewVisibility(R.id.span, if (r.spanText.isEmpty()) View.GONE else View.VISIBLE)
            v.setTextViewText(R.id.client, r.client)
            v.setViewVisibility(R.id.dday, if (r.dday.isEmpty()) View.GONE else View.VISIBLE)
            v.setTextViewText(R.id.dday, r.dday)
            v.setTextColor(R.id.dday, tint)

            v.setTextViewText(R.id.site, r.title)
            v.setTextColor(R.id.site, tint)

            // 인원: 이름을 늘어놓고 오른쪽에 배치 수. 아무도 없으면 이름 자리에 안내
            if (svc) {
                // AS 는 필요 인원이 없다 — 배지 없이 이름만. 아무도 없으면 '담당 미정' 빨강
                v.setTextViewText(R.id.staff, if (r.staffNames.isEmpty()) "👤 담당 미정" else "👤 " + r.staffNames.joinToString(" · "))
                v.setTextColor(R.id.staff, ctx.c(if (r.staffNames.isEmpty()) R.color.danger else R.color.staff))
                v.setViewVisibility(R.id.count, View.GONE)
                // 필름 자리에 요청 내용
                v.setTextViewText(R.id.film, if (r.request.isEmpty()) "요청 내용 없음" else r.request)
                v.setTextColor(R.id.film, ctx.c(if (r.request.isEmpty()) R.color.faint else R.color.text))
            } else {
                v.setTextViewText(R.id.staff, if (r.staffNames.isEmpty()) "👤 인원 미배정" else "👤 " + r.staffNames.joinToString(" · "))
                v.setTextColor(R.id.staff, ctx.c(if (r.staffNames.isEmpty()) R.color.faint else R.color.staff))
                v.setViewVisibility(R.id.count, View.VISIBLE)
                v.setTextViewText(R.id.count, r.staffLabel)
                v.setInt(R.id.count, "setBackgroundResource", when (r.staffState) {
                    StaffState.FULL -> R.drawable.badge_green
                    StaffState.PLAIN -> R.drawable.badge_gray
                    StaffState.SHORT, StaffState.NONE -> R.drawable.badge_red
                })
                v.setTextColor(R.id.count, ctx.c(if (r.staffState == StaffState.PLAIN) R.color.badge_plain_text else R.color.white))

                // 필름: 받았으면 초록, 3일 안인데 아직이면 빨강, 그 전엔 회색
                val film = FILM_STAGES[r.filmStage]
                v.setTextViewText(R.id.film, if (r.filmUrgent) "🎞 $film — 시공 ${dLabel(r.daysUntil)}" else "🎞 $film")
                v.setTextColor(R.id.film, when {
                    r.filmStage == FILM_STAGES.size - 1 -> ctx.c(R.color.success)
                    r.filmUrgent -> ctx.c(R.color.danger)
                    else -> ctx.c(R.color.muted)
                })
            }

            // 누르면 이 현장을 앱에서 연다 (위 setPendingIntentTemplate 에 채워 넣는다)
            v.setOnClickFillInIntent(R.id.row, Intent().putExtra(EXTRA_URL, Store.siteUrl(r.siteId)))
            return v
        }

        /** 청록·먹색 번갈이는 현장 카드끼리만 센다 — 사이에 AS 가 끼어도 앱(app.js 차례)과 같은 색이 나온다 */
        fun colorIndex(rows: List<Row>, position: Int) = rows.take(position).count { it.kind == RowKind.SITE }

        private fun dLabel(n: Int): String = when (n) { 0 -> "오늘"; 1 -> "내일"; else -> "D-$n" }

        private fun weekIntent(ctx: Context, widgetId: Int, delta: Int): PendingIntent =
            Widgets.navIntent(ctx, ScheduleWidget::class.java, ACTION_WEEK, widgetId, delta)
    }
}
