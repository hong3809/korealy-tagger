// dotenv: 로컬 개발 시에만 사용
try { require('dotenv').config(); } catch(e) {}

const { parse } = require('node-html-parser');

// ──────────────────────────────────────────────
// 1. 스킨케어 / 뷰티 관련 키워드 사전
// ──────────────────────────────────────────────
const KEYWORD_DICT = {
  // 제품 카테고리
  categories: [
    'serum', 'toner', 'moisturizer', 'cleanser', 'sunscreen', 'spf',
    'mask', 'sheet mask', 'essence', 'eye cream', 'lip', 'balm',
    'exfoliant', 'exfoliating', 'scrub', 'peel', 'peeling',
    'ampoule', 'sleeping mask', 'cream', 'lotion', 'oil', 'mist',
    'primer', 'foundation', 'bb cream', 'cc cream', 'cushion',
    'blush', 'contour', 'highlighter', 'setting powder', 'setting spray',
    'shampoo', 'conditioner', 'hair mask', 'hair oil', 'hair serum',
    'body lotion', 'body cream', 'body scrub', 'body wash', 'hand cream',
    'cleansing foam', 'cleansing milk', 'cleansing oil', 'cleansing balm',
    'micellar water', 'makeup remover', 'toning pad', 'toning pads',
    'sleeping pack', 'wash-off mask', 'clay mask', 'bubble mask',
    'collagen', 'retinol', 'niacinamide', 'hyaluronic acid', 'ceramide',
    'vitamin c', 'aha', 'bha', 'pha', 'salicylic acid', 'glycolic acid',
    'centella', 'cica', 'madecassoside', 'snail', 'propolis', 'mugwort',
    'ginseng', 'green tea', 'rice', 'peptide', 'bifida', 'ferment',
  ],

  // 피부 타입
  skinTypes: [
    'oily skin', 'dry skin', 'combination skin', 'sensitive skin',
    'normal skin', 'acne-prone', 'acne prone', 'all skin types',
    'oily', 'dry', 'sensitive', 'combination',
  ],

  // 피부 고민
  skinConcerns: [
    'anti-aging', 'anti aging', 'aging', 'wrinkle', 'fine line',
    'brightening', 'whitening', 'dark spot', 'hyperpigmentation',
    'pore', 'pores', 'hydrating', 'hydration', 'moisturizing',
    'soothing', 'calming', 'redness', 'irritation', 'acne', 'blemish',
    'blackhead', 'whitehead', 'firming', 'lifting', 'elasticity',
    'dullness', 'radiance', 'glow', 'glowing',
  ],

  // 브랜드 원산지
  origins: ['k-beauty', 'korean', 'korea', 'k beauty'],

  // 특성
  features: [
    'vegan', 'cruelty-free', 'cruelty free', 'fragrance-free', 'fragrance free',
    'alcohol-free', 'paraben-free', 'sulfate-free', 'dermatologist tested',
    'hypoallergenic', 'non-comedogenic', 'organic', 'natural',
    'waterproof', 'long-lasting', 'spf', 'pa+', 'uva', 'uvb',
  ],

  // 볼륨/용량 패턴 (정규식)
  volumePatterns: [
    /\b\d+\s*ml\b/gi,
    /\b\d+\s*g\b/gi,
    /\b\d+\s*oz\b/gi,
    /\b\d+\s*ea\b/gi,
    /\b\d+\s*pc\b/gi,
    /\b\d+\s*pcs\b/gi,
    /\b\d+\s*sheet[s]?\b/gi,
    /\bx\s*\d+\s*ea\b/gi,
  ],
};

