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
  await test('현장업무 연결 칸: 새 현장은 adminId 빈 값, adminSynced null', () => {
    reset();
    const a = Store.addClient('A'); const s = Store.addSite(a.id);
    assert.strictEqual(s.adminId, '');
    assert.strictEqual(s.adminSynced, null);
  });
  await test('현장업무 연결 칸: 저장·백업 큐·다시 불러오기에서 유지', () => {
    reset();
    const a = Store.addClient('A'); const s = Store.addSite(a.id);
    Store.updateSite(s.id, { adminId: 'recX', adminSynced: { name: 'N', date: '2026-10-07', staff: ['가'] } });
    const q = Store.state.syncQueue.filter(o => o.type === 'site' && o.id === s.id);
    assert.strictEqual(q.length, 1);
    assert.strictEqual(q[0].data.adminId, 'recX');
    Store.load();
    assert.strictEqual(Store.getSite(s.id).adminId, 'recX');
    assert.deepStrictEqual(Store.getSite(s.id).adminSynced, { name: 'N', date: '2026-10-07', staff: ['가'] });
  });
  await test('현장업무 연결 칸: 예전 현장(칸 없음)도 빈 값으로 보정', () => {
    reset();
    const a = Store.addClient('A'); const s = Store.addSite(a.id);
    const raw = JSON.parse(localStorage.getItem('sitenote.v1'));
    delete raw.sites[0].adminId; delete raw.sites[0].adminSynced;
    localStorage.setItem('sitenote.v1', JSON.stringify(raw));
    Store.load();
    assert.strictEqual(Store.getSite(s.id).adminId, '');
    assert.strictEqual(Store.getSite(s.id).adminSynced, null);
  });
  await test('기사 정보: 경력·페이·사는곳·메모가 저장·다시 불러오기에서 유지되고 모르는 칸은 버린다', () => {
    reset();
    Store.setSettings({ people: { '서영호': { phone: '010-1', car: '12가3456', career: '10년', pay: '일 28만', home: '부천', memo: '메모', 이상한칸: 'x' } } });
    Store.load();
    assert.deepStrictEqual(Store.state.settings.people['서영호'],
      { phone: '010-1', car: '12가3456', career: '10년', pay: '일 28만', home: '부천', memo: '메모', grade: '' });
  });
  await test('기사 정보: 예전 백업(전화·차량만)도 그대로 읽는다', () => {
    reset();
    Store.setSettings({ people: { '염문철': { phone: '010-3', car: '' } } });
    Store.load();
    assert.deepStrictEqual(Store.state.settings.people['염문철'],
      { phone: '010-3', car: '', career: '', pay: '', home: '', memo: '', grade: '' });
  });
  console.log('이름 바꾸기');
  const 이름판 = () => {
    reset();
    Store.setSettings({ team: ['김정헌', '서영호', '염문철'], people: { '김정헌': { phone: '010-1', car: '12가3456', career: '10년', pay: '일 28만', home: '부천', memo: '메모', grade: 'A' } } });
    const c = Store.addClient('A'); const s1 = Store.addSite(c.id); const s2 = Store.addSite(c.id); const s3 = Store.addSite(c.id);
    Store.addStaff(s1.id, 0, '김정헌'); Store.addStaff(s1.id, 0, '서영호');
    Store.addStaff(s2.id, 0, '염문철');
    const sv = Store.addService(s3.id); Store.updateService(s3.id, sv.id, { request: 'x', staff: ['김정헌'] });
    return { s1, s2, s3, sv };
  };
  await test('renameStaff: 명단 순서는 그대로, 기사 정보(6칸+등급)가 새 이름으로 옮겨간다', () => {
    이름판();
    const r = Store.renameStaff('김정헌', '김정훈');
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(Store.state.settings.team, ['김정훈', '서영호', '염문철']);
    assert.ok(!('김정헌' in Store.state.settings.people));
    assert.deepStrictEqual(Store.state.settings.people['김정훈'],
      { phone: '010-1', car: '12가3456', career: '10년', pay: '일 28만', home: '부천', memo: '메모', grade: 'A' });
  });
  await test('renameStaff: 모든 현장의 날짜별 인원과 AS 담당도 새 이름으로 바뀐다', () => {
    const { s1, s2, s3 } = 이름판();
    Store.renameStaff('김정헌', '김정훈');
    assert.deepStrictEqual(Store.getSite(s1.id).days[0].staff, ['김정훈', '서영호']);
    assert.deepStrictEqual(Store.getSite(s2.id).days[0].staff, ['염문철']);
    assert.deepStrictEqual(Store.getSite(s3.id).services[0].staff, ['김정훈']);
  });
  await test('renameStaff: 바뀐 현장만 백업 큐에 올라가고 설정도 올라간다', () => {
    const { s1, s2, s3 } = 이름판();
    Store.state.syncQueue = [];
    Store.renameStaff('김정헌', '김정훈');
    const ids = Store.state.syncQueue.filter(o => o.type === 'site').map(o => o.id).sort();
    assert.deepStrictEqual(ids, [s1.id, s3.id].sort());
    assert.ok(!ids.includes(s2.id));
    assert.ok(Store.state.syncQueue.some(o => o.type === 'settings'));
  });
  await test('renameStaff: 이미 있는 이름·같은 이름·빈 이름·명단에 없는 이름은 거절하고 아무것도 안 바꾼다', () => {
    이름판();
    Store.state.syncQueue = [];
    const before = JSON.stringify(Store.state.settings.team) + JSON.stringify(Store.state.settings.people);
    assert.strictEqual(Store.renameStaff('김정헌', '서영호').ok, false);
    assert.strictEqual(Store.renameStaff('김정헌', '김정헌').ok, false);
    assert.strictEqual(Store.renameStaff('김정헌', '   ').ok, false);
    assert.strictEqual(Store.renameStaff('없는사람', '새이름').ok, false);
    assert.strictEqual(JSON.stringify(Store.state.settings.team) + JSON.stringify(Store.state.settings.people), before);
    assert.strictEqual(Store.state.syncQueue.length, 0);
  });
  await test('renameStaff: 새 이름이 그 날 이미 들어 있으면(일당 기사) 중복 없이 합친다', () => {
    const { s1 } = 이름판();
    Store.addStaff(s1.id, 0, '최기사');
    Store.renameStaff('김정헌', '최기사');
    assert.deepStrictEqual(Store.getSite(s1.id).days[0].staff, ['최기사', '서영호']);
  });
  await test('기사 정보: 등급은 A·B·C·F 만 남고 나머지는 빈 값으로 읽힌다', () => {
    reset();
    Store.setSettings({ people: { '가': { grade: 'C' }, '나': { grade: 'Z' }, '다': { phone: '1' } } });
    Store.load();
    assert.strictEqual(Store.state.settings.people['가'].grade, 'C');
    assert.strictEqual(Store.state.settings.people['나'].grade, '');
    assert.strictEqual(Store.state.settings.people['다'].grade, '');
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

  await test('화면 이동·백업키·달력 보기만 바꾸면 설정을 서버로 안 올린다', () => {
    reset();
    Store.setSettings({ lastView: 'schedule' });
    Store.setSettings({ lastTab: 'c1' });
    Store.setSettings({ calShow: 'region' });
    Store.setSettings({ backupKey: 'k' });
    assert.strictEqual(Store.state.syncQueue.filter(o => o.type === 'settings').length, 0);
    assert.strictEqual(Store.state.settings.lastTab, 'c1', '폰에는 저장됨');
  });
  await test('팀원·부자재·질문을 바꾸면 올린다', () => {
    reset();
    Store.setSettings({ team: ['김기사'] });
    let op = Store.state.syncQueue.find(o => o.type === 'settings');
    assert.deepStrictEqual(op.data.team, ['김기사']);
    reset();
    Store.setSettings({ supplyDefaults: ['본드'] });
    assert.ok(Store.state.syncQueue.find(o => o.type === 'settings'));
  });
  await test('다른 브라우저에서 앱을 열기만 해서는 백업의 팀원 명단을 못 덮는다', async () => {
    reset();
    // 비어 있는 다른 브라우저: 백업키만 있고 팀원 명단은 빈 상태로 화면을 돌아다닌다
    Store.setSettings({ backupKey: 'k' });
    Store.setSettings({ lastView: 'main' }); Store.setSettings({ lastTab: 'x' }); Store.setSettings({ lastView: 'schedule' });
    await runTimers();
    assert.strictEqual(fetchCalls.length, 0, '보낼 게 없으니 서버에 아무것도 안 간다');
  });
  await test('백업키를 넣으면 기다리던 변경은 보낸다 (설정은 안 보낸다)', async () => {
    reset();
    Store.addClient('A');                       // 키 없이 적어 둔 것
    Store.setSettings({ backupKey: 'k' });
    await runTimers();
    assert.strictEqual(fetchCalls.length, 1);
    const body = JSON.parse(fetchCalls[0][1].body);
    assert.deepStrictEqual(body.ops.map(o => o.type), ['client']);
    assert.strictEqual(Store.pendingCount(), 0);
  });

  await test('팀원 연락처·차량은 백업에 같이 올라간다', () => {
    reset();
    Store.setSettings({ people: { '김기사': { phone: '010-1', car: '12가3456' } } });
    const op = Store.state.syncQueue.find(o => o.type === 'settings');
    assert.deepStrictEqual(op.data.people, { '김기사': { phone: '010-1', car: '12가3456' } });
  });
  await test('연락처 표: 저장 후 다시 불러와도 그대로, 이상한 값은 버린다', () => {
    reset();
    Store.setSettings({ people: { '김기사': { phone: ' 010-1 ', car: '12가3456' } } });
    Store.load();
    assert.deepStrictEqual(Store.state.settings.people, { '김기사': { phone: '010-1', car: '12가3456', career: '', pay: '', home: '', memo: '', grade: '' } });
    mem['sitenote.v1'] = JSON.stringify({ version: 1, clients: [], sites: [], photos: [],
      settings: { people: ['잘못된', '모양'] }, syncQueue: [] });
    Store.load();
    assert.deepStrictEqual(Store.state.settings.people, {});
  });
  await test('예전 데이터(연락처 표 없음)도 빈 표로 열린다', () => {
    reset();
    mem['sitenote.v1'] = JSON.stringify({ version: 1, clients: [], sites: [], photos: [],
      settings: { team: ['김기사'] }, syncQueue: [] });
    Store.load();
    assert.deepStrictEqual(Store.state.settings.team, ['김기사']);
    assert.deepStrictEqual(Store.state.settings.people, {});
  });

  await test('AS: 접수·고치기·지우기, 현장째로 백업 큐에 올라간다', () => {
    reset();
    const a = Store.addClient('A'); const s = Store.addSite(a.id);
    Store.state.syncQueue = [];
    const v = Store.addService(s.id, { request: '들뜸 재시공' });
    assert.ok(v.id.startsWith('v'));
    assert.strictEqual(v.kind, 'AS'); assert.strictEqual(v.date, ''); assert.strictEqual(v.done, false);
    Store.updateService(s.id, v.id, { date: '2026-09-30', staff: ['서영호', ' ', '서영호'], kind: '추가' });
    let got = Store.getSite(s.id).services[0];
    assert.strictEqual(got.date, '2026-09-30'); assert.strictEqual(got.kind, '추가');
    assert.deepStrictEqual(got.staff, ['서영호'], '빈 이름·중복 정리');
    const op = Store.state.syncQueue.find(o => o.type === 'site' && o.id === s.id);
    assert.strictEqual(op.data.services.length, 1, '현장 백업에 AS 가 같이 간다');
    Store.updateService(s.id, v.id, { customer: '홍길동', phone: '010-1234-5678' });
    assert.strictEqual(Store.getSite(s.id).services[0].customer, '홍길동', '고객명도 안 지워진다');
    Store.updateService(s.id, v.id, { bizContact: '이실장' });
    assert.strictEqual(Store.getSite(s.id).services[0].bizContact, '이실장', '고른 업자 담당자도 안 지워진다');
    assert.strictEqual(Store.getSite(s.id).services[0].phone, '010-1234-5678', '고객 연락처가 저장 정리에서 안 지워진다');
    assert.strictEqual(Store.getSite(s.id).services[0].date, '2026-09-30', '연락처를 고쳐도 다른 칸은 그대로');
    Store.updateService(s.id, v.id, { done: true });
    assert.strictEqual(Store.getSite(s.id).services[0].done, true);
    assert.strictEqual(Store.getSite(s.id).services[0].phone, '010-1234-5678');
    Store.removeService(s.id, v.id);
    assert.deepStrictEqual(Store.getSite(s.id).services, []);
  });
  await test('예전 현장(AS 없음)·이상한 AS 줄도 열린다', () => {
    reset();
    mem['sitenote.v1'] = JSON.stringify({ version: 1, clients: [], photos: [], settings: {}, syncQueue: [], sites: [
      { id: 's1', clientId: 'c1', name: '예전' },
      { id: 's2', clientId: 'c1', name: '이상함', services: [null, { request: 'id 없음' }, { id: 'v9', kind: '?', staff: 'x' }] }
    ] });
    Store.load();
    assert.deepStrictEqual(Store.getSite('s1').services, []);
    const v = Store.getSite('s2').services;
    assert.strictEqual(v.length, 1); assert.strictEqual(v[0].kind, 'AS'); assert.deepStrictEqual(v[0].staff, []);
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
      settings: { questions: { toilet: '복원된 문구' }, people: { '김기사': { phone: '010-9', car: '99가9999' } } }
    }) });
    const r = await Store.restore(true);
    assert.strictEqual(r.clients, 1);
    assert.deepStrictEqual(Store.state.settings.people, { '김기사': { phone: '010-9', car: '99가9999', career: '', pay: '', home: '', memo: '', grade: '' } }, '연락처 표도 복원');
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
  await test('settingsForSync: team/supplyDefaults/people 포함, backupKey/lastTab/lastView 제외', () => {
    reset();
    Store.setSettings({ team: ['김기사'], backupKey: 'k', lastTab: 'c1', lastView: 'schedule' });
    const op = Store.state.syncQueue[Store.state.syncQueue.length - 1];
    assert.strictEqual(op.type, 'settings');
    assert.deepStrictEqual(Object.keys(op.data).sort(), ['people', 'questions', 'reviewQuestions', 'reviewTags', 'serviceTools', 'supplyDefaults', 'team']);
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

  await test('입구차단기: 새 현장·예전 현장 모두 기본값 경비호출, 지운 값은 그대로 빈 칸', () => {
    reset();
    const c = Store.addClient('A'); const s = Store.addSite(c.id);
    assert.strictEqual(Store.getSite(s.id).barrier, '경비호출');
    Store.updateSite(s.id, { barrier: '' });
    mem['sitenote.v1'] = JSON.stringify({ version: 1, clients: [], photos: [], sites: [
      { id: 's1', clientId: 'c1', color: 0, name: '옛현장', date: '2026-09-19' },
      { id: 's2', clientId: 'c1', color: 0, name: '지운현장', barrier: '' }
    ], settings: { questions: {} }, syncQueue: [] });
    Store.load();
    assert.strictEqual(Store.getSite('s1').barrier, '경비호출');
    assert.strictEqual(Store.getSite('s2').barrier, '');
  });

  // ---------- 현장 후기 (2026-09-27) ----------
  await test('후기: 새 현장·구버전 현장은 빈 후기, 설정 기본 질문·태그', () => {
    reset();
    const c = Store.addClient('A'); const s = Store.addSite(c.id);
    assert.deepStrictEqual(Store.getSite(s.id).review, { answers: {}, tags: [] });
    mem['sitenote.v1'] = JSON.stringify({ version: 1, clients: [], photos: [], sites: [
      { id: 's1', clientId: 'c1', color: 0, name: '옛현장', date: '2026-09-19' }
    ], settings: { questions: {} }, syncQueue: [] });
    Store.load();
    assert.deepStrictEqual(Store.getSite('s1').review, { answers: {}, tags: [] });
    assert.deepStrictEqual(Store.state.settings.reviewQuestions, ['시공후기', '개선사항은 무엇인가?', '견적과 다른 부분은 어떤 것이었나?']);
    assert.deepStrictEqual(Store.state.settings.reviewTags, ['도배시공후', '바닥시공후']);
  });

  await test('후기: setReviewAnswer / toggleReviewTag (5개 넘으면 false)', () => {
    reset();
    const c = Store.addClient('A'); const s = Store.addSite(c.id);
    Store.setReviewAnswer(s.id, '시공후기', '깔끔했음');
    assert.strictEqual(Store.getSite(s.id).review.answers['시공후기'], '깔끔했음');
    ['a', 'b', 'c', 'd', 'e'].forEach((t) => assert.strictEqual(Store.toggleReviewTag(s.id, t), true));
    assert.strictEqual(Store.toggleReviewTag(s.id, 'f'), false);          // 6개째는 안 들어간다
    assert.deepStrictEqual(Store.getSite(s.id).review.tags, ['a', 'b', 'c', 'd', 'e']);
    assert.strictEqual(Store.toggleReviewTag(s.id, 'a'), true);           // 끄기
    assert.deepStrictEqual(Store.getSite(s.id).review.tags, ['b', 'c', 'd', 'e']);
  });

  await test('후기: 질문·태그 설정은 백업(동기화) 대상', () => {
    reset();
    Store.setSettings({ reviewTags: ['도배시공후', '거주중'] });
    const q = Store.state.syncQueue.filter((o) => o.type === 'settings');
    assert.strictEqual(q.length, 1);
    assert.deepStrictEqual(q[0].data.reviewTags, ['도배시공후', '거주중']);
    assert.ok(Array.isArray(q[0].data.reviewQuestions));
  });

  await test('후기 질문 제목 고치기: 설정 자리 그대로, 모든 현장의 답이 새 제목으로 옮겨간다', () => {
    reset();
    const c = Store.addClient('A'); const s1 = Store.addSite(c.id); const s2 = Store.addSite(c.id);
    Store.setReviewAnswer(s1.id, '시공후기', '깔끔');
    Store.setReviewAnswer(s2.id, '개선사항은 무엇인가?', '퍼티');
    assert.strictEqual(Store.renameReviewQuestion('시공후기', '  시공 후기 한줄 '), true);
    assert.deepStrictEqual(Store.state.settings.reviewQuestions, ['시공 후기 한줄', '개선사항은 무엇인가?', '견적과 다른 부분은 어떤 것이었나?']);
    assert.deepStrictEqual(Store.getSite(s1.id).review.answers, { '시공 후기 한줄': '깔끔' });
    assert.deepStrictEqual(Store.getSite(s2.id).review.answers, { '개선사항은 무엇인가?': '퍼티' });   // 상관없는 현장은 그대로
  });

  await test('후기 질문 제목 고치기: 빈 제목·다른 질문과 같은 제목·없는 질문은 false', () => {
    reset();
    assert.strictEqual(Store.renameReviewQuestion('시공후기', '  '), false);
    assert.strictEqual(Store.renameReviewQuestion('시공후기', '개선사항은 무엇인가?'), false);
    assert.strictEqual(Store.renameReviewQuestion('없는 질문', '새 질문'), false);
    assert.strictEqual(Store.renameReviewQuestion('시공후기', '시공후기'), true);   // 그대로면 아무것도 안 바뀜
    assert.deepStrictEqual(Store.state.settings.reviewQuestions[0], '시공후기');
  });

  await test('후기 질문 제목 고치기: 그 현장에 새 제목 답이 이미 있으면 두 답을 줄바꿈으로 합친다', () => {
    reset();
    const c = Store.addClient('A'); const s = Store.addSite(c.id);
    // 예전에 지웠다 다시 만든 질문처럼 두 제목에 답이 다 있는 경우
    Store.setReviewAnswer(s.id, '시공후기', '예전 답');
    Store.setReviewAnswer(s.id, '후기', '새 답');
    Store.renameReviewQuestion('시공후기', '후기');
    assert.deepStrictEqual(Store.getSite(s.id).review.answers, { '후기': '새 답\n예전 답' });
  });

  await test('후기 질문 순서: moveReviewQuestion 위/아래, 끝에서는 그대로', () => {
    reset();
    Store.moveReviewQuestion(2, -1);
    assert.deepStrictEqual(Store.state.settings.reviewQuestions, ['시공후기', '견적과 다른 부분은 어떤 것이었나?', '개선사항은 무엇인가?']);
    Store.moveReviewQuestion(0, -1);   // 맨 위에서 위로 → 그대로
    Store.moveReviewQuestion(2, 1);    // 맨 아래에서 아래로 → 그대로
    assert.deepStrictEqual(Store.state.settings.reviewQuestions[0], '시공후기');
    assert.deepStrictEqual(Store.state.settings.reviewQuestions[2], '개선사항은 무엇인가?');
  });

  // ---------- AS·추가작업: 챙길 부자재·공구 (2026-10-05) ----------
  await test('AS 챙길 것: 설정 기본 목록, 접수에 tools 저장(빈값·중복 정리), 예전 접수는 빈 목록', () => {
    reset();
    assert.deepStrictEqual(Store.state.settings.serviceTools, ['사포', '퍼티', '열풍기', '재단판']);
    const c = Store.addClient('A'); const s = Store.addSite(c.id);
    const v = Store.addService(s.id, { request: '들뜸', tools: [' 사포 ', '', '사포', '퍼티'] });
    assert.deepStrictEqual(Store.getSite(s.id).services[0].tools, ['사포', '퍼티']);
    Store.updateService(s.id, v.id, { tools: ['열풍기'] });
    assert.deepStrictEqual(Store.getSite(s.id).services[0].tools, ['열풍기']);
    mem['sitenote.v1'] = JSON.stringify({ version: 1, clients: [], photos: [], sites: [
      { id: 's1', clientId: 'c1', color: 0, name: '옛현장', services: [{ id: 'v1', request: 'x' }] }
    ], settings: { questions: {} }, syncQueue: [] });
    Store.load();
    assert.deepStrictEqual(Store.getSite('s1').services[0].tools, []);
    assert.deepStrictEqual(Store.state.settings.serviceTools, ['사포', '퍼티', '열풍기', '재단판']);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
