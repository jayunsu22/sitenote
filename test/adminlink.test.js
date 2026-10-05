// 실행: node test/adminlink.test.js
const assert = require('assert');
const AdminLink = require('../adminlink.js');

let pass = 0, fail = 0;
// 테스트는 차례로 실행한다 — 진행 중 보호(같은 현장 id 로 겹친 호출 합치기)가 모듈 전체에서 공유되기 때문
let chain = Promise.resolve();
function test(name, fn) {
  chain = chain.then(() => Promise.resolve().then(fn).then(
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

// ---------- 네트워크 함수 (가짜 fetch / 가짜 Store) ----------
function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, opts) => {
    const call = { url, method: (opts && opts.method) || 'GET', body: opts && opts.body ? JSON.parse(opts.body) : null };
    calls.push(call);
    const out = await handler(call);
    if (out instanceof Error) throw out;
    return { ok: out.ok !== false, status: out.status || 200, json: async () => out.json };
  };
  fn.calls = calls;
  return fn;
}
function fakeStore(s) {
  const updates = [];
  return {
    updates,
    getSite: (id) => (id === s.id ? s : null),
    updateSite: (id, patch) => { updates.push(patch); Object.assign(s, patch); return s; }
  };
}
const U = AdminLink.URLS;
const is = (call, which) => call.url.indexOf(U[which]) === 0;
const posts = (f, type) => f.calls.filter((c) => c.method === 'POST' && c.body && c.body.type === type);
const unlinked = () => site({ name: '인천 부평', days: [{ date: '2026-10-07', staff: ['가', '나'] }] });
const linkedSite = (synced, over) => site(Object.assign({
  name: '인천 부평', adminId: 'recA', days: [{ date: '2026-10-07', staff: ['가', '나'] }], adminSynced: synced
}, over || {}));

console.log('createProject');
test('id 를 받으면 adminId 와 adminSynced 를 저장하고 요청 body 는 createBody 와 같다', async () => {
  const s = unlinked(), st = fakeStore(s);
  const f = fakeFetch(() => ({ json: { id: 'recNEW' } }));
  const id = await AdminLink.createProject('s1', { fetchFn: f, Store: st });
  assert.strictEqual(id, 'recNEW');
  assert.strictEqual(s.adminId, 'recNEW');
  assert.deepStrictEqual(s.adminSynced, { name: '인천 부평', date: '2026-10-07', staff: ['가', '나'] });
  assert.deepStrictEqual(posts(f, 'create_project')[0].body, AdminLink.createBody(unlinked()));
});
test('응답이 배열이거나 fields.id 여도 인식', async () => {
  for (const json of [[{ id: 'recA1' }], { fields: { id: 'recA1' } }]) {
    const s = unlinked(), st = fakeStore(s);
    const id = await AdminLink.createProject('s1', { fetchFn: fakeFetch(() => ({ json })), Store: st });
    assert.strictEqual(id, 'recA1');
  }
});
test('응답에 id 가 없으면 목록에서 같은 이름 중 가장 새 것을 쓴다', async () => {
  const s = unlinked(), st = fakeStore(s);
  const f = fakeFetch((c) => (c.method === 'POST' ? { json: {} } : { json: { projects: [
    { id: 'recOld', fields: { 현장명: '인천 부평', createdTime: '2026-09-01T00:00:00.000Z' } },
    { id: 'recNew', fields: { 현장명: '인천 부평', createdTime: '2026-10-05T00:00:00.000Z' } },
    { id: 'recOther', fields: { 현장명: '다른 곳', createdTime: '2026-10-06T00:00:00.000Z' } }
  ] } }));
  assert.strictEqual(await AdminLink.createProject('s1', { fetchFn: f, Store: st }), 'recNew');
});
test('응답도 목록도 실패하면 reject 하고 저장하지 않는다', async () => {
  const s = unlinked(), st = fakeStore(s);
  const f = fakeFetch(() => ({ ok: false, status: 500, json: {} }));
  await assert.rejects(() => AdminLink.createProject('s1', { fetchFn: f, Store: st }));
  assert.strictEqual(st.updates.length, 0);
  assert.strictEqual(s.adminId, '');
});
test('현장명이 비어 있으면 요청 없이 reject', async () => {
  const s = site({ name: '' }), st = fakeStore(s), f = fakeFetch(() => ({ json: { id: 'recX' } }));
  await assert.rejects(() => AdminLink.createProject('s1', { fetchFn: f, Store: st }));
  assert.strictEqual(f.calls.length, 0);
});
test('동시에 두 번 불러도 create_project 요청은 1번', async () => {
  const s = unlinked(), st = fakeStore(s);
  const f = fakeFetch(async () => { await new Promise((r) => setTimeout(r, 10)); return { json: { id: 'recNEW' } }; });
  const deps = { fetchFn: f, Store: st };
  const [a, b] = await Promise.all([AdminLink.createProject('s1', deps), AdminLink.createProject('s1', deps)]);
  assert.strictEqual(a, 'recNEW'); assert.strictEqual(b, 'recNEW');
  assert.strictEqual(posts(f, 'create_project').length, 1);
});
test('이미 adminId 가 있으면 요청 0번', async () => {
  const s = linkedSite(null), st = fakeStore(s), f = fakeFetch(() => ({ json: {} }));
  assert.strictEqual(await AdminLink.createProject('s1', { fetchFn: f, Store: st }), 'recA');
  assert.strictEqual(f.calls.length, 0);
});

console.log('listProjects / linkExisting / unlink');
test('listProjects: 보관함 제외, 시공기사 문자열을 쪼갠다', async () => {
  const f = fakeFetch(() => ({ json: { projects: [
    { id: 'r1', fields: { 현장명: '가', 시공일자: '2026-10-01', 시공기사: '염문철, 문승규' } },
    { id: 'r2', fields: { 현장명: '나', 보관함: true } },
    { id: 'r3', fields: { 현장명: '다' } }
  ] } }));
  const list = await AdminLink.listProjects({ fetchFn: f });
  assert.deepStrictEqual(list, [
    { id: 'r1', name: '가', date: '2026-10-01', workers: ['염문철', '문승규'] },
    { id: 'r3', name: '다', date: '', workers: [] }
  ]);
});
test('linkExisting: 관리자 현장명을 덮어쓰지 않도록 이름은 맞춘 것으로 기록, 날짜·인원은 첫 맞춤 대상', () => {
  const s = unlinked(), st = fakeStore(s);
  AdminLink.linkExisting('s1', 'recZ', { Store: st });
  assert.strictEqual(s.adminId, 'recZ');
  assert.deepStrictEqual(s.adminSynced, { name: '인천 부평', date: '', staff: [] });
  assert.deepStrictEqual(AdminLink.needsSync(s), { name: false, date: true, staff: true, any: true });
});
test('unlink: adminId·adminSynced 비움', () => {
  const s = linkedSite({ name: 'x', date: 'y', staff: [] }), st = fakeStore(s);
  AdminLink.unlink('s1', { Store: st });
  assert.strictEqual(s.adminId, ''); assert.strictEqual(s.adminSynced, null);
});

console.log('syncSite');
const detail = (workers, tasks) => ({ json: { workers, tasks: tasks || [] } });
test('이름만 바뀜 → update_project_name 1번(newName 만), update_workers 0번', async () => {
  const s = linkedSite({ name: '옛 이름', date: '2026-10-07', staff: ['가', '나'] }), st = fakeStore(s);
  const f = fakeFetch(() => ({ json: {} }));
  const r = await AdminLink.syncSite('s1', { fetchFn: f, Store: st });
  assert.strictEqual(r.ok, true);
  const p = posts(f, 'update_project_name');
  assert.strictEqual(p.length, 1);
  assert.deepStrictEqual(p[0].body, { type: 'update_project_name', projectCode: 'recA', newName: '인천 부평' });
  assert.strictEqual(posts(f, 'update_workers').length, 0);
  assert.strictEqual(s.adminSynced.name, '인천 부평');
});
test('인원 추가 → detail 을 새로 받고 현재 명단 뒤에 붙여 update_workers', async () => {
  const s = linkedSite({ name: '인천 부평', date: '2026-10-07', staff: ['가'] }), st = fakeStore(s);
  const f = fakeFetch((c) => (is(c, 'detail') ? detail(['다', '가']) : { json: {} }));
  const r = await AdminLink.syncSite('s1', { fetchFn: f, Store: st });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(f.calls.filter((c) => is(c, 'detail')).length, 1);
  assert.deepStrictEqual(posts(f, 'update_workers')[0].body, { type: 'update_workers', projectCode: 'recA', workersText: '다,가,나' });
  assert.deepStrictEqual(s.adminSynced.staff, ['가', '나']);
  assert.deepStrictEqual(r.adminOnly, ['다']);
});
test('지난번에 넣은 이름이 빠졌고 배정이 있으면 명단에 남기고 kept 로 알린다', async () => {
  const s = linkedSite({ name: '인천 부평', date: '2026-10-07', staff: ['가', '나', '다'] }), st = fakeStore(s);
  const f = fakeFetch((c) => (is(c, 'detail') ? detail(['가', '나', '다'], [{ fields: { 밑작업기사: '다', 시공기사: '가' } }]) : { json: {} }));
  const r = await AdminLink.syncSite('s1', { fetchFn: f, Store: st });
  assert.deepStrictEqual(r.kept, ['다']);
  assert.strictEqual(posts(f, 'update_workers').length, 0);   // 바뀔 것이 없다(다 가 남으므로)
});
test('배정 없는 빠진 이름은 명단에서 뺀다', async () => {
  const s = linkedSite({ name: '인천 부평', date: '2026-10-07', staff: ['가', '나', '다'] }), st = fakeStore(s);
  const f = fakeFetch((c) => (is(c, 'detail') ? detail(['가', '나', '다']) : { json: {} }));
  await AdminLink.syncSite('s1', { fetchFn: f, Store: st });
  assert.strictEqual(posts(f, 'update_workers')[0].body.workersText, '가,나');
});
test('update_project_name 이 실패해도 인원 단계는 계속하고, 실패한 단계의 기록은 그대로 둔다', async () => {
  const s = linkedSite({ name: '옛 이름', date: '2026-10-07', staff: ['가'] }), st = fakeStore(s);
  const f = fakeFetch((c) => {
    if (c.method === 'POST' && c.body.type === 'update_project_name') return { ok: false, status: 500, json: {} };
    if (is(c, 'detail')) return detail(['가']);
    return { json: {} };
  });
  const r = await AdminLink.syncSite('s1', { fetchFn: f, Store: st });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.meta, 'fail');
  assert.strictEqual(s.adminSynced.name, '옛 이름');
  assert.deepStrictEqual(s.adminSynced.staff, ['가', '나']);
});
test('맞출 것이 없으면 요청 0번', async () => {
  const s = linkedSite({ name: '인천 부평', date: '2026-10-07', staff: ['가', '나'] }), st = fakeStore(s);
  const f = fakeFetch(() => ({ json: {} }));
  const r = await AdminLink.syncSite('s1', { fetchFn: f, Store: st });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(f.calls.length, 0);
});
test('같은 현장의 syncSite 가 겹쳐도 요청은 한 번만', async () => {
  const s = linkedSite({ name: '옛 이름', date: '2026-10-07', staff: ['가', '나'] }), st = fakeStore(s);
  const f = fakeFetch(async () => { await new Promise((r) => setTimeout(r, 10)); return { json: {} }; });
  const deps = { fetchFn: f, Store: st };
  await Promise.all([AdminLink.syncSite('s1', deps), AdminLink.syncSite('s1', deps)]);
  assert.strictEqual(posts(f, 'update_project_name').length, 1);
});

chain.then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
