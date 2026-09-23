package com.jayunsu22.sitenote.widget

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast

/*
 * 위젯 목록의 행을 누르면 여기를 거쳐 그 현장 주소를 연다. 화면은 없다.
 * 안드로이드 14부터 위젯 목록에 쓰는 '채워 넣을 수 있는' PendingIntent 에는
 * 우리 앱 안의 화면만 걸 수 있어서, 브라우저로 바로 못 보내고 한 번 거친다.
 * 현장관리를 홈 화면 앱으로 설치해 두셨으면 그 앱으로 열린다.
 */
class OpenActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.getStringExtra(ScheduleWidget.EXTRA_URL)
        // 우리 앱 주소만 연다 — 다른 앱이 이 화면에 엉뚱한 주소를 넣어 보내도 따라가지 않는다
        if (url != null && url.startsWith(Store.APP_URL)) {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (e: ActivityNotFoundException) {
                Toast.makeText(this, "주소를 열 앱이 없습니다", Toast.LENGTH_SHORT).show()
            }
        }
        finish()
    }
}
