package com.jayunsu22.sitenote.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.text.SpannableString
import android.text.Spanned
import android.text.style.RelativeSizeSpan
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** colors.xml 의 색 (웹앱 style.css 와 같은 값) */
internal fun Context.c(id: Int) = getColor(id)

/** 날짜 숫자 옆에 작은 🔧 — AS·추가작업이 잡힌 날 (앱 달력의 .schcal-svc 와 같다) */
internal fun withWrench(day: String, services: Int): CharSequence {
    if (services <= 0) return day
    val t = SpannableString("$day🔧")
    t.setSpan(RelativeSizeSpan(0.72f), day.length, t.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    return t
}

/*
 * 두 위젯(현장 일정 = 목록, 현장 달력 = 월간)이 같이 쓰는 것.
 * 데이터·새로 받기는 하나다 — 어느 위젯에서 ⟳ 를 눌러도 둘 다 다시 그린다.
 */
object Widgets {
    const val ACTION_REFRESH = "com.jayunsu22.sitenote.widget.REFRESH"
    const val EXTRA_DELTA = "delta"   // 넘기기: -1 앞, +1 뒤, 0 이번 주·이번 달로

    @Volatile var refreshing = false

    fun updateAll(ctx: Context) {
        ScheduleWidget.updateAll(ctx)
        MonthWidget.updateAll(ctx)
    }

    /** 홈 화면에 위젯이 하나라도 있나 — 다 치웠을 때만 30분마다 받기를 멈춘다 */
    fun anyPlaced(ctx: Context): Boolean {
        val mgr = AppWidgetManager.getInstance(ctx)
        return listOf(ScheduleWidget::class.java, MonthWidget::class.java)
            .any { mgr.getAppWidgetIds(ComponentName(ctx, it)).isNotEmpty() }
    }

    /** ⟳ 를 눌렀을 때 — '불러오는 중…' 부터 보여 준다. 눌렀는데 아무 반응 없으면 또 누른다 */
    fun onRefreshTapped(ctx: Context) {
        refreshing = true
        updateAll(ctx)
        refreshing = false
        RefreshWorker.now(ctx)
    }

    /** '9/24 08:08 기준' — 위젯은 백업본이라 몇 분 늦을 수 있어서 언제 받은 건지 늘 보여준다 */
    fun fetchedLabel(ctx: Context): String {
        val at = Store.fetchedAt(ctx)
        return when {
            refreshing -> "불러오는 중…"
            at > 0 -> SimpleDateFormat("M/d HH:mm", Locale.KOREA).format(Date(at)) + " 기준"
            else -> ""
        }
    }

    /** 백업키 없음·불러오기 실패 알림. 없으면 "" */
    fun notice(ctx: Context): String {
        val err = Store.lastError(ctx)
        return when {
            Store.key(ctx).isEmpty() -> "앱을 열어 백업키를 넣어 주세요"
            err.isNotEmpty() && Store.fetchedAt(ctx) > 0 -> "⚠ 새로 못 받음: $err (아래는 전에 받은 내용)"
            err.isNotEmpty() -> "⚠ $err"
            else -> ""
        }
    }

    /** 현장관리 주소 열기 — OpenActivity 를 거쳐 정해 둔 브라우저(기본 크롬)로 연다.
     *  브라우저를 바꾸면 위젯을 다시 그리지 않아도 바로 그 브라우저로 열린다 (누를 때 고르므로) */
    fun viewUrl(ctx: Context, url: String, req: Int): PendingIntent =
        PendingIntent.getActivity(ctx, 100 + req,
            Intent(ctx, OpenActivity::class.java).putExtra(ScheduleWidget.EXTRA_URL, url)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    fun openSettings(ctx: Context): PendingIntent =
        PendingIntent.getActivity(ctx, 3, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    fun refreshIntent(ctx: Context, provider: Class<*>): PendingIntent =
        PendingIntent.getBroadcast(ctx, 0, Intent(ctx, provider).setAction(ACTION_REFRESH),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    /** ‹ › · '이번 주로/이번 달로'. 위젯마다, 방향마다 달라야 한다 (extra 만 다르면 같은 것으로 합쳐진다) */
    fun navIntent(ctx: Context, provider: Class<*>, action: String, widgetId: Int, delta: Int): PendingIntent =
        PendingIntent.getBroadcast(ctx, widgetId * 4 + (delta + 2),
            Intent(ctx, provider).setAction(action)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                .putExtra(EXTRA_DELTA, delta),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
}
