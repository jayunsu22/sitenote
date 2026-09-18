// share.js — 순수 함수 모음 (화면·저장소에 의존하지 않음)
// 현장 항목 정의, 빈값 판정, 업자 질문/팀원 공유 문구 생성, 정렬, 색상 순환, 동기화 큐 병합
// 브라우저에서는 전역 Share, node에서는 module.exports 로 노출
(function (root) {
  'use strict';

  // 15개 항목 — 화면 순서 = 배열 순서 = 문구 출력 순서
  // type: text | date | select | films | link | multiline
  // question: 값이 비어있을 때 업자에게 보낼 기본 질문 문구
  //           (name/photoUrl/memo 는 우리가 채우는 칸이라 질문 대상 아님)
  var FIELDS = [
    // 동/호수·평형 칸은 뺐다(2026-09-17). '군포 우륵아파트 704동 606호' 처럼
    // 현장명에 같이 적는 게 빠르다. 예전에 저장한 값은 titleLine 이 그대로 붙여준다.
    // 현장주소 칸도 뺐다(2026-09-17). 네비에 직접 넣는 게 빠르다.
    { key: 'name',    label: '현장명',        type: 'text' },
    { key: 'date',    label: '시작날짜',      type: 'date',   question: '시공 날짜 언제인가요?' },
    { key: 'pwLobby', label: '공동현관 비번', type: 'text',   question: '공동현관 비번 알려주세요' },
    { key: 'pwUnit',  label: '세대 비번',     type: 'text',   question: '세대 현관 비번 알려주세요' },
    { key: 'gate',    label: '출입구',        type: 'text',   question: '방문객 차량 출입구가 따로 있나요?' },
    { key: 'carReg',  label: '차량등록',      type: 'select', question: '출입 시 차량등록이 필요한가요?',
      options: ['미확인', '필요', '불필요'], shareLabel: '차량등록' },
    { key: 'parking', label: '주차',          type: 'text',   question: '주차는 어디에 하면 되나요?' },
    { key: 'cargoEv', label: '화물 엘리베이터', type: 'select', question: '짐 옮길 때 화물 엘리베이터 사용해야 하나요?',
      options: ['미확인', '사용', '일반사용'], shareLabel: '화물EV' },
    { key: 'toilet',  label: '화장실',        type: 'text',   question: '화장실 사용할 곳 위치 알려주세요' },
    // 특이사항 전달 - 팀원에게 꼭 알려줄 주의점("앞집이 예민함, 조심조심 들어올 것").
    // 우리가 채우는 칸이라 question 없음. 공유 문구에는 ⚠ 붙여서 나감.
    { key: 'note',    label: '특이사항 전달', type: 'multiline', shareLabel: '⚠ 특이사항',
      placeholder: '팀원에게 전달할 주의점 (예: 앞집이 예민함, 조심조심 들어올 것)' },
    { key: 'films',   label: '필름/시공위치', type: 'films',  question: '시공 위치별 필름 번호 알려주세요' },
    // 현장사진 링크 - 블로그자동화(현장 품질관리)에서 뽑은 사진 갤러리 주소를 붙여넣는 칸.
    // 업자에게 물어볼 항목이 아니라 우리가 채우는 칸이라 question 이 없다.
    { key: 'photoUrl', label: '현장사진',     type: 'link' },
    { key: 'memo',    label: '메모',          type: 'multiline' }
  ];

  var FIELD_MAP = {};
  FIELDS.forEach(function (f) { FIELD_MAP[f.key] = f; });

  var DEFAULT_QUESTIONS = {};
  FIELDS.forEach(function (f) { if (f.question) DEFAULT_QUESTIONS[f.key] = f.question; });

  var COLOR_COUNT = 8;

  // 사진(명함·단가표 등) — 저장 전 자동 축소 기준
  // 단가표 숫자가 읽히려면 해상도가 중요하므로 품질보다 픽셀을 먼저 지킨다.
  var PHOTO_MAX_BYTES = 600 * 1024;  // 원본 보관 한도
  var PHOTO_MAX_DIM = 2000;          // 긴 변 기준 픽셀
  var PHOTO_MIN_DIM = 1000;          // 용량이 안 맞아도 여기보다 작게는 안 줄인다
  // 목록 격자에 쓰는 작은 그림 — 폰 저장소(localStorage)와 Airtable 한 칸에 그대로 들어간다
  var PHOTO_THUMB_DIM = 400;
  var PHOTO_THUMB_BYTES = 40 * 1024;
  // Airtable 롱텍스트 한 칸은 10만자 한도 → 원본 base64 는 이 크기로 잘라 여러 행에 나눠 백업
  var PHOTO_CHUNK = 90000;

  // 긴 문자열을 size 글자씩 자름
  function splitChunks(str, size) {
    var out = [];
    str = String(str || '');
    for (var i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
    return out;
  }
  // 조각 행([{i, chunk}])을 순서대로 붙여 원래 문자열로. 빠진 번호가 있으면 '' (불완전한 백업은 버림)
  function joinChunks(rows) {
    var list = (rows || []).slice().sort(function (a, b) { return (a.i || 0) - (b.i || 0); });
    for (var i = 0; i < list.length; i++) if ((list[i].i || 0) !== i) return '';
    return list.map(function (r) { return r.chunk || ''; }).join('');
  }

  // 'data:image/jpeg;base64,...' 의 실제 바이트 수
  function dataUrlBytes(url) {
    var i = String(url || '').indexOf(',');
    if (i < 0) return 0;
    var b64 = url.slice(i + 1);
    var pad = b64.slice(-2) === '==' ? 2 : b64.slice(-1) === '=' ? 1 : 0;
    return Math.max(0, Math.floor(b64.length * 3 / 4) - pad);
  }

  // 이미지 data URL 인지 확인 (복원 데이터에 엉뚱한 값이 와도 <img> 에 넣지 않도록)
  function isImageDataUrl(url) {
    return /^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(String(url || ''));
  }

  // 파일 크기 표기 (12KB / 1.2MB)
  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + 'B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + 'KB';
    return (n / 1024 / 1024).toFixed(1) + 'MB';
  }

  function str(v) { return (v == null ? '' : String(v)).trim(); }

  // 붙여넣은 링크를 눌러서 열 수 있는 주소로. 주소창에서 복사하면 http(s) 가 빠지는 경우가
  // 많은데, 그대로 카톡에 보내면 링크로 안 잡히는 일이 있어 없으면 https:// 를 붙인다.
  function linkUrl(v) {
    var u = str(v);
    if (!u) return '';
    return /^https?:\/\//i.test(u) ? u : 'https://' + u.replace(/^\/+/, '');
  }

  // 비어있음 판정: 텍스트는 공백 제거 후 빈 문자열, 선택형은 '미확인', films는 코드가 있는 줄이 하나도 없음
  function isEmpty(site, key) {
    var f = FIELD_MAP[key];
    if (!f || !site) return true;
    var v = site[key];
    if (f.type === 'select') return !v || str(v.v) === '' || v.v === '미확인';
    if (f.type === 'films') return !Array.isArray(v) || !v.some(function (r) { return r && str(r.code) !== ''; });
    return str(v) === '';
  }

  // 제목 줄: 현장명 동호수 평형 (빈 것 생략)
  // 동/호수·평형 칸이 없어진 뒤로는 현장명에 같이 적으므로, 현장명에 이미 들어있는 값은 다시 붙이지 않는다
  // (예전 데이터: unit='2동 501호' + 새로 적은 name='… 2동 501호' → 두 번 나오던 문제)
  function titleLine(site) {
    var name = str(site.name);
    var squash = function (s) { return s.replace(/\s+/g, ''); };
    var parts = [name];
    [str(site.unit), str(site.size)].forEach(function (v) {
      if (v && squash(name).indexOf(squash(v)) === -1) parts.push(v);
    });
    parts = parts.filter(Boolean);
    return parts.length ? parts.join(' ') : '(이름없음)';
  }

  // 필름 번호만 한 줄에 하나씩. 대리점에 주문할 때 붙여넣는 용도라 시공위치는 뺀다.
  // 같은 번호가 여러 줄이면 한 번만(주문은 품목 목록이지 시공 목록이 아니다).
  function filmOrderText(site) {
    var seen = {};
    return ((site && site.films) || [])
      .map(function (r) { return r ? str(r.code) : ''; })
      .filter(function (c) { if (!c || seen[c]) return false; seen[c] = true; return true; })
      .join('\n');
  }

  // 'YYYY-MM-DD' → 'M/D'
  function shortDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(iso));
    if (!m) return str(iso);
    return parseInt(m[2], 10) + '/' + parseInt(m[3], 10);
  }

  // FIELDS 순서대로, 선택된 키만 남김
  function orderedKeys(keys) {
    var set = {};
    (keys || []).forEach(function (k) { set[k] = true; });
    return FIELDS.map(function (f) { return f.key; }).filter(function (k) { return set[k]; });
  }

  // 업자에게 질문: 선택된 키 중 비어있는 항목의 질문 문구만. 질문할 게 없으면 ''
  function buildQuestion(site, keys, questions) {
    var q = questions || DEFAULT_QUESTIONS;
    var lines = orderedKeys(keys)
      // 질문 문구가 정의된 항목만 (name/note/photoUrl/memo 처럼 우리가 채우는 칸은 제외)
      .filter(function (k) { return DEFAULT_QUESTIONS[k] && isEmpty(site, k); })
      .map(function (k) { return '- ' + (str(q[k]) || DEFAULT_QUESTIONS[k]); });
    if (!lines.length) return '';
    return '[' + titleLine(site) + ']\n' + lines.join('\n');
  }

  function selectLine(f, v) {
    var memo = str(v.memo);
    return f.shareLabel + ' ' + v.v + (memo ? ' (' + memo + ')' : '');
  }

  // 팀원에게 공유: 선택된 키 중 채워진 항목만. 제목 줄은 항상 포함(날짜는 date 선택 시 제목 줄 뒤에)
  function buildShare(site, keys) {
    var ks = orderedKeys(keys).filter(function (k) { return !isEmpty(site, k); });
    var has = {};
    ks.forEach(function (k) { has[k] = true; });

    var head = '[' + titleLine(site) + ']' + (has.date ? ' ' + shortDate(site.date) : '');
    var lines = [head];

    if (has.address) lines.push('📍 ' + str(site.address));
    if (has.pwLobby) lines.push('공동현관비번: ' + str(site.pwLobby));
    if (has.pwUnit) lines.push('세대비번: ' + str(site.pwUnit));
    if (has.gate) lines.push('출입: ' + str(site.gate));
    if (has.carReg) lines.push(selectLine(FIELD_MAP.carReg, site.carReg));
    if (has.parking) lines.push('주차: ' + str(site.parking));
    if (has.cargoEv) lines.push(selectLine(FIELD_MAP.cargoEv, site.cargoEv));
    if (has.toilet) lines.push('화장실: ' + str(site.toilet));
    if (has.note) lines.push(FIELD_MAP.note.shareLabel + ': ' + str(site.note));
    if (has.films) {
      var fl = site.films
        .filter(function (r) { return r && str(r.code) !== ''; })
        .map(function (r) { return [str(r.place), str(r.code)].filter(Boolean).join(' '); });
      lines.push('필름: ' + fl.join(', '));
    }
    if (has.photoUrl) lines.push('📷 현장사진: ' + linkUrl(site.photoUrl));
    if (has.memo) lines.push(str(site.memo));
    return lines.join('\n');
  }

  // 날짜 없는 현장 먼저(미정), 그 다음 날짜 오름차순, 동률은 최근 생성 우선. 원본 유지
  function sortSites(sites) {
    return sites.slice().sort(function (a, b) {
      var da = str(a.date), db = str(b.date);
      if (!da && db) return -1;
      if (da && !db) return 1;
      if (da !== db) return da < db ? -1 : 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  // 새 현장 색: 해당 거래처의 현장 수 mod 8
  function nextColor(sites, clientId) {
    var n = sites.filter(function (s) { return s.clientId === clientId; }).length;
    return n % COLOR_COUNT;
  }

  // 동기화 큐 병합: 같은 type+id 는 마지막 op 로 교체 (delete 도 이전 upsert 를 지우고 뒤에 붙음). 원본 유지
  function mergeQueue(queue, op) {
    var out = (queue || []).filter(function (o) { return !(o.type === op.type && o.id === op.id); });
    out.push(op);
    return out;
  }

  var Share = {
    FIELDS: FIELDS,
    linkUrl: linkUrl,
    FIELD_MAP: FIELD_MAP,
    DEFAULT_QUESTIONS: DEFAULT_QUESTIONS,
    COLOR_COUNT: COLOR_COUNT,
    PHOTO_MAX_BYTES: PHOTO_MAX_BYTES,
    PHOTO_MAX_DIM: PHOTO_MAX_DIM,
    PHOTO_MIN_DIM: PHOTO_MIN_DIM,
    PHOTO_THUMB_DIM: PHOTO_THUMB_DIM,
    PHOTO_THUMB_BYTES: PHOTO_THUMB_BYTES,
    PHOTO_CHUNK: PHOTO_CHUNK,
    splitChunks: splitChunks,
    joinChunks: joinChunks,
    dataUrlBytes: dataUrlBytes,
    isImageDataUrl: isImageDataUrl,
    fmtBytes: fmtBytes,
    isEmpty: isEmpty,
    titleLine: titleLine,
    filmOrderText: filmOrderText,
    shortDate: shortDate,
    buildQuestion: buildQuestion,
    buildShare: buildShare,
    sortSites: sortSites,
    nextColor: nextColor,
    mergeQueue: mergeQueue
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Share;
  else root.Share = Share;
})(typeof window !== 'undefined' ? window : this);
