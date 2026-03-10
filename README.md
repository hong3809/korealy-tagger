# Korealy Auto-Tagger

Shopify 스토어에서 **korealy** 공급업체 제품이 등록/수정될 때 자동으로 태그를 생성하는 Webhook 서버입니다.

## 기능
- `products/create` / `products/update` Webhook 수신
- Product Title, Type, Vendor, Collection → 필수 태그 자동 추가
- Description HTML 파싱 → K-Beauty 키워드 자동 태그 추출
- 기존 태그 유지 + 신규 태그 병합

## 환경변수 설정
```
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ADMIN_API_TOKEN=your-token
TARGET_VENDOR=korealy
ADMIN_KEY=your-admin-key
PORT=3000
```

## 실행
```bash
npm install
npm start
```
# Railway 강제 재배포 트리거 Tue Mar 10 04:33:18 UTC 2026
