# CopyPatch

[English](README.md) | [Türkçe](README.tr.md)

CopyPatch, sahip olduğunuz mevcut web uygulamanıza güvenli ve satır içi (inline) metin düzenleme yeteneği kazandırır. Onaylanan metinleri React bileşenleriyle işaretleyin, CopyPatch'i uygulamanızın içine gömün ve yetkili editörlerin `?copypatch=1` parametresiyle metinleri doğrudan canlı arayüzde düzenlemesini sağlayın. Ayrı bir servis, açık port, reverse proxy veya karmaşık CORS yapılandırması gerektirmez.

## Bir Bakışta v2 Mimarisi

- **Aynı Köken (Same-Origin) API:** API rotası doğrudan ana uygulamanız tarafından `/__copypatch/api/v2` altında sunulur.
- **Sıfır CORS ve Proxy:** Tarayıcı istekleri sayfanın kendi kökeninde kalır. CopyPatch bağımsız bir API sunucusu veya harici proxy kullanmaz.
- **Esnek Kalıcılık Motorları:** Yerel geliştirme veya tek sunuculu dağıtımlar için SQLite; yatayda ölçeklenen çoklu sunucular için PostgreSQL kullanın.
- **Güçlü Kimlik Doğrulama:** Dahili Argon2id parola akışıyla hemen başlayın veya CopyPatch'i ana uygulamanızın mevcut kullanıcı ve oturum sistemine bağlayın.
- **Sunucu Çalışma Zamanı:** CopyPatch sunucu yeteneğine sahip uygulamalar için tasarlanmıştır. Salt statik (SSG) çıktılar varsayılan yedek metinleri render edebilir; ancak aktif düzenleme ve kayıt için bir sunucu çalışma zamanı (Node.js/serverless) gereklidir.

## Paket Ekosistemi

| Paket | Açıklama ve Görev |
| --- | --- |
| [`@copypatch/core`](packages/core) | Paylaşılan veri sözleşmeleri, doğrulama kuralları ve API sabitleri. |
| [`@copypatch/react`](packages/react) | `CopyPatchProvider`, düzenlenebilir React bileşenleri, kancalar ve tembel yüklenen düzenleyici arayüzü. |
| [`@copypatch/backend`](packages/backend) | Depolamadan bağımsız backend çalışma zamanı ve kimlik doğrulama sözleşmesi. |
| [`@copypatch/storage-sqlite`](packages/storage-sqlite) | `better-sqlite3` tabanlı SQLite kalıcılık adaptörü. |
| [`@copypatch/storage-postgres`](packages/storage-postgres) | `pg` tabanlı, bağlantı havuzu ve transaction kilitli PostgreSQL adaptörü. |
| [`@copypatch/node`](packages/node) | Yerel Node, Express, Fastify, Hono HTTP adaptörleri ve `copypatch` CLI aracı. |
| [`@copypatch/next`](packages/next) | Next.js App Router rota işleyicileri ve sunucu tarafı snapshot okuma yardımcıları. |

`@copypatch/server` v1 sürümündeki bağımsız sunucu paketidir. Yeni entegrasyonlar için kullanımdan kaldırılmıştır (deprecated); mevcut paket sürümleri npm üzerinden asla silinmeyecektir.

## Hızlı Başlangıç: Next.js ve SQLite

```bash
pnpm add @copypatch/core @copypatch/react @copypatch/backend \
  @copypatch/storage-sqlite @copypatch/next
```

Rota işleyicinizin ve sunucu bileşenlerinizin paylaşabileceği tekil bir backend örneği oluşturun:

```ts
// lib/copypatch.ts
import { createCopyPatchBackend } from '@copypatch/backend';
import { createSQLitePersistence } from '@copypatch/storage-sqlite';

const persistence = createSQLitePersistence('./data/copypatch.sqlite');
await persistence.migrate();

export const copypatch = createCopyPatchBackend({
  persistence,
  passphraseHash: process.env.COPYPATCH_PASSPHRASE_HASH!,
});
```

Uygulamanızın içine mount edin. Üretilen v2 rotası aynı kökendeki `/__copypatch/api/v2` yolunu yönetir:

```ts
// app/%5F%5Fcopypatch/api/v2/[...path]/route.ts
import { createCopyPatchRouteHandlers } from '@copypatch/next/server';
import { copypatch } from '@/lib/copypatch';

export const { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS } =
  createCopyPatchRouteHandlers(copypatch);
```

Argon2id parola özetini bir kez oluşturun ve çıktıyı ortam değişkeninize kaydedin:

```bash
printf '%s' "$COPYPATCH_PASSPHRASE" | pnpm exec copypatch hash --stdin
```

Aynı backend'i kullanarak sunucuda anlık görüntüyü okuyun ve React sağlayıcısına aktarın:

```tsx
// app/page.tsx
import { NextCopyPatchProvider, EditableText } from '@copypatch/next';
import { readPublishedSnapshot } from '@copypatch/next/server';
import { copypatch } from '@/lib/copypatch';

export default async function Page() {
  const snapshot = await readPublishedSnapshot(copypatch, 'tr');

  return (
    <NextCopyPatchProvider locale="tr" initialSnapshot={snapshot}>
      <EditableText contentKey="hero.title" as="h1">
        Hoş Geldiniz
      </EditableText>
    </NextCopyPatchProvider>
  );
}
```

Hazır bir başlangıç şablonu oluşturmak için `copypatch init --framework next --storage sqlite` komutunu çalıştırabilirsiniz.

## Çerçeve Entegrasyon Matrisi

| Çatı / Host | Sunucu Entegrasyonu | Notlar |
| --- | --- | --- |
| **Next.js App Router** | `@copypatch/next` | Catch-all rotası mount edin ve `readPublishedSnapshot` ile sunucuda render edin. |
| **Astro SSR** | `@copypatch/node` yerel adaptör | Üretilen API rotasını SSR adaptörüne ekleyin. Statik çıktı düzenleme sağlayamaz. |
| **React Router** | `@copypatch/node` yerel adaptör | İşleyiciyi çerçevenin sunucu giriş noktasına mount edin. |
| **Vite + Node** | `@copypatch/node` (Express, Fastify, Hono) | Vite istemci derleyicisidir; CopyPatch'i uygulamayı sunan Node sunucusuna mount edin. |

## Kimlik Doğrulama Stratejileri

Backend iki bağımsız stratejiden tam olarak birini kabul eder:

- `passphraseHash`: CopyPatch güvenli, aynı kökene bağlı bir oturum oluşturur ve değişikliklerde CSRF başlığını doğrular.
- `authAdapter`: Ana uygulama kendi kullanıcısını ve rollerini çözümler. Adaptör aynı zamanda her mutasyon isteğinin güvenliğini doğrular.

Her iki yaklaşımda da taslak kaydetmek için `editor`, canlıya yayınlamak için `publisher` rolü gereklidir.

## Dökümantasyon Bağlantıları

- [Mimari Haritası (Architecture Map)](docs/architecture.tr.md)
- [Tehdit Modeli ve Güvenlik Durumu](docs/threat-model.tr.md)
- [Güvenlik Politikası](SECURITY.tr.md)
- [Katkı Rehberi](CONTRIBUTING.tr.md)
- [Canlı Dökümantasyon Sitesi](https://copypatch.vercel.app/tr/docs)

## Lisans

MIT. Telif Hakkı 2026 Efe Arabacı.
