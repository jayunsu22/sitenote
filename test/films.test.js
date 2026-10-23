// 실행: node test/films.test.js
// 필름 겹침 (2026-10-22) — 같은 필름 번호가 가까운 날짜 다른 현장에 또 있으면 알려 주고, 줄마다 주문 표시
// 기대값 출처: 사용자와 정한 시안(앞뒤 7일 겹침, 모아보기 2주, 줄마다 '주문 MM/DD')
const assert = require('assert');
const Share = require('../share.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n    ', e.message); }
}

const 오늘 = '2026-10-22';
const 현장 = (id, date, films, o) => Object.assign({ id, clientId: 'c1', name: id, date, days: [{ date, staff: [] }], films, createdAt: 1 }, o || {});
const 줄 = (code, orderedAt, place) => ({ place: place || '', code, ready: false, orderedAt: orderedAt || '' });

test('filmKey: 공백·하이픈·대소문자 무시', () => {
  assert.strictEqual(Share.filmKey(' pw-881 '), 'PW881');
  assert.strictEqual(Share.filmKey('PW 881'), 'PW881');
  assert.strictEqual(Share.filmKey(''), '');
});

test('filmOverlaps: 앞뒤 7일 안 다른 현장의 같은 번호 (주문 여부 포함), 8일 넘으면 없음, 자기 현장 제외', () => {
  const a = 현장('우륵', '2026-10-24', [줄('PW-881', '2026-10-21')]);
  const b = 현장('영종', '2026-10-25', [줄('pw881'), 줄('LW-123')]);
  const c = 현장('멀리', '2026-11-05', [줄('PW-881')]);
  const ov = Share.filmOverlaps([a, b, c], b, 'pw881');
  assert.deepStrictEqual(ov.map(x => [x.site.id, x.orderedAt]), [['우륵', '2026-10-21']]);
  assert.deepStrictEqual(Share.filmOverlaps([a, b, c], b, 'LW-123'), []);
  assert.deepStrictEqual(Share.filmOverlaps([a, b, c], b, ''), []);
});
test('filmOverlaps: 날짜 없는 현장은 겹침 대상이 아니다', () => {
  const a = 현장('날짜없음', '', [줄('PW-881')]);
  const b = 현장('영종', '2026-10-25', [줄('PW-881')]);
  assert.deepStrictEqual(Share.filmOverlaps([a, b], b, 'PW-881'), []);
});

test('filmBoard: 오늘부터 14일 안 현장의 필름을 번호별로, 겹친 번호 먼저, 같은 현장 같은 번호는 한 번', () => {
  const a = 현장('우륵', '2026-10-24', [줄('PW-881', '2026-10-21'), 줄('LW-123'), 줄('PW-881', '2026-10-21', '방2')]);
  const b = 현장('영종', '2026-10-25', [줄('pw881')]);
  const old = 현장('지난', '2026-10-10', [줄('PW-881')]);
  const far = 현장('먼', '2026-11-10', [줄('LW-123')]);
  const g = Share.filmBoard([a, b, old, far], 오늘, 14);
  assert.deepStrictEqual(g.map(x => [x.code, x.uses.length]), [['PW-881', 2], ['LW-123', 1]]);
  assert.deepStrictEqual(g[0].uses.map(u => [u.site.id, u.date, u.orderedAt]), [['우륵', '2026-10-24', '2026-10-21'], ['영종', '2026-10-25', '']]);
});
test('filmBoardText: 미주문 번호만 한 줄에 하나 (중복 없이)', () => {
  const a = 현장('우륵', '2026-10-24', [줄('PW-881', '2026-10-21'), 줄('LW-123')]);
  const b = 현장('영종', '2026-10-25', [줄('PW-881'), 줄('HP-604')]);
  assert.strictEqual(Share.filmBoardText(Share.filmBoard([a, b], 오늘, 14)), 'PW-881\nLW-123\nHP-604');
});

test('dateFilms: 시공 첫날 칸에 번호, 앞뒤 7일 안에 또 있으면 dup', () => {
  const a = 현장('우륵', '2026-10-24', [줄('PW-881'), 줄('LW-123')]);
  const b = 현장('영종', '2026-10-25', [줄('PW-881')]);
  const m = Share.dateFilms([a, b]);
  assert.deepStrictEqual(m['2026-10-24'], [{ code: 'PW-881', dup: true }, { code: 'LW-123', dup: false }]);
  assert.deepStrictEqual(m['2026-10-25'], [{ code: 'PW-881', dup: true }]);
});

test('filmOrderCount: 번호 있는 줄 중 주문한 줄 수', () => {
  assert.deepStrictEqual(Share.filmOrderCount(현장('a', '2026-10-24', [줄('A', '2026-10-21'), 줄('B'), 줄('')])), { ordered: 1, total: 2 });
});

