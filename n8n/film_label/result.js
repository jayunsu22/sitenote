// 현장관리_필름라벨 › 결과정리: Gemini 답을 { labels: [{ code, w, l }], error } 로. 번호 없는 줄·같은 번호는 뺀다.
const r = $input.first().json || {};
let 답 = {};
try {
  const t = (((r.candidates || [])[0] || {}).content || {}).parts || [];
  답 = JSON.parse((t[0] && t[0].text) || '{}');
} catch (e) { 답 = {}; }
const seen = new Set();
const labels = [];
(Array.isArray(답.labels) ? 답.labels : []).forEach((x) => {
  const code = String((x && x.code) || '').trim().toUpperCase().slice(0, 40);
  const key = code.replace(/[\s\-_.]/g, '');
  if (!key || seen.has(key)) return;
  seen.add(key);
  const n = (v) => { const k = Math.round(Number(String(v == null ? '' : v).replace(/[^\d.]/g, '')) || 0); return k > 0 && k < 100000 ? k : 0; };
  labels.push({ code, w: n(x.w), l: n(x.l) });
});
return [{ json: { labels, error: r.error ? String(r.error.message || r.error) : '' } }];
