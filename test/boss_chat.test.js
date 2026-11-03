// 🤖 대화형 비서 (boss_chat.js) — 이름·현장·번호는 지어낸 것
const assert = require('assert');
const B = require('../boss_chat.js');

function runWith(replies, execs, more) {
  const asked = [], ran = [];
  const deps = Object.assign({
    hasSite: (id) => id === 's1', userText: '',
    ask: (h) => { asked.push(h); const r = replies.shift(); return r instanceof Error ? Promise.reject(r) : Promise.resolve(r); },
    exec: (a) => { ran.push(a); return Promise.resolve(execs ? execs(a) : { ok: true, text: '함' }); },
  }, more || {});
  return B.run([{ role: 'user', text: '지시' }], deps).then((r) => ({ r, asked, ran }));
}

(async () => {
  // 대화만: 실행 없이 답
  let t = await runWith([{ ok: true, say: '2곳이에요', actions: [], chips: ['더 보기'] }]);
  assert.deepStrictEqual([t.r.say, t.r.chips, t.ran.length], ['2곳이에요', ['더 보기'], 0]);

  // 실행 → 결과를 AI 에게 돌려줌 → 진짜 결과로 답. 첫 답의 say 는 쓰지 않는다
  t = await runWith([
    { ok: true, say: '했어요(미리 한 말)', actions: [{ tool: 'mark_paid', siteId: 's1' }] },
    { ok: true, say: '잔금 표시했어요', actions: [] },
  ]);
  assert.strictEqual(t.r.say, '잔금 표시했어요');
  assert.strictEqual(t.ran.length, 1);
  assert.ok(t.asked[1].some((m) => m.role === 'tool' && m.text.includes('"ok":true')));

  // 없는 현장·모르는 도구는 실행 안 하고 실패로 돌려줌
  t = await runWith([
    { ok: true, actions: [{ tool: 'mark_paid', siteId: 'zz' }, { tool: 'delete_all' }] },
    { ok: true, say: '못 찾았어요', actions: [] },
  ]);
  assert.strictEqual(t.ran.length, 0);
  assert.deepStrictEqual(t.r.results.map((x) => x.ok), [false, false]);

  // 3명까지는 바로, 4명부터는 확인 뒤 — 실행하지 않고 pending
  const three = { tool: 'send_text', names: ['가', '나', '다'], text: '안녕' };
  const four = { tool: 'send_text', names: ['가', '나', '다', '라'], text: '안녕' };
  t = await runWith([{ ok: true, actions: [three] }, { ok: true, say: '보냈어요', actions: [] }]);
  assert.deepStrictEqual([t.ran.length, t.r.pending.length], [1, 0]);
  t = await runWith([{ ok: true, actions: [four] }, { ok: true, say: '네 분께 보낼까요?', actions: [] }]);
  assert.deepStrictEqual([t.ran.length, t.r.pending], [0, [four]]);
  assert.strictEqual(t.r.results[0].waiting, true);

  // 같은 일을 또 시켜도 한 번만 (문자 두 번 방지)
  t = await runWith([{ ok: true, actions: [three] }, { ok: true, actions: [three] }, { ok: true, say: '끝', actions: [] }]);
  assert.strictEqual(t.ran.length, 1);

  // 번호 저장: 사장님이 쓴 글에 있는 번호만
  assert.strictEqual(B.check({ tool: 'save_phone', name: '가', phone: '010-0000-0000' }, { userText: '번호 01000000000', hasSite: () => false }), '');
  assert.ok(B.check({ tool: 'save_phone', name: '가', phone: '010-1111-1111' }, { userText: '번호 01000000000', hasSite: () => false }));

  // 안 하고 했다고 하면 되묻고, 그래도 그러면 사실을 앞에 붙임
  t = await runWith([{ ok: true, say: '문자 보냈어요', actions: [] }, { ok: true, say: '문자 보냈어요', actions: [] }]);
  assert.ok(t.r.say.startsWith('⚠️ 실제로 처리된 건 없어요'));
  t = await runWith([{ ok: true, say: '문자 보냈어요', actions: [] }, { ok: true, say: '번호가 없어 못 보내요', actions: [] }]);
  assert.strictEqual(t.r.say, '번호가 없어 못 보내요');

  // 일부만 나간 문자: 되묻지 않고, 누가 못 받았는지 AI 에게 알림
  t = await runWith([{ ok: true, actions: [three] }, { ok: true, say: '한 분만 보냈어요', actions: [] }],
    () => ({ ok: false, partial: true, people: [{ name: '가', ok: true }, { name: '나', ok: false, why: '번호 없음' }] }));
  assert.strictEqual(t.r.say, '한 분만 보냈어요');
  assert.ok(t.asked[1].some((m) => m.text.includes('번호 없음')));
  // 못 보냈다는 말은 '했다' 는 말이 아니다
  t = await runWith([{ ok: true, say: '번호가 없어 못 보냈어요', actions: [] }]);
  assert.strictEqual(t.asked.length, 1);

  // AI 연결 실패: 처음이면 아무것도 안 함, 실행 뒤면 결과는 남기고 다시 실행 안 함
  t = await runWith([new Error('네트워크')]);
  assert.strictEqual(t.r.failed, true);
  assert.ok(t.r.say.includes('아무것도 처리하지 않았어요'));
  t = await runWith([{ ok: true, actions: [{ tool: 'mark_paid', siteId: 's1' }] }, new Error('네트워크')]);
  assert.deepStrictEqual([t.r.failed, t.ran.length, t.r.results[0].ok], [true, 1, true]);

  // 끝없이 시키면 멈춤
  const many = [0, 1, 2, 3, 4, 5].map((i) => ({ ok: true, actions: [{ tool: 'mark_paid', siteId: 's1', n: i }] }));
  t = await runWith(many);
  assert.strictEqual(t.ran.length, 4);
  assert.ok(t.r.say.includes('여기까지만'));

  // 상태 요약: 고객 번호 없음, 팀원 번호는 있고 없고만, 먼 현장 빠짐
  const ctx = B.buildContext({ today: '2026-11-04', clients: [{ id: 'c', name: '가나' }],
    sites: [{ id: 's1', clientId: 'c', name: '하늘', date: '2026-11-05', custPhone: '01012345678', days: [{ date: '2026-11-05', staff: ['가'] }] },
      { id: 's2', clientId: 'c', name: '옛날', date: '2026-01-01' }],
    settings: { team: ['가', '나'], people: { 가: { phone: '010-0000-0000' } } }, tasks: [{ title: '끝', done: true }, { title: '남음', date: '2026-11-05' }] });
  assert.deepStrictEqual(ctx.sites.map((s) => s.id), ['s1']);
  assert.ok(!JSON.stringify(ctx).includes('01012345678') && !JSON.stringify(ctx).includes('010-0000-0000'));
  assert.deepStrictEqual(ctx.team, [{ name: '가', phone: true }, { name: '나', phone: false }]);
  assert.deepStrictEqual(ctx.tasks, [{ title: '남음', date: '2026-11-05' }]);
  assert.deepStrictEqual(B.findSites([{ id: 's2', clientId: 'c', name: '옛날 아파트' }], [{ id: 'c', name: '가나' }], '가나 옛날').map((s) => s.id), ['s2']);

  // 대화 → AI 대화: 한 일을 undoId 와 함께
  const h = B.toHistory([{ role: 'me', text: '바꿔' }, { role: 'ai', text: '했어요', cards: [{ ok: true, text: '세대 비번', undoId: 'u1' }] }]);
  assert.strictEqual(h[1].role, 'assistant');
  assert.ok(h[1].text.includes('undoId u1'));
  console.log('boss_chat ok');
})().catch((e) => { console.error(e); process.exit(1); });
