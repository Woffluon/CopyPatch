# @copypatch/storage-postgres

[English](README.md) | [Türkçe](README.tr.md)

CopyPatch v2 için PostgreSQL kalıcılığı. Birden fazla uygulama örneğinin içerik, oturum ve hız sınırı durumunu paylaşması gerektiğinde kullanın.

```bash
pnpm add @copypatch/storage-postgres pg
```

`createPostgresPersistence`, bağlantı dizesi veya mevcut `pg.Pool` kabul eder. `migrate()` idempotenttir ve advisory transaction lock kullanır. Enjekte edilen pool çağıranın mülkiyetinde kalır.

[Dağıtım rehberi](https://copypatch.vercel.app/tr/docs/deployment) bağlantı havuzu ve operasyon notlarını içerir.
