// 실행: node test/quote_requests.test.js
// 견적요청 내역 (2026-10-17) — 방문견적 저장함·발행목록에서 이 거래처 것만 골라 상태를 붙인다
// 기대값 출처: 설계 문서 (songil) docs/superpowers/specs/2026-10-17-quote-request-design.md
//   품목 0 → 답장 전 / 품목 있음·현장코드 없음 → 작성 중 / 현장코드 있음 → 발행
const assert = require('assert');
const Q = require('../quote_requests.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n    ', e.message); }
}

const 요청 = (거래처ID, 원문, 접수일시) => ({ 접수일시: 접수일시 || '2026-10-17T05:00:00Z', 원문: 원문 || '안방 분합창 1', 거래처ID: 거래처ID, 거래처명: 'X' });
const 담긴 = (o) => Object.assign({ id: 1, 이름: '풍림 2단지', 건수: 0, 총액: 0, 현장코드: '', 저장일시: '2026-10-17T05:00:00Z', 요청: 요청('c1') }, o || {});

test('상태 3가지: 품목 0 답장 전, 품목 있음 작성 중, 현장코드 있음 발행', () => {
  const r = Q.요청내역([
    담긴({ id: 1 }),
    담긴({ id: 2, 건수: 3, 총액: 500000, 요청: 요청('c1', 'a', '2026-10-17T04:00:00Z') }),
    담긴({ id: 3, 건수: 3, 총액: 900000, 현장코드: 'AB12CD34', 요청: 요청('c1', 'b', '2026-10-16T04:00:00Z') }),
  ], [], 'c1');
  assert.deepStrictEqual(r.map(x => x.상태), ['답장 전', '작성 중', '발행']);
  assert.strictEqual(r[1].금액, 500000);
  assert.strictEqual(r[2].견적코드, 'AB12CD34');
});

test('다른 거래처 요청과 요청 없는 저장함 건은 뺀다', () => {
  const r = Q.요청내역([담긴({ 요청: 요청('c2') }), 담긴({ 요청: null })], [], 'c1');
  assert.strictEqual(r.length, 0);
});

test('발행목록: 이 거래처 발행 견적은 저장함에서 지웠어도 발행 줄로 남는다', () => {
  const r = Q.요청내역([], [
    { 견적코드: 'P1', 현장명: '에듀포레', 발행일시: '2026-10-15T01:00:00Z', 총액: 1860000, 현장관리_거래처ID: 'c1' },
    { 견적코드: 'P2', 현장명: '남의 것', 발행일시: '2026-10-15T01:00:00Z', 총액: 1, 현장관리_거래처ID: 'c2' },
  ], 'c1');
  assert.strictEqual(r.length, 1);
  assert.deepStrictEqual([r[0].상태, r[0].이름, r[0].금액, r[0].견적코드], ['발행', '에듀포레', 1860000, 'P1']);
});

test('저장함에도 발행목록에도 있는 같은 견적코드는 한 줄 (발행일시는 발행목록 것)', () => {
  const r = Q.요청내역(
    [담긴({ 건수: 2, 총액: 700000, 현장코드: 'P1' })],
    [{ 견적코드: 'P1', 현장명: '풍림', 발행일시: '2026-10-17T09:00:00Z', 총액: 700000, 현장관리_거래처ID: 'c1' }],
    'c1');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].상태, '발행');
  assert.strictEqual(r[0].날짜, '2026-10-17T09:00:00Z');
});

test('정렬: 답장 전이 맨 위, 같은 상태 안에서는 최근 순', () => {
  const r = Q.요청내역([
    담긴({ id: 1, 건수: 1, 요청: 요청('c1', 'a', '2026-10-17T01:00:00Z') }),
    담긴({ id: 2, 요청: 요청('c1', 'b', '2026-10-15T01:00:00Z') }),
    담긴({ id: 3, 요청: 요청('c1', 'c', '2026-10-16T01:00:00Z') }),
  ], [{ 견적코드: 'P9', 현장명: 'z', 발행일시: '2026-10-18T00:00:00Z', 총액: 1, 현장관리_거래처ID: 'c1' }], 'c1');
  assert.deepStrictEqual(r.map(x => x.상태 + ':' + x.요약.slice(0, 1)), ['답장 전:c', '답장 전:b', '작성 중:a', '발행:']);
});

