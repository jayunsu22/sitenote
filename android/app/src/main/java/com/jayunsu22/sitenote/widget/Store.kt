package com.jayunsu22.sitenote.widget

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/*
 * 위젯이 보여줄 데이터를 폰에 들고 있는 곳.
 *
 * 웹앱 데이터는 크롬 안(localStorage)에 있어서 위젯이 직접 못 읽는다. 대신 웹앱이 자동으로
 * 올려 두는 백업(n8n → 에어테이블)을 받아 온다. 그러니 위젯은 '마지막으로 백업된 내용' 을
 * 보여준다 — 앱에서 고치면 몇 초 안에 백업되고, 위젯은 30분마다 또는 ⟳ 를 누를 때 받아 온다.
 * 받아 온 JSON 은 통째로 저장해 두고, 통신이 안 될 때는 그걸로 그린다.
 *
 * 복원용 sitenote-restore 가 아니라 위젯 전용 sitenote-schedule 을 부른다 (n8n '현장관리_위젯일정').
 * restore 는 사진 원본까지 통째로 주는데, 30분마다 받으면 사진 몇 장으로도 하루 수백 MB 가 된다.
 * schedule 은 거래처 이름과 현장 일정 칸만 준다 — 현관 비번·연락처도 폰에 남기지 않는다.
 */
object Store {
    const val APP_URL = "https://jayunsu22.github.io/sitenote/index.html"
    private const val SCHEDULE_URL = "https://primary-production-a6fa.up.railway.app/webhook/sitenote-schedule"
    private const val PREFS = "sitenote_widget"

    private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun key(c: Context): String = prefs(c).getString("key", "") ?: ""
    fun setKey(c: Context, k: String) = prefs(c).edit().putString("key", k.trim()).apply()

    fun json(c: Context): String? = prefs(c).getString("json", null)
    fun fetchedAt(c: Context): Long = prefs(c).getLong("fetchedAt", 0L)
    fun lastError(c: Context): String = prefs(c).getString("lastError", "") ?: ""

    fun siteUrl(siteId: String) = "$APP_URL#site/$siteId"
    fun scheduleUrl() = "$APP_URL#schedule"

    sealed class Result {
        data class Ok(val sites: Int) : Result()
        data class Fail(val message: String) : Result()
    }

    /** 백업을 받아 저장한다. 네트워크를 쓰므로 메인 스레드에서 부르면 안 된다 */
    fun refresh(c: Context): Result {
        val k = key(c)
        if (k.isEmpty()) return fail(c, "백업키가 없습니다")
        return try {
            val url = URL("$SCHEDULE_URL?key=" + URLEncoder.encode(k, "UTF-8"))
            val con = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 20_000
                readTimeout = 30_000
                requestMethod = "GET"
            }
            try {
                val code = con.responseCode
                if (code == 401) return fail(c, "백업키가 맞지 않습니다")
                if (code !in 200..299) return fail(c, "서버 응답 $code")
                val body = con.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
                // 모양이 이상한 응답으로 멀쩡한 저장본을 덮어쓰지 않는다
                val root = JSONObject(body)
                val sites = root.optJSONArray("sites") ?: return fail(c, "받은 내용에 현장 목록이 없습니다")
                prefs(c).edit()
                    .putString("json", body)
                    .putLong("fetchedAt", System.currentTimeMillis())
                    .putString("lastError", "")
                    .apply()
                Result.Ok(sites.length())
            } finally {
                con.disconnect()
            }
        } catch (e: java.net.UnknownHostException) {
            fail(c, "인터넷 연결이 없습니다")
        } catch (e: java.net.SocketTimeoutException) {
            fail(c, "서버가 응답하지 않습니다")
        } catch (e: Exception) {
            fail(c, "불러오기 실패: ${e.javaClass.simpleName}")
        }
    }

    private fun fail(c: Context, msg: String): Result {
        prefs(c).edit().putString("lastError", msg).apply()
        return Result.Fail(msg)
    }
}
