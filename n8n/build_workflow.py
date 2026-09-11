# -*- coding: utf-8 -*-
"""n8n 워크플로우 '거래처별 현장관리 백업' JSON 생성기.

사용:  python n8n/build_workflow.py --base appXXXX --key 백업키 > n8n/현장관리_백업.json
(--base/--key 없이 실행하면 __BASE_ID__/__BACKUP_KEY__ 자리표시자가 들어간 템플릿 출력)

설계 (docs/superpowers/specs 참조):
- POST /webhook/sitenote-sync   { key, ops:[{op:'upsert'|'delete', type:'client'|'site'|'settings', id, data}] }
    → 키 검사 → 타입별 10건씩 Airtable upsert(PATCH performUpsert, fieldsToMergeOn=['id'])
    → delete 는 행을 지우지 않고 '삭제' 체크(툼스톤)로 처리해 노드 수를 줄임
- GET  /webhook/sitenote-restore?key=…  → 3개 테이블 전체(삭제 제외) → {clients, sites, settings}
"""
import json, sys, uuid, argparse

AIRTABLE_CRED = {"airtableTokenApi": {"id": "J5wefJCMalpjjm3Q", "name": "Airtable Personal Access Token account 2"}}
TABLES = {"client": "거래처", "site": "현장", "settings": "설정"}

def nid():
    return str(uuid.uuid4())

