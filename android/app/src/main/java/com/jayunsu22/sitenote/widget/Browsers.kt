package com.jayunsu22.sitenote.widget

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri

/*
 * 현장관리를 어느 브라우저로 여나 (2026-09-24).
 *
 * 현장관리 데이터는 브라우저 안에 따로따로 있다 — 크롬에서 쓰던 거래처·현장은 네이버·삼성
 * 브라우저에서 열면 안 보인다. 위젯이 '기본 브라우저로 열기' 를 하면 폰에 따라 네이버 앱으로
 * 열려서 빈 화면이 나왔고, 그 빈 복사본이 백업의 팀원 명단까지 덮어썼다.
 * 그래서 평소 쓰시는 브라우저(기본은 크롬)를 정해 두고 늘 그걸로 연다.
 */
object Browsers {
    const val CHROME = "com.android.chrome"
    private const val PREF = "browser"

    data class App(val pkg: String, val label: String)

    /** https 주소를 열 수 있는 앱들 (중복 없이, 이름순) */
    fun installed(ctx: Context): List<App> {
        val pm = ctx.packageManager
        val probe = Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")).addCategory(Intent.CATEGORY_BROWSABLE)
        return pm.queryIntentActivities(probe, PackageManager.MATCH_ALL)
            .map { App(it.activityInfo.packageName, it.loadLabel(pm).toString()) }
            .distinctBy { it.pkg }
            .filter { it.pkg != ctx.packageName }
            .sortedBy { it.label }
    }

    private fun isInstalled(ctx: Context, pkg: String) =
        runCatching { ctx.packageManager.getPackageInfo(pkg, 0); true }.getOrDefault(false)

    /** 쓸 브라우저: 고른 것 → 없으면 크롬 → 크롬도 없으면 null (폰 기본 브라우저) */
    fun chosen(ctx: Context): String? {
        val picked = ctx.getSharedPreferences("sitenote_widget", Context.MODE_PRIVATE).getString(PREF, null)
        if (picked != null && isInstalled(ctx, picked)) return picked
        return if (isInstalled(ctx, CHROME)) CHROME else null
    }

    fun choose(ctx: Context, pkg: String) =
        ctx.getSharedPreferences("sitenote_widget", Context.MODE_PRIVATE).edit().putString(PREF, pkg).apply()

    fun label(ctx: Context): String {
        val pkg = chosen(ctx) ?: return "폰 기본 브라우저"
        return runCatching {
            ctx.packageManager.getApplicationLabel(ctx.packageManager.getApplicationInfo(pkg, 0)).toString()
        }.getOrDefault(pkg)
    }

    /** 정해 둔 브라우저로 연다. 그 브라우저가 못 열면 폰 기본 브라우저로 */
    fun open(ctx: Context, url: String) {
        val i = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        chosen(ctx)?.let { i.setPackage(it) }
        try {
            ctx.startActivity(i)
        } catch (e: ActivityNotFoundException) {
            ctx.startActivity(i.setPackage(null))
        }
    }
}
