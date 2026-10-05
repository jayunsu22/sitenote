// 실행: node test/adminlink.test.js
const assert = require('assert');
const AdminLink = require('../adminlink.js');

let pass = 0, fail = 0;
const pending = [];
function test(name, fn) {
  pending.push(Promise.resolve().then(fn).then(
    () => { pass++; console.log('  ✓', name); },
    (e) => { fail++; console.log('  ✗', name, '\n    ', e.message); }
  ));
}

const site = (over) => Object.assign({
  id: 's1', clientId: 'c1', name: '', unit: '', size: '', date: '',
  days: [{ date: '', staff: [] }], adminId: '', adminSynced: null
}, over || {});

console.log('rosterOf');
test('모든 날 인원을 처음 나온 순서로 중복 없이', () => {
  const s = site({ days: [{ date: 'a', staff: ['가', '나'] }, { date: 'b', staff: ['나', '다'] }, { date: 'c', staff: [] }] });
  assert.deepStrictEqual(AdminLink.rosterOf(s), ['가', '나', '다']);
});
test('days 가 없거나 비어 있으면 빈 목록', () => {
  assert.deepStrictEqual(AdminLink.rosterOf(site({ days: undefined })), []);
  assert.deepStrictEqual(AdminLink.rosterOf(site({ days: [] })), []);
});

console.log('firstDate / adminTitle');
test('firstDate: ISO 날짜만', () => {
  assert.strictEqual(AdminLink.firstDate(site({ days: [{ date: '2026-10-07', staff: [] }] })), '2026-10-07');
  assert.strictEqual(AdminLink.firstDate(site({ days: [{ date: '', staff: [] }] })), '');
  assert.strictEqual(AdminLink.firstDate(site({ days: [{ date: 'abc', staff: [] }] })), '');
});
test('adminTitle: 현장명 + 동호수, 이름이 비면 빈 문자열', () => {
  assert.strictEqual(AdminLink.adminTitle(site({ name: '인천 부평 3동', unit: '101호' })), '인천 부평 3동 101호');
  assert.strictEqual(AdminLink.adminTitle(site({ name: '' })), '');
});

console.log('needsSync');
const full = (over) => site(Object.assign({
  name: '인천 부평', adminId: 'recA',
  days: [{ date: '2026-10-07', staff: ['가', '나'] }], adminSynced: null
}, over || {}));
test('adminId 가 없으면 전부 false', () => {
  assert.deepStrictEqual(AdminLink.needsSync(full({ adminId: '' })), { name: false, date: false, staff: false, any: false });
});
test('처음 맞춤(adminSynced null): 이름·날짜·인원 모두 필요', () => {
  assert.deepStrictEqual(AdminLink.needsSync(full()), { name: true, date: true, staff: true, any: true });
});
test('맞춘 값이 현재와 같으면 전부 false', () => {
  const s = full({ adminSynced: { name: '인천 부평', date: '2026-10-07', staff: ['나', '가'] } });
  assert.deepStrictEqual(AdminLink.needsSync(s), { name: false, date: false, staff: false, any: false });
});
test('인원만 바뀜', () => {
  const s = full({ adminSynced: { name: '인천 부평', date: '2026-10-07', staff: ['가'] } });
  assert.deepStrictEqual(AdminLink.needsSync(s), { name: false, date: false, staff: true, any: true });
});
test('날짜가 미정(빈 값)이면 관리자 날짜를 지우지 않는다', () => {
  const s = full({ days: [{ date: '', staff: ['가', '나'] }], adminSynced: { name: '인천 부평', date: '2026-10-07', staff: ['가', '나'] } });
  assert.strictEqual(AdminLink.needsSync(s).date, false);
});

