// 실행: node test/tasks.test.js
// 할 일 (2026-10-14) — 자동 할 일(필름 주문·인원 모집·부자재 준비)과 일정 화면 날짜 묶기
// 기대값 출처: 설계 문서 docs/superpowers/specs/2026-10-14-할일-design.md 의 표 (사용자가 정한 기준 3일·3일·전날)
const assert = require('assert');
const Share = require('../share.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n    ', e.message); }
}

const 오늘 = '2026-10-14';
function 현장(o) {
  return Object.assign({
    id: 's1', clientId: 'c1', name: '우륵 704', date: '2026-10-17',
    days: [{ date: '2026-10-17', staff: ['김기사'] }],
    filmStage: 1, needStaff: 0, supplies: [{ name: '본드', ready: true }], services: [], createdAt: 1
  }, o || {});
}
const 규칙 = Share.DEFAULT_TASK_RULES;
const kinds = list => list.map(t => t.kind).sort();

test('기본 기준: 필름 3일·인원 3일·부자재 1일', () => {
  assert.deepStrictEqual(Share.DEFAULT_TASK_RULES, { filmDays: 3, staffDays: 3, supplyDays: 1 });
});
test('normalizeTaskRules: 이상한 값은 기본값, 0~14 정수', () => {
  assert.deepStrictEqual(Share.normalizeTaskRules(null), { filmDays: 3, staffDays: 3, supplyDays: 1 });
  assert.deepStrictEqual(Share.normalizeTaskRules({ filmDays: '5', staffDays: -1, supplyDays: 99 }), { filmDays: 5, staffDays: 3, supplyDays: 1 });
  assert.deepStrictEqual(Share.normalizeTaskRules({ filmDays: 0, staffDays: 2.7, supplyDays: 'x' }), { filmDays: 0, staffDays: 2, supplyDays: 1 });
});

test('필름 주문: 시공 3일 전이면 뜬다 (제목·연결·날짜=오늘)', () => {
  const l = Share.autoTasks([현장()], 오늘, 규칙);
  assert.deepStrictEqual(kinds(l), ['film']);
  const t = l[0];
  assert.strictEqual(t.id, 'auto:film:s1');
  assert.strictEqual(t.auto, true);
  assert.strictEqual(t.date, 오늘);
  assert.strictEqual(t.title, '필름 주문: 우륵 704');
  assert.deepStrictEqual(t.link, { type: 'site', id: 's1', siteId: 's1', label: '우륵 704' });
});
test('필름 주문: 4일 전이면 안 뜬다', () => {
  assert.deepStrictEqual(Share.autoTasks([현장({ date: '2026-10-18', days: [{ date: '2026-10-18', staff: ['김'] }] })], 오늘, 규칙), []);
});
test('필름 주문: 시공 당일은 뜨고, 첫날이 지나면 안 뜬다', () => {
  assert.deepStrictEqual(kinds(Share.autoTasks([현장({ date: 오늘, days: [{ date: 오늘, staff: ['김'] }] })], 오늘, 규칙)), ['film']);
  assert.deepStrictEqual(Share.autoTasks([현장({ date: '2026-10-13', days: [{ date: '2026-10-13', staff: ['김'] }] })], 오늘, 규칙), []);
});
test('필름 주문: 단계가 주문(2)·수령(3)이면 안 뜨고, 미확정(0)이면 뜬다', () => {
  assert.deepStrictEqual(Share.autoTasks([현장({ filmStage: 2 })], 오늘, 규칙), []);
  assert.deepStrictEqual(Share.autoTasks([현장({ filmStage: 3 })], 오늘, 규칙), []);
  assert.deepStrictEqual(kinds(Share.autoTasks([현장({ filmStage: 0 })], 오늘, 규칙)), ['film']);
});
test('날짜 없는 현장은 자동 할 일이 없다', () => {
  assert.deepStrictEqual(Share.autoTasks([현장({ date: '', days: [{ date: '', staff: [] }], filmStage: 0 })], 오늘, 규칙), []);
});

