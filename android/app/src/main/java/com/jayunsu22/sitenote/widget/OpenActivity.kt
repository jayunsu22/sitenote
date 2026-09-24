package com.jayunsu22.sitenote.widget

import android.app.Activity
import android.content.ActivityNotFoundException
import android.os.Bundle
import android.widget.Toast

/*
 * 위젯을 누르면 여기를 거쳐 현장관리 주소를 연다. 화면은 없다.
 * - 정해 둔 브라우저(기본 크롬)로 연다. 기본 브라우저로 열면 폰에 따라 네이버 앱 등으로 열려
 *   데이터가 없는 빈 현장관리가 뜬다 (데이터는 브라우저마다 따로 있다) — Browsers.kt
 * - 안드로이드 14부터 위젯 목록의 '채워 넣는' PendingIntent 에는 우리 앱 안의 화면만 걸 수 있어서
 *   목록 행도 여기를 거친다.
 */
class OpenActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.getStringExtra(ScheduleWidget.EXTRA_URL)
        // 우리 앱 주소만 연다 — 다른 앱이 이 화면에 엉뚱한 주소를 넣어 보내도 따라가지 않는다
        if (url != null && url.startsWith(Store.APP_URL)) {
            try {
                Browsers.open(this, url)
            } catch (e: ActivityNotFoundException) {
                Toast.makeText(this, "주소를 열 앱이 없습니다", Toast.LENGTH_SHORT).show()
            }
        }
        finish()
    }
}
