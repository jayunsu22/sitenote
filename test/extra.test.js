// 추가작업 → 인원·필름 (share.js extraPlan)
const assert = require('assert');
const Share = require('../share.js');
const items = { '방2문+틀': { 카테고리2: '방문', 자재소모량: 6.5 }, 아트월: { 카테고리2: '아트월', 자재소모량: 3 }, 거실샤시: { 카테고리2: '샤시', 자재소모량: 1, 길이입력: true } };
const site = { films: [{ place: '방문', code: 'HP604' }, { place: '아트월', code: 'PS027' }, { place: '샤시 전체', code: 'HP604' }], extraDone: {} };
const tasks = [
  { id: 'a', fields: { 시공품목: '거실샤시' } },
  { id: 'x1', fields: { 시공품목: '아트월 재시공', 추가구분: '재시공', 원품목: '아트월', 추가수량: 1, 추가금액: 420000 } },
  { id: 'x2', fields: { 시공품목: '방2문+틀 AS', 추가구분: 'AS', 원품목: '방2문+틀', 추가수량: 1, 청구: '업체청구' } },
  { id: 'x3', fields: { 시공품목: '거실샤시 추가요청', 추가구분: '추가요청', 원품목: '거실샤시', 추가수량: 6 } },
];
const p = Share.extraPlan(tasks, items, site);
assert.deepStrictEqual(p.rows.map((r) => [r.id, r.minutes, r.filmM, r.filmCode]), [['x1', 60, 3, 'PS027'], ['x2', 40, 6.5, 'HP604'], ['x3', 150, 6, 'HP604']]);
assert.strictEqual(p.minutes, 250);
assert.strictEqual(p.pum, 1);   // 4시간 10분 → 반품(4시간)을 넘어 1품
assert.strictEqual(p.addStaff, 1);
assert.deepStrictEqual(p.films, [{ code: 'PS027', m: 3 }, { code: 'HP604', m: 12.5 }]);
assert.strictEqual(p.newFilmRows.length, 3);
// 이미 넣은 줄은 다시 안 넣는다
const p2 = Share.extraPlan(tasks, items, Object.assign({}, site, { extraDone: { x1: { staff: 1, film: 1 }, x2: { staff: 1, film: 1 }, x3: { staff: 1 } } }));
assert.strictEqual(p2.addStaff, 0);
assert.deepStrictEqual(p2.newFilmRows.map((r) => r.id), ['x3']);
assert.deepStrictEqual(Share.extraFilmRow(p.rows[2]), { place: '추가 거실샤시 추가요청 6m', code: 'HP604', ready: false, orderedAt: '' });
// 시공위치가 안 맞으면 가장 많이 쓴 번호
assert.strictEqual(Share.extraFilmCode(site.films, '현관중문'), 'HP604');
assert.strictEqual(Share.extraFilmCode([], 'x'), '');
console.log('extra ok');
