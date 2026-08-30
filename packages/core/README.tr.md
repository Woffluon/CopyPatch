# @copypatch/core

[English](README.md) | [Türkçe](README.tr.md)

CopyPatch paket ailesinin ESM sözleşmeleri ve yardımcıları. React veya Next.js entegrasyonlarının dışında tip, doğrulama ve API sabitlerine ihtiyaç duyduğunuzda kullanın.

## Kurulum

```bash
pnpm add @copypatch/core
```

## Genel API

- `API_BASE_PATH`, `CSRF_HEADER_NAME` ve içerik/oturum sözleşmeleri
- `ContentSnapshot`, `EditorSnapshot`, `CopyPatchPersistence`
- `isValidContentKey`, `isValidLocale`, `normalizeText`

İçerik anahtarları 160 karaktere kadar harf, sayı, nokta, alt çizgi, iki nokta ve kısa çizgi kullanabilir. Ayrıntılı tip ve HTTP sözleşmeleri için [Türkçe API referansına](https://copypatch.vercel.app/tr/docs/api-reference) bakın.

Node.js 20 veya üzeri ve ESM gerekir.
