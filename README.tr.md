# CopyPatch

[English](README.md) | [Türkçe](README.tr.md)

CopyPatch, var olan web uygulamanıza güvenli ve satır içi (inline) metin düzenleme yeteneği kazandırır. Düzenlenebilir metinleri React bileşenleriyle işaretleyin, CopyPatch backend modülünü ana uygulamanızın içine bağlayın ve yetkili editörlerin `?copypatch=1` parametresiyle doğrudan canlı sayfada metinleri güncellemesini sağlayın.

CopyPatch uygulamanızın kendi çalışma zamanı içinde gömülü çalışır. Bağımsız bir API sunucusu, harici açık portlar, reverse proxy veya harici CORS yapılandırması gerektirmez.

```mermaid
flowchart LR
  Browser[Tarayıcı: ?copypatch=1] --> Host[Ana Uygulama]
  Host --> ReactView[React: CopyPatchProvider & EditableText]
  Host --> ApiRoute[/__copypatch/api/v2/*]
  ApiRoute --> Backend[@copypatch/backend]
  Backend --> Storage[(SQLite / PostgreSQL)]
```

---

## Temel Yetenekler

- **Aynı köken (Same-origin) mimarisi:** API rotası doğrudan `/__copypatch/api/v2` altında sunulur. Tüm istekler sayfanın kendi kökeninde kaldığı için CORS karmaşıklığı ve harici port açma riski oluşmaz.
- **Ziyaretçiler için sıfır ek paket yükü:** Normal ziyaretçilere yalnızca hafif React bileşenleri gönderilir. Görsel düzenleyici arayüzü, diff inceleme araçları ve kimlik doğrulama ekranları yalnızca `?copypatch=1` parametresi mevcut olduğunda dinamik olarak yüklenir.
- **Sunucu anlık görüntüsü (Snapshot) ile render:** Sunucu bileşenleri (RSC) ve SSR rotaları yayınlanmış metinleri doğrudan veritabanından okur; böylece istemcide layout kayması (CLS) veya veri bekleme şelaleleri yaşanmaz.
- **Esnek depolama katmanı:** Tek sunuculu veya yerel ortamlar için SQLite (`@copypatch/storage-sqlite`), yatayda ölçeklenen çoklu sunucu kümeleri için PostgreSQL (`@copypatch/storage-postgres`) kullanılır.
- **Rol tabanlı güvenlik:** Dahili Argon2id oturumları veya ana uygulamaya ait özel kimlik doğrulama adaptörleri ile `editor` (taslak kaydetme) ve `publisher` (canlıya yayınlama) yetkileri katı CSRF doğrulamasıyla denetlenir.

---

## Paket Ekosistemi

CopyPatch, `@copypatch` kapsamında eşzamanlı sürümlenen yedi genel paket sunar:

| Paket | Görev |
| --- | --- |
| [`@copypatch/core`](packages/core) | Paylaşılan TypeScript sözleşmeleri, doğrulama şemaları ve API sabitleri. |
| [`@copypatch/react`](packages/react) | `<CopyPatchProvider>`, `<EditableText>`, headless hook'lar ve dinamik düzenleyici arayüzü. |
| [`@copypatch/backend`](packages/backend) | Depolamadan bağımsız HTTP denetleyicisi, oturum yönetimi, CSRF kontrolü ve yetkilendirme. |
| [`@copypatch/storage-sqlite`](packages/storage-sqlite) | `better-sqlite3` tabanlı SQLite kalıcılık adaptörü. |
| [`@copypatch/storage-postgres`](packages/storage-postgres) | Transaction ve bağlantı havuzu destekli PostgreSQL kalıcılık adaptörü. |
| [`@copypatch/node`](packages/node) | Express, Fastify, Hono, yerel Node HTTP adaptörleri ve `copypatch` CLI aracı. |
| [`@copypatch/next`](packages/next) | Next.js App Router rota işleyicileri, sunucu snapshot okuma yardımcıları ve sağlayıcı sarmalayıcıları. |

> [!NOTE]
> `@copypatch/server` paketi v1 sürümündeki bağımsız sunucuyu temsil eder. Kullanımdan kaldırılmıştır ve yalnızca geriye dönük uyumluluk için korunmaktadır. Tüm v2 entegrasyonları gömülü backend örneklerini kullanır.

---

## Hızlı Başlangıç: Next.js App Router ve SQLite

### 1. Bağımlılıkları yükleyin

```bash
pnpm add @copypatch/core @copypatch/react @copypatch/backend \
  @copypatch/storage-sqlite @copypatch/next
```

### 2. Paylaşılan backend örneğini oluşturun

Kalıcılık motorunu ve backend denetleyicisini sunucu tarafında tek bir yardımcı modülde başlatın:

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

### 3. Aynı köken API rotasını ekleyin

