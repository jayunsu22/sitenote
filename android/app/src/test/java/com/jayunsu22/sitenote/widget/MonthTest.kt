package com.jayunsu22.sitenote.widget

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth

// 지어낸 데이터만 쓴다 (공개 저장소)
class MonthTest {
    private val today = LocalDate.of(2026, 9, 24)

    private fun site(id: String, name: String, dates: List<String>, calRegion: String = "", address: String = "") =
        JSONObject().put("id", id).put("clientId", "c1").put("name", name)
            .put("calRegion", calRegion).put("address", address)
            .put("days", JSONArray(dates.map { JSONObject().put("date", it).put("staff", JSONArray()) }))

    private fun data(vararg s: JSONObject) = JSONObject().put("sites", JSONArray(s.toList())).toString()

    @Test fun 격자는_빈칸없이_앞뒤달로_채운다() {
        val g = monthGridFull(YearMonth.of(2026, 9))
        assertEquals(35, g.size)
        assertEquals(LocalDate.of(2026, 8, 30), g.first())
        assertEquals(listOf(30, 1, 2, 3).map { it }, g.subList(31, 35).map { it.dayOfMonth })   // 9/30 다음 10/1·2·3
        assertEquals(28, monthGridFull(YearMonth.of(2026, 2)).size)                          // 1일이 일요일인 28일 달 = 4줄
        assertEquals(42, monthGridFull(YearMonth.of(2026, 8)).size)                          // 6줄 달
    }

    @Test fun 지역은_동_먼저_없으면_구_없으면_첫낱말() {
        assertEquals("당하동", autoRegion(site("a", "인천 당하동 1084-2 그랜드비스타 2동 501호", listOf())))
        assertEquals("삼산동", autoRegion(site("a", "인천 부평구 삼산동 래미안 104동", listOf())))
        assertEquals("부평구", autoRegion(site("a", "인천 부평구 래미안 104동 901호", listOf())))
        assertEquals("군포", autoRegion(site("a", "군포 우륵아파트 704동 606호", listOf())))
        assertEquals("인천", autoRegion(site("a", "인천 도림로8 벽산블루밍 104동 901호", listOf())))
        assertEquals("", autoRegion(site("a", "룩스디자인", listOf())))
        assertEquals("", autoRegion(site("a", "테스트현장 101동 1001호", listOf())))
    }

    @Test fun 주소가_있으면_주소를_먼저_달력지역을_적었으면_그게_이긴다() {
        assertEquals("송도동", regionOf(site("a", "룩스디자인", listOf(), address = "인천 연수구 송도동 123")))
        assertEquals("인천 송도동", regionOf(site("a", "인천 도림로8 벽산블루밍", listOf(), calRegion = "인천 송도동")))
        assertEquals("당하동", regionOf(site("a", "인천 당하동 1084-2", listOf(), calRegion = "   ")))
    }

    @Test fun 날짜별_건수와_동네_같은_동네는_한번만() {
        val b = buildMonth(data(
            site("a", "인천 당하동 1084-2", listOf("2026-09-30", "2026-10-01")),
            site("b", "인천 당하동 900", listOf("2026-09-30")),
            site("c", "부평구 삼산동 자이", listOf("2026-09-30")),
            site("d", "룩스디자인", listOf("2026-09-28")),                  // 지역 없음 → 건수만
        ), today)
        val c = b.cells.associateBy { it.date }
        assertEquals(3, c[LocalDate.of(2026, 9, 30)]!!.count)
        assertEquals(listOf("당하동", "삼산동"), c[LocalDate.of(2026, 9, 30)]!!.regions)
        assertEquals(1, c[LocalDate.of(2026, 9, 28)]!!.count)
        assertTrue(c[LocalDate.of(2026, 9, 28)]!!.regions.isEmpty())
        // 앞뒤 달 칸도 일정은 보여준다
        val oct1 = c[LocalDate.of(2026, 10, 1)]!!
        assertFalse(oct1.inMonth); assertEquals(listOf("당하동"), oct1.regions)
    }

    @Test fun 이번달_건수는_그_달_날짜만_센다() {
        val b = buildMonth(data(
            site("a", "A 당하동", listOf("2026-09-30", "2026-10-01", "2026-10-02")),
            site("b", "B 삼산동", listOf("2026-08-31")),
        ), today)
        assertEquals(1, b.monthTotal)                                    // 9/30 하나 (8/31·10/1·10/2 는 격자엔 있어도 안 센다)
        val oct = buildMonth(data(site("a", "A 당하동", listOf("2026-09-30", "2026-10-01", "2026-10-02"))), today, 1)
        assertEquals(YearMonth.of(2026, 10), oct.month)
        assertEquals(2, oct.monthTotal)
        assertEquals(1, oct.monthOffset)
    }

    @Test fun 날짜_없는_줄과_깨진_날짜는_건너뛴다() {
        val s = site("a", "A 당하동", listOf("2026-09-30", "", "2026-13-40"))
        val b = buildMonth(data(s), today)
        assertEquals(1, b.cells.sumOf { it.count })
    }
}
