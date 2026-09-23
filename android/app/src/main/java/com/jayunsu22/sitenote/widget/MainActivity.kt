package com.jayunsu22.sitenote.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import java.text.SimpleDateFormat
import java.time.LocalDate
import java.util.Date
import java.util.Locale
import kotlin.concurrent.thread

/*
 * 앱 아이콘을 누르면 나오는 화면 — 설정은 백업키 하나뿐이다.
 * 키를 넣고 [저장하고 불러오기] → [홈 화면에 위젯 추가] 하면 끝.
 */
class MainActivity : Activity() {
    private lateinit var keyBox: EditText
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        keyBox = findViewById(R.id.key)
        status = findViewById(R.id.status)
        keyBox.setText(Store.key(this))

        findViewById<Button>(R.id.save).setOnClickListener { saveAndLoad() }
        findViewById<Button>(R.id.pin).setOnClickListener { pinWidget(ScheduleWidget::class.java) }
        findViewById<Button>(R.id.pinMonth).setOnClickListener { pinWidget(MonthWidget::class.java) }
        findViewById<Button>(R.id.open).setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Store.scheduleUrl())))
        }
        showStatus()
    }

    private fun saveAndLoad() {
        val k = keyBox.text.toString().trim()
        if (k.isEmpty()) { status.text = "백업키를 넣어 주세요"; return }
        Store.setKey(this, k)
        (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(keyBox.windowToken, 0)
        status.text = "불러오는 중…"
        thread {
            val r = Store.refresh(this)
            Widgets.updateAll(this)
            RefreshWorker.schedule(this)
            runOnUiThread {
                if (r is Store.Result.Fail) status.text = "⚠ ${r.message}"
                else showStatus()
            }
        }
    }

    private fun showStatus() {
        val at = Store.fetchedAt(this)
        if (at == 0L) {
            status.text = if (Store.key(this).isEmpty()) "아직 백업키를 안 넣었습니다" else "아직 불러오지 않았습니다"
            return
        }
        val board = ScheduleWidget.load(this, LocalDate.now())
        val when_ = SimpleDateFormat("M월 d일 HH:mm", Locale.KOREA).format(Date(at))
        status.text = if (board == null) "$when_ 에 받았지만 내용을 읽지 못했습니다"
        else "✓ $when_ 기준 · 현장 ${board.siteCount}개 · 앞으로 일정 ${board.rows.size}곳"
    }

    /** 안드로이드 8 이상은 버튼 한 번으로 홈 화면에 올릴 수 있다 (런처가 지원하면) */
    private fun pinWidget(provider: Class<*>) {
        val mgr = AppWidgetManager.getInstance(this)
        val ok = mgr.isRequestPinAppWidgetSupported &&
            mgr.requestPinAppWidget(ComponentName(this, provider), null, null)
        findViewById<TextView>(R.id.pinHint).visibility = if (ok) View.GONE else View.VISIBLE
    }
}