`/__copypatch/api/v2/*` yolunu karşılayan catch-all rota işleyicisini tanımlayın:

```ts
// app/%5F%5Fcopypatch/api/v2/[...path]/route.ts
import { createCopyPatchRouteHandlers } from '@copypatch/next/server';
import { copypatch } from '@/lib/copypatch';

export const { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS } =
  createCopyPatchRouteHandlers(copypatch);
```

### 4. Argon2id parola özetini üretin

Özeti bir kez üretin ve ortam değişkeninize (`COPYPATCH_PASSPHRASE_HASH`) kaydedin:

```bash
printf '%s' "guclu-editor-parolaniz" | pnpm exec copypatch hash --stdin
```

### 5. Sunucu bileşenlerini snapshot ile render edin

Sunucuda yayınlanmış anlık görüntüyü okuyun ve arayüzü sağlayıcı ile sarmalayın:

```tsx
// app/page.tsx
import { NextCopyPatchProvider, EditableText } from '@copypatch/next';
import { readPublishedSnapshot } from '@copypatch/next/server';
import { copypatch } from '@/lib/copypatch';

export default async function Page() {
  const snapshot = await readPublishedSnapshot(copypatch, 'tr');

  return (
    <NextCopyPatchProvider locale="tr" initialSnapshot={snapshot}>
      <main className="container">
        <EditableText contentKey="home.hero.title" as="h1">
          Platformumuza Hoş Geldiniz
        </EditableText>
        <EditableText contentKey="home.hero.body" as="p" allowLineBreaks>
          Bu sayfayı ?copypatch=1 parametresiyle açarak metinleri doğrudan düzenleyebilirsiniz.
        </EditableText>
      </main>
    </NextCopyPatchProvider>
  );
}
```

---

## Depolama Adaptörleri

### SQLite (`@copypatch/storage-sqlite`)

Yerel geliştirme, masaüstü uygulamaları veya tek container dağıtımları için idealdir:

```ts
import { createSQLitePersistence } from '@copypatch/storage-sqlite';

const persistence = createSQLitePersistence('./data/copypatch.sqlite');
await persistence.migrate();
```

### PostgreSQL (`@copypatch/storage-postgres`)

Çoklu sunucusuz (serverless) örnek veya yatayda ölçeklenen sunucular için tasarlanmıştır:

```ts
import { createPostgresPersistence } from '@copypatch/storage-postgres';

const persistence = createPostgresPersistence(process.env.DATABASE_URL!);
await persistence.migrate();
```

---

## Çoklu Çerçeve Sunucu Adaptörleri

`@copypatch/node` paketi popüler Node.js çatıları için yerel ara yazılımlar sunar:

### Express

```ts
import express from 'express';
import { expressMiddleware } from '@copypatch/node';
import { copypatch } from './copypatch.js';

const app = express();

// Body parser'lardan önce CopyPatch middleware'ini bağlayın
app.use(expressMiddleware(copypatch));
```

### Fastify

```ts
import Fastify from 'fastify';
import { fastifyPlugin } from '@copypatch/node';
import { copypatch } from './copypatch.js';

const fastify = Fastify();
await fastify.register(fastifyPlugin, { backend: copypatch });
```

### Hono (Node.js çalışma zamanı)

```ts
import { Hono } from 'hono';
import { honoMiddleware } from '@copypatch/node';
import { copypatch } from './copypatch.js';

const app = new Hono();
app.use('*', honoMiddleware(copypatch));
```

### Astro SSR ve React Router

Astro SSR veya React Router sunucu girişlerinde doğrudan `handleNodeRequest` fonksiyonunu kullanın:

```ts
import { handleNodeRequest } from '@copypatch/node';
import { copypatch } from './copypatch.js';

export async function handleRequest(req, res) {
  const handled = await handleNodeRequest(copypatch, req, res);
  if (handled) return;
  // Ana uygulamanın render işlemine devam edin
}
```

---

## React Bileşen ve Hook Referansı

### `<EditableText>`

Ziyaretçi modunda düz metin; editör modunda kontrolsüz `contentEditable` yüzeyi render eder:

```tsx
import { EditableText } from '@copypatch/react';

<EditableText
  contentKey="pricing.plan.pro.description"
  as="p"
  allowLineBreaks={false}
  className="text-muted"
>
  Tüm temel özellikleri içeren standart ekip paketi.
</EditableText>
```

- `contentKey` (zorunlu): Metin kaydı için benzersiz kimlik dizesi.
- `as` (isteğe bağlı): HTML eleman tipi (örneğin `'span'`, `'h1'`, `'p'`). Varsayılan: `'span'`.
- `allowLineBreaks` (isteğe bağlı): Shift+Enter ile çok satırlı düzenlemeye izin vermek için `true` yapın.
- `children` (zorunlu): Veritabanında kayıtlı metin bulunmadığında render edilecek yedek içerik.

