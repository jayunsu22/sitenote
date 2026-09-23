package com.jayunsu22.sitenote.widget

import org.json.JSONArray
import org.json.JSONObject
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/*
 * 일정 계산 — 현장관리 웹앱(share.js / app.js)의 일정 화면 규칙을 그대로 옮긴 것.
 * 위젯과 앱이 다르게 보이면 어느 쪽을 믿어야 할지 모르게 되므로, 규칙을 바꿀 때는
 * 양쪽을 같이 바꾼다. 화면(안드로이드)에 기대지 않아서 JVM 단위 테스트로 검증한다.
 *
 * 입력은 백업 서버(sitenote-restore)가 돌려주는 JSON 그대로다:
 *   { clients: [{id, name, …}], sites: [{id, clientId, name, days:[{date, staff}], needStaff, filmStage, …}], … }
 */

val WEEKDAYS = listOf("일", "월", "화", "수", "목", "금", "토")
val FILM_STAGES = listOf("필름 미확정", "필름 확정", "필름 주문", "필름 수령")
const val URGENT_DAYS = 3   // 시공일이 3일 안이면 '급함' (share.js 의 URGENT_DAYS 와 같다)

fun weekdayOf(d: LocalDate): String = WEEKDAYS[d.dayOfWeek.value % 7]   // 월=1 … 일=7 → 일=0
fun shortDate(d: LocalDate): String = "${d.monthValue}/${d.dayOfMonth}"
fun sundayOf(d: LocalDate): LocalDate =
    if (d.dayOfWeek == DayOfWeek.SUNDAY) d else d.minusDays(d.dayOfWeek.value.toLong())

/** 인원 배치 상태 — 배지 색을 정한다 (앱의 staffCountBadge 와 같은 뜻) */
enum class StaffState { NONE, SHORT, FULL, PLAIN }

data class Row(
    val siteId: String,
    val title: String,
    val client: String,
    val dates: List<LocalDate>,
    val next: LocalDate,
    val whenText: String,       // '9/28 월 – 9/29 화' 또는 '10/7 수'
    val spanText: String,       // '하루' / '2일 연속' / '총 3일'
    val dday: String,           // '오늘' / '내일' / ''
    val daysUntil: Int,         // 남은 첫 날까지 며칠 (오늘 = 0)
    val staffNames: List<String>,
    val staffLabel: String,     // '4/10' / '2명' / '미배정'
    val staffState: StaffState,
    val filmStage: Int,
    val filmUrgent: Boolean,    // 3일 안인데 필름이 아직 안 왔다
)

data class DayCell(val date: LocalDate, val count: Int)

data class Board(
    val today: LocalDate,
    val weekOffset: Int,        // 0 = 이번 주, 1 = 다음 주, -1 = 지난 주
    val week: List<DayCell>,    // 보고 있는 주 일~토 (앱 일정 화면 위쪽 띠와 같다)
    val weekTotal: Int,
    val rows: List<Row>,        // 오늘 이후로 남은 날이 있는 현장, 남은 첫 날 순
    val siteCount: Int,
)

private fun str(v: Any?): String = if (v == null || v == JSONObject.NULL) "" else v.toString().trim()

private fun isoDate(s: String): LocalDate? =
    if (Regex("""^\d{4}-\d{2}-\d{2}$""").matches(s)) runCatching { LocalDate.parse(s) }.getOrNull() else null

private fun intOf(v: Any?): Int = when (v) {
    is Number -> v.toInt()
    else -> str(v).toIntOrNull() ?: 0
}

private fun strings(a: JSONArray?): List<String> {
    if (a == null) return emptyList()
    return (0 until a.length()).map { str(a.opt(it)) }.filter { it.isNotEmpty() }
}

/** share.js titleLine — 현장명 + (예전 데이터의) 동호수·평형. 이름에 이미 있으면 다시 안 붙인다 */
fun titleLine(site: JSONObject): String {
    val name = str(site.opt("name"))
    val squash = { s: String -> s.replace(Regex("""\s+"""), "") }
    val parts = mutableListOf(name)
    for (v in listOf(str(site.opt("unit")), str(site.opt("size")))) {
        if (v.isNotEmpty() && !squash(name).contains(squash(v))) parts.add(v)
    }
    val t = parts.filter { it.isNotEmpty() }.joinToString(" ")
    return t.ifEmpty { "(이름없음)" }
}

private class DayRow(val date: LocalDate, val index: Int, val staff: List<String>)