test('인원 모집: 필요 3명에 1명이면 "2명 부족"', () => {
  const l = Share.autoTasks([현장({ filmStage: 2, needStaff: 3 })], 오늘, 규칙);
  assert.deepStrictEqual(kinds(l), ['staff']);
  assert.strictEqual(l[0].id, 'auto:staff:s1');
  assert.strictEqual(l[0].title, '인원 모집: 우륵 704 (2명 부족)');
});
test('인원 모집: 다 채웠거나 필요 인원을 안 정했으면 안 뜬다', () => {
  assert.deepStrictEqual(Share.autoTasks([현장({ filmStage: 2, needStaff: 1 })], 오늘, 규칙), []);
  assert.deepStrictEqual(Share.autoTasks([현장({ filmStage: 2, needStaff: 0, days: [{ date: '2026-10-17', staff: [] }] })], 오늘, 규칙), []);
});

test('현장 자재: 시공 전날 미체크가 있으면 뜨고, 2일 전이면 안 뜬다 (차 상비품은 빼고)', () => {
  const 내일 = '2026-10-15';
  const s = 현장({ filmStage: 2, date: 내일, days: [{ date: 내일, staff: ['김'] }], supplies: [{ name: '본드', ready: false }] });
  const l = Share.autoTasks([s], 오늘, 규칙);
  assert.deepStrictEqual(kinds(l), ['supply']);
  assert.strictEqual(l[0].title, '현장 자재 챙기기: 우륵 704 (본드)');
  const s2 = 현장({ filmStage: 2, date: '2026-10-16', days: [{ date: '2026-10-16', staff: ['김'] }], supplies: [{ name: '본드', ready: false }] });
  assert.deepStrictEqual(Share.autoTasks([s2], 오늘, 규칙), []);
});
test('현장 자재: 다 체크했으면 안 뜬다', () => {
  const s = 현장({ filmStage: 2, date: '2026-10-15', days: [{ date: '2026-10-15', staff: ['김'] }] });
  assert.deepStrictEqual(Share.autoTasks([s], 오늘, 규칙), []);
});

console.log('내 차 재고 (2026-10-19) — 상비품은 현장이 아니라 나에게 붙는다');
const 차설정 = { supplyDefaults: ['본드', '장갑'], stockLow: {} };
test('상비품(본드)만 미체크면 현장 할 일은 안 뜬다 — 차에 싣고 다니는 것이라서', () => {
  const 내일 = '2026-10-15';
  const s = 현장({ filmStage: 2, date: 내일, days: [{ date: 내일, staff: ['김'] }], supplies: [{ name: '본드', ready: false }] });
  assert.deepStrictEqual(Share.autoTasks([s], 오늘, 규칙, {}, 차설정), []);
});
test('그 현장에만 필요한 자재는 현장 할 일로 뜬다 (상비품은 빠진다)', () => {
  const 내일 = '2026-10-15';
  const s = 현장({ filmStage: 2, date: 내일, days: [{ date: 내일, staff: ['김'] }],
    supplies: [{ name: '본드', ready: false }, { name: '특수칼날', ready: false }] });
  const l = Share.autoTasks([s], 오늘, 규칙, {}, 차설정);
  assert.deepStrictEqual(kinds(l), ['supply']);
  assert.strictEqual(l[0].title, '현장 자재 챙기기: 우륵 704 (특수칼날)');
});
test('차 보충: 부족 표시한 상비품이 있으면 현장 수와 상관없이 하루에 하나', () => {
  const 설정 = { supplyDefaults: ['본드', '장갑'], stockLow: { '본드': true, '장갑': true } };
  const 내일 = '2026-10-15';
  const a = 현장({ id: 'a', filmStage: 2, date: 내일, days: [{ date: 내일, staff: ['김'] }], supplies: [{ name: '본드', ready: false }] });
  const b = 현장({ id: 'b', filmStage: 2, date: 내일, days: [{ date: 내일, staff: ['김'] }], supplies: [{ name: '본드', ready: false }] });
  const l = Share.autoTasks([a, b], 오늘, 규칙, {}, 설정);
  assert.deepStrictEqual(kinds(l), ['stock']);
  assert.strictEqual(l[0].title, '차 보충: 본드·장갑');
  assert.deepStrictEqual(l[0].stockLow, ['본드', '장갑']);
  assert.strictEqual(l[0].link, null, '현장에 안 붙는 내 할 일');
});
test('차 보충: 다 채웠으면 안 뜨고, 목록에서 뺀 이름은 무시한다', () => {
  assert.deepStrictEqual(Share.autoTasks([], 오늘, 규칙, {}, 차설정), []);
  const 유령 = { supplyDefaults: ['본드'], stockLow: { '없어진품목': true } };
  assert.deepStrictEqual(Share.autoTasks([], 오늘, 규칙, {}, 유령), []);
});
test('setStockLow: 켜고 끄기, 원본은 안 바뀐다', () => {
  const 설정 = { supplyDefaults: ['본드'], stockLow: {} };
  const on = Share.setStockLow(설정, '본드', true);
  assert.deepStrictEqual(on, { '본드': true });
  assert.deepStrictEqual(설정.stockLow, {});
  assert.deepStrictEqual(Share.setStockLow({ supplyDefaults: ['본드'], stockLow: on }, '본드', false), {});
  assert.deepStrictEqual(Share.stockLowNames({ supplyDefaults: ['본드'], stockLow: on }), ['본드']);
});