console.log('planRoster');
test('관리자 명단 뒤에 새 이름 추가, 관리자 전용 기사 보존', () => {
  const r = AdminLink.planRoster({ desired: ['가', '나'], current: ['다'], prevSynced: [], assigned: [] });
  assert.deepStrictEqual(r.next, ['다', '가', '나']);
  assert.deepStrictEqual(r.added, ['가', '나']);
  assert.deepStrictEqual(r.removed, []);
  assert.deepStrictEqual(r.adminOnly, ['다']);
});
test('지난번에 넣은 이름이 빠졌고 배정이 없으면 삭제', () => {
  const r = AdminLink.planRoster({ desired: ['가'], current: ['가', '나'], prevSynced: ['가', '나'], assigned: [] });
  assert.deepStrictEqual(r.next, ['가']);
  assert.deepStrictEqual(r.removed, ['나']);
});
test('배정이 있으면 남겨 둔다', () => {
  const r = AdminLink.planRoster({ desired: ['가'], current: ['가', '나'], prevSynced: ['가', '나'], assigned: ['나'] });
  assert.deepStrictEqual(r.next, ['가', '나']);
  assert.deepStrictEqual(r.removed, []);
  assert.deepStrictEqual(r.kept, ['나']);
});
test('관리자가 직접 넣은 기사는 지우지 않는다', () => {
  const r = AdminLink.planRoster({ desired: ['가'], current: ['가', '나'], prevSynced: ['가'], assigned: [] });
  assert.deepStrictEqual(r.next, ['가', '나']);
  assert.deepStrictEqual(r.removed, []);
  assert.deepStrictEqual(r.adminOnly, ['나']);
});
test('이미 같으면 바뀐 것 없음', () => {
  const r = AdminLink.planRoster({ desired: ['가', '나'], current: ['가', '나'], prevSynced: ['가', '나'], assigned: [] });
  assert.deepStrictEqual(r.next, ['가', '나']);
  assert.deepStrictEqual(r.added, []);
  assert.deepStrictEqual(r.removed, []);
});

console.log('rankProjects');
test('비슷한 것이 앞, 이미 묶인 것은 맨 뒤', () => {
  const projects = [
    { id: 'A', name: '인천 부평 3동 101호', date: '2026-10-01', workers: [] },
    { id: 'B', name: '수원 영통 5동', date: '2026-10-09', workers: [] },
    { id: 'C', name: '인천 부평 3동 202호', date: '2026-10-02', workers: [] }
  ];
  const r = AdminLink.rankProjects(projects, '인천 부평 3동 101호', ['C']);
  assert.deepStrictEqual(r.map((p) => p.id), ['A', 'B', 'C']);
  assert.deepStrictEqual(r.map((p) => p.similar), [true, false, true]);
  assert.deepStrictEqual(r.map((p) => p.linked), [false, false, true]);
});
test('한 조각만 겹치는 건 비슷하다고 보지 않는다(흔한 말: 인천)', () => {
  const r = AdminLink.rankProjects([{ id: 'A', name: '인천 서구 1동', date: '', workers: [] }], '인천 부평 3동', []);
  assert.strictEqual(r[0].similar, false);
});
test('비슷하지 않은 것끼리는 시공일 최신순', () => {
  const projects = [
    { id: 'old', name: '가가 나나', date: '2026-09-01', workers: [] },
    { id: 'new', name: '다다 라라', date: '2026-10-01', workers: [] }
  ];
  assert.deepStrictEqual(AdminLink.rankProjects(projects, '마마 바바', []).map((p) => p.id), ['new', 'old']);
});

console.log('parseAdminLinkHash');
test('#adminlink=현장id:recId', () => {
  assert.deepStrictEqual(AdminLink.parseAdminLinkHash('#adminlink=s_abc:recXYZ123'), { siteId: 's_abc', adminId: 'recXYZ123' });
});
test('모양이 다르면 null', () => {
  assert.strictEqual(AdminLink.parseAdminLinkHash('#adminlink=s_abc'), null);
  assert.strictEqual(AdminLink.parseAdminLinkHash('#site/s_abc'), null);
  assert.strictEqual(AdminLink.parseAdminLinkHash(''), null);
});

console.log('createBody / adminOpenUrl');
test('createBody: 현장명·1일차 날짜·인원', () => {
  const s = site({ name: '인천 부평', days: [{ date: '2026-10-07', staff: ['가', '나'] }, { date: '2026-10-08', staff: ['다'] }] });
  assert.deepStrictEqual(AdminLink.createBody(s), {
    type: 'create_project', projectName: '인천 부평', projectDate: '2026-10-07',
    address: '', notice: '', workersText: '가,나,다'
  });
});
test('adminOpenUrl', () => {
  assert.strictEqual(AdminLink.adminOpenUrl('recA'), 'https://jayunsu22.github.io/autoblog/admin.html#site=recA');
});

Promise.all(pending).then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