test('요약: 원문 첫 줄들을 이어 붙여 짧게 (빈 줄 무시)', () => {
  const r = Q.요청내역([담긴({ 요청: 요청('c1', '\n안방 분합창 1\n\n거실 샤시 2\n냉장고장 하나요\n현관문') })], [], 'c1');
  assert.strictEqual(r[0].요약, '안방 분합창 1 · 거실 샤시 2 · 냉장고장 하나요');
});

test('답장전수', () => {
  assert.strictEqual(Q.답장전수([{ 상태: '답장 전' }, { 상태: '발행' }, { 상태: '답장 전' }]), 2);
  assert.strictEqual(Q.답장전수(null), 0);
});

console.log('기존 견적서 연결 (2026-10-18)');
test('코드뽑기: 코드 그대로 / /q/주소 / 전체 주소, 못 알아보면 빈 문자열', () => {
  assert.strictEqual(Q.코드뽑기('AB12CD34'), 'AB12CD34');
  assert.strictEqual(Q.코드뽑기(' /q/AB12CD34 '), 'AB12CD34');
  assert.strictEqual(Q.코드뽑기('https://songil.netlify.app/q/AB12CD34?x=1'), 'AB12CD34');
  assert.strictEqual(Q.코드뽑기('견적서 보내요'), '');
  assert.strictEqual(Q.코드뽑기(''), '');
});
test('코드목록: 빈 값·중복은 버리고 순서는 지킨다', () => {
  assert.deepStrictEqual(Q.코드목록(['A1', '/q/A1', '', 'B2', null, 'B2']), ['A1', 'B2']);
  assert.deepStrictEqual(Q.코드목록(null), []);
});
test('연결한 견적서는 다른 거래처 것이어도 발행 줄로 나오고 연결 표시가 붙는다', () => {
  const 발행 = [
    { 견적코드: 'P1', 현장명: '내 것', 발행일시: '2026-10-18T01:00:00Z', 총액: 100, 현장관리_거래처ID: 'c1' },
    { 견적코드: 'P2', 현장명: '예전에 딴 데서', 발행일시: '2026-10-17T01:00:00Z', 총액: 200, 현장관리_거래처ID: '' },
  ];
  const r = Q.요청내역([], 발행, 'c1', ['P2']);
  assert.deepStrictEqual(r.map(x => x.견적코드), ['P1', 'P2']);
  assert.strictEqual(r[0].연결, false, '원래 이 거래처 것은 연결 표시 없음');
  assert.strictEqual(r[1].연결, true);
  assert.strictEqual(r[1].금액, 200);
});
test('발행목록에 없는 연결 코드도 코드만으로 한 줄 남는다 (중복은 한 번)', () => {
  const r = Q.요청내역([], [], 'c1', ['ZZ9', '/q/ZZ9']);
  assert.strictEqual(r.length, 1);
  assert.deepStrictEqual([r[0].상태, r[0].견적코드, r[0].연결], ['발행', 'ZZ9', true]);
});
test('저장함에서 이미 보여준 견적코드를 연결해도 줄이 두 번 생기지 않는다', () => {
  const r = Q.요청내역([담긴({ 건수: 2, 현장코드: 'AB12CD34' })], [], 'c1', ['AB12CD34']);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].견적코드, 'AB12CD34');
});

test('숨김: ✕ 로 숨긴 줄(견적코드·저장함 id)은 빠진다, 키가 붙는다', () => {
  const 박스 = [담긴({ id: 7 }), 담긴({ id: 8, 건수: 2, 현장코드: 'AAA' })];
  const 발행 = [{ 견적코드: 'BBB', 현장관리_거래처ID: 'c1', 현장명: '다시 발행', 발행일시: '2026-10-20T00:00:00Z', 총액: 1 }];
  const 다 = Q.요청내역(박스, 발행, 'c1', ['CCC']);
  assert.deepStrictEqual(다.map(x => x.키).sort(), ['AAA', 'BBB', 'CCC', 'box:7']);
  const r = Q.요청내역(박스, 발행, 'c1', ['CCC'], ['box:7', 'BBB', 'CCC']);
  assert.deepStrictEqual(r.map(x => x.키), ['AAA']);
  assert.strictEqual(Q.요청내역(박스, 발행, 'c1', [], undefined).length, 3);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
