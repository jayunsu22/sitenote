package com.jayunsu22.sitenote.widget

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

// 실제 백업에는 현관 비번·연락처가 들어 있어서 여기엔 지어낸 데이터만 쓴다 (공개 저장소)
class ScheduleTest {
    private val today = LocalDate.of(2026, 9, 24)   // 목요일

    private fun site(
        id: String, name: String, dates: List<String>, staff: List<List<String>> = emptyList(),
        need: Any? = 0, stage: Any? = 0, client: String = "c1", createdAt: Long = 1,
    ) = JSONObject()
        .put("id", id).put("clientId", client).put("name", name).put("createdAt", createdAt)
        .put("date", dates.firstOrNull() ?: "")
        .put("needStaff", need ?: JSONObject.NULL).put("filmStage", stage ?: JSONObject.NULL)
        .put("days", JSONArray(dates.mapIndexed { i, d ->
            JSONObject().put("date", d).put("staff", JSONArray(staff.getOrElse(i) { emptyList() }))
        }))

    private fun data(vararg sites: JSONObject) = JSONObject()
        .put("clients", JSONArray(listOf(
            JSONObject().put("id", "c1").put("name", "이레토탈 인테리어"),
            JSONObject().put("id", "c2").put("name", "룩스디자인 인천"))))
        .put("sites", JSONArray(sites.toList()))
        .toString()

    @Test fun 이번주_띠는_일요일부터_7일_날짜별_현장수() {
        val b = build(data(
            site("a", "A", listOf("2026-09-24", "2026-09-25")),
            site("b", "B", listOf("2026-09-24")),
            site("c", "C", listOf("2026-10-01")),
        ), today)
        assertEquals(LocalDate.of(2026, 9, 20), b.week.first().date)
        assertEquals(LocalDate.of(2026, 9, 26), b.week.last().date)
        assertEquals(listOf(0, 0, 0, 0, 2, 1, 0), b.week.map { it.count })
        assertEquals(3, b.weekTotal)
    }

    @Test fun 다_지난_현장은_빼고_남은_첫날_순서() {
        val b = build(data(
            site("late", "늦은", listOf("2026-10-05")),
            site("past", "지난", listOf("2026-09-18", "2026-09-19")),
            site("soon", "곧", listOf("2026-09-28")),
            site("mid", "진행중", listOf("2026-09-23", "2026-09-24", "2026-09-25")),
        ), today)
        assertEquals(listOf("mid", "soon", "late"), b.rows.map { it.siteId })
    }

    @Test fun 같은_날이면_먼저_만든_현장이_위() {
        val b = build(data(
            site("new", "나중", listOf("2026-09-28"), createdAt = 20),
            site("old", "먼저", listOf("2026-09-28"), createdAt = 10),
        ), today)
        assertEquals(listOf("old", "new"), b.rows.map { it.siteId })
    }

    @Test fun 머리줄_날짜_이어진_날은_기간_떨어진_날은_남은_첫날() {
        val b = build(data(
            site("run", "이어짐", listOf("2026-09-28", "2026-09-29")),
            site("gap", "떨어짐", listOf("2026-09-28", "2026-09-29", "2026-10-07")),
            site("one", "하루", listOf("2026-09-30")),
            site("going", "진행중", listOf("2026-09-23", "2026-09-24")),
        ), today)
        val r = b.rows.associateBy { it.siteId }
        assertEquals("9/28 월 – 9/29 화", r["run"]!!.whenText); assertEquals("2일 연속", r["run"]!!.spanText)
        assertEquals("9/28 월", r["gap"]!!.whenText);           assertEquals("총 3일", r["gap"]!!.spanText)
        assertEquals("9/30 수", r["one"]!!.whenText);           assertEquals("하루", r["one"]!!.spanText)
        // 첫날이 이미 지났으면 기간이 아니라 남은 첫 날을 적는다 (앱과 같다)
        assertEquals("9/24 목", r["going"]!!.whenText);          assertEquals("오늘", r["going"]!!.dday)
    }

    @Test fun 오늘_내일_표시() {
        val b = build(data(
            site("t", "오늘", listOf("2026-09-24")),
            site("m", "내일", listOf("2026-09-25")),
            site("x", "모레", listOf("2026-09-26")),
        ), today)
        assertEquals(listOf("오늘", "내일", ""), b.rows.map { it.dday })
        assertEquals(listOf(0, 1, 2), b.rows.map { it.daysUntil })
    }

