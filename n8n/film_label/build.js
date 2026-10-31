// 현장관리_필름라벨 n8n 흐름 JSON 을 만든다: node n8n/film_label/build.js > n8n/film_label/workflow.json
// 현장관리 앱 › 필름 탭 › 📦 AS 박스 [📷 박스 사진 올리기] 가 부른다 (POST film-label-read, 사장님 열쇠).
// 노드 코드는 prompt.js · result.js 가 원본. 모양은 songil/n8n/photo_classify 와 같다 (Gemini 2.5 flash).
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

const workflow = {
  name: '현장관리_필름라벨',
  nodes: [
    {
      id: 'w', name: '받은사진', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0],
      webhookId: '6f1d2c8a-3b47-4e0f-9a52-7c1e4b8d0f31',
      parameters: { httpMethod: 'POST', path: 'film-label-read', responseMode: 'responseNode', authentication: 'headerAuth',
        options: { allowedOrigins: '*' } },
      credentials: { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } },
    },
    { id: 'p', name: '프롬프트', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0], parameters: { mode: 'runOnceForAllItems', jsCode: read('prompt.js') } },
    {
      id: 'g', name: 'Gemini', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [440, 0], continueOnFail: true,
      parameters: {
        method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json.gemini) }}', options: { timeout: 90000 },
      },
      credentials: { googlePalmApi: { id: 'DVT2g7GvXhSY4Y4b', name: 'Google Gemini(PaLM) Api account' } },
    },
    { id: 'c', name: '결과정리', type: 'n8n-nodes-base.code', typeVersion: 2, position: [660, 0], parameters: { mode: 'runOnceForAllItems', jsCode: read('result.js') } },
    {
      id: 'r', name: '응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [880, 0],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}',
        options: { responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } } },
    },
  ],
  connections: {
    받은사진: { main: [[{ node: '프롬프트', type: 'main', index: 0 }]] },
    프롬프트: { main: [[{ node: 'Gemini', type: 'main', index: 0 }]] },
    Gemini: { main: [[{ node: '결과정리', type: 'main', index: 0 }]] },
    결과정리: { main: [[{ node: '응답', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1', saveDataSuccessExecution: 'none' },
};
process.stdout.write(JSON.stringify(workflow, null, 2));
