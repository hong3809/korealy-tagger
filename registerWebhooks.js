/**
 * registerWebhooks.js
 * ─────────────────────────────────────────────────────────────
 * Shopify Webhook 자동 등록 스크립트
 * 사용법: node registerWebhooks.js <PUBLIC_URL>
 *   예시: node registerWebhooks.js https://my-server.com
 * ─────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const axios = require('axios');

const SHOPIFY_STORE_URL       = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;

const PUBLIC_URL = process.argv[2];

if (!PUBLIC_URL) {
  console.error('❌  사용법: node registerWebhooks.js <PUBLIC_URL>');
  console.error('    예시: node registerWebhooks.js https://abc123.ngrok.io');
  process.exit(1);
}

const WEBHOOKS_TO_REGISTER = [
  {
    topic:   'products/create',
    address: `${PUBLIC_URL}/webhooks/products/create`,
    format:  'json',
  },
  {
    topic:   'products/update',
    address: `${PUBLIC_URL}/webhooks/products/update`,
    format:  'json',
  },
];

async function listWebhooks() {
  const res = await axios.get(
    `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/webhooks.json`,
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN } }
  );
  return res.data.webhooks || [];
}

async function deleteWebhook(id) {
  await axios.delete(
    `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/webhooks/${id}.json`,
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN } }
  );
}

async function createWebhook(topic, address, format) {
  const res = await axios.post(
    `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/webhooks.json`,
    { webhook: { topic, address, format } },
    {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN,
        'Content-Type': 'application/json',
      },
    }
  );
  return res.data.webhook;
}

async function main() {
  console.log(`\n🔧  Shopify Webhook 등록 시작`);
  console.log(`    스토어: ${SHOPIFY_STORE_URL}`);
  console.log(`    서버 URL: ${PUBLIC_URL}\n`);

  // 기존 Webhook 조회 및 중복 삭제
  const existing = await listWebhooks();
  console.log(`📋  기존 Webhook: ${existing.length}개`);

  for (const wh of existing) {
    const topics = WEBHOOKS_TO_REGISTER.map(w => w.topic);
    if (topics.includes(wh.topic)) {
      console.log(`   🗑  삭제: [${wh.topic}] ${wh.address}`);
      await deleteWebhook(wh.id);
    }
  }

  // 새 Webhook 등록
  console.log(`\n✅  Webhook 등록:`);
  for (const wh of WEBHOOKS_TO_REGISTER) {
    try {
      const created = await createWebhook(wh.topic, wh.address, wh.format);
      console.log(`   ✔  [${created.topic}] → ${created.address} (ID: ${created.id})`);
    } catch (err) {
      const msg = err.response?.data?.errors || err.message;
      console.error(`   ✖  [${wh.topic}] 등록 실패:`, JSON.stringify(msg));
    }
  }

  console.log(`\n🎉  완료!\n`);
}

main().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
