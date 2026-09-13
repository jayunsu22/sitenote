// 실행: node test/store.test.js
// localStorage / fetch / navigator / setTimeout 을 메모리로 모킹해서 Store 를 검증
const assert = require('assert');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n    ', e.stack.split('\n').slice(0, 3).join('\n')); }
}

// ---- 모킹 ----
const mem = {};
global.localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; }
};
global.navigator = { onLine: true };
global.window = { addEventListener() {} };
let fetchCalls = [];
let fetchImpl = async () => ({ ok: true, json: async () => ({ ok: true }) });
global.fetch = (...a) => { fetchCalls.push(a); return fetchImpl(...a); };
// 디바운스 타이머를 즉시 실행 가능하게: setTimeout 을 가로채서 콜백 보관
let timers = {}; let timerSeq = 0;
const realSetTimeout = global.setTimeout;
global.setTimeout = (fn, ms) => { const id = ++timerSeq; timers[id] = fn; return id; };
global.clearTimeout = id => { delete timers[id]; };
// 보류 중인 타이머를 모두 실행하고, 그 안에서 시작된 fetch 프로미스가 끝날 때까지 잠깐 기다림
async function runTimers() {
  const t = timers; timers = {};
  for (const id of Object.keys(t)) await t[id]();
  await new Promise(r => realSetTimeout(r, 5));
}

global.Share = require('../share.js');
const Store = require('../store.js');

function reset() {
  for (const k in mem) delete mem[k];
  fetchCalls = []; timers = {};
  Store.load();
}

