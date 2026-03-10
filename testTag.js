/**
 * testTag.js
 * ─────────────────────────────────────────────────────────────
 * 기존 korealy 제품에 즉시 태그를 적용하는 스크립트
 * 사용법: node testTag.js [product_id]
 *   product_id 없으면 → 모든 korealy 제품 일괄 처리
 * ─────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const axios = require('axios');
const { generateTags } = require('./tagEngine');

const SHOPIFY_STORE_URL       = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
const TARGET_VENDOR           = (process.env.TARGET_VENDOR || 'korealy').toLowerCase();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getProduct(productId) {
  const res = await axios.get(
    `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/products/${productId}.json`,
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN } }
  );
  return res.data.product;
}

async function getAllKorealyProducts() {
  const products = [];
  let url = `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/products.json?vendor=${encodeURIComponent(TARGET_VENDOR)}&limit=50&fields=id,title,vendor,product_type,tags,body_html`;

  while (url) {
    const res = await axios.get(url, {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN },
    });
    const page = res.data.products || [];
    products.push(...page);
    if (page.length < 50) break;

    const linkHeader = res.headers['link'];
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/page_info=([^&>]+)[^>]*>\s*;\s*rel="next"/);
      url = match
        ? `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/products.json?page_info=${match[1]}&limit=50`
        : null;
    } else {
      url = null;
    }
  }
  return products;
}

async function updateProductTags(productId, tags) {
  const res = await axios.put(
    `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/products/${productId}.json`,
    { product: { id: productId, tags: tags.join(', ') } },
    {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN,
        'Content-Type': 'application/json',
      },
    }
  );
  return res.data.product;
}

async function processOne(product) {
  console.log(`\n📦  제품: "${product.title}"`);
  console.log(`   벤더: ${product.vendor} | 타입: ${product.product_type}`);
  console.log(`   기존 태그: ${product.tags || '(없음)'}`);

  const tags = await generateTags(product, SHOPIFY_STORE_URL, SHOPIFY_ADMIN_API_TOKEN);
  console.log(`   ✅  새 태그 (${tags.length}개): ${tags.join(', ')}`);

  const updated = await updateProductTags(product.id, tags);
  console.log(`   💾  저장 완료: ${updated.tags}`);
  return tags;
}

async function main() {
  const productId = process.argv[2];

  console.log(`\n========================================`);
  console.log(` Korealy 자동 태거`);
  console.log(` 스토어: ${SHOPIFY_STORE_URL}`);
  console.log(`========================================`);

  if (productId) {
    // 단일 제품 처리
    console.log(`\n🔍  단일 제품 처리: ID ${productId}`);
    try {
      const product = await getProduct(productId);
      await processOne(product);
    } catch (err) {
      console.error('❌  오류:', err.response?.data || err.message);
    }
  } else {
    // 전체 korealy 제품 일괄 처리
    console.log(`\n🔍  "${TARGET_VENDOR}" 벤더의 모든 제품 조회 중...`);
    const products = await getAllKorealyProducts();
    console.log(`   총 ${products.length}개 발견\n`);

    if (products.length === 0) {
      console.log(`⚠️  "${TARGET_VENDOR}" 벤더 제품이 없습니다.`);
      console.log(`   현재 스토어에 등록된 벤더를 확인하세요.`);
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < products.length; i++) {
      console.log(`\n[${i + 1}/${products.length}]`);
      try {
        await processOne(products[i]);
        successCount++;
      } catch (err) {
        console.error(`❌  오류 (ID: ${products[i].id}):`, err.response?.data || err.message);
        failCount++;
      }
      if (i < products.length - 1) await sleep(300); // API rate limit
    }

    console.log(`\n========================================`);
    console.log(` 완료: 성공 ${successCount}개 / 실패 ${failCount}개`);
    console.log(`========================================\n`);
  }
}

main().catch(err => {
  console.error('치명적 오류:', err.message);
  process.exit(1);
});
