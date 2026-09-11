// share.js — 순수 함수 모음 (화면·저장소에 의존하지 않음)
// 현장 항목 정의, 빈값 판정, 업자 질문/팀원 공유 문구 생성, 정렬, 색상 순환, 동기화 큐 병합
// 브라우저에서는 전역 Share, node에서는 module.exports 로 노출
(function (root) {
  'use strict';

  // 14개 항목 — 화면 순서 = 배열 순서 = 문구 출력 순서
  // type: text | date | select | films | multiline
  // question: 값이 비어있을 때 업자에게 보낼 기본 질문 문구 (name/memo 는 질문 대상 아님)
  var FIELDS = [
    { key: 'name',    label: '현장명',        type: 'text' },
    { key: 'unit',    label: '동/호수',       type: 'text',   question: '동호수 알려주세요' },
    { key: 'size',    label: '평형',          type: 'text',   question: '평형 알려주세요' },
    { key: 'address', label: '현장주소',      type: 'text',   question: '현장 주소 알려주세요' },
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
    { key: 'films',   label: '필름/시공위치', type: 'films',  question: '시공 위치별 필름 번호 알려주세요' },
    { key: 'memo',    label: '메모',          type: 'multiline' }
  ];

  var FIELD_MAP = {};
  FIELDS.forEach(function (f) { FIELD_MAP[f.key] = f; });

  var DEFAULT_QUESTIONS = {};
  FIELDS.forEach(function (f) { if (f.question) DEFAULT_QUESTIONS[f.key] = f.question; });

  var COLOR_COUNT = 8;

  function str(v) { return (v == null ? '' : String(v)).trim(); }

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
  function titleLine(site) {
    var parts = [str(site.name), str(site.unit), str(site.size)].filter(Boolean);
    return parts.length ? parts.join(' ') : '(이름없음)';
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
      .filter(function (k) { return k !== 'name' && k !== 'memo' && isEmpty(site, k); })
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
    var pw = [];
    if (has.pwLobby) pw.push('공동현관: ' + str(site.pwLobby));
    if (has.pwUnit) pw.push('세대: ' + str(site.pwUnit));
    if (pw.length) lines.push(pw.join('  '));
    if (has.gate) lines.push('출입: ' + str(site.gate));
    if (has.carReg) lines.push(selectLine(FIELD_MAP.carReg, site.carReg));
    if (has.parking) lines.push('주차: ' + str(site.parking));
    if (has.cargoEv) lines.push(selectLine(FIELD_MAP.cargoEv, site.cargoEv));
    if (has.toilet) lines.push('화장실: ' + str(site.toilet));
    if (has.films) {
      var fl = site.films
        .filter(function (r) { return r && str(r.code) !== ''; })
        .map(function (r) { return [str(r.place), str(r.code)].filter(Boolean).join(' '); });
      lines.push('필름: ' + fl.join(', '));
    }
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
    FIELD_MAP: FIELD_MAP,
    DEFAULT_QUESTIONS: DEFAULT_QUESTIONS,
    COLOR_COUNT: COLOR_COUNT,
    isEmpty: isEmpty,
    titleLine: titleLine,
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
