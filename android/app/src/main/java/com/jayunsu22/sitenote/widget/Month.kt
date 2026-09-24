package com.jayunsu22.sitenote.widget

import org.json.JSONObject
import java.time.LocalDate
import java.time.YearMonth

/*
 * 월간 달력 위젯의 계산 — 웹앱 일정 화면의 월간 '지역 보기' 규칙을 옮긴 것
 * (share.js autoRegion / regionOf / dateRegions / monthGridFull, app.js calCell).
 * 새 일·AS 를 잡을 때 '빈 날' 과 '그날 어느 동네에 가 있나' 를 한눈에 보려는 달력이다.
 * 규칙을 바꿀 때는 웹앱과 같이 바꾼다.
 */

data class MonthCell(
    val date: LocalDate,
    val inMonth: Boolean,       // 앞뒤 달 날짜면 false (숫자만 흐리게, 일정 표시는 그대로)
    val count: Int,             // 그날 일 수 (현장 + AS·추가작업)
    val regions: List<String>,  // 그날 동네 (같은 동네는 한 번만, 적힌 순)
    val services: Int = 0,      // 그중 AS·추가작업 수 — 날짜 옆에 🔧
)

data class MonthBoard(
    val today: LocalDate,
    val month: YearMonth,
    val monthOffset: Int,       // 0 = 이번 달
    val cells: List<MonthCell>, // 일요일부터, 빈 칸 없이 앞뒤 달로 채운 격자 (4~6줄)
    val monthTotal: Int,        // 그 달 날짜에 잡힌 건수 (앞뒤 달 칸은 안 센다 — 앱과 같다)
)

private val 동읍면 = Regex("""^[가-힣]{1,5}(동|읍|면|리)$""")   // 가장 좁은 단위 - AS 묶기에 제일 쓸모 있다
private val 시군구 = Regex("""^[가-힣]{1,5}(시|군|구)$""")

/** 현장명·주소에서 뽑은 지역. '104동' 같은 건물 동은 한글만 받으므로 저절로 빠진다 */
fun autoRegion(site: JSONObject): String {
    val src = str(site.opt("address")).ifEmpty { str(site.opt("name")) }
    val ts = src.split(Regex("""\s+""")).filter { it.isNotEmpty() }
    ts.firstOrNull { 동읍면.matches(it) }?.let { return it }
    ts.firstOrNull { 시군구.matches(it) }?.let { return it }
    // 꼬리가 없으면 첫 낱말이 지역 ('청라 호반 베르디움'). 낱말이 하나뿐이면 상호일 뿐이다 ('룩스디자인')
    if (ts.size >= 2 && Regex("""^[가-힣]{2,4}$""").matches(ts[0])) return ts[0]
    return ""
}

/** 달력에 뜰 지역 — 앱의 '달력지역' 칸에 직접 적은 게 있으면 그것 */
fun regionOf(site: JSONObject): String = str(site.opt("calRegion")).ifEmpty { autoRegion(site) }

/** 빈 칸 없이 앞뒤 달 날짜로 채운 격자 — 9/30 이 수요일이면 그 줄 끝에 10/1·2·3 이 온다 */
fun monthGridFull(ym: YearMonth): List<LocalDate> {
    val first = ym.atDay(1)
    val lead = first.dayOfWeek.value % 7           // 일요일 = 0
    val cells = (lead + ym.lengthOfMonth() + 6) / 7 * 7
    return (0 until cells).map { first.minusDays(lead.toLong()).plusDays(it.toLong()) }
}

fun buildMonth(json: String, today: LocalDate, monthOffset: Int = 0): MonthBoard {
    val root = JSONObject(json)
    val sites = root.optJSONArray("sites")?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it) } }
        ?: emptyList()

    val counts = HashMap<LocalDate, Int>()
    val svcCounts = HashMap<LocalDate, Int>()
    val regions = LinkedHashMap<LocalDate, MutableList<String>>()
    for (s in sites) {                              // 백업에 적힌 순서 그대로 — 앱과 같은 순서로 동네가 나온다
        val dates = daysOf(s).map { it.date }.toSet()   // 날짜 없는 줄은 daysOf 가 버린다
        for (d in dates) counts[d] = (counts[d] ?: 0) + 1
        // AS·추가작업도 그날 잡힌 일이다 (share.js dateCounts / dateServices) — 끝난 것도 센다, 앱과 같다
        val svcDates = servicesOf(s).mapNotNull { it.date }
        for (d in svcDates) {
            counts[d] = (counts[d] ?: 0) + 1
            svcCounts[d] = (svcCounts[d] ?: 0) + 1
        }
        val r = regionOf(s)
        if (r.isEmpty()) continue
        for (d in dates + svcDates) {               // AS 도 그 현장 동네로 가는 일이다
            val list = regions.getOrPut(d) { mutableListOf() }
            if (r !in list) list.add(r)
        }
    }

    val ym = YearMonth.from(today).plusMonths(monthOffset.toLong())
    val cells = monthGridFull(ym).map { d ->
        MonthCell(d, YearMonth.from(d) == ym, counts[d] ?: 0, regions[d] ?: emptyList(), svcCounts[d] ?: 0)
    }
    val total = counts.entries.sumOf { (d, n) -> if (YearMonth.from(d) == ym) n else 0 }
    return MonthBoard(today, ym, monthOffset, cells, total)
}