### `useCopyPatch`

Aktif düzenleyici durumu, yetkilendirme bilgisi ve geçerli dil koduna erişir:

```tsx
import { useCopyPatch } from '@copypatch/react';

function StatusIndicator() {
  const { isEditorActive, isAuthorized, role, locale } = useCopyPatch();

  if (!isEditorActive) return null;

  return (
    <aside className="editor-status">
      Dil: {locale} | Rol: {role ?? 'Misafir'}
    </aside>
  );
}
```

### `useEditableText` (Headless Hook)

`<EditableText>` kullanmadan özel düzenleme bileşenleri veya entegrasyonlar geliştirmek için:

```tsx
import { useEditableText } from '@copypatch/react';

function CustomField({ contentKey, defaultValue }: { contentKey: string; defaultValue: string }) {
  const { text, isEditing, elementRef, onFocus, onBlur, onInput } =
    useEditableText(contentKey, defaultValue);

  return (
    <div
      ref={elementRef}
      contentEditable={isEditing}
      onFocus={onFocus}
      onBlur={onBlur}
      onInput={onInput}
    >
      {text}
    </div>
  );
}
```

---

## Kimlik Doğrulama ve Güvenlik

CopyPatch iki kimlik doğrulama yöntemini destekler:

### 1. Dahili Argon2id Parola Doğrulaması

Backend oluşturulurken `passphraseHash` parametresi tanımlanır. Başarılı giriş sonrasında HTTP-only ve imzalı bir oturum çerezi (`copypatch_session`) oluşturulur.

Veri değiştiren tüm isteklerde (taslak kaydı, yayınlama, geri alma) CSRF saldırılarına karşı `x-copypatch-csrf` başlığı doğrulanır.

### 2. Ana Uygulama Kimlik Doğrulama Adaptörü

CopyPatch'i uygulamanızın mevcut kullanıcı sistemine (NextAuth, Clerk, Auth0, Supabase vb.) bağlayın:

```ts
import { createCopyPatchBackend, type AuthAdapter } from '@copypatch/backend';

const authAdapter: AuthAdapter = {
  async resolveUser(request) {
    const session = await getHostSession(request);
    if (!session?.user) return null;

    return {
      id: session.user.id,
      name: session.user.name,
      role: session.user.isAdmin ? 'publisher' : 'editor',
    };
  },
  async verifyMutation(request, user) {
    // Ana uygulamanın CSRF token veya istek bütünlüğünü doğrulayın
    return isValidHostCsrf(request);
  },
};

export const copypatch = createCopyPatchBackend({
  persistence,
  authAdapter,
});
```

### Rol Hiyerarşisi

- `guest`: Yalnızca yayınlanmış metinleri okuyabilir.
- `editor`: Yayınlanmış metinleri okuyabilir, taslakları önizleyebilir ve taslak revizyonu kaydedebilir.
- `publisher`: Editör yetkilerine ek olarak taslak revizyonlarını canlıya yayınlayabilir.

---

## CLI Referansı

`@copypatch/node` paketi `copypatch` CLI aracını içerir:

| Komut | Kullanım | Açıklama |
| --- | --- | --- |
| `init` | `copypatch init --framework <framework> --storage <storage>` | Başlangıç yapılandırma ve rota dosyalarını üretir. |
| `hash` | `printf '%s' "$SECRET" \| copypatch hash --stdin` | Kriptografik Argon2id parola özeti oluşturur. |
| `migrate` | `copypatch migrate --storage <sqlite\|postgres>` | Seçilen depolama motoru için şema geçişlerini çalıştırır. |
| `doctor` | `copypatch doctor` | Mevcut dizini, yapılandırma dosyalarını ve ortam değişkenlerini denetler. |

`init` komutu için desteklenen çatı seçenekleri: `next`, `astro`, `react-router`, `vite-node`.

---

## Dökümantasyon ve Mimari

- [Mimari Haritası (Architecture Map)](docs/architecture.tr.md): Çalışma zamanı akışı ve paket bağımlılık kuralları.
- [Tehdit Modeli ve Güvenlik Durumu](docs/threat-model.tr.md): Güvenlik analizi, oturum politikaları ve önlemler.
- [Güvenlik Politikası](SECURITY.tr.md): Güvenlik açığı bildirim ve koordinasyon yönergeleri.
- [Katkı Rehberi](CONTRIBUTING.tr.md): Monorepo kurulumu, lockstep sürümleme ve test talimatları.
- [Canlı Dökümantasyon Sitesi](https://copypatch.vercel.app/tr/docs): API rehberleri, canlı bileşen alanı ve öğreticiler.

---

## Lisans

MIT. Telif Hakkı 2026 Efe Arabacı.
