package com.jayunsu22.sitenote.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Typeface
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.FrameLayout
import android.widget.ListView
import android.widget.TextView
import androidx.test.core.app.ApplicationProvider
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.time.LocalDate

/*
 * 에뮬레이터 없이 위젯이 실제로 어떻게 그려지는지 PNG 로 뽑는다.
 * 위젯이 쓰는 RemoteViews(frame·row)를 그대로 apply 해서 그리므로 레이아웃·색·글자가 진짜와 같다.
 * 목록만은 RemoteViewsService 대신 같은 row() 결과를 ListView 에 직접 꽂는다.
 * 평소 테스트에서는 건너뛴다 (RENDER_PREVIEW 가 있을 때만).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
class WidgetPreview {
    @Test fun render() {
        assumeTrue(System.getenv("RENDER_PREVIEW") != null)
        // 앱에 넣을 위젯 고르기 미리보기는 작게(xhdpi) 뽑는다 — APK 가 무거워지지 않게
        System.getenv("PREVIEW_DENSITY")?.let { RuntimeEnvironment.setQualifiers("+$it") }
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        val json = File(System.getenv("PREVIEW_JSON")!!).readText()
        ctx.getSharedPreferences("sitenote_widget", Context.MODE_PRIVATE).edit()
            .putString("key", "preview").putString("json", json)
            .putLong("fetchedAt", 1790202960000L)   // 2026-09-24 07:36 KST
            .commit()
        val today = LocalDate.parse(System.getenv("PREVIEW_TODAY") ?: "2026-09-24")
        val board = build(json, today)

        val host = FrameLayout(ctx)
        val frame = ScheduleWidget.frame(ctx, 1, board, withList = false).apply(ctx, host)
        val rows = board.rows.mapIndexed { i, r -> ScheduleWidget.row(ctx, r, i).apply(ctx, host) }
        frame.findViewById<ListView>(R.id.list).adapter = object : BaseAdapter() {
            override fun getCount() = rows.size
            override fun getItem(p: Int) = rows[p]
            override fun getItemId(p: Int) = p.toLong()
            override fun getView(p: Int, c: View?, parent: ViewGroup?) = rows[p]
        }
        frame.findViewById<View>(R.id.empty).visibility = if (rows.isEmpty()) View.VISIBLE else View.GONE

        // 한글 글꼴이 없는 환경이면 지정한 글꼴을 입힌다 (굵기는 그대로)
        System.getenv("PREVIEW_FONT")?.let { path ->
            val tf = Typeface.createFromFile(path)
            fun walk(v: View) {
                if (v is TextView) v.setTypeface(tf, v.typeface?.style ?: Typeface.NORMAL)
                if (v is ViewGroup) for (i in 0 until v.childCount) walk(v.getChildAt(i))
            }
            walk(frame); rows.forEach { walk(it) }
        }

        // 4×4 칸 위젯 크기쯤 (가로 360dp, 세로 460dp) 을 홈 화면 배경 위에 그린다
        val dm = ctx.resources.displayMetrics
        val w = (360 * dm.density).toInt(); val h = (460 * dm.density).toInt(); val pad = (14 * dm.density).toInt()
        frame.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY),
                      View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
        frame.layout(0, 0, w, h)
        val bare = System.getenv("PREVIEW_BG") == "none"   // 위젯 고르기 미리보기는 바탕 없이
        val m = if (bare) 0 else pad
        val bmp = Bitmap.createBitmap(w + m * 2, h + m * 2, Bitmap.Config.ARGB_8888)
        val cv = Canvas(bmp)
        if (!bare) cv.drawColor(Color.parseColor("#5b6b82"))
        cv.translate(m.toFloat(), m.toFloat())
        frame.draw(cv)
        File(System.getenv("PREVIEW_OUT") ?: "widget.png").outputStream().use {
            bmp.compress(Bitmap.CompressFormat.PNG, 100, it)
        }
    }
}
