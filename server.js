// dotenv: 로컬 개발 시에만 사용 (Railway는 환경변수 자동 주입)
try { require('dotenv').config(); } catch(e) {}

const express = require('express');
const crypto  = require('crypto');
const axios   = require('axios');
const { generateTags } = require('./tagEngine');

const app  = express();
const PORT = process.env.PORT || 3000;

const SHOPIFY_STORE_URL       = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
const SHOPIFY_WEBHOOK_SECRET  = process.env.SHOPIFY_WEBHOOK_SECRET || '';
const TARGET_VENDOR           = (process.env.TARGET_VENDOR || 'korealy').toLowerCase();

// ── 원시 바디 보존 (HMAC 검증용) ─────────────────
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));

// ── HMAC 검증 ────────────────────────────────────
function verifyWebhook(req) {
  if (!SHOPIFY_WEBHOOK_SECRET) return true;
  const hmac   = req.headers['x-shopify-hmac-sha256'];
  if (!hmac)   return false;
  const digest = crypto
    .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest('base64');
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(digest));
}

// ── 태그 업데이트 ─────────────────────────────────
async function updateProductTags(productId, tags) {
  const url = 'https://' + SHOPIFY_STORE_URL + '/admin/api/2024-01/products/' + productId + '.json';
  const res = await axios.put(url,
    { product: { id: productId, tags: tags.join(', ') } },
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN, 'Content-Type': 'application/json' } }
  );
  return res.data.product;
}

// ── 공통 처리 ─────────────────────────────────────
async function processProduct(product) {
  const vendor = (product.vendor || '').toLowerCase();
  if (vendor !== TARGET_VENDOR) {
    console.log('[SKIP] Vendor: ' + product.vendor);
    return;
  }
  console.log('[PROCESS] ' + product.title + ' (' + product.vendor + ')');
  const tags = await generateTags(product, SHOPIFY_STORE_URL, SHOPIFY_ADMIN_API_TOKEN);
  console.log('[TAGS] ' + tags.join(', '));
  await updateProductTags(product.id, tags);
  console.log('[DONE] 태그 업데이트 완료');
}

// ── 라우트 ────────────────────────────────────────
app.get('/health', function(req, res) {
  res.json({ status: 'ok', store: SHOPIFY_STORE_URL, vendor: TARGET_VENDOR, time: new Date().toISOString() });
});

app.post('/webhooks/products/create', function(req, res) {
  if (!verifyWebhook(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.status(200).json({ received: true });
  processProduct(req.body).catch(function(err) { console.error('[ERROR:create]', err.message); });
});

app.post('/webhooks/products/update', function(req, res) {
  if (!verifyWebhook(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.status(200).json({ received: true });
  processProduct(req.body).catch(function(err) { console.error('[ERROR:update]', err.message); });
});

app.post('/tag-existing', async function(req, res) {
  const authHeader = req.headers['x-admin-key'];
  if (authHeader !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ started: true });

  try {
    var url = 'https://' + SHOPIFY_STORE_URL + '/admin/api/2024-01/products.json?vendor=' + encodeURIComponent(TARGET_VENDOR) + '&limit=50&fields=id,title,vendor,product_type,tags,body_html';
    while (url) {
      var r = await axios.get(url, { headers: { 'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN } });
      var products = r.data.products || [];
      if (products.length === 0) break;
      for (var i = 0; i < products.length; i++) {
        try {
          var tags = await generateTags(products[i], SHOPIFY_STORE_URL, SHOPIFY_ADMIN_API_TOKEN);
          await updateProductTags(products[i].id, tags);
          console.log('[BULK] ' + products[i].title);
          await new Promise(function(resolve) { setTimeout(resolve, 300); });
        } catch(e) { console.error('[BULK ERROR]', e.message); }
      }
      if (products.length < 50) break;
      var link = r.headers['link'];
      if (link && link.includes('rel="next"')) {
        var m = link.match(/page_info=([^&>]+)[^>]*>\s*;\s*rel="next"/);
        url = m ? 'https://' + SHOPIFY_STORE_URL + '/admin/api/2024-01/products.json?page_info=' + m[1] + '&limit=50' : null;
      } else { break; }
    }
    console.log('[BULK DONE]');
  } catch(err) { console.error('[BULK ERROR]', err.message); }
});

// ── 서버 시작 ─────────────────────────────────────
app.listen(PORT, function() {
  console.log('========================================');
  console.log(' Korealy Auto-Tagger 서버 시작');
  console.log(' 포트: ' + PORT);
  console.log(' 스토어: ' + SHOPIFY_STORE_URL);
  console.log(' 대상 벤더: ' + TARGET_VENDOR);
  console.log('========================================');
});
