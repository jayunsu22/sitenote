// 현장관리_필름라벨 › 프롬프트: AS 박스에 넣는 필름 롤 사진에서 테이프 글씨('ps010 300x2450')를 Gemini 에게 읽힌다.
// 받는 것: { photos: [{ mime, data(base64) }] } — 한 롤씩 찍은 여러 장이어도, 여러 롤을 한 장에 찍어도 된다.
const b = $input.first().json.body || {};
const photos = (Array.isArray(b.photos) ? b.photos : []).filter((p) => p && p.data).slice(0, 8);
if (!photos.length) throw new Error('photos 가 필요합니다');

const 글 = [
  '인테리어 필름 롤 사진이다. 롤마다 테이프(마스킹테이프 등)에 손글씨로 "필름번호 폭x길이" 가 적혀 있다.',
  '예: "ps010 300x2450" → 번호 PS010, 폭 300, 길이 2450 (mm).',
  '',
  '할 일: 사진에 보이는 테이프 글씨를 롤마다 하나씩 모두 읽는다.',
  '- 번호는 적힌 그대로(영문은 대문자로). 하이픈이 있으면 둔다. 한글 이름이 적혀 있으면 그것도 번호에 포함.',
  '- 폭·길이는 숫자만. "x" 앞이 폭, 뒤가 길이. 안 보이거나 안 적혀 있으면 0.',
  '- 같은 롤이 여러 사진에 나오면 한 번만.',
  '- 테이프 글씨가 아닌 것(필름 겉면 무늬, 상자 인쇄 글씨)은 읽지 않는다.',
  '- 글씨가 흐려 확실하지 않은 글자는 가장 그럴듯하게 읽되, 번호 자체가 안 보이면 그 롤은 뺀다.',
  '',
  '답은 JSON 하나만: {"labels": [{"code": "PS010", "w": 300, "l": 2450}, ...]}',
].join('\n');

const parts = [{ text: 글 }];
photos.forEach((p, i) => {
  parts.push({ text: '사진' + (i + 1) + ':' });
  parts.push({ inline_data: { mime_type: p.mime || 'image/jpeg', data: p.data } });
});
return [{ json: {
  gemini: { contents: [{ role: 'user', parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } },
} }];