function asSite(svc) {
  return 현장({ filmStage: 2, date: '2026-10-01', days: [{ date: '2026-10-01', staff: ['김'] }], services: [svc] });
}
const as = o => Object.assign({ id: 'v1', kind: 'AS', date: '2026-10-15', tools: ['퍼티', '사포'], toolsReady: [], done: false }, o || {});
test('AS 부자재: 전날 안 챙긴 공구가 있으면 AS 로 연결되어 뜬다', () => {
  const l = Share.autoTasks([asSite(as({ toolsReady: ['퍼티'] }))], 오늘, 규칙);
  assert.deepStrictEqual(kinds(l), ['supply']);
  assert.strictEqual(l[0].id, 'auto:supply:s1:v1');
  assert.strictEqual(l[0].title, 'AS 부자재: 우륵 704');
  assert.deepStrictEqual(l[0].link, { type: 'service', id: 'v1', siteId: 's1', label: '우륵 704 AS' });
});
test('AS 부자재: 다 챙겼거나·끝난 AS·공구 없음·지난 AS 는 안 뜬다', () => {
  assert.deepStrictEqual(Share.autoTasks([asSite(as({ toolsReady: ['퍼티', '사포'] }))], 오늘, 규칙), []);
  assert.deepStrictEqual(Share.autoTasks([asSite(as({ done: true }))], 오늘, 규칙), []);
  assert.deepStrictEqual(Share.autoTasks([asSite(as({ tools: [] }))], 오늘, 규칙), []);
  assert.deepStrictEqual(Share.autoTasks([asSite(as({ date: '2026-10-13' }))], 오늘, 규칙), []);
});

test('기준을 바꾸면 경계가 움직인다 (필름 5일)', () => {
  const s = 현장({ date: '2026-10-19', days: [{ date: '2026-10-19', staff: ['김'] }] });
  assert.deepStrictEqual(Share.autoTasks([s], 오늘, 규칙), []);
  assert.deepStrictEqual(kinds(Share.autoTasks([s], 오늘, { filmDays: 5, staffDays: 3, supplyDays: 1 })), ['film']);
});

