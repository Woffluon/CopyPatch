# CopyPatch v3 Mimari Haritası

[English](architecture.md) | [Türkçe](architecture.tr.md)

Bu belge, CopyPatch v3'ün güncel mimari haritasıdır. Bir paket sınırı, genel entegrasyon sözleşmesi veya dağıtım sınırı değiştiğinde bu belgeyi güncelleyin.

## Çalışma Zamanı Şeması

```mermaid
flowchart LR
  Browser[Tarayıcı / İstemci] --> Host[Ana Web Uygulaması]
  Host --> React[@copypatch/react]
  Host --> Route[/__copypatch/api/v2]
  Route --> Backend[@copypatch/backend]
  Backend --> Storage[SQLite veya PostgreSQL]
```

Ana uygulama API rotasını doğrudan kendi bünyesinde barındırır. Tarayıcı doğrudan sayfanın render edildiği aynı kökenle (same-origin) iletişim kurar; dolayısıyla CopyPatch ayrı bir arka plan süreci, ikinci bir açık port, reverse proxy veya CORS modu içermez.

## Paket Sınırları ve Sorumluluklar

| Paket | Sorumluluk ve Kapsam |
| --- | --- |
| `@copypatch/core` | API yolları, veri sözleşmeleri, doğrulama kuralları, içerik ve kalıcılık tipleri. |
| `@copypatch/react` | Sağlayıcı (Provider), düzenlenebilir metin bileşenleri, istemci deposu ve tembel yüklenen düzenleyici arayüzü. |
| `@copypatch/backend` | HTTP yönlendirme, yetkilendirme, oturum davranışları, CSRF kontrolleri ve iyimser revizyon koordinasyonu. |
| `@copypatch/storage-sqlite` | SQLite migrasyonları ve `better-sqlite3` tabanlı kalıcılık uygulaması. |
| `@copypatch/storage-postgres` | PostgreSQL migrasyonları, bağlantı havuzu ve çoklu sunucu kalıcılığı. |
| `@copypatch/node` | Yerel Node, Express, Fastify ve Hono adaptörleri ile proje kurulum ve migrasyon CLI komutları. |
| `@copypatch/next` | Next.js App Router rota işleyicileri ve doğrudan sunucu tarafı snapshot okuma yardımcıları. |

## Veri ve İstek Akış Yolları

1. **Sunucu Render:** Ana uygulama, SSR/RSC aşamasında varsayılan yedek metni render eder veya paylaşılan backend örneğinden yayınlanmış dil anlık görüntüsünü doğrudan okur.
2. **İstemci Eşitleme:** `CopyPatchProvider`, istemci durumunu tazelemek istediğinde `/__copypatch/api/v2/content/:locale` aynı kökenli uç noktasını çağırır.
3. **Düzenleme Modu:** Sayfa URL'sinde `?copypatch=1` bulunduğunda, istemci düzenleyici paketini tembel yükler (lazy-load).
4. **Kimlik ve Mutasyon:** Editörler dahili parola oturumu veya host auth adaptörü ile giriş yapar. Mutasyon rotaları rol ve revizyon denetimlerini uygular.
5. **Kalıcılık:** Yerel ve tek sunuculu yapılarda SQLite; çoklu sunucu kümelerinde PostgreSQL kullanılır.

## Ana Çerçeve (Host) Seçenekleri

- **Next.js App Router:** `createCopyPatchRouteHandlers` ile catch-all rotası oluşturun ve sunucu bileşenlerinde `readPublishedSnapshot` kullanın.
- **Astro SSR, React Router veya Vite + Node:** Uygulamayı sunan Node sunucusuna `@copypatch/node` adaptörlerinden birini mount edin.
- **Statik Çıktılar (SSG):** Canlı düzenleme için desteklenmez. Statik sayfa varsayılan metinleri render edebilir; ancak API ve depolama için sunucu çalışma zamanı gereklidir.

## Dökümantasyon Yönetimi

- Bu dosya projenin mimari haritası ve güncel genel sözleşme referansıdır.
- `docs/threat-model.tr.md` güvenlik durumunu ve tasarım kararları geçmişini tutar.
- `docs/npm-publishing.md` ve `docs/npm-readiness-audit-2026-08-24.md` kasıtlı silme bölgesindedir (delete-zone); bakımcı onayı olmadan yeniden oluşturulmamalıdır.
- README ve dökümantasyon sitesi son kullanıcıya dönük özetlerdir. Site;
  navigasyonu, rotaları, sitemap'i ve yerel arama indeksini eşlenmiş
  `apps/site/src/content/docs/en` ve `tr` MDX girişlerinden üretir. İki dili
  ve örneklerini bu haritayla, özellikle v2 API yolu ve same-origin dağıtım
  modeliyle uyumlu tutun.
