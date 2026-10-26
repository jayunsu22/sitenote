// 정산 내역 회차 (share.js settleRounds)
const assert = require('assert');
const Share = require('../share.js');
const A = ['방1 안방문+틀', '방1 안방샤시'];
const r = Share.settleRounds([
  { 코드: 'Z7', 발행일시: '2026-10-01T04:22:31Z', 총액: 3130000, 품목: A },
  { 코드: 'A6', 발행일시: '2026-10-06T07:00:31Z', 총액: 3130000, 품목: A },          // 같은 견적 다시 발행 → 앞 것 대체
  { 코드: 'B1', 발행일시: '2026-10-20T07:00:31Z', 총액: 800000, 품목: ['거실 아트월'], 추가작업: [{ 품목명: '방2문+틀 AS' }] },   // 다른 날 다른 일 → 2회차
], { A6: '2026-10-07' });
assert.deepStrictEqual(r.rows.map((x) => [x.코드, x.대체, x.입금]), [['Z7', 'A6', ''], ['A6', '', '2026-10-07'], ['B1', '', '']]);
assert.strictEqual(r.회차, 2);
assert.strictEqual(r.합계, 3930000);
assert.strictEqual(r.받은, 3130000);
assert.strictEqual(r.남은, 800000);
assert.strictEqual(Share.settleRounds([]).합계, 0);
console.log('settle rounds ok');