(async () => {
  console.log('load / 기본 상태');
  await test('빈 저장소면 기본 상태', () => {
    reset();
    assert.deepStrictEqual(Store.state.clients, []);
    assert.deepStrictEqual(Store.state.sites, []);
    assert.strictEqual(Store.state.settings.backupKey, '');
    assert.deepStrictEqual(Store.state.settings.questions, Share.DEFAULT_QUESTIONS);
    assert.deepStrictEqual(Store.state.syncQueue, []);
  });
  await test('저장 후 다시 load 하면 복원', () => {
    reset();
    Store.addClient('A인테리어');
    Store.load();
    assert.strictEqual(Store.state.clients[0].name, 'A인테리어');
  });

  console.log('client');
  await test('addClient: order 는 마지막 + 1, 큐에 upsert', () => {
    reset();
    const a = Store.addClient('A'); const b = Store.addClient('B');
    assert.strictEqual(a.order, 0); assert.strictEqual(b.order, 1);
    assert.deepStrictEqual(a.contacts, []);
    assert.strictEqual(Store.state.syncQueue.length, 2);
    assert.strictEqual(Store.state.syncQueue[1].type, 'client');
  });
  await test('renameClient / updateClient', () => {
    reset();
    const a = Store.addClient('A');
    Store.renameClient(a.id, 'AA');
    Store.updateClient(a.id, { filmPrice: '1m 9000원', contacts: [{ name: '김실장', phone: '010' }] });
    const c = Store.state.clients[0];
    assert.strictEqual(c.name, 'AA'); assert.strictEqual(c.filmPrice, '1m 9000원'); assert.strictEqual(c.contacts[0].name, '김실장');
    assert.strictEqual(Store.state.syncQueue.length, 1, '같은 id 는 큐에 하나');
  });
  await test('reorderClients', () => {
    reset();
    const a = Store.addClient('A'), b = Store.addClient('B'), c = Store.addClient('C');
    Store.reorderClients([c.id, a.id, b.id]);
    assert.deepStrictEqual(Store.clients().map(x => x.name), ['C', 'A', 'B']);
  });
  await test('deleteClient: 소속 현장도 삭제, 큐에 delete', () => {
    reset();
    const a = Store.addClient('A'), b = Store.addClient('B');
    const s1 = Store.addSite(a.id); Store.addSite(b.id);
    Store.deleteClient(a.id);
    assert.strictEqual(Store.state.clients.length, 1);
    assert.strictEqual(Store.state.sites.length, 1);
    const dels = Store.state.syncQueue.filter(o => o.op === 'delete').map(o => o.type + ':' + o.id);
    assert.deepStrictEqual(dels, ['site:' + s1.id, 'client:' + a.id]);
  });

  console.log('site');
  await test('addSite: 14개 항목 기본값, 색상 순환', () => {
    reset();
    const a = Store.addClient('A');
    const s = Store.addSite(a.id);
    Share.FIELDS.forEach(f => assert.ok(f.key in s, f.key + ' 있어야 함'));
    assert.deepStrictEqual(s.carReg, { v: '미확인', memo: '' });
    assert.deepStrictEqual(s.films, []);
    assert.strictEqual(s.color, 0);
    assert.strictEqual(Store.addSite(a.id).color, 1);
  });
  await test('updateSite: updatedAt 갱신, 큐 병합', () => {
    reset();
    const a = Store.addClient('A'); const s = Store.addSite(a.id);
    Store.updateSite(s.id, { name: 'X' }); Store.updateSite(s.id, { parking: 'P' });
    const got = Store.getSite(s.id);
    assert.strictEqual(got.name, 'X'); assert.strictEqual(got.parking, 'P');
    assert.strictEqual(Store.state.syncQueue.filter(o => o.type === 'site').length, 1);
  });
  await test('sitesOf: 정렬 적용', () => {
    reset();
    const a = Store.addClient('A');
    const s1 = Store.addSite(a.id); Store.updateSite(s1.id, { date: '2026-09-20' });
    const s2 = Store.addSite(a.id); Store.updateSite(s2.id, { date: '2026-09-01' });
    const s3 = Store.addSite(a.id);
    assert.deepStrictEqual(Store.sitesOf(a.id).map(s => s.id), [s3.id, s2.id, s1.id]);
  });
  await test('deleteSite', () => {
    reset();
    const a = Store.addClient('A'); const s = Store.addSite(a.id);
    Store.deleteSite(s.id);
    assert.strictEqual(Store.state.sites.length, 0);
    assert.ok(Store.state.syncQueue.some(o => o.op === 'delete' && o.id === s.id));
  });

  console.log('photo (고정값 사진)');
  const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(400);
  await test('addPhoto: 거래처에 붙고 큐에 photo upsert', () => {
    reset();
    const a = Store.addClient('A');
    const p = Store.addPhoto(a.id, { name: '김실장 명함', dataUrl: IMG, w: 1280, h: 720, bytes: 300 });
    assert.ok(p && p.id.startsWith('p_'));
    assert.strictEqual(p.clientId, a.id);
    assert.strictEqual(Store.photosOf(a.id).length, 1);
    const op = Store.state.syncQueue.find(o => o.type === 'photo');
    assert.ok(op); assert.strictEqual(op.op, 'upsert'); assert.strictEqual(op.data.dataUrl, IMG);
  });
  await test('photosOf: 추가한 순서(오래된 것 먼저), 다른 거래처는 안 섞임', () => {
    reset();
    const a = Store.addClient('A'), b = Store.addClient('B');
    const p1 = Store.addPhoto(a.id, { name: '1', dataUrl: IMG, createdAt: 1 });
    const p2 = Store.addPhoto(a.id, { name: '2', dataUrl: IMG, createdAt: 2 });
    Store.addPhoto(b.id, { name: '3', dataUrl: IMG });
    assert.deepStrictEqual(Store.photosOf(a.id).map(p => p.id), [p1.id, p2.id]);
    assert.strictEqual(Store.photosOf(b.id).length, 1);
  });
  await test('updatePhoto / deletePhoto', () => {
    reset();
    const a = Store.addClient('A');
    const p = Store.addPhoto(a.id, { name: '', dataUrl: IMG });
    Store.updatePhoto(p.id, { name: '견적서' });
    assert.strictEqual(Store.getPhoto(p.id).name, '견적서');
    Store.deletePhoto(p.id);
    assert.strictEqual(Store.getPhoto(p.id), null);
    assert.ok(Store.state.syncQueue.some(o => o.type === 'photo' && o.op === 'delete' && o.id === p.id));
  });
  await test('deleteClient: 사진도 같이 삭제, 큐에 delete', () => {
    reset();
    const a = Store.addClient('A');
    const p = Store.addPhoto(a.id, { name: '명함', dataUrl: IMG });
    Store.deleteClient(a.id);
    assert.strictEqual(Store.state.photos.length, 0);
    assert.ok(Store.state.syncQueue.some(o => o.type === 'photo' && o.op === 'delete' && o.id === p.id));
  });
  await test('저장공간이 가득 차면 사진을 되돌리고 null', () => {
    reset();
    const a = Store.addClient('A');
    const realSet = localStorage.setItem;
    localStorage.setItem = () => { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; };
    const p = Store.addPhoto(a.id, { name: '큰사진', dataUrl: IMG });
    localStorage.setItem = realSet;
    assert.strictEqual(p, null);
    assert.strictEqual(Store.state.photos.length, 0, '메모리 상태도 되돌아감');
    assert.strictEqual(Store.state.syncQueue.filter(o => o.type === 'photo').length, 0, '큐에도 남지 않음');
  });

  console.log('settings');
  await test('setSettings: 질문 문구·백업키 저장, 설정은 큐에 settings 로', () => {
    reset();
    Store.setSettings({ questions: Object.assign({}, Share.DEFAULT_QUESTIONS, { toilet: '화장실?' }), backupKey: 'k' });
    assert.strictEqual(Store.state.settings.questions.toilet, '화장실?');
    assert.strictEqual(Store.state.settings.backupKey, 'k');
    const op = Store.state.syncQueue.find(o => o.type === 'settings');
    assert.ok(op); assert.strictEqual(op.data.backupKey, undefined, '백업키는 서버로 보내지 않음');
  });

  console.log('flush');
  await test('백업키 없으면 fetch 안 함, 큐 유지', async () => {
    reset();
    Store.addClient('A');
    await runTimers();
    assert.strictEqual(fetchCalls.length, 0);
    assert.strictEqual(Store.pendingCount(), 1);
  });
  await test('백업키 있으면 디바운스 후 POST, 성공 시 큐 비움', async () => {
    reset();
    Store.setSettings({ backupKey: 'k' });
    Store.addClient('A');
    await runTimers();
    assert.strictEqual(fetchCalls.length, 1);
    const [url, opt] = fetchCalls[0];
    assert.ok(url.endsWith('/webhook/sitenote-sync'));
    const body = JSON.parse(opt.body);
    assert.strictEqual(body.key, 'k');
    assert.ok(body.ops.length >= 1);
    assert.strictEqual(Store.pendingCount(), 0);
    assert.ok(Store.state.lastSyncAt > 0);
  });
  await test('실패 시 큐 유지', async () => {
    reset();
    fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
    Store.setSettings({ backupKey: 'k' });
    Store.addClient('A');
    await runTimers();
    assert.ok(Store.pendingCount() >= 1);
    assert.ok(Store.state.lastSyncError);
    fetchImpl = async () => ({ ok: true, json: async () => ({ ok: true }) });
  });
  await test('오프라인이면 전송 안 함', async () => {
    reset();
    navigator.onLine = false;
    Store.setSettings({ backupKey: 'k' });
    Store.addClient('A');
    await runTimers();
    assert.strictEqual(fetchCalls.length, 0);
    navigator.onLine = true;
  });
  await test('flush 중 새 변경이 생기면 그 변경은 큐에 남음', async () => {
    reset();
    Store.setSettings({ backupKey: 'k' });
    const a = Store.addClient('A');
    fetchImpl = async () => { Store.updateClient(a.id, { name: 'A2' }); return { ok: true, json: async () => ({ ok: true }) }; };
    await runTimers();
    assert.strictEqual(Store.pendingCount(), 1);
    assert.strictEqual(Store.state.syncQueue[0].data.name, 'A2');
    fetchImpl = async () => ({ ok: true, json: async () => ({ ok: true }) });
  });

  console.log('restore');
  await test('restore: GET 결과로 전체 교체, 백업키·lastTab 은 유지', async () => {
    reset();
    Store.setSettings({ backupKey: 'k', lastTab: 'zzz' });
    fetchImpl = async () => ({ ok: true, json: async () => ({
      clients: [{ id: 'c9', name: 'R', order: 0, contacts: [] }],
      sites: [{ id: 's9', clientId: 'c9', name: 'RS', films: [] }],
      photos: [{ id: 'p9', clientId: 'c9', name: '명함', dataUrl: 'data:image/jpeg;base64,AAAA' }],
      settings: { questions: { toilet: '복원된 문구' } }
    }) });
    const r = await Store.restore(true);
    assert.strictEqual(r.clients, 1);
    assert.strictEqual(r.photos, 1);
    assert.strictEqual(Store.photosOf('c9')[0].name, '명함');
    assert.strictEqual(Store.getPhoto('p9').bytes, 0, '누락 필드는 기본값으로 채움');
    assert.strictEqual(Store.state.clients[0].name, 'R');
    assert.strictEqual(Store.getSite('s9').carReg.v, '미확인', '누락 필드는 기본값으로 채움');
    assert.strictEqual(Store.state.settings.questions.toilet, '복원된 문구');
    assert.strictEqual(Store.state.settings.questions.parking, Share.DEFAULT_QUESTIONS.parking, '없는 문구는 기본값');
    assert.strictEqual(Store.state.settings.backupKey, 'k');
    assert.strictEqual(Store.state.settings.lastTab, 'zzz');
    assert.strictEqual(Store.pendingCount(), 0, '복원 후 큐는 비움');
    fetchImpl = async () => ({ ok: true, json: async () => ({ ok: true }) });
  });
  await test('restore(force 아님): 데이터 있으면 거부', async () => {
    reset();
    Store.setSettings({ backupKey: 'k' });
    Store.addClient('A');
    fetchCalls = [];
    const r = await Store.restore(false);
    assert.strictEqual(r, null);
    assert.strictEqual(fetchCalls.length, 0);
  });
  await test('restore: 백업키 없으면 에러', async () => {
    reset();
    await assert.rejects(() => Store.restore(true), /백업키/);
  });

  console.log('onChange');
  await test('변경마다 콜백', () => {
    reset();
    let n = 0; const off = Store.onChange(() => n++);
    Store.addClient('A'); Store.setSettings({ lastTab: 'x' });
    assert.strictEqual(n, 2);
    off(); Store.addClient('B');
    assert.strictEqual(n, 2);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