/** share.js daysOf — days 가 비었으면 시작날짜(date) 한 줄로 본다 (예전 데이터) */
private fun daysOf(site: JSONObject): List<DayRow> {
    val arr = site.optJSONArray("days")
    val raw = if (arr != null && arr.length() > 0)
        (0 until arr.length()).map { arr.optJSONObject(it) ?: JSONObject() }
    else listOf(JSONObject().put("date", str(site.opt("date"))))
    return raw.mapIndexedNotNull { i, d ->
        val date = isoDate(str(d.opt("date"))) ?: return@mapIndexedNotNull null   // 날짜 없는 줄은 버린다
        DayRow(date, i, strings(d.optJSONArray("staff")))
    }.sortedWith(compareBy({ it.date }, { it.index }))
}

/** weekOffset 은 위쪽 띠만 옮긴다. 아래 목록은 늘 '오늘부터 남은 현장' — 앱과 같다 */
fun build(json: String, today: LocalDate, maxRows: Int = 40, weekOffset: Int = 0): Board {
    val root = JSONObject(json)
    val clients = HashMap<String, String>()
    root.optJSONArray("clients")?.let { a ->
        for (i in 0 until a.length()) {
            val c = a.optJSONObject(i) ?: continue
            clients[str(c.opt("id"))] = str(c.opt("name"))
        }
    }
    val sites = root.optJSONArray("sites")?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it) } }
        ?: emptyList()

    // 날짜별 건수 — share.js dateCounts: 현장 하나가 그날 일이 있으면 1
    val counts = HashMap<LocalDate, Int>()
    for (s in sites) for (d in daysOf(s).map { it.date }.toSet()) counts[d] = (counts[d] ?: 0) + 1

    val sun = sundayOf(today).plusWeeks(weekOffset.toLong())
    val week = (0L until 7L).map { sun.plusDays(it) }.map { DayCell(it, counts[it] ?: 0) }

    val rows = sites
        .sortedBy { (it.opt("createdAt") as? Number)?.toLong() ?: 0L }   // 같은 날이면 먼저 만든 현장이 위
        .mapNotNull { s -> rowOf(s, clients, today) }
        .sortedBy { it.next }                                            // 안정 정렬 — 위 순서가 유지된다
        .take(maxRows)

    return Board(today, weekOffset, week, week.sumOf { it.count }, rows, sites.size)
}

private fun rowOf(site: JSONObject, clients: Map<String, String>, today: LocalDate): Row? {
    val days = daysOf(site)
    if (days.isEmpty()) return null
    val dates = days.map { it.date }
    val nextAt = dates.indexOfFirst { !it.isBefore(today) }
    if (nextAt < 0) return null                                   // 다 지난 현장은 위젯에 안 싣는다
    val next = dates[nextAt]
    val start = dates.first(); val end = dates.last()
    val multi = dates.size > 1
    val consecutive = dates.zipWithNext().all { (a, b) -> a.plusDays(1) == b }

    // app.js renderRunCard: 아직 하루도 안 지났고 날이 이어진 때만 기간으로 적는다
    val whenText = if (multi && consecutive && next == start)
        "${shortDate(start)} ${weekdayOf(start)} – ${shortDate(end)} ${weekdayOf(end)}"
    else "${shortDate(next)} ${weekdayOf(next)}"
    val spanText = if (!multi) "하루" else if (consecutive) "${dates.size}일 연속" else "총 ${dates.size}일"
    val until = ChronoUnit.DAYS.between(today, next).toInt()
    val dday = when (until) { 0 -> "오늘"; 1 -> "내일"; else -> "" }

    // 인원 줄은 '남은 첫 날' 기준 — 끝난 날 인원을 보여주면 다음에 부를 사람과 헷갈린다
    val names = days[nextAt].staff
    val need = intOf(site.opt("needStaff")).coerceIn(0, 99)
    val have = names.size
    val (label, state) = when {
        need > 0 && have >= need -> "$have/$need" to StaffState.FULL
        need > 0 -> "$have/$need" to StaffState.SHORT
        have > 0 -> "${have}명" to StaffState.PLAIN
        else -> "미배정" to StaffState.NONE
    }

    val stage = intOf(site.opt("filmStage")).let { if (it in FILM_STAGES.indices) it else 0 }
    val urgent = stage < FILM_STAGES.size - 1 && until <= URGENT_DAYS

    return Row(
        siteId = str(site.opt("id")),
        title = titleLine(site),
        client = clients[str(site.opt("clientId"))] ?: "",
        dates = dates, next = next,
        whenText = whenText, spanText = spanText, dday = dday, daysUntil = until,
        staffNames = names, staffLabel = label, staffState = state,
        filmStage = stage, filmUrgent = urgent,
    )
}
