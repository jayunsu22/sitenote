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

/** 목록 한 줄의 종류 — 현장 / 날짜 잡힌 AS·추가작업 / AS 대기(날짜 없거나 지났는데 안 끝남) */
enum class RowKind { SITE, SERVICE, WAITING }

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
    val kind: RowKind = RowKind.SITE,
    val request: String = "",   // AS 요청 내용
    val overdue: Boolean = false, // AS 대기 중 날짜가 이미 지난 것
)

data class DayCell(val date: LocalDate, val count: Int, val services: Int = 0)   // services: 그날 AS 수 (날짜 옆 빨간 !)

data class Board(
    val today: LocalDate,
    val weekOffset: Int,        // 0 = 이번 주, 1 = 다음 주, -1 = 지난 주
    val week: List<DayCell>,    // 보고 있는 주 일~토 (앱 일정 화면 위쪽 띠와 같다)
    val weekTotal: Int,
    val rows: List<Row>,        // AS 대기 → (현장·AS 를 날짜순으로, 같은 날이면 현장 먼저)
    val siteCount: Int,
)

internal fun str(v: Any?): String = if (v == null || v == JSONObject.NULL) "" else v.toString().trim()

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

internal class DayRow(val date: LocalDate, val index: Int, val staff: List<String>)

/** share.js daysOf — days 가 비었으면 시작날짜(date) 한 줄로 본다 (예전 데이터) */
internal fun daysOf(site: JSONObject): List<DayRow> {
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

    // 날짜별 건수 — share.js dateCounts: 현장 하나가 그날 일이 있으면 1, AS 도 한 건씩
    val counts = HashMap<LocalDate, Int>()
    val svcCounts = HashMap<LocalDate, Int>()
    for (s in sites) {
        for (d in daysOf(s).map { it.date }.toSet()) counts[d] = (counts[d] ?: 0) + 1
        for (v in servicesOf(s)) v.date?.let { d ->
            counts[d] = (counts[d] ?: 0) + 1
            svcCounts[d] = (svcCounts[d] ?: 0) + 1
        }
    }

    val sun = sundayOf(today).plusWeeks(weekOffset.toLong())
    val week = (0L until 7L).map { sun.plusDays(it) }.map { DayCell(it, counts[it] ?: 0, svcCounts[it] ?: 0) }

    val byCreated = sites.sortedBy { (it.opt("createdAt") as? Number)?.toLong() ?: 0L }   // 같은 날이면 먼저 만든 것이 위
    val siteRows = byCreated.mapNotNull { s -> rowOf(s, clients, today) }
    // AS: 날짜 잡힌 것은 현장 사이에 날짜순으로 (share.js upcomingServices + app.js 끼우기와 같다)
    val svcAll = sites.flatMap { s -> servicesOf(s).map { s to it } }
    val upcoming = svcAll.filter { (_, v) -> !v.done && v.date != null && !v.date.isBefore(today) }
        .sortedWith(compareBy({ it.second.date }, { it.second.createdAt }))
        .map { (s, v) -> serviceRow(s, v, clients, today, RowKind.SERVICE) }
    // AS 대기: 지난 것 먼저(날짜순), 그다음 날짜 없는 것(접수순) — share.js waitingServices
    val waiting = svcAll.filter { (_, v) -> !v.done && (v.date == null || v.date.isBefore(today)) }
        .sortedWith(compareBy({ if (it.second.date != null) 0 else 1 }, { it.second.date }, { it.second.createdAt }))
        .map { (s, v) -> serviceRow(s, v, clients, today, RowKind.WAITING) }
    val rows = waiting + (siteRows + upcoming)
        .sortedWith(compareBy({ it.next }, { it.kind.ordinal }))            // 안정 정렬 — 같은 날이면 현장 먼저
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

/* ---------- AS·추가작업 (share.js servicesOf / serviceLabel 와 같다) ---------- */
internal class Svc(val id: String, val kind: String, val request: String, val date: LocalDate?,
                   val staff: List<String>, val done: Boolean, val createdAt: Long)

internal fun servicesOf(site: JSONObject): List<Svc> {
    val a = site.optJSONArray("services") ?: return emptyList()
    return (0 until a.length()).mapNotNull { i ->
        val v = a.optJSONObject(i) ?: return@mapNotNull null
        val id = str(v.opt("id")).ifEmpty { return@mapNotNull null }
        Svc(id, if (str(v.opt("kind")) == "추가") "추가" else "AS", str(v.opt("request")),
            isoDate(str(v.opt("date"))), strings(v.optJSONArray("staff")),
            v.optBoolean("done", false), (v.opt("createdAt") as? Number)?.toLong() ?: 0L)
    }
}

fun serviceLabel(kind: String) = if (kind == "추가") "추가작업" else "AS"

private fun serviceRow(site: JSONObject, v: Svc, clients: Map<String, String>, today: LocalDate, kind: RowKind): Row {
    val label = serviceLabel(v.kind)
    val d = v.date
    val until = if (d != null) ChronoUnit.DAYS.between(today, d).toInt() else 0
    return Row(
        siteId = str(site.opt("id")),
        title = titleLine(site),
        client = clients[str(site.opt("clientId"))] ?: "",
        dates = listOfNotNull(d),
        next = d ?: today,
        whenText = if (kind == RowKind.WAITING) "🔧 $label 대기" else "🔧 $label ${shortDate(d!!)} ${weekdayOf(d)}",
        spanText = when {
            kind != RowKind.WAITING -> ""
            d == null -> "날짜 미정"
            else -> "${shortDate(d)} 지남"
        },
        dday = if (kind == RowKind.SERVICE) when (until) { 0 -> "오늘"; 1 -> "내일"; else -> "" } else "",
        daysUntil = until,
        staffNames = v.staff,
        staffLabel = "",
        staffState = if (v.staff.isEmpty()) StaffState.NONE else StaffState.PLAIN,
        filmStage = 0,
        filmUrgent = false,
        kind = kind,
        request = v.request,
        overdue = kind == RowKind.WAITING && d != null,
    )
}
