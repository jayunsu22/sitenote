package com.jayunsu22.sitenote.widget

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService

/** 위젯 목록의 행을 채운다. 저장해 둔 백업에서 오늘 기준으로 매번 다시 계산한다 */
class ScheduleRowsService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = Factory(applicationContext)

    private class Factory(private val ctx: Context) : RemoteViewsFactory {
        private var rows: List<Row> = emptyList()

        override fun onCreate() {}
        // 자정이 지나면 '오늘' 이 바뀌므로 저장본이 그대로여도 다시 계산한다
        override fun onDataSetChanged() { rows = ScheduleWidget.load(ctx)?.rows ?: emptyList() }
        override fun onDestroy() { rows = emptyList() }
        override fun getCount() = rows.size
        override fun getViewAt(position: Int): RemoteViews? =
            rows.getOrNull(position)?.let { ScheduleWidget.row(ctx, it, position) }
        override fun getLoadingView(): RemoteViews? = null
        override fun getViewTypeCount() = 1
        override fun getItemId(position: Int) = position.toLong()
        override fun hasStableIds() = false
    }
}
