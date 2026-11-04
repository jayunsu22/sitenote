// 실행: node test/filmbox.test.js
// AS 필름 박스 (2026-10-31) — 마지막 날 가장 긴 필름만 박스에 넣고 테이프에 'ps010 300x2450' 을 적어 사진을 올린다.
// 꺼내 쓰면 [다 씀] 또는 [남은 길이]. 같은 번호를 다시 올리면 새 치수로 바뀐다 (사장님과 정한 규칙)
const assert = require('assert');
const Share = require('../share.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n    ', e.message); }
}
const ids = (p) => (i) => p + i;

test('parseFilmLabel: 번호 폭x길이 (대소문자·x·×·* 모두)', () => {
  assert.deepStrictEqual(Share.parseFilmLabel('ps010 300x2450'), { code: 'PS010', w: 300, l: 2450 });
  assert.deepStrictEqual(Share.parseFilmLabel('  pw-881  600 X 3800 '), { code: 'PW-881', w: 600, l: 3800 });
  assert.deepStrictEqual(Share.parseFilmLabel('LG777 1220×3100mm'), { code: 'LG777', w: 1220, l: 3100 });
  assert.deepStrictEqual(Share.parseFilmLabel('한솔 콘크리트화이트 300*900'), { code: '한솔 콘크리트화이트', w: 300, l: 900 });
});
test('parseFilmLabel: 치수 없으면 번호만, 빈 글은 null', () => {
  assert.deepStrictEqual(Share.parseFilmLabel('ps010'), { code: 'PS010', w: 0, l: 0 });
  assert.strictEqual(Share.parseFilmLabel('   '), null);
  assert.strictEqual(Share.parseFilmLabel('300x2450'), null);
});
test('parseFilmLabels: 여러 줄', () => {
  assert.deepStrictEqual(Share.parseFilmLabels('ps010 300x2450\n\npw881 600x3800').map(x => x.code), ['PS010', 'PW881']);
});
test('filmBoxPut: 새 번호는 더하고, 같은 번호(하이픈·대소문자 무시)는 새 치수로 바꾼다', () => {
  let r = Share.filmBoxPut([], [{ code: 'PS010', w: 300, l: 2450 }, { code: 'PW881', w: 600, l: 3800 }], '2026-10-31', ids('a'));
  assert.strictEqual(r.added, 2);
  assert.deepStrictEqual(r.box.map(x => [x.id, x.code, x.w, x.l, x.at]), [['a0', 'PS010', 300, 2450, '2026-10-31'], ['a1', 'PW881', 600, 3800, '2026-10-31']]);
  r = Share.filmBoxPut(r.box, [{ code: 'ps-010', w: 300, l: 1450 }], '2026-11-15', ids('b'));
  assert.strictEqual(r.updated, 1); assert.strictEqual(r.added, 0);
  assert.strictEqual(r.box.length, 2);
  assert.deepStrictEqual([r.box[0].id, r.box[0].l, r.box[0].at], ['a0', 1450, '2026-11-15']);
  assert.deepStrictEqual(r.box[0].log, [{ at: '2026-11-15', from: 2450, to: 1450 }]);
});
test('filmBoxPut: 다 쓴 번호를 다시 올리면 살아난다', () => {
  let box = Share.filmBoxPut([], [{ code: 'PS010', w: 300, l: 2450 }], '2026-10-31', ids('a')).box;
  box = Share.filmBoxUse(box, 'a0', '2026-11-01');
  assert.strictEqual(Share.filmBoxActive(box).length, 0);
  box = Share.filmBoxPut(box, [{ code: 'PS010', w: 300, l: 3000 }], '2026-11-20', ids('b')).box;
  assert.deepStrictEqual(Share.filmBoxActive(box).map(x => [x.id, x.l, x.usedAt]), [['a0', 3000, '']]);
});
test('filmBoxSetLength: 3m 중 1m 쓰고 남은 길이, 0 이면 다 씀', () => {
  let box = Share.filmBoxPut([], [{ code: 'PS010', w: 300, l: 3000 }], '2026-10-31', ids('a')).box;
  box = Share.filmBoxSetLength(box, 'a0', 2000, '2026-11-15');
  assert.strictEqual(box[0].l, 2000);
  assert.strictEqual(Share.filmBoxNote(box[0]), '10/31 넣음 · 11/15 1000 씀');
  box = Share.filmBoxSetLength(box, 'a0', 0, '2026-11-20');
  assert.strictEqual(box[0].usedAt, '2026-11-20');
  assert.strictEqual(Share.filmBoxNote(box[0]), '10/31 넣음 · 11/15 1000 씀 → 11/20 다 씀');
  box = Share.filmBoxUndoUse(box, 'a0');
  assert.strictEqual(box[0].usedAt, '');
});
test('filmBoxSearch: 번호 일부로 모든 현장에서 찾기, 다 쓴 것 빼고, 빈 칸이면 전체', () => {
  const a = { id: 'A', filmBox: [{ id: '1', code: 'PS010', w: 300, l: 2450, at: '2026-10-01' }, { id: '2', code: 'LG777', w: 1220, l: 3100, at: '2026-10-01', usedAt: '2026-10-20' }] };
  const b = { id: 'B', filmBox: [{ id: '3', code: 'ps-010', w: 600, l: 900, at: '2026-10-25' }, { id: '4', code: 'PW881', w: 600, l: 3800, at: '2026-10-25' }] };
  const c = { id: 'C' };
  assert.deepStrictEqual(Share.filmBoxSearch([a, b, c], 'ps01').map(x => [x.site.id, x.item.id]), [['B', '3'], ['A', '1']]);
  assert.deepStrictEqual(Share.filmBoxSearch([a, b, c], 'lg777'), []);
  assert.deepStrictEqual(Share.filmBoxSearch([a, b, c], '').map(x => x.item.code), ['ps-010', 'PS010', 'PW881']);
});
test('normalizeFilmBox: 모양이 이상한 줄은 버린다', () => {
  assert.deepStrictEqual(Share.normalizeFilmBox(null), []);
  assert.strictEqual(Share.normalizeFilmBox([null, { code: '' }, { code: 'X1', l: '900', at: 'bad' }]).length, 1);
  assert.strictEqual(Share.normalizeFilmBox([{ code: 'X1', l: '900' }])[0].l, 900);
});

console.log('\n' + pass + ' 통과, ' + fail + ' 실패');
if (fail) process.exit(1);