    @Test fun 인원은_남은_첫날_기준_필요인원과_견줘서() {
        val b = build(data(
            site("short", "모자람", listOf("2026-09-28", "2026-09-29"),
                 listOf(listOf("서영호", "염문철"), listOf("문승규")), need = 3),
            site("full", "채움", listOf("2026-09-28"), listOf(listOf("A", "B")), need = 2),
            site("plain", "필요인원 안정함", listOf("2026-09-28"), listOf(listOf("A"))),
            site("none", "아무도 없음", listOf("2026-09-28")),
            site("going", "어제 시작", listOf("2026-09-23", "2026-09-24"),
                 listOf(listOf("어제사람"), listOf("오늘사람"))),
        ), today)
        val r = b.rows.associateBy { it.siteId }
        assertEquals("2/3", r["short"]!!.staffLabel); assertEquals(StaffState.SHORT, r["short"]!!.staffState)
        assertEquals(listOf("서영호", "염문철"), r["short"]!!.staffNames)
        assertEquals("2/2", r["full"]!!.staffLabel);  assertEquals(StaffState.FULL, r["full"]!!.staffState)
        assertEquals("1명", r["plain"]!!.staffLabel); assertEquals(StaffState.PLAIN, r["plain"]!!.staffState)
        assertEquals("미배정", r["none"]!!.staffLabel); assertEquals(StaffState.NONE, r["none"]!!.staffState)
        // 끝난 날 인원이 아니라 오늘 올 사람
        assertEquals(listOf("오늘사람"), r["going"]!!.staffNames)
    }

    @Test fun 필름_3일_안인데_아직이면_급함_수령했으면_아님() {
        val b = build(data(
            site("u", "급함", listOf("2026-09-27"), stage = 2),      // D-3, 주문
            site("d", "받음", listOf("2026-09-25"), stage = 3),      // 내일, 수령
            site("f", "멀다", listOf("2026-09-28"), stage = 0),      // D-4
        ), today)
        val r = b.rows.associateBy { it.siteId }
        assertTrue(r["u"]!!.filmUrgent)
        assertFalse(r["d"]!!.filmUrgent)
        assertFalse(r["f"]!!.filmUrgent)
        assertEquals("필름 주문", FILM_STAGES[r["u"]!!.filmStage])
    }

    @Test fun 예전_데이터_null_값과_빈_날짜줄을_견딘다() {
        val old = site("o", "군포 세종아파트", listOf("2026-09-30"), need = null, stage = null)
        old.getJSONArray("days").put(JSONObject().put("date", "").put("staff", JSONArray()))   // 날짜 안 넣은 2일차
        val noDays = JSONObject().put("id", "n").put("clientId", "c2").put("name", "days 없음")
            .put("date", "2026-10-02")                                                          // 아주 예전: days 가 없다
        val b = build(data(old, noDays), today)
        val r = b.rows.associateBy { it.siteId }
        assertEquals("하루", r["o"]!!.spanText)             // 빈 줄은 일수에 안 센다
        assertEquals("미배정", r["o"]!!.staffLabel)
        assertEquals(0, r["o"]!!.filmStage)
        assertEquals("10/2 금", r["n"]!!.whenText)
        assertEquals("룩스디자인 인천", r["n"]!!.client)
    }

    @Test fun 제목은_예전_동호수를_이름에_없을때만_붙인다() {
        val a = JSONObject().put("name", "시대아파트").put("unit", "104동 910호").put("size", "13평")
        val b = JSONObject().put("name", "시대아파트 104동910호 13평").put("unit", "104동 910호").put("size", "13평")
        assertEquals("시대아파트 104동 910호 13평", titleLine(a))
        assertEquals("시대아파트 104동910호 13평", titleLine(b))
        assertEquals("(이름없음)", titleLine(JSONObject()))
    }

    @Test fun 요일과_일요일() {
        assertEquals("목", weekdayOf(today))
        assertEquals("일", weekdayOf(LocalDate.of(2026, 9, 20)))
        assertEquals(LocalDate.of(2026, 9, 20), sundayOf(LocalDate.of(2026, 9, 20)))
        assertEquals(LocalDate.of(2026, 9, 20), sundayOf(LocalDate.of(2026, 9, 26)))
    }
}