// ---- 날짜 묶기 ----
const 할일 = (id, o) => Object.assign({ id, title: id, date: '', time: '', link: null, done: false }, o || {});
test('taskTimeKey: 시각 → 오전 → 오후 → 없음', () => {
  const order = ['', '오후', '13:00', '오전', '09:00'].sort((a, b) => Share.taskTimeKey({ time: a }).localeCompare(Share.taskTimeKey({ time: b })));
  assert.deepStrictEqual(order, ['09:00', '13:00', '오전', '오후', '']);
});
test('taskGroups: 밀린 것·날짜 없는 것·날짜별 열린/끝난 것', () => {
  const g = Share.taskGroups([
    할일('a', { date: '2026-10-12' }),
    할일('b', { date: '2026-10-10' }),
    할일('c', { date: '2026-10-12', done: true }),
    할일('d'),
    할일('e', { date: 오늘, time: '오후' }),
    할일('f', { date: 오늘, time: '09:00' }),
    할일('g', { date: 오늘, done: true }),
    할일('h', { done: true })
  ], 오늘);
  assert.deepStrictEqual(g.overdue.map(t => t.id), ['b', 'a']);
  assert.deepStrictEqual(g.undated.map(t => t.id), ['d']);
  assert.deepStrictEqual(g.byDate[오늘].open.map(t => t.id), ['f', 'e']);
  assert.deepStrictEqual(g.byDate[오늘].done.map(t => t.id), ['g']);
  assert.deepStrictEqual(g.byDate['2026-10-12'].open, []);           // 밀린 건 위 상자로만
  assert.deepStrictEqual(g.byDate['2026-10-12'].done.map(t => t.id), ['c']);
  assert.ok(!('' in g.byDate));                                          // 날짜 없이 끝난 건 어디에도 안 보인다
});

// ---- 대기 인원 (2026-10-14) ----
test('normalizeHolds: 날짜 아닌 키·빈 이름·중복 버림, 30일 넘게 지난 날 버림', () => {
  const h = Share.normalizeHolds({ '2026-10-22': [' 안광윤 ', '윤인재', '안광윤', ''], 'x': ['a'], '2026-10-20': [], '2026-09-10': ['옛날'], '2026-09-20': ['최근'] }, 오늘);
  assert.deepStrictEqual(h, { '2026-10-22': ['안광윤', '윤인재'], '2026-09-20': ['최근'] });
  assert.deepStrictEqual(Share.normalizeHolds(null, 오늘), {});
});
test('heldOpen: 그날 현장·AS 에 들어간 사람은 대기에서 빠진다 (공백 무시)', () => {
  const s = 현장({ date: '2026-10-22', days: [{ date: '2026-10-22', staff: ['안 광윤'] }],
    services: [{ id: 'v1', date: '2026-10-22', staff: ['박기사'], tools: [], done: false }] });
  const h = { '2026-10-22': ['안광윤', '윤인재', '박기사'] };
  assert.deepStrictEqual(Share.heldOpen(h, [s], '2026-10-22'), ['윤인재']);
  assert.deepStrictEqual(Share.heldOpen(h, [s], '2026-10-23'), []);
});
test('자동 할 일 인원 배정: 기준 일수 안이고 대기가 남았으면 뜬다', () => {
  const h = { '2026-10-16': ['안광윤', '윤인재'], '2026-10-20': ['김기사'] };
  const l = Share.autoTasks([], 오늘, 규칙, h);
  assert.deepStrictEqual(l.map(t => t.id), ['auto:hold:2026-10-16']);
  assert.strictEqual(l[0].kind, 'hold');
  assert.strictEqual(l[0].title, '인원 배정: 10/16(금) 대기 2명 (안광윤·윤인재)');
  assert.strictEqual(l[0].holdDate, '2026-10-16');
  assert.deepStrictEqual(Share.autoTasks([], 오늘, 규칙), [], 'holds 를 안 주면 없음');
});

