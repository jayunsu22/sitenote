// 실행: node test/quote_link.test.js
// 현장 ↔ 견적서 잇기 (2026-10-18) — 견적 라인 → 현장관리자 품목 짝짓기, 내역 묶기, 품목 자동 체크
const assert = require('assert');
const Q = require('../quote_link.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n    ', e.message); }
}
async function atest(name, fn) {
  try { await fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n    ', e.message); }
}

console.log('견적코드');
test('코드뽑기: 코드 / /q/주소 / 전체 주소, 못 알아보면 빈 문자열', () => {
  assert.strictEqual(Q.코드뽑기('AB12CD34'), 'AB12CD34');
  assert.strictEqual(Q.코드뽑기(' https://songil.netlify.app/q/AB12CD34?x=1 '), 'AB12CD34');
  assert.strictEqual(Q.코드뽑기('견적서 보내요'), '');
  assert.strictEqual(Q.보기주소('AB12'), 'https://songil.netlify.app/q/AB12');
});

console.log('내역 묶기');
const 라인들 = [
  { 구역: '거실', 품목명: '샤시1 (시스템샤시)', 수량: 2, 단위: '짝', 표시금액: 300000 },
  { 구역: '거실', 품목명: '몰딩', 수량: 1, 단위: '식', 표시금액: 100000 },
  { 구역: '방1', 품목명: '방문', 수량: 1, 단위: '짝', 표시금액: 120000 },
  { 구역: '주방', 품목명: '싱크대 상부장', 수량: '', 단위: '', 직접금액: 80000 },
];
test('구역별: 구역 순서를 지키고 구역 합을 낸다', () => {
  const z = Q.구역별(라인들);
  assert.deepStrictEqual(z.map(x => x.구역), ['거실', '방1', '주방']);
  assert.strictEqual(z[0].합, 400000);
  assert.strictEqual(z[0].줄.length, 2);
  assert.strictEqual(z[2].줄[0].금액, 80000, '직접 적은 품목은 직접금액을 쓴다');
});
test('요약: 현장명·총액·줄수', () => {
  const s = Q.요약({ 현장명: '에듀포레 204동', 평형: '34평', 총액: 600000, 라인들: 라인들, 발행일시: '2026-10-18T01:00:00Z' });
  assert.deepStrictEqual([s.현장명, s.평형, s.총액, s.줄수], ['에듀포레 204동', '34평', 600000, 4]);
});

console.log('짝짓기 (견적 품목 → 현장관리자 품목명)');
test('방문·샤시·화장실문은 현장관리자 이름 규칙으로 바뀐다', () => {
  const 현장품목 = ['방1문+틀', '거실샤시1', '거실화장실문+틀', '주방몰딩'];
  const r = Q.짝짓기([
    { 구역: '방1', 품목명: '방문' },
    { 구역: '거실', 품목명: '샤시1 (시스템샤시)' },
    { 구역: '거실', 품목명: '화장실문' },
  ], 3, 현장품목);
  assert.deepStrictEqual(r.짝.map(x => x.현장품목), ['방1문+틀', '거실샤시1', '거실화장실문+틀']);
  assert.strictEqual(r.짝없음.length, 0);
});
test('전체공통 몰딩은 현장관리자에 있는 구역 몰딩만 여러 개로 나뉜다', () => {
  const r = Q.짝짓기([{ 구역: '전체공통', 품목명: '몰딩' }], 3, ['거실몰딩', '주방몰딩', '방1몰딩']);
  assert.deepStrictEqual(r.짝.map(x => x.현장품목), ['거실몰딩', '주방몰딩', '방1몰딩']);
});
test('현장관리자에 없는 품목은 짝없음으로 (없는 품목을 새로 만들지 않는다)', () => {
  const r = Q.짝짓기([{ 구역: '방3', 품목명: '침대 프레임' }], 3, ['방1문+틀']);
  assert.strictEqual(r.짝.length, 0);
  assert.deepStrictEqual(r.짝없음, [{ 구역: '방3', 견적품목: '침대 프레임' }]);
});
test('같은 현장품목으로 겹치면 한 번만 켠다', () => {
  const r = Q.짝짓기([{ 구역: '방1', 품목명: '문짝' }, { 구역: '방1', 품목명: '문틀' }], 3, ['방1문+틀']);
  assert.strictEqual(r.짝.length, 1);
});
test('견적품목들 / 방수추정', () => {
  assert.deepStrictEqual(Q.견적품목들([{ 구역: '거실', 품목명: '몰딩' }, { 구역: '', 품목명: 'x' }, null]),
    [{ 구역: '거실', 품목명: '몰딩' }]);
  assert.strictEqual(Q.방수추정([{ 구역: '방1' }, { 구역: '방4베란다' }, { 구역: '거실' }]), 4);
  assert.strictEqual(Q.방수추정([{ 구역: '거실' }]), 3, '방이 안 보이면 3개로 본다');
});

(async () => {
  console.log('품목 자동 체크 (webhook 호출)');
  const 부른곳 = [];
  const deps = { fetchFn: (url, opt) => {
    부른곳.push({ url: String(url).split('?')[0], body: opt && opt.body ? JSON.parse(opt.body) : null });
    if (String(url).indexOf('pro-quote') >= 0) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({
        현장명: 'A', 총액: 1, 라인들: [{ 구역: '방1', 품목명: '방문' }, { 구역: '거실', 품목명: '샤시1' }, { 구역: '방2', 품목명: '침대' }] }) });
    }
    if (String(url).indexOf('film-quality-get-v2') >= 0) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({
        masterItems: [{ 품목명: '방1문+틀' }, { 품목명: '거실샤시1' }], activeItems: ['거실샤시1'] }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  } };
  await atest('이미 켜진 품목은 건드리지 않고, 새 품목만 toggle_item_create 로 켠다', async () => {
    const r = await Q.품목맞추기('recSITE', 'AB12', deps);
    assert.deepStrictEqual(r.켠것, ['방1문+틀']);
    assert.deepStrictEqual(r.이미, ['거실샤시1']);
    assert.deepStrictEqual(r.짝없음, [{ 구역: '방2', 견적품목: '침대' }]);
    assert.deepStrictEqual(r.실패, []);
    const 보낸 = 부른곳.filter(x => x.body && x.body.type === 'toggle_item_create');
    assert.strictEqual(보낸.length, 1);
    assert.deepStrictEqual(보낸[0].body, { type: 'toggle_item_create', projectCode: 'recSITE', itemName: '방1문+틀' });
  });

  await atest('견적서를 못 받으면 품목을 하나도 켜지 않는다', async () => {
    const bad = { fetchFn: () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }) };
    await assert.rejects(() => Q.품목맞추기('recSITE', 'ZZ', bad), /HTTP 404/);
  });


  /* 정산 견적서 (songil.netlify.app/s/…) 도 현장에 이어 붙인다 (2026-11-12 사장님) — 코드는 's:' 를 붙여 방문견적(/q/)과 가른다 */
  console.log('정산 견적서');
  test('코드뽑기: /s/주소 → s:코드, s:코드는 그대로, 보기주소는 /s/', () => {
    assert.strictEqual(Q.코드뽑기('https://songil.netlify.app/s/Ab12Cd34?n=xx'), 's:Ab12Cd34');
    assert.strictEqual(Q.코드뽑기('s:Ab12Cd34'), 's:Ab12Cd34');
    assert.strictEqual(Q.is정산('s:Ab12Cd34'), true);
    assert.strictEqual(Q.is정산('Ab12Cd34'), false);
    assert.strictEqual(Q.보기주소('s:Ab12Cd34'), 'https://songil.netlify.app/s/Ab12Cd34');
  });
  test('정산견적 → 내역: 품목 견적은 품목별 금액, 시공범위·개수, 직접 추가·부가·추가작업까지', () => {
    const q = Q.정산견적변환({ 견적코드: 'Ab12', 현장명: '예시 현장', 발행일시: '2026-11-12', 총액: 553000, 스냅샷: {
      방식: '품목',
      시공품목: [
        { 구역: '방1', 품목명: '방1문+틀', 시공범위: '문틀만 시공', 개수: 1, 금액: 112000 },
        { 구역: '거실', 품목명: '거실화장실문', 시공범위: '문+틀 양쪽면 시공', 개수: 2, 금액: 442000 },
      ],
      품목: [{ 품목명: '실리콘 시공', 구역: '직접 추가', 종류: '금액', 금액: 30000 }],
      자재소계: [],
      부가: [{ 항목명: '식대', 금액: 0, 비고: '인건비 포함' }, { 항목명: '부자재비', 금액: 20000 }],
      추가작업: [{ 품목명: '방2문', 구분: 'AS', 청구: '업체청구', 금액: 50000 }],
      미수금: [{ 현장명: '지난 현장', 금액: 100000 }],
    } });
    assert.strictEqual(q.현장명, '예시 현장');
    assert.strictEqual(q.총액, 553000);
    assert.deepStrictEqual(q.라인들.map(l => [l.구역, l.품목명, l.수량, l.단위, l.표시금액]), [
      ['방1', '방1문+틀 (문틀만 시공)', '', '', 112000],
      ['거실', '거실화장실문', 2, '개', 442000],
      ['직접 추가', '실리콘 시공', '', '', 30000],
      ['부가 항목', '식대 (인건비 포함)', '', '', 0],
      ['부가 항목', '부자재비', '', '', 20000],
      ['미수금', '지난 현장', '', '', 100000],
    ]);   // 업체청구 추가작업은 고객 합계에 안 들어가므로 뺀다
  });
  test('정산견적 → 내역: 품수 견적은 인건비(품수)·자재별 금액·품목 이름', () => {
    const q = Q.정산견적변환({ 현장명: 'x', 총액: 378000, 스냅샷: {
      인건비: { 품수: 0, 품단가: 250000, 금액: 0 },
      자재소계: [{ 자재명: '영림ps', 단가: 9000, 소모량합: 42, 금액: 378000 }],
      품목: [{ 품목명: '방1문+틀', 구역: '방1', 소모량: 6.5, 시공범위: '문+틀 양쪽면 시공' }],
    } });
    assert.deepStrictEqual(q.라인들.map(l => [l.구역, l.품목명, l.수량, l.단위, l.표시금액]), [
      ['자재비', '영림ps', 42, 'm', 378000],
      ['방1', '방1문+틀', 6.5, 'm', 0],
    ]);   // 품수 0 이면 인건비 줄을 안 만든다
  });
  await atest('견적받기: s:코드는 settle-quote 로 받아 내역으로 바꾼다', async () => {
    let 부름 = '';
    const deps = { fetchFn: (url) => { 부름 = String(url); return Promise.resolve({ ok: true, json: () => Promise.resolve({ 견적코드: 'Ab12', 현장명: '예시', 총액: 1, 스냅샷: { 방식: '품목', 시공품목: [{ 구역: '방1', 품목명: '방1문+틀', 개수: 1, 금액: 1 }] } }) }); } };
    const q = await Q.견적받기('s:Ab12', deps);
    assert.ok(/settle-quote\?id=Ab12/.test(부름));
    assert.strictEqual(q.라인들.length, 1);
  });
  await atest('품목맞추기: 정산 견적서는 현장업무 품목으로 만든 것이라 아무것도 안 켠다', async () => {
    const deps = { fetchFn: () => { throw new Error('부르면 안 됨'); } };
    const r = await Q.품목맞추기('recSITE', 's:Ab12', deps);
    assert.deepStrictEqual(r, { 켠것: [], 이미: [], 짝없음: [], 실패: [], 정산: true });
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

// 💰 정산 견적서의 인건비 (11/13): 품수 = 시공 인건비 줄, 품목 = 품목 금액에서 자재비 비율만큼 뺀 나머지
{
  const assert = require('assert');
  const Q = require('../quote_link.js'), S = require('../share.js');
  const a = Q.정산견적변환({ 견적코드: 'S1', 스냅샷: { 방식: '품수', 인건비: { 품수: 6, 금액: 1200000 }, 자재소계: [{ 자재명: 'ps170', 금액: 300000 }], 부가: [{ 항목명: '출장', 금액: 50000 }] } });
  assert.strictEqual(S.quoteLaborOf(a).labor, 1200000);
  const b = Q.정산견적변환({ 견적코드: 'S2', 스냅샷: { 방식: '품목', 시공품목: [{ 구역: '방1', 품목명: '방문', 금액: 170000 }, { 구역: '방2', 품목명: '방문', 금액: 170000 }], 자재소계: [{ 자재명: 'ps170', 금액: 90000 }] } });
  assert.strictEqual(S.quoteLaborOf(b).labor, 250000);
  // 품목마다 인건비가 저장된 정산 (11/13 실제: 품목합 166만, 인건비 132만, 자재소계 없음)
  const c = Q.정산견적변환({ 견적코드: 'S3', 스냅샷: { 방식: '품목', 시공품목: [{ 품목명: '현관문', 금액: 170000, 인건비: 130000, 자재비: 40000 }, { 품목명: '현관중문', 금액: 1490000, 인건비: 1190000, 자재비: 300000 }], 합계: { 인건비: 1320000, 자재비: 340000, 총액: 1660000 } } });
  assert.strictEqual(S.quoteLaborOf(c).labor, 1320000, '품목 인건비 그대로');
  // 품목 인건비가 없어도 합계 인건비 비율로
  const d = Q.정산견적변환({ 견적코드: 'S4', 스냅샷: { 방식: '품목', 시공품목: [{ 품목명: 'a', 금액: 1000000 }, { 품목명: 'b', 금액: 660000 }], 합계: { 인건비: 1320000, 자재비: 340000, 총액: 1660000 } } });
  assert.ok(Math.abs(S.quoteLaborOf(d).labor - 1320000) <= 1, '합계 인건비 비율');
}

{
  // 정산 견적 품목명은 이미 현장업무 이름 — 구역을 또 붙이지 않는다 (11/13 '방1 방1문+틀' 빠짐)
  const Q = require('../quote_link.js');
  const masters = ['방1문+틀', '방1수납장', '거실샤시1', '현관중문', '거실샤시'];
  const r = Q.품목값([{ 구역: '방1', 품목명: '방1문+틀 (문틀만 시공)', 인건비표시금액: 100000 }, { 구역: '거실', 품목명: '거실샤시1', 인건비표시금액: 50000 },
    { 구역: '방1', 품목명: '방문', 인건비표시금액: 70000 }], masters, 1);
  assert.deepStrictEqual(r.값, { '방1문+틀': 170000, '거실샤시1': 50000 }); assert.strictEqual(r.짝없음.length, 0);
  // 짝 기억: 거실 베란다샤시1 → 거실샤시
  const store = {}; global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } };
  const line = [{ 구역: '거실', 품목명: '베란다샤시1 (샤시(단창))', 인건비표시금액: 80000 }];
  assert.strictEqual(Q.품목값(line, masters, 1).짝없음.length, 1);
  assert.ok(Q.짝기억저장('거실', '베란다샤시1 (샤시(단창))', '거실샤시'));
  assert.deepStrictEqual(Q.품목값(line, masters, 1).값, { '거실샤시': 80000 });
  assert.strictEqual(Q.짝짓기([{ 구역: '거실', 품목명: '베란다샤시1' }], 3, masters).짝[0].현장품목, '거실샤시');
  delete global.localStorage;
  console.log('  ✓ 정산 이름 그대로 · 짝 기억');
}
