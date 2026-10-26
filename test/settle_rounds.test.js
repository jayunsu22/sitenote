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
