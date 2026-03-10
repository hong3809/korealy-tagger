/**
 * server.js
 * ─────────────────────────────────────────────────────────────
 * Shopify Webhook 수신 서버
 *  - products/create  → korealy 제품에 자동 태그 적용
 *  - products/update  → korealy 제품에 자동 태그 적용
 *  - GET /health      → 헬스체크
 *  - POST /tag-existing → 기존 korealy 제품 일괄 태그 처리
 * ─────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const express    = require('express');
const bodyParser = require('body-parser');
const crypto     = require('crypto');
const axios      = require('axios');
const { generateTags } = require('./tagEngine');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── 환경 변수 ───────────────────────────────────
const SHOPIFY_STORE_URL      = process.env.SHOPIFY_STORE_URL;        // e.g. xxx.myshopify.com
const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
const SHOPIFY_WEBHOOK_SECRET  = process.env.SHOPIFY_WEBHOOK_SECRET || '';
const TARGET_VENDOR           = (process.env.TARGET_VENDOR || 'korealy').toLowerCase();

// ── 원시 바디 보존 (HMAC 검증용) ────────────────
app.use(
  bodyParser.json({
    verify: (req, _res, buf) => { req.rawBody = buf; },
  })
);

// ────────────────────────────────────────────────
// HMAC 서명 검증 (Webhook Secret 설정 시 활성화)
// ────────────────────────────────────────────────
function verifyWebhook(req) {
  if (!SHOPIFY_WEBHOOK_SECRET) return true; // 시크릿 없으면 검증 스킵
  const hmac    = req.headers['x-shopify-hmac-sha256'];
  if (!hmac)    return false;
  const digest  = crypto
    .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest('base64');
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(digest));
}

// ────────────────────────────────────────────────
// 제품 태그 업데이트 (Shopify Admin API)
// ────────────────────────────────────────────────
async function updateProductTags(productId, tags) {
  const url = `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/products/${productId}.json`;
  const payload = { product: { id: productId, tags: tags.join(', ') } };

  try {
    const res = await axios.put(url, payload, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN,
        'Content-Type': 'application/json',
      },
    });
    return res.data.product;
  } catch (err) {
    const msg = err.response?.data || err.message;
    console.error('[updateProductTags] 실패:', JSON.stringify(msg));
    throw err;
  }
}

// ────────────────────────────────────────────────
// 공통 처리 로직
// ────────────────────────────────────────────────
async function processProduct(product) {
  const vendor = (product.vendor || '').toLowerCase();

  if (vendor !== TARGET_VENDOR) {
    console.log(`[SKIP] Vendor: "${product.vendor}" → 대상 아님`);
    return { skipped: true, vendor: product.vendor };
  }

  console.log(`\n[PROCESS] 제품 ID: ${product.id} / "${product.title}" (${product.vendor})`);

  const tags = await generateTags(product, SHOPIFY_STORE_URL, SHOPIFY_ADMIN_API_TOKEN);
  console.log(`[TAGS] 생성된 태그 (${tags.length}개):`, tags.join(', '));

  const updated = await updateProductTags(product.id, tags);
  console.log(`[DONE] 태그 업데이트 완료 → ${updated.tags}`);

  return { success: true, productId: product.id, tags };
}

// ────────────────────────────────────────────────
// GET /health
// ────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    store: SHOPIFY_STORE_URL,
    targetVendor: TARGET_VENDOR,
    time: new Date().toISOString(),
  });
});

// ────────────────────────────────────────────────
// POST /webhooks/products/create
// ────────────────────────────────────────────────
app.post('/webhooks/products/create', async (req, res) => {
  if (!verifyWebhook(req)) {
    console.warn('[WARN] Webhook 서명 검증 실패 (create)');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.status(200).json({ received: true }); // Shopify 5초 타임아웃 대응

  try {
    const result = await processProduct(req.body);
    console.log('[WEBHOOK:create]', result);
  } catch (err) {
    console.error('[WEBHOOK:create] 처리 오류:', err.message);
  }
});

// ────────────────────────────────────────────────
// POST /webhooks/products/update
// ────────────────────────────────────────────────
app.post('/webhooks/products/update', async (req, res) => {
  if (!verifyWebhook(req)) {
    console.warn('[WARN] Webhook 서명 검증 실패 (update)');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.status(200).json({ received: true });

  try {
    const result = await processProduct(req.body);
    console.log('[WEBHOOK:update]', result);
  } catch (err) {
    console.error('[WEBHOOK:update] 처리 오류:', err.message);
  }
});

// ────────────────────────────────────────────────
// POST /tag-existing  → 기존 korealy 제품 일괄 처리
// ────────────────────────────────────────────────
app.post('/tag-existing', async (req, res) => {
  const authHeader = req.headers['x-admin-key'];
  if (authHeader !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.json({ started: true, message: '일괄 태그 작업 시작. 서버 로그를 확인하세요.' });

  try {
    let page = 1;
    let processedCount = 0;
    let updatedCount = 0;
    let pageInfo = null;
    const limit = 50;

    console.log(`\n[BULK] korealy 제품 일괄 태그 시작...`);

    // 페이지네이션으로 모든 korealy 제품 처리
    while (true) {
      let url = `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/products.json?vendor=${encodeURIComponent(TARGET_VENDOR)}&limit=${limit}&fields=id,title,vendor,product_type,tags,body_html`;
      if (pageInfo) url += `&page_info=${pageInfo}`;

      const res2 = await axios.get(url, {
        headers: { 'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN },
      });

      const products = res2.data.products || [];
      if (products.length === 0) break;

      for (const product of products) {
        processedCount++;
        try {
          const tags = await generateTags(product, SHOPIFY_STORE_URL, SHOPIFY_ADMIN_API_TOKEN);
          await updateProductTags(product.id, tags);
          updatedCount++;
          console.log(`[BULK ${processedCount}] "${product.title}" → ${tags.join(', ')}`);
          await sleep(300); // API rate limit 대응
        } catch (err) {
          console.error(`[BULK ERROR] 제품 ${product.id}: ${err.message}`);
        }
      }

      if (products.length < limit) break;
      page++;

      // Link 헤더에서 page_info 추출
      const linkHeader = res2.headers['link'];
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/page_info=([^&>]+)[^>]*>\s*;\s*rel="next"/);
        pageInfo = match ? match[1] : null;
        if (!pageInfo) break;
      } else {
        break;
      }
    }

    console.log(`\n[BULK DONE] 처리: ${processedCount}개, 업데이트: ${updatedCount}개`);
  } catch (err) {
    console.error('[BULK] 일괄 처리 오류:', err.message);
  }
});

// ────────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ────────────────────────────────────────────────
// 서버 시작
// ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(` Korealy Auto-Tagger 서버 시작`);
  console.log(` 포트: ${PORT}`);
  console.log(` 스토어: ${SHOPIFY_STORE_URL}`);
  console.log(` 대상 벤더: ${TARGET_VENDOR}`);
  console.log(`========================================\n`);
});

module.exports = app;
