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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
