package com.jayunsu22.sitenote.widget

import android.app.Application
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/*
 * 위젯을 누르면 어느 앱이 열리나.
 * 2026-09-24: 기본 브라우저(네이버 앱)로 열려서 데이터 없는 빈 현장관리가 떴고,
 * 그 빈 복사본이 백업의 팀원 명단을 덮어썼다. 늘 정해 둔 브라우저(기본 크롬)로 열어야 한다.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BrowsersTest {
    private val app get() = ApplicationProvider.getApplicationContext<Application>()
    private val naver = "com.nhn.android.search"

    private fun install(pkg: String) {
        shadowOf(app.packageManager).installPackage(PackageInfo().apply {
            packageName = pkg
            applicationInfo = ApplicationInfo().apply { packageName = pkg }
        })
    }

    /** 위젯의 PendingIntent 가 가리키는 대로 OpenActivity 를 띄우고, 그게 연 인텐트를 돌려준다 */
    private fun tap(url: String): Intent? {
        val saved = shadowOf(Widgets.viewUrl(app, url, 1)).savedIntent
        assertEquals(OpenActivity::class.java.name, saved.component?.className)
        val act = Robolectric.buildActivity(OpenActivity::class.java, saved).create().get()
        return shadowOf(act).nextStartedActivity
    }

    @Test fun 네이버가_있어도_고른게_없으면_크롬으로_연다() {
        install(Browsers.CHROME); install(naver)
        val opened = tap(Store.scheduleUrl())!!
        assertEquals(Browsers.CHROME, opened.`package`)
        assertEquals(Intent.ACTION_VIEW, opened.action)
        assertEquals(Store.scheduleUrl(), opened.dataString)
    }

    @Test fun 고른_브라우저가_있으면_그걸로() {
        install(Browsers.CHROME); install(naver)
        Browsers.choose(app, naver)
        assertEquals(naver, tap(Store.siteUrl("s1"))!!.`package`)
    }

    @Test fun 고른_브라우저를_지웠으면_크롬으로_돌아간다() {
        install(Browsers.CHROME)
        Browsers.choose(app, "gone.browser")
        assertEquals(Browsers.CHROME, Browsers.chosen(app))
    }

    @Test fun 크롬도_없고_고른것도_없으면_폰_기본_브라우저() {
        assertNull(Browsers.chosen(app))
        assertNull(tap(Store.scheduleUrl())!!.`package`)
    }

    @Test fun 현장관리_주소가_아니면_열지_않는다() {
        install(Browsers.CHROME)
        val act = Robolectric.buildActivity(OpenActivity::class.java,
            Intent(app, OpenActivity::class.java).putExtra(ScheduleWidget.EXTRA_URL, "https://evil.example/x")).create().get()
        assertNull(shadowOf(act).nextStartedActivity)
    }
}