// ──────────────────────────────────────────────
// 2. HTML → 순수 텍스트 변환
// ──────────────────────────────────────────────
function htmlToText(html) {
  if (!html) return '';
  try {
    const root = parse(html);
    return root.text.replace(/\s+/g, ' ').trim();
  } catch {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

// ──────────────────────────────────────────────
// 3. 텍스트에서 키워드 추출
// ──────────────────────────────────────────────
function extractKeywordsFromText(text) {
  const lower = text.toLowerCase();
  const found = new Set();

  // 카테고리
  for (const kw of KEYWORD_DICT.categories) {
    if (lower.includes(kw)) found.add(toTitleCase(kw));
  }
  // 피부 타입
  for (const kw of KEYWORD_DICT.skinTypes) {
    if (lower.includes(kw)) found.add(toTitleCase(kw));
  }
  // 피부 고민
  for (const kw of KEYWORD_DICT.skinConcerns) {
    if (lower.includes(kw)) found.add(toTitleCase(kw));
  }
  // 원산지
  for (const kw of KEYWORD_DICT.origins) {
    if (lower.includes(kw)) found.add('K-Beauty');
  }
  // 특성
  for (const kw of KEYWORD_DICT.features) {
    if (lower.includes(kw)) found.add(toTitleCase(kw));
  }

  return [...found];
}

// ──────────────────────────────────────────────
// 4. 제품 제목에서 태그 추출
// ──────────────────────────────────────────────
function extractTagsFromTitle(title) {
  if (!title) return [];
  const tags = extractKeywordsFromText(title);

  // 볼륨 패턴 추출
  for (const pattern of KEYWORD_DICT.volumePatterns) {
    const matches = title.match(pattern);
    if (matches) matches.forEach(m => tags.push(m.trim().toUpperCase()));
  }

  return tags;
}

// ──────────────────────────────────────────────
// 5. Description HTML에서 태그 추출
// ──────────────────────────────────────────────
function extractTagsFromDescription(bodyHtml) {
  if (!bodyHtml) return [];
  const text = htmlToText(bodyHtml);
  return extractKeywordsFromText(text);
}

// ──────────────────────────────────────────────
// 6. 컬렉션 목록 조회 (Admin API)
// ──────────────────────────────────────────────
async function fetchProductCollections(productId, shopDomain, accessToken) {
  const axios = require('axios');
  try {
    const res = await axios.get(
      `https://${shopDomain}/admin/api/2024-01/collects.json?product_id=${productId}`,
      { headers: { 'X-Shopify-Access-Token': accessToken } }
    );
    const collects = res.data.collects || [];
    const collectionTitles = [];

    for (const collect of collects) {
      try {
        const cRes = await axios.get(
          `https://${shopDomain}/admin/api/2024-01/custom_collections/${collect.collection_id}.json`,
          { headers: { 'X-Shopify-Access-Token': accessToken } }
        );
        const title = cRes.data.custom_collection?.title;
        if (title) collectionTitles.push(title);
      } catch {}

      try {
        const sRes = await axios.get(
          `https://${shopDomain}/admin/api/2024-01/smart_collections/${collect.collection_id}.json`,
          { headers: { 'X-Shopify-Access-Token': accessToken } }
        );
        const title = sRes.data.smart_collection?.title;
        if (title) collectionTitles.push(title);
      } catch {}
    }

    return collectionTitles;
  } catch (err) {
    console.error('[fetchProductCollections] 오류:', err.message);
    return [];
  }
}

// ──────────────────────────────────────────────
// 7. 메인 태그 생성 함수
// ──────────────────────────────────────────────
async function generateTags(product, shopDomain, accessToken) {
  const allTags = new Set();

  // ── 필수 태그 (항상 포함) ──────────────────────
  // Product Title 에서 의미 있는 단어 추출
  const titleTags = extractTagsFromTitle(product.title || '');
  titleTags.forEach(t => allTags.add(t));

  // Product Type
  if (product.product_type && product.product_type.trim()) {
    allTags.add(product.product_type.trim());
  }

  // Vendor (공급업체)
  if (product.vendor && product.vendor.trim()) {
    allTags.add(product.vendor.trim());
  }

  // Collection (컬렉션 목록 조회)
  if (product.id && shopDomain && accessToken) {
    const collections = await fetchProductCollections(product.id, shopDomain, accessToken);
    collections.forEach(c => allTags.add(c));
  }

  // ── Description 분석 태그 ──────────────────────
  const descTags = extractTagsFromDescription(product.body_html || '');
  descTags.forEach(t => allTags.add(t));

  // ── 기존 태그 유지 ──────────────────────────────
  if (product.tags) {
    const existing = product.tags.split(',').map(t => t.trim()).filter(Boolean);
    existing.forEach(t => allTags.add(t));
  }

  // ── K-Beauty 기본 태그 (korealy 공급업체) ─────
  allTags.add('K-Beauty');
  allTags.add('korealy');

  // 중복 제거 + 정렬 + 빈 값 제거
  return [...allTags]
    .filter(t => t && t.trim().length > 0)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

// ──────────────────────────────────────────────
// 8. 유틸
// ──────────────────────────────────────────────
function toTitleCase(str) {
  return str
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

module.exports = { generateTags, fetchProductCollections, htmlToText };