test('모집 문구: 날짜·동네·부족 인원, 현장명은 안 나간다', () => {
  const s = 현장({ name: '군포 우륵아파트 704동 606호', calRegion: '산본', needStaff: 3,
    days: [{ date: '2026-10-17', staff: ['김기사'] }, { date: '2026-10-18', staff: [] }] });
  const t = Share.buildRecruitText(s);
  assert.ok(t.includes('10/17(토), 10/18(일)'), t);
  assert.ok(t.includes('📍 산본'), t);
  assert.ok(t.includes('👥 2명'), t);
  assert.ok(!t.includes('우륵') && !t.includes('606'), t);
});

test('실리콘: 내가 쏘고 못 챙긴 색이 있으면 시공 2일 전부터 할 일 (부자재 할 일엔 안 겹침)', () => {
  const 실 = (o) => 현장(Object.assign({ filmStage: 2, silicone: { who: 'me', colors: ['백색', '회색'] },
    supplies: [{ name: '본드', ready: true }, { name: '실리콘 백색', ready: true }, { name: '실리콘 회색', ready: false }] }, o));
  assert.deepStrictEqual(Share.autoTasks([실()], 오늘, 규칙), [], '3일 전엔 아직');
  const l = Share.autoTasks([실()], '2026-10-15', 규칙);
  assert.deepStrictEqual(kinds(l), ['silicone']);
  assert.strictEqual(l[0].title, '실리콘 준비: 우륵 704 (회색)');
  assert.deepStrictEqual(kinds(Share.autoTasks([실()], '2026-10-16', 규칙)), ['silicone'], '전날엔 부자재 할 일과 안 겹침');
  assert.deepStrictEqual(Share.autoTasks([실({ silicone: { who: 'other', colors: ['회색'] } })], '2026-10-16', 규칙).filter(t => t.kind === 'silicone'), []);
  const 다 = 실({ supplies: [{ name: '실리콘 백색', ready: true }, { name: '실리콘 회색', ready: true }] });
  assert.deepStrictEqual(Share.autoTasks([다], '2026-10-15', 규칙), []);
});
test('siliconeLate: 2일 전부터 빨간불, 지나도 계속, 다 챙기면 꺼짐 / 공유 한 줄', () => {
  const s = 현장({ silicone: { who: 'me', colors: ['백색'] }, supplies: [{ name: '실리콘 백색', ready: false }] });
  assert.strictEqual(Share.siliconeLate(s, '2026-10-14'), false);
  assert.strictEqual(Share.siliconeLate(s, '2026-10-15'), true);
  assert.strictEqual(Share.siliconeLate(s, '2026-10-18'), true);
  assert.strictEqual(Share.siliconeLate(Object.assign({}, s, { supplies: [{ name: '실리콘 백색', ready: true }] }), '2026-10-16'), false);
  assert.strictEqual(Share.siliconeLate(Object.assign({}, s, { silicone: { who: 'other', colors: ['백색'] } }), '2026-10-16'), false);
  assert.strictEqual(Share.siliconeShareLine(현장({ silicone: { who: 'me', colors: ['백색', '회색'] } })), '🧴 실리콘: 사장님이 쏨 (백색 · 회색)');
  assert.strictEqual(Share.siliconeShareLine(현장({ silicone: { who: 'other', colors: ['백색'] } })), '');
  assert.ok(Share.buildShare(현장({ silicone: { who: 'me', colors: ['투명'] } }), []).includes('🧴 실리콘: 사장님이 쏨 (투명)'));
});

test('할 일 순서: 정한 순서(order)가 먼저, 안 정한 것은 그 뒤에 시간 순 (2026-10-24)', () => {
  const T = (id, o) => Object.assign({ id, title: id, date: 오늘, time: '', done: false, createdAt: 1 }, o);
  const g = Share.taskGroups([T('a', { time: '오전' }), T('b', { order: 2 }), T('c', { order: 1, time: '오후' }), T('d', {})], 오늘);
  assert.deepStrictEqual(g.byDate[오늘].open.map(t => t.id), ['c', 'b', 'a', 'd']);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