// ---- 날짜별 주문 내역 (2026-10-22 사용자 요청: 달력 대신 주문한 날짜별로) ----
test('filmOrderLog: 최근 30일 주문을 주문한 날짜별로(최근 먼저), 같은 현장 같은 번호는 한 줄, 다른 현장에 또 주문하면 dup', () => {
  const a = 현장('우륵', '2026-10-24', [줄('PW-881', '2026-10-21', '방문'), 줄('PW-881', '2026-10-21', '방2'), 줄('LW-123', '2026-10-20')]);
  const b = 현장('영종', '2026-10-25', [줄('pw881', '2026-10-22'), 줄('HP-604')]);
  const old = 현장('옛날', '2026-09-01', [줄('PW-881', '2026-09-10')]);
  const log = Share.filmOrderLog([a, b, old], 오늘, 30);
  assert.deepStrictEqual(log.map(d => d.date), ['2026-10-22', '2026-10-21', '2026-10-20']);
  assert.deepStrictEqual(log[1].items.map(i => [i.code, i.site.id, i.places, i.dup]), [['PW-881', '우륵', '방문, 방2', 2]]);
  assert.deepStrictEqual(log[0].items.map(i => [i.code, i.site.id, i.dup]), [['pw881', '영종', 2]]);
  assert.deepStrictEqual(log[2].items.map(i => [i.code, i.dup]), [['LW-123', 0]]);
});
test('filmOrderedBefore: 이 번호를 최근 30일 안 다른 현장에서 주문한 기록', () => {
  const a = 현장('우륵', '2026-10-24', [줄('PW-881', '2026-10-21')]);
  const b = 현장('영종', '2026-10-25', [줄('pw 881')]);
  assert.deepStrictEqual(Share.filmOrderedBefore([a, b], b, 'pw 881', 오늘, 30).map(x => [x.site.id, x.orderedAt]), [['우륵', '2026-10-21']]);
  assert.deepStrictEqual(Share.filmOrderedBefore([a, b], a, 'PW-881', 오늘, 30), []);
});

// ---- 필름 전체 보기 (2026-10-22 사용자: '필름칸에 넣어진 모든 필름넘버 + 주문/수령 단계') ----
test('filmSchedule: 시공 첫날이 7일 전~14일 뒤인 현장의 모든 번호, 날짜별·현장별, 단계(미주문/주문/수령), 겹침 수', () => {
  const a = 현장('우륵', '2026-10-16', [줄('PW-881', '2026-10-14', '방문'), 줄('LW-123', '', '거실'), 줄('', '', '빈줄')], { filmStage: 3 });
  const b = 현장('영종', '2026-10-25', [줄('pw881', '', '현관'), 줄('HP-604', '2026-10-21', '창틀')], { filmStage: 1 });
  const c = 현장('주문단계', '2026-10-25', [줄('XX-1')], { filmStage: 2 });
  const old = 현장('옛날', '2026-10-10', [줄('PW-881')]);
  const far = 현장('먼', '2026-11-10', [줄('LW-123')]);
  const g = Share.filmSchedule([a, b, c, old, far], 오늘, 7, 14);
  assert.deepStrictEqual(g.map(d => [d.date, d.sites.map(x => x.site.id)]), [['2026-10-16', ['우륵']], ['2026-10-25', ['영종', '주문단계']]]);
  assert.deepStrictEqual(g[0].sites[0].rows.map(r => [r.code, r.place, r.status, r.orderedAt, r.dup]),
    [['PW-881', '방문', '수령', '2026-10-14', 2], ['LW-123', '거실', '수령', '', 0]]);
  assert.deepStrictEqual(g[1].sites[0].rows.map(r => [r.code, r.status, r.orderedAt, r.dup]),
    [['pw881', '미주문', '', 2], ['HP-604', '주문', '2026-10-21', 0]]);
  assert.deepStrictEqual(g[1].sites[1].rows.map(r => r.status), ['주문'], '현장 단계가 주문이면 줄도 주문');
});
test('filmScheduleText: 미주문 번호만 (중복 없이)', () => {
  const b = 현장('영종', '2026-10-25', [줄('pw881'), 줄('HP-604', '2026-10-21'), 줄('PW-881')], { filmStage: 1 });
  assert.strictEqual(Share.filmScheduleText(Share.filmSchedule([b], 오늘, 7, 14)), 'pw881');
});

test('filmOverlapsAhead: 마지막 작업일이 오늘 전인 현장은 뺀다 (오늘 작업 중이면 남김)', () => {
  const me = { id: 'm', date: '2026-10-24', days: [{ date: '2026-10-24', staff: [] }], films: [{ code: 'PS010' }] };
  const 지난 = { id: 'a', date: '2026-10-20', days: [{ date: '2026-10-20', staff: [] }], films: [{ code: 'ps010' }] };
  const 오늘끝 = { id: 'b', date: '2026-10-22', days: [{ date: '2026-10-22', staff: [] }, { date: '2026-10-23', staff: [] }], films: [{ code: 'PS-010' }] };
  const 앞 = { id: 'c', date: '2026-10-27', days: [{ date: '2026-10-27', staff: [] }], films: [{ code: 'PS010' }] };
  assert.strictEqual(Share.filmOverlaps([me, 지난, 오늘끝, 앞], me, 'PS010').length, 3);
  assert.deepStrictEqual(Share.filmOverlapsAhead([me, 지난, 오늘끝, 앞], me, 'PS010', '2026-10-23').map(x => x.site.id), ['b', 'c']);
  assert.deepStrictEqual(Share.filmOverlapsAhead([me, 지난, 오늘끝, 앞], me, 'PS010', '2026-10-24').map(x => x.site.id), ['c']);
});

test('겹침 상태: 줄마다 주문을 안 찍어도 단계 띠가 주문(2)·수령(3)이면 주문으로 본다 (2026-10-24)', () => {
  const me = { id: 'm', date: '2026-10-24', days: [{ date: '2026-10-24', staff: [] }], films: [{ code: 'PS010' }] };
  const S = (id, filmStage, orderedAt) => ({ id, date: '2026-10-25', days: [{ date: '2026-10-25', staff: [] }], filmStage, films: [{ code: 'ps010', orderedAt }] });
  const txt = (o) => Share.filmOverlapText(Share.filmOverlaps([me, o], me, 'PS010')[0]);
  assert.ok(txt(S('a', 1, '')).endsWith('그쪽 미주문'));
  assert.ok(txt(S('b', 2, '')).endsWith('그쪽은 주문'));
  assert.ok(txt(S('c', 3, '')).endsWith('그쪽은 수령'));
  assert.ok(txt(S('d', 1, '2026-10-20')).endsWith('그쪽은 주문 10/20'));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
