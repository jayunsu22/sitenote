package com.jayunsu22.sitenote.widget

import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.time.LocalDate

/*
 * 실제 백업으로 웹앱(share.js)과 결과가 같은지 견줄 때만 쓴다. 평소에는 건너뛴다.
 * 실제 백업에는 현관 비번·연락처가 있으니 파일을 저장소에 넣지 말 것.
 *   SITENOTE_REAL_JSON=백업.json SITENOTE_TODAY=2026-09-24 SITENOTE_DUMP=out.tsv gradle :app:testReleaseUnitTest
 */
class RealDataDump {
    @Test fun dump() {
        val src = System.getenv("SITENOTE_REAL_JSON")
        assumeTrue(src != null && File(src).exists())
        val today = LocalDate.parse(System.getenv("SITENOTE_TODAY") ?: LocalDate.now().toString())
        val b = build(File(src!!).readText(), today, maxRows = 999)
        val out = StringBuilder()
        out.append("WEEK\t").append(b.week.joinToString(",") { "${it.date}=${it.count}" }).append('\n')
        for (r in b.rows) out.append(listOf(r.siteId, r.next, r.dates.joinToString(","), r.staffLabel,
            r.whenText, r.spanText, r.filmStage, r.client).joinToString("\t")).append('\n')
        // 달력: 이번 달·다음 달 칸마다 건수와 동네 (share.js dateCounts / dateRegions / monthGridFull 과 견준다)
        for (off in 0..1) {
            val m = buildMonth(File(src).readText(), today, off)
            out.append("MONTH\t${m.month}\t${m.monthTotal}\n")
            for (c in m.cells) out.append("${c.date}\t${if (c.inMonth) 1 else 0}\t${c.count}\t${c.regions.joinToString("|")}\n")
        }
        File(System.getenv("SITENOTE_DUMP") ?: "dump.tsv").writeText(out.toString())
    }
}
