const { parse } = require('node-html-parser');

const KEYWORD_DICT = {
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
  skinTypes: [
    'oily skin', 'dry skin', 'combination skin', 'sensitive skin',
    'normal skin', 'acne-prone', 'acne prone', 'all skin types',
    'oily', 'dry', 'sensitive', 'combination',
  ],
  skinConcerns: [
    'anti-aging', 'anti aging', 'aging', 'wrinkle', 'fine line',
    'brightening', 'whitening', 'dark spot', 'hyperpigmentation',
    'pore', 'pores', 'hydrating', 'hydration', 'moisturizing',
    'soothing', 'calming', 'redness', 'irritation', 'acne', 'blemish',
    'blackhead', 'whitehead', 'firming', 'lifting', 'elasticity',
    'dullness', 'radiance', 'glow', 'glowing',
  ],
  origins: ['k-beauty', 'korean', 'korea', 'k beauty'],
  features: [
    'vegan', 'cruelty-free', 'cruelty free', 'fragrance-free', 'fragrance free',
    'alcohol-free', 'paraben-free', 'sulfate-free', 'dermatologist tested',
    'hypoallergenic', 'non-comedogenic', 'organic', 'natural',
    'waterproof', 'long-lasting', 'spf', 'pa+', 'uva', 'uvb',
  ],
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

function htmlToText(html) {
  if (!html) return '';
  try {
    var root = parse(html);
    return root.text.replace(/\s+/g, ' ').trim();
  } catch(e) {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

function toTitleCase(str) {
  return str.split(' ').map(function(w) {
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

function extractKeywordsFromText(text) {
  var lower = text.toLowerCase();
  var found = new Set();
  var i;
  for (i = 0; i < KEYWORD_DICT.categories.length; i++) {
    if (lower.includes(KEYWORD_DICT.categories[i])) found.add(toTitleCase(KEYWORD_DICT.categories[i]));
  }
  for (i = 0; i < KEYWORD_DICT.skinTypes.length; i++) {
    if (lower.includes(KEYWORD_DICT.skinTypes[i])) found.add(toTitleCase(KEYWORD_DICT.skinTypes[i]));
  }
  for (i = 0; i < KEYWORD_DICT.skinConcerns.length; i++) {
    if (lower.includes(KEYWORD_DICT.skinConcerns[i])) found.add(toTitleCase(KEYWORD_DICT.skinConcerns[i]));
  }
  for (i = 0; i < KEYWORD_DICT.origins.length; i++) {
    if (lower.includes(KEYWORD_DICT.origins[i])) found.add('K-Beauty');
  }
  for (i = 0; i < KEYWORD_DICT.features.length; i++) {
    if (lower.includes(KEYWORD_DICT.features[i])) found.add(toTitleCase(KEYWORD_DICT.features[i]));
  }
  return Array.from(found);
}

function extractTagsFromTitle(title) {
  if (!title) return [];
  var tags = extractKeywordsFromText(title);
  for (var i = 0; i < KEYWORD_DICT.volumePatterns.length; i++) {
    var matches = title.match(KEYWORD_DICT.volumePatterns[i]);
    if (matches) {
      matches.forEach(function(m) { tags.push(m.trim().toUpperCase()); });
    }
  }
  return tags;
}

function extractTagsFromDescription(bodyHtml) {
  if (!bodyHtml) return [];
  var text = htmlToText(bodyHtml);
  return extractKeywordsFromText(text);
}

async function fetchProductCollections(productId, shopDomain, accessToken) {
  var axios = require('axios');
  try {
    var res = await axios.get(
      'https://' + shopDomain + '/admin/api/2024-01/collects.json?product_id=' + productId,
      { headers: { 'X-Shopify-Access-Token': accessToken } }
    );
    var collects = res.data.collects || [];
    var collectionTitles = [];
    for (var j = 0; j < collects.length; j++) {
      try {
        var cRes = await axios.get(
          'https://' + shopDomain + '/admin/api/2024-01/custom_collections/' + collects[j].collection_id + '.json',
          { headers: { 'X-Shopify-Access-Token': accessToken } }
        );
        var title = cRes.data.custom_collection && cRes.data.custom_collection.title;
        if (title) collectionTitles.push(title);
      } catch(e) {}
      try {
        var sRes = await axios.get(
          'https://' + shopDomain + '/admin/api/2024-01/smart_collections/' + collects[j].collection_id + '.json',
          { headers: { 'X-Shopify-Access-Token': accessToken } }
        );
        var stitle = sRes.data.smart_collection && sRes.data.smart_collection.title;
        if (stitle) collectionTitles.push(stitle);
      } catch(e) {}
    }
    return collectionTitles;
  } catch(err) {
    console.error('[fetchProductCollections] 오류:', err.message);
    return [];
  }
}

async function generateTags(product, shopDomain, accessToken) {
  var allTags = new Set();

  var titleTags = extractTagsFromTitle(product.title || '');
  titleTags.forEach(function(t) { allTags.add(t); });

  if (product.product_type && product.product_type.trim()) {
    allTags.add(product.product_type.trim());
  }
  if (product.vendor && product.vendor.trim()) {
    allTags.add(product.vendor.trim());
  }

  if (product.id && shopDomain && accessToken) {
    var collections = await fetchProductCollections(product.id, shopDomain, accessToken);
    collections.forEach(function(c) { allTags.add(c); });
  }

  var descTags = extractTagsFromDescription(product.body_html || '');
  descTags.forEach(function(t) { allTags.add(t); });

  if (product.tags) {
    var existing = product.tags.split(',').map(function(t) { return t.trim(); }).filter(Boolean);
    existing.forEach(function(t) { allTags.add(t); });
  }

  allTags.add('K-Beauty');
  allTags.add('korealy');

  return Array.from(allTags)
    .filter(function(t) { return t && t.trim().length > 0; })
    .sort(function(a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
}

module.exports = { generateTags: generateTags, fetchProductCollections: fetchProductCollections, htmlToText: htmlToText };