def build(base_id, backup_key):
    api = "https://api.airtable.com/v0/" + base_id + "/"

    # ---------- 공통: 키 검사 코드 ----------
    sync_code = r'''
// 백업키 검사 + 타입별 10건 배치 생성 (Airtable upsert 는 요청당 최대 10건)
const KEY = %s;
const body = $input.first().json.body || {};
if (!body.key || body.key !== KEY) return [{ json: { error: 'unauthorized' } }];
const ops = Array.isArray(body.ops) ? body.ops : [];
const TABLE = { client: '거래처', site: '현장', settings: '설정' };
const now = new Date().toISOString();
const byTable = {};
for (const op of ops) {
  const table = TABLE[op.type]; if (!table || !op.id) continue;
  const d = op.data || {};
  let fields = { id: String(op.id), data: JSON.stringify(d), '수정시각': now, '삭제': op.op === 'delete' };
  if (op.type === 'client') Object.assign(fields, { '이름': d.name || '', '순서': Number(d.order || 0) });
  if (op.type === 'site') Object.assign(fields, { '현장명': d.name || '', '거래처id': d.clientId || '', '시작날짜': d.date || '' });
  if (op.op === 'delete') fields = { id: String(op.id), '삭제': true, '수정시각': now };
  (byTable[table] = byTable[table] || []).push({ fields });
}
const out = [];
for (const table of Object.keys(byTable)) {
  const recs = byTable[table];
  for (let i = 0; i < recs.length; i += 10) {
    out.push({ json: { table, body: { performUpsert: { fieldsToMergeOn: ['id'] }, records: recs.slice(i, i + 10), typecast: true } } });
  }
}
if (!out.length) return [{ json: { table: '', body: null, empty: true } }];
return out;
''' % json.dumps(backup_key, ensure_ascii=False)

    restore_check = r'''
const KEY = %s;
const q = $input.first().json.query || {};
if (!q.key || q.key !== KEY) return [{ json: { error: 'unauthorized' } }];
return [{ json: { ok: true } }];
''' % json.dumps(backup_key, ensure_ascii=False)

    restore_merge = r'''
// 3개 테이블 결과를 앱이 기대하는 형태로 합침
function rows(nodeName) {
  const out = [];
  for (const it of $(nodeName).all()) {
    const recs = (it.json.records) ? it.json.records : [];
    for (const r of recs) {
      const f = r.fields || {};
      if (f['삭제']) continue;
      try { out.push(JSON.parse(f.data || '{}')); } catch (e) { /* 손상된 행 무시 */ }
    }
  }
  return out;
}
const clients = rows('거래처 읽기');
const sites = rows('현장 읽기');
const settingsRows = rows('설정 읽기');
return [{ json: { clients, sites, settings: settingsRows[0] || {} } }];
'''

    def http_read(name, table, pos):
        return {
            "id": nid(), "name": name, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": pos,
            "credentials": AIRTABLE_CRED,
            "parameters": {
                "method": "GET", "url": api + table,
                "authentication": "predefinedCredentialType", "nodeCredentialType": "airtableTokenApi",
                "sendQuery": True,
                "queryParameters": {"parameters": [
                    {"name": "filterByFormula", "value": "NOT({삭제})"},
                    {"name": "pageSize", "value": "100"}
                ]},
                "options": {"pagination": {"pagination": {
                    "paginationMode": "updateAParameterInEachRequest",
                    "parameters": {"parameters": [{"type": "qs", "name": "offset", "value": "={{ $response.body.offset }}"}]},
                    "paginationCompleteWhen": "other",
                    "completeExpression": "={{ !$response.body.offset }}"
                }}}
            },
            "executeOnce": True
        }

    nodes = [
        # ===== sync =====
        {"id": nid(), "name": "sync Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [0, 0],
         "webhookId": nid(),
         "parameters": {"httpMethod": "POST", "path": "sitenote-sync", "responseMode": "responseNode", "options": {}}},
        {"id": nid(), "name": "키검사·배치생성", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [220, 0],
         "parameters": {"jsCode": sync_code}},
        {"id": nid(), "name": "인증됨?", "type": "n8n-nodes-base.if", "typeVersion": 2, "position": [440, 0],
         "parameters": {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
                        "conditions": [{"id": nid(), "leftValue": "={{ $json.error }}", "rightValue": "", "operator": {"type": "string", "operation": "empty", "singleValue": True}}],
                        "combinator": "and"}, "options": {}}},
        {"id": nid(), "name": "보낼 것 있음?", "type": "n8n-nodes-base.if", "typeVersion": 2, "position": [660, -100],
         "parameters": {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
                        "conditions": [{"id": nid(), "leftValue": "={{ !!$json.empty }}", "rightValue": "", "operator": {"type": "boolean", "operation": "false", "singleValue": True}}],
                        "combinator": "and"}, "options": {}}},
        {"id": nid(), "name": "Airtable upsert", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [880, -160],
         "credentials": AIRTABLE_CRED,
         "parameters": {"method": "PATCH", "url": "=" + api + "{{ $json.table }}",
                        "authentication": "predefinedCredentialType", "nodeCredentialType": "airtableTokenApi",
                        "sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify($json.body) }}", "options": {}}},
        {"id": nid(), "name": "결과집계", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [1100, -160],
         "parameters": {"jsCode": "const n = $input.all().reduce((m, it) => m + ((it.json.records || []).length), 0);\nreturn [{ json: { ok: true, done: n } }];"}},
        {"id": nid(), "name": "응답 OK", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [1320, -160],
         "parameters": {"respondWith": "json", "responseBody": "={{ JSON.stringify($json) }}", "options": {}}},
        {"id": nid(), "name": "응답 (빈 요청)", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [880, -20],
         "parameters": {"respondWith": "json", "responseBody": "{\"ok\": true, \"done\": 0}", "options": {}}},
        {"id": nid(), "name": "응답 401", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [660, 120],
         "parameters": {"respondWith": "json", "responseBody": "{\"error\": \"unauthorized\"}", "options": {"responseCode": 401}}},

        # ===== restore =====
        {"id": nid(), "name": "restore Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [0, 400],
         "webhookId": nid(),
         "parameters": {"httpMethod": "GET", "path": "sitenote-restore", "responseMode": "responseNode", "options": {}}},
        {"id": nid(), "name": "복원 키검사", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [220, 400],
         "parameters": {"jsCode": restore_check}},
        {"id": nid(), "name": "복원 인증됨?", "type": "n8n-nodes-base.if", "typeVersion": 2, "position": [440, 400],
         "parameters": {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
                        "conditions": [{"id": nid(), "leftValue": "={{ $json.error }}", "rightValue": "", "operator": {"type": "string", "operation": "empty", "singleValue": True}}],
                        "combinator": "and"}, "options": {}}},
        http_read("거래처 읽기", "거래처", [660, 320]),
        http_read("현장 읽기", "현장", [880, 320]),
        http_read("설정 읽기", "설정", [1100, 320]),
        {"id": nid(), "name": "복원 합치기", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [1320, 320],
         "parameters": {"jsCode": restore_merge}},
        {"id": nid(), "name": "복원 응답", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [1540, 320],
         "parameters": {"respondWith": "json", "responseBody": "={{ JSON.stringify($json) }}", "options": {}}},
        {"id": nid(), "name": "복원 응답 401", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [660, 520],
         "parameters": {"respondWith": "json", "responseBody": "{\"error\": \"unauthorized\"}", "options": {"responseCode": 401}}},
    ]

    def c(*targets):
        return {"main": [[{"node": t, "type": "main", "index": 0} for t in group] for group in targets]}

    connections = {
        "sync Webhook": c(["키검사·배치생성"]),
        "키검사·배치생성": c(["인증됨?"]),
        "인증됨?": c(["보낼 것 있음?"], ["응답 401"]),
        "보낼 것 있음?": c(["Airtable upsert"], ["응답 (빈 요청)"]),
        "Airtable upsert": c(["결과집계"]),
        "결과집계": c(["응답 OK"]),
        "restore Webhook": c(["복원 키검사"]),
        "복원 키검사": c(["복원 인증됨?"]),
        "복원 인증됨?": c(["거래처 읽기"], ["복원 응답 401"]),
        "거래처 읽기": c(["현장 읽기"]),
        "현장 읽기": c(["설정 읽기"]),
        "설정 읽기": c(["복원 합치기"]),
        "복원 합치기": c(["복원 응답"]),
    }
    return {"name": "거래처별 현장관리 백업", "nodes": nodes, "connections": connections,
            "settings": {"executionOrder": "v1"}}

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="__BASE_ID__")
    ap.add_argument("--key", default="__BACKUP_KEY__")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(build(a.base, a.key), ensure_ascii=False, indent=2))
