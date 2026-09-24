package com.jayunsu22.sitenote.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import java.time.DayOfWeek
import java.time.LocalDate

/*
 * 현장 달력 위젯 — 앱 일정 화면의 월간 '지역 보기' 를 홈 화면에.
 * 새 일·AS 를 잡을 때 빈 날(점선 동그라미)과 그날 가 있는 동네를 보고 고른다.
 * 칸 규칙은 app.js calCell 과 같다:
 *   동네가 있으면 두 줄까지 이름 (셋 이상이면 둘째 줄에 '+N'), 동네가 갈리는 날은 빨강
 *   일은 있는데 현장명에 지역이 없으면 건수 배지 (빈 동그라미를 띄우면 '일 없는 날' 로 읽힌다)
 *   일 없는 앞날은 점선 동그라미, 지난 날은 흐리게, 앞뒤 달 날짜는 숫자만 흐리게
 */
class MonthWidget : AppWidgetProvider() {

    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) mgr.updateAppWidget(id, frame(ctx, id))
        RefreshWorker.schedule(ctx)
    }

    override fun onEnabled(ctx: Context) {
        RefreshWorker.schedule(ctx)
        RefreshWorker.now(ctx)
    }

    override fun onDisabled(ctx: Context) { if (!Widgets.anyPlaced(ctx)) RefreshWorker.cancel(ctx) }

    override fun onReceive(ctx: Context, intent: Intent) {
        super.onReceive(ctx, intent)
        when (intent.action) {
            ACTION_MONTH -> {
                val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
                if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return
                val d = intent.getIntExtra(Widgets.EXTRA_DELTA, 0)
                Store.setMonthOffset(ctx, id, if (d == 0) 0 else Store.monthOffset(ctx, id) + d)
                AppWidgetManager.getInstance(ctx).updateAppWidget(id, frame(ctx, id))
            }
            Widgets.ACTION_REFRESH -> Widgets.onRefreshTapped(ctx)
        }
    }

    companion object {
        const val ACTION_MONTH = "com.jayunsu22.sitenote.widget.MONTH"
        // 칸 42개(6줄×7칸)의 id — 칸 / 날짜 / 동네 첫줄 / 둘째줄 / 건수·동그라미
        private val MC = intArrayOf(
            R.id.mc0, R.id.mc1, R.id.mc2, R.id.mc3, R.id.mc4, R.id.mc5, R.id.mc6,
            R.id.mc7, R.id.mc8, R.id.mc9, R.id.mc10, R.id.mc11, R.id.mc12, R.id.mc13,
            R.id.mc14, R.id.mc15, R.id.mc16, R.id.mc17, R.id.mc18, R.id.mc19, R.id.mc20,
            R.id.mc21, R.id.mc22, R.id.mc23, R.id.mc24, R.id.mc25, R.id.mc26, R.id.mc27,
            R.id.mc28, R.id.mc29, R.id.mc30, R.id.mc31, R.id.mc32, R.id.mc33, R.id.mc34,
            R.id.mc35, R.id.mc36, R.id.mc37, R.id.mc38, R.id.mc39, R.id.mc40, R.id.mc41)
        private val MD = intArrayOf(
            R.id.md0, R.id.md1, R.id.md2, R.id.md3, R.id.md4, R.id.md5, R.id.md6,
            R.id.md7, R.id.md8, R.id.md9, R.id.md10, R.id.md11, R.id.md12, R.id.md13,
            R.id.md14, R.id.md15, R.id.md16, R.id.md17, R.id.md18, R.id.md19, R.id.md20,
            R.id.md21, R.id.md22, R.id.md23, R.id.md24, R.id.md25, R.id.md26, R.id.md27,
            R.id.md28, R.id.md29, R.id.md30, R.id.md31, R.id.md32, R.id.md33, R.id.md34,
            R.id.md35, R.id.md36, R.id.md37, R.id.md38, R.id.md39, R.id.md40, R.id.md41)
        private val MA = intArrayOf(
            R.id.ma0, R.id.ma1, R.id.ma2, R.id.ma3, R.id.ma4, R.id.ma5, R.id.ma6,
            R.id.ma7, R.id.ma8, R.id.ma9, R.id.ma10, R.id.ma11, R.id.ma12, R.id.ma13,
            R.id.ma14, R.id.ma15, R.id.ma16, R.id.ma17, R.id.ma18, R.id.ma19, R.id.ma20,
            R.id.ma21, R.id.ma22, R.id.ma23, R.id.ma24, R.id.ma25, R.id.ma26, R.id.ma27,
            R.id.ma28, R.id.ma29, R.id.ma30, R.id.ma31, R.id.ma32, R.id.ma33, R.id.ma34,
            R.id.ma35, R.id.ma36, R.id.ma37, R.id.ma38, R.id.ma39, R.id.ma40, R.id.ma41)
        private val MB = intArrayOf(
            R.id.mb0, R.id.mb1, R.id.mb2, R.id.mb3, R.id.mb4, R.id.mb5, R.id.mb6,
            R.id.mb7, R.id.mb8, R.id.mb9, R.id.mb10, R.id.mb11, R.id.mb12, R.id.mb13,
            R.id.mb14, R.id.mb15, R.id.mb16, R.id.mb17, R.id.mb18, R.id.mb19, R.id.mb20,
            R.id.mb21, R.id.mb22, R.id.mb23, R.id.mb24, R.id.mb25, R.id.mb26, R.id.mb27,
            R.id.mb28, R.id.mb29, R.id.mb30, R.id.mb31, R.id.mb32, R.id.mb33, R.id.mb34,
            R.id.mb35, R.id.mb36, R.id.mb37, R.id.mb38, R.id.mb39, R.id.mb40, R.id.mb41)
        private val MK = intArrayOf(
            R.id.mk0, R.id.mk1, R.id.mk2, R.id.mk3, R.id.mk4, R.id.mk5, R.id.mk6,
            R.id.mk7, R.id.mk8, R.id.mk9, R.id.mk10, R.id.mk11, R.id.mk12, R.id.mk13,
            R.id.mk14, R.id.mk15, R.id.mk16, R.id.mk17, R.id.mk18, R.id.mk19, R.id.mk20,
            R.id.mk21, R.id.mk22, R.id.mk23, R.id.mk24, R.id.mk25, R.id.mk26, R.id.mk27,
            R.id.mk28, R.id.mk29, R.id.mk30, R.id.mk31, R.id.mk32, R.id.mk33, R.id.mk34,
            R.id.mk35, R.id.mk36, R.id.mk37, R.id.mk38, R.id.mk39, R.id.mk40, R.id.mk41)
        private val ROWS = intArrayOf(R.id.mrow0, R.id.mrow1, R.id.mrow2, R.id.mrow3, R.id.mrow4, R.id.mrow5)

        fun updateAll(ctx: Context) {
            val mgr = AppWidgetManager.getInstance(ctx)
            val ids = mgr.getAppWidgetIds(ComponentName(ctx, MonthWidget::class.java))
            for (id in ids) mgr.updateAppWidget(id, frame(ctx, id))
        }

        fun load(ctx: Context, today: LocalDate = LocalDate.now(), monthOffset: Int = 0): MonthBoard {
            val json = Store.json(ctx)
            // 받은 게 없어도 빈 달력은 그린다 (날짜는 보여야 한다)
            return json?.let { runCatching { buildMonth(it, today, monthOffset) }.getOrNull() }
                ?: buildMonth("""{"sites":[]}""", today, monthOffset)
        }

        fun frame(ctx: Context, widgetId: Int, given: MonthBoard? = null): RemoteViews {
            val v = RemoteViews(ctx.packageName, R.layout.widget_month)
            val off = given?.monthOffset ?: Store.monthOffset(ctx, widgetId)
            val b = given ?: load(ctx, monthOffset = off)
            val hasKey = Store.key(ctx).isNotEmpty()

            v.setTextViewText(R.id.mTitle, "${b.month.year}년 ${b.month.monthValue}월")
            v.setTextViewText(R.id.mSum, "이번 달 ${b.monthTotal}건")
            v.setViewVisibility(R.id.mThis, if (off != 0) View.VISIBLE else View.GONE)
            v.setTextViewText(R.id.mUpdated, Widgets.fetchedLabel(ctx))
            val notice = Widgets.notice(ctx)
            v.setTextViewText(R.id.mNotice, notice)
            v.setViewVisibility(R.id.mNotice, if (notice.isEmpty()) View.GONE else View.VISIBLE)

            b.cells.forEachIndexed { i, c -> paint(ctx, v, MC[i], MD[i], MA[i], MB[i], MK[i], c, b.today) }
            // 5줄인 달은 마지막 줄을, 4줄인 달(1일이 일요일인 2월)은 두 줄을 숨긴다
            val rows = b.cells.size / 7
            ROWS.forEachIndexed { r, id -> v.setViewVisibility(id, if (r < rows) View.VISIBLE else View.GONE) }

            // 누르는 곳: 달력·제목 → 앱 일정 화면, ‹ › → 달 넘기기, ⟳ → 새로 받기
            val open = if (hasKey) Widgets.viewUrl(ctx, Store.scheduleUrl(), 1) else Widgets.openSettings(ctx)
            v.setOnClickPendingIntent(R.id.mTitle, open)
            v.setOnClickPendingIntent(R.id.mGrid, open)
            v.setOnClickPendingIntent(R.id.mNotice, if (hasKey && Store.lastError(ctx).isEmpty()) open else Widgets.openSettings(ctx))
            v.setOnClickPendingIntent(R.id.mPrev, Widgets.navIntent(ctx, MonthWidget::class.java, ACTION_MONTH, widgetId, -1))
            v.setOnClickPendingIntent(R.id.mNext, Widgets.navIntent(ctx, MonthWidget::class.java, ACTION_MONTH, widgetId, +1))
            v.setOnClickPendingIntent(R.id.mThis, Widgets.navIntent(ctx, MonthWidget::class.java, ACTION_MONTH, widgetId, 0))
            v.setOnClickPendingIntent(R.id.mRefresh, Widgets.refreshIntent(ctx, MonthWidget::class.java))
            return v
        }

        private fun paint(ctx: Context, v: RemoteViews, cellId: Int, dayId: Int, aId: Int, bId: Int, kId: Int,
                          c: MonthCell, today: LocalDate) {
            val isToday = c.date == today
            val past = c.date.isBefore(today)
            val sun = c.date.dayOfWeek == DayOfWeek.SUNDAY

            v.setTextViewText(dayId, withMark(ctx, c.date.dayOfMonth.toString(), c.services, isToday))
            v.setTextColor(dayId, ctx.c(when {
                isToday -> R.color.white
                !c.inMonth -> R.color.out                     // 앞뒤 달 — 숫자만 흐리게
                past -> if (sun) R.color.sun_past else R.color.faint
                sun -> R.color.sun
                else -> R.color.text
            }))
            v.setInt(cellId, "setBackgroundResource", when {
                isToday -> R.drawable.cell_today
                c.count > 0 && past -> R.drawable.cell_has_past
                c.count > 0 -> R.drawable.cell_has
                else -> R.drawable.cell_none
            })

            val rg = c.regions
            if (rg.isNotEmpty()) {
                // 동네 이름: 하나면 두 줄까지 늘려 쓰고, 둘이면 한 줄씩, 셋 이상이면 둘째 줄에 +N
                val color = ctx.c(when {
                    isToday -> R.color.white
                    past -> R.color.faint
                    rg.size > 1 -> R.color.danger              // 하루에 동네가 갈리는 날
                    else -> R.color.sat
                })
                v.setViewVisibility(aId, View.VISIBLE)
                v.setTextViewText(aId, rg[0])
                v.setInt(aId, "setMaxLines", if (rg.size == 1) 2 else 1)
                v.setTextColor(aId, color)
                if (rg.size > 1) {
                    v.setViewVisibility(bId, View.VISIBLE)
                    v.setTextViewText(bId, if (rg.size > 2) "${rg[1]}+${rg.size - 2}" else rg[1])
                    v.setTextColor(bId, color)
                } else v.setViewVisibility(bId, View.GONE)
                v.setViewVisibility(kId, View.GONE)
                return
            }
            v.setViewVisibility(aId, View.GONE)
            v.setViewVisibility(bId, View.GONE)
            val n = c.count
            when {
                n == 0 && past -> v.setViewVisibility(kId, View.INVISIBLE)
                n == 0 -> {                                       // 일 없는 앞날 = 넣을 수 있는 날
                    v.setViewVisibility(kId, View.VISIBLE)
                    v.setTextViewText(kId, "")
                    v.setInt(kId, "setBackgroundResource", R.drawable.ring)
                }
                else -> {                                         // 일은 있는데 지역을 모르는 날
                    v.setViewVisibility(kId, View.VISIBLE)
                    v.setTextViewText(kId, n.toString())
                    v.setInt(kId, "setBackgroundResource", when {
                        isToday -> R.drawable.badge_white
                        past -> R.drawable.badge_gray
                        n >= 2 -> R.drawable.badge_red
                        else -> R.drawable.badge_blue
                    })
                    v.setTextColor(kId, ctx.c(when {
                        isToday -> if (n >= 2) R.color.danger else R.color.sat
                        past -> R.color.badge_past_text
                        else -> R.color.white
                    }))
                }
            }
        }
    }
}
