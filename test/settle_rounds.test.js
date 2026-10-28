// 정산 내역 회차 (share.js settleRounds) — 조정 금액·견적 없이 더한 정산·일부 입금·합계 넣기/빼기
const assert = require('assert');
const Share = require('../share.js');
const A = ['방1 안방문+틀', '방1 안방샤시'];
const list = [
  { 코드: 'Z7', 발행일시: '2026-10-01T04:22:31Z', 총액: 3130000, 품목: A },
  { 코드: 'A6', 발행일시: '2026-10-06T07:00:31Z', 총액: 3130000, 품목: A },          // 같은 견적 다시 발행 → 앞 것 자동 '고친 전'
  { 코드: 'B1', 발행일시: '2026-10-20T07:00:31Z', 총액: 800000, 품목: ['거실 아트월'] },
];
let r = Share.settleRounds(list, {}, []);
assert.deepStrictEqual(r.rows.map((x) => [x.key, x.포함, x.회 || 0]), [['Z7', false, 0], ['A6', true, 1], ['B1', true, 2]]);
assert.strictEqual(r.합계, 3930000);
// 조정(네고) · 일부 입금 · 견적 없이 더한 정산
r = Share.settleRounds(list, { A6: { 금액: 3000000, 사유: '네고', 입금일: '2026-10-07' }, B1: { 입금일: '2026-10-21', 입금액: 500000 } },
  [{ id: 'm1', 날짜: '2026-10-22', 내용: '현관 손잡이 추가', 금액: 50000 }]);
const A6 = r.rows.find((x) => x.key === 'A6');
assert.strictEqual(A6.정산금액, 3000000); assert.strictEqual(A6.조정, true); assert.strictEqual(A6.입금액, 3000000);
assert.strictEqual(r.합계, 3000000 + 800000 + 50000);
assert.strictEqual(r.받은, 3000000 + 500000);
assert.strictEqual(r.남은, 350000);
assert.strictEqual(r.회차, 3);
// 자동 '고친 전' 을 사장님이 합계에 넣기 (중간 추가 견적이었던 경우)
r = Share.settleRounds(list, { Z7: { 포함: true } }, []);
assert.strictEqual(r.합계, 3130000 * 2 + 800000);
assert.strictEqual(Share.settleRounds([]).합계, 0);
console.log('settle rounds ok');
// 정산 장부 (2026-10-28): 기존 견적 → 입금/추가견적 줄 → 총액·납입금·미수금
{
  const man = [
    { id: 'a', 종류: '견적', 날짜: '2026-10-28', 금액: 3000000, 내용: '기존 견적' },
    { id: 'c', 종류: '추가', 날짜: '2026-10-31', 금액: 200000, 내용: '현관 손잡이' },
    { id: 'b', 종류: '입금', 날짜: '2026-10-30', 금액: 1000000 },
    { id: 'd', 종류: '입금', 날짜: '2026-10-31', 금액: 500000 },
  ];
  const L = Share.settleLedger([], {}, man);
  assert.deepStrictEqual(L.lines.map((l) => l.key), ['a', 'b', 'c', 'd']);   // 같은 날은 추가견적 먼저, 입금 나중
  assert.deepStrictEqual(L.lines.map((l) => l.미수), [3000000, 2000000, 2200000, 1700000]);
  assert.strictEqual(L.총액, 3200000); assert.strictEqual(L.납입, 1500000); assert.strictEqual(L.미수, 1700000);
  // 예전 한 줄(금액+입금액)은 청구 줄·입금 줄로 나뉜다
  const old = Share.splitSettleManual([{ id: 'm1', 날짜: '2026-10-22', 내용: '중간', 금액: 50000, 입금일: '2026-10-23', 입금액: 30000 }]);
  assert.deepStrictEqual(old.map((m) => [m.종류, m.금액, m.날짜]), [['추가', 50000, '2026-10-22'], ['입금', 30000, '2026-10-23']]);
  // 발행한 정산견적과 그 입금도 장부 줄
  const L2 = Share.settleLedger([{ 코드: 'B1', 발행일시: '2026-10-20T07:00:31Z', 총액: 800000, 품목: ['x'] }], { B1: { 입금일: '2026-10-21', 입금액: 500000 } }, []);
  assert.deepStrictEqual(L2.lines.map((l) => [l.종류, l.금액]), [['견적', 800000], ['입금', 500000]]);
  assert.strictEqual(L2.미수, 300000);
  console.log('settle ledger ok');
}
