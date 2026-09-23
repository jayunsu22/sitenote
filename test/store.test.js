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
  await test('addSite: 15개 항목 기본값, 색상 순환', () => {
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
    // 날짜 없는 현장이 맨 위, 그 다음 최근 날짜순
    assert.deepStrictEqual(Store.sitesOf(a.id).map(s => s.id), [s3.id, s1.id, s2.id]);
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
  const BIG = 'data:image/jpeg;base64,' + 'B'.repeat(Share.PHOTO_CHUNK * 2 + 100); // 조각 3개짜리 원본
  const THUMB = 'data:image/jpeg;base64,' + 'C'.repeat(120);
  await test('addPhoto: 메타는 상태에, 원본은 조각 op 로 큐에', async () => {
    reset();
    const a = Store.addClient('A');
    const p = await Store.addPhoto(a.id, { name: '영림 2026년 단가', thumb: THUMB, dataUrl: BIG, w: 1500, h: 2000, bytes: 200000 });
    assert.ok(p && p.id.startsWith('p_'));
    assert.strictEqual(p.parts, 3, '90000자씩 3조각');
    assert.strictEqual(p.dataUrl, '', '원본은 상태에 두지 않음');
    assert.strictEqual(p.thumb, THUMB);
    const ops = Store.state.syncQueue.filter(o => o.type === 'photo');
    assert.strictEqual(ops.length, 4, '메타 1 + 조각 3');
    const meta = ops.find(o => o.id === p.id);
    assert.strictEqual(meta.data.name, '영림 2026년 단가');
    const chunks = ops.filter(o => o.id !== p.id);
    assert.deepStrictEqual(chunks.map(o => o.part), [0, 1, 2]);
    assert.ok(chunks.every(o => o.photoRef === p.id && !o.data), '큐에는 참조만, 본문은 전송 직전에 채움');
  });
  await test('photoData: 저장한 원본을 다시 읽음', async () => {
    reset();
    const a = Store.addClient('A');
    const p = await Store.addPhoto(a.id, { thumb: THUMB, dataUrl: IMG });
    assert.strictEqual(await Store.photoData(p.id), IMG);
  });
  await test('photosOf: 추가한 순서, 다른 거래처는 안 섞임', async () => {
    reset();
    const a = Store.addClient('A'), b = Store.addClient('B');
    const p1 = await Store.addPhoto(a.id, { name: '1', dataUrl: IMG, createdAt: 1 });
    const p2 = await Store.addPhoto(a.id, { name: '2', dataUrl: IMG, createdAt: 2 });
    await Store.addPhoto(b.id, { name: '3', dataUrl: IMG });
    assert.deepStrictEqual(Store.photosOf(a.id).map(p => p.id), [p1.id, p2.id]);
    assert.strictEqual(Store.photosOf(b.id).length, 1);
  });
  await test('updatePhoto: 설명만 바꾸면 메타만 다시 보냄', async () => {
    reset();
    const a = Store.addClient('A');
    const p = await Store.addPhoto(a.id, { name: '', thumb: THUMB, dataUrl: BIG });
    Store.state.syncQueue = [];
    Store.updatePhoto(p.id, { name: '영림 단가표' });
    assert.strictEqual(Store.getPhoto(p.id).name, '영림 단가표');
    const ops = Store.state.syncQueue.filter(o => o.type === 'photo');
    assert.deepStrictEqual(ops.map(o => o.id), [p.id], '조각은 다시 안 보냄');
  });
  await test('deletePhoto: 메타와 조각 모두 삭제', async () => {
    reset();
    const a = Store.addClient('A');
    const p = await Store.addPhoto(a.id, { dataUrl: BIG });
    Store.state.syncQueue = [];
    await Store.deletePhoto(p.id);
    assert.strictEqual(Store.getPhoto(p.id), null);
    const dels = Store.state.syncQueue.filter(o => o.type === 'photo' && o.op === 'delete').map(o => o.id).sort();
    assert.deepStrictEqual(dels, [p.id, p.id + '#0', p.id + '#1', p.id + '#2'].sort());
  });
  await test('deleteClient: 사진 메타·조각도 같이 삭제', async () => {
    reset();
    const a = Store.addClient('A');
    const p = await Store.addPhoto(a.id, { name: '명함', dataUrl: BIG });
    Store.deleteClient(a.id);
    assert.strictEqual(Store.state.photos.length, 0);
    const dels = Store.state.syncQueue.filter(o => o.type === 'photo' && o.op === 'delete').map(o => o.id);
    assert.strictEqual(dels.length, 4);
  });
  await test('저장공간이 가득 차면 사진을 되돌리고 null', async () => {
    reset();
    const a = Store.addClient('A');
    const realSet = localStorage.setItem;
    localStorage.setItem = () => { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; };
    const p = await Store.addPhoto(a.id, { name: '큰사진', dataUrl: IMG });
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
  await test('사진 조각은 전송 직전에 원본에서 채워진다', async () => {
    reset();
    Store.setSettings({ backupKey: 'k' });
    const a = Store.addClient('A');
    const big = 'data:image/jpeg;base64,' + 'B'.repeat(Share.PHOTO_CHUNK + 50);
    const p = await Store.addPhoto(a.id, { name: '단가표', thumb: 'data:image/jpeg;base64,CCCC', dataUrl: big });
    fetchCalls = [];
    await runTimers();
    const body = JSON.parse(fetchCalls[0][1].body);
    const chunkOps = body.ops.filter(o => o.type === 'photo' && o.data && o.data.photoId === p.id);
    assert.strictEqual(chunkOps.length, 2);
    assert.strictEqual(Share.joinChunks(chunkOps.map(o => o.data)), big, '보낸 조각을 붙이면 원본');
    assert.ok(body.ops.every(o => !('photoRef' in o)), '참조 필드는 서버로 보내지 않음');
    assert.strictEqual(Store.pendingCount(), 0);
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
      photos: [
        { id: 'p9', clientId: 'c9', name: '명함', thumb: 'data:image/jpeg;base64,CCCC', parts: 2 },
        { id: 'p9#1', photoId: 'p9', i: 1, chunk: 'BBBB' },
        { id: 'p9#0', photoId: 'p9', i: 0, chunk: 'data:image/jpeg;base64,AAAA' }
      ],
      settings: { questions: { toilet: '복원된 문구' } }
    }) });
    const r = await Store.restore(true);
    assert.strictEqual(r.clients, 1);
    assert.strictEqual(r.photos, 1);
    assert.strictEqual(Store.photosOf('c9')[0].name, '명함');
    assert.strictEqual(Store.getPhoto('p9').bytes, 0, '누락 필드는 기본값으로 채움');
    assert.strictEqual(await Store.photoData('p9'), 'data:image/jpeg;base64,AAAABBBB', '조각을 붙여 원본 복구');
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


  console.log('일정 — 데이터 보정');
  await test('구버전 현장 load: films.ready=false, days=[시작날짜], supplies=기본값', () => {
    reset();
    mem['sitenote.v1'] = JSON.stringify({ version: 1, clients: [], photos: [], sites: [
      { id: 's1', clientId: 'c1', color: 0, name: '구', date: '2026-09-19', films: [{ place: 'a', code: 'b' }] }
    ], settings: { questions: {} }, syncQueue: [] });
    Store.load();
    const s = Store.getSite('s1');
    assert.strictEqual(s.films[0].ready, false);
    assert.deepStrictEqual(s.days, [{ date: '2026-09-19', staff: [] }]);
    assert.deepStrictEqual(s.supplies.map(x => x.name), ['본드', '장갑']);
    assert.ok(s.supplies.every(x => x.ready === false));
  });
  await test('설정의 부자재 기본값이 3개면 보정도 3개, supplies 가 이미 있으면(빈 배열이라도) 그대로', () => {
    reset();
    mem['sitenote.v1'] = JSON.stringify({ version: 1, clients: [], photos: [], sites: [
      { id: 's1', clientId: 'c1', color: 0, name: '구', date: '' },
      { id: 's2', clientId: 'c1', color: 0, name: '빈', date: '', supplies: [] }
    ], settings: { supplyDefaults: ['본드', '장갑', '칼날'] }, syncQueue: [] });
    Store.load();
    assert.strictEqual(Store.getSite('s1').supplies.length, 3);
    assert.deepStrictEqual(Store.getSite('s2').supplies, []);
  });
  await test('days[0].date 가 시작날짜와 어긋나면 시작날짜 기준으로 민다', () => {
    reset();
    mem['sitenote.v1'] = JSON.stringify({ version: 1, clients: [], photos: [], sites: [
      { id: 's1', clientId: 'c1', color: 0, name: '구', date: '2026-09-22',
        days: [{ date: '2026-09-19', staff: ['김기사'] }, { date: '2026-09-20', staff: [' ', '박기사'] }] }
    ], settings: {}, syncQueue: [] });
    Store.load();
    assert.deepStrictEqual(Store.getSite('s1').days, [{ date: '2026-09-22', staff: ['김기사'] }, { date: '2026-09-23', staff: ['박기사'] }]);
  });
  await test('addSite: supplies 는 기본값 복사본, days 1줄', () => {
    reset();
    const c = Store.addClient('A');
    const s = Store.addSite(c.id);
    assert.deepStrictEqual(s.days, [{ date: '', staff: [] }]);
    assert.deepStrictEqual(s.supplies.map(x => x.name), ['본드', '장갑']);
    s.supplies[0].name = '변경';
    assert.strictEqual(Store.state.settings.supplyDefaults[0], '본드', '참조 공유 아님');
  });
  await test('settingsForSync: team/supplyDefaults 포함, backupKey/lastTab/lastView 제외', () => {
    reset();
    Store.setSettings({ team: ['김기사'], backupKey: 'k', lastTab: 'c1', lastView: 'schedule' });
    const op = Store.state.syncQueue[Store.state.syncQueue.length - 1];
    assert.strictEqual(op.type, 'settings');
    assert.deepStrictEqual(Object.keys(op.data).sort(), ['questions', 'supplyDefaults', 'team']);
    assert.deepStrictEqual(op.data.team, ['김기사']);
  });

  console.log('일정 — 현장 변경');
  await test('updateSite({date}): 일차가 같이 밀리고 큐에 upsert 1건', () => {
    reset();
    const c = Store.addClient('A'); const s = Store.addSite(c.id);
    Store.updateSite(s.id, { date: '2026-09-19' });
    Store.addDay(s.id);
    assert.deepStrictEqual(Store.getSite(s.id).days.map(d => d.date), ['2026-09-19', '2026-09-20']);
    const before = Store.state.syncQueue.length;
    Store.updateSite(s.id, { date: '2026-09-22' });
    assert.deepStrictEqual(Store.getSite(s.id).days.map(d => d.date), ['2026-09-22', '2026-09-23']);
    assert.strictEqual(Store.state.syncQueue.length, before, '같은 현장 upsert 는 병합됨');
  });
  await test('addStaff/removeStaff: 공백 trim, 빈 값·중복 무시', () => {
    reset();
    const c = Store.addClient('A'); const s = Store.addSite(c.id);
    Store.addStaff(s.id, 0, ' 김기사 ');
    Store.addStaff(s.id, 0, '김기사');
    Store.addStaff(s.id, 0, '   ');
    Store.addStaff(s.id, 0, '박기사');
    assert.deepStrictEqual(Store.getSite(s.id).days[0].staff, ['김기사', '박기사']);
    Store.removeStaff(s.id, 0, '김기사');
    assert.deepStrictEqual(Store.getSite(s.id).days[0].staff, ['박기사']);
    Store.addStaff(s.id, 5, '없는날'); // 없는 일차는 무시
    assert.strictEqual(Store.getSite(s.id).days.length, 1);
  });
  await test('addDay/removeDay/setDayDate: 마지막 +1, 1일차는 못 지우고 못 바꿈', () => {
    reset();
    const c = Store.addClient('A'); const s = Store.addSite(c.id);
    Store.updateSite(s.id, { date: '2026-09-30' });
    Store.addDay(s.id); Store.addDay(s.id);
    assert.deepStrictEqual(Store.getSite(s.id).days.map(d => d.date), ['2026-09-30', '2026-10-01', '2026-10-02']);
    Store.removeDay(s.id, 0);
    assert.strictEqual(Store.getSite(s.id).days.length, 3);
    Store.removeDay(s.id, 1);
    assert.deepStrictEqual(Store.getSite(s.id).days.map(d => d.date), ['2026-09-30', '2026-10-02']);
    Store.setDayDate(s.id, 1, '2026-10-05');
    Store.setDayDate(s.id, 0, '2026-10-05');
    assert.deepStrictEqual(Store.getSite(s.id).days.map(d => d.date), ['2026-09-30', '2026-10-05']);
    assert.strictEqual(Store.getSite(s.id).date, '2026-09-30');
  });
  await test('setDays: 날짜순 정렬, 남은 날 인원 유지, 빠진 날 인원 버림, 비면 1줄', () => {
    reset();
    const c = Store.addClient('A'); const s = Store.addSite(c.id);
    Store.setDays(s.id, ['2026-09-21', '2026-09-18', '2026-09-18']);
    assert.deepStrictEqual(Store.getSite(s.id).days.map(d => d.date), ['2026-09-18', '2026-09-21']);
    assert.strictEqual(Store.getSite(s.id).date, '2026-09-18');
    Store.addStaff(s.id, 1, '김기사');
    Store.setDays(s.id, ['2026-09-21', '2026-09-25']);
    assert.deepStrictEqual(Store.getSite(s.id).days, [{ date: '2026-09-21', staff: ['김기사'] }, { date: '2026-09-25', staff: [] }]);
    assert.strictEqual(Store.getSite(s.id).date, '2026-09-21');
    Store.setDays(s.id, []);
    assert.deepStrictEqual(Store.getSite(s.id).days, [{ date: '', staff: [] }]);
    assert.strictEqual(Store.getSite(s.id).date, '');
    Store.setDays(s.id, ['9/25', '']);
    assert.deepStrictEqual(Store.getSite(s.id).days, [{ date: '', staff: [] }], '잘못된 날짜는 무시');
  });
  await test('addDay: 시작날짜가 없으면 빈 날짜 줄', () => {
    reset();
    const c = Store.addClient('A'); const s = Store.addSite(c.id);
    Store.addDay(s.id);
    assert.deepStrictEqual(Store.getSite(s.id).days.map(d => d.date), ['', '']);
  });
  await test('filmStage: 기본 0, 구버전 보정 0, setFilmStage 범위 밖은 0', () => {
    reset();
    const c = Store.addClient('A'); const s = Store.addSite(c.id);
    assert.strictEqual(s.filmStage, 0);
    Store.setFilmStage(s.id, 2);
    assert.strictEqual(Store.getSite(s.id).filmStage, 2);
    Store.setFilmStage(s.id, 9);
    assert.strictEqual(Store.getSite(s.id).filmStage, 0);
    mem['sitenote.v1'] = JSON.stringify({ version: 1, clients: [], photos: [], sites: [
      { id: 's1', clientId: 'c1', color: 0, name: '구', date: '' }, { id: 's2', clientId: 'c1', color: 0, name: '구', date: '', filmStage: 3 }
    ], settings: {}, syncQueue: [] });
    Store.load();
    assert.strictEqual(Store.getSite('s1').filmStage, 0);
    assert.strictEqual(Store.getSite('s2').filmStage, 3);
  });
  await test('toggleFilm/toggleSupply/addSupply/removeSupply', () => {
    reset();
    const c = Store.addClient('A'); const s = Store.addSite(c.id);
    Store.updateSite(s.id, { films: [{ place: 'a', code: 'PS035' }] });
    Store.toggleFilm(s.id, 0);
    assert.strictEqual(Store.getSite(s.id).films[0].ready, true);
    Store.toggleFilm(s.id, 0);
    assert.strictEqual(Store.getSite(s.id).films[0].ready, false);
    Store.toggleSupply(s.id, 1);
    assert.strictEqual(Store.getSite(s.id).supplies[1].ready, true);
    Store.addSupply(s.id, ' 칼날 '); Store.addSupply(s.id, ''); Store.addSupply(s.id, '칼날');
    assert.deepStrictEqual(Store.getSite(s.id).supplies.map(x => x.name), ['본드', '장갑', '칼날']);
    Store.removeSupply(s.id, 0);
    assert.deepStrictEqual(Store.getSite(s.id).supplies.map(x => x.name), ['장갑', '칼날']);
  });

  await test('setNeedStaff: 0(미정)부터 99까지, 잘못된 값은 0, 새 현장·구버전 현장은 0', () => {
    reset();
    const c = Store.addClient('A'); const s = Store.addSite(c.id);
    assert.strictEqual(s.needStaff, 0);
    Store.setNeedStaff(s.id, 3);
    assert.strictEqual(Store.getSite(s.id).needStaff, 3);
    Store.setNeedStaff(s.id, -1);
    assert.strictEqual(Store.getSite(s.id).needStaff, 0, '0 아래로는 안 내려감');
    Store.setNeedStaff(s.id, 500);
    assert.strictEqual(Store.getSite(s.id).needStaff, 99);
    Store.setNeedStaff(s.id, '가나');
    assert.strictEqual(Store.getSite(s.id).needStaff, 0);
  });
  await test('구버전 현장 load: needStaff 없으면 0', () => {
    reset();
    mem['sitenote.v1'] = JSON.stringify({ version: 1, clients: [], photos: [], sites: [
      { id: 's1', clientId: 'c1', color: 0, name: '옛현장', date: '2026-09-19' }
    ], settings: { questions: {} }, syncQueue: [] });
    Store.load();
    assert.strictEqual(Store.getSite('s1').needStaff, 0);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
