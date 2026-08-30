# @copypatch/storage-sqlite

[English](README.md) | [Türkçe](README.tr.md)

CopyPatch v2 için SQLite kalıcılığı. Tek sunuculu veya kalıcı diski olan dağıtımlar için uygundur.

```bash
pnpm add @copypatch/core @copypatch/storage-sqlite better-sqlite3
```

`createSQLitePersistence` ile adaptörü oluşturun ve trafik almadan önce `migrate()` çağırın. Mutasyonlar taslak ve yayınlanmış revizyonlar üzerinde atomik compare-and-swap kullanır. Uygulama kapanırken `close()` çağırın.

[Dağıtım rehberi](https://copypatch.vercel.app/tr/docs/deployment) kalıcı volume ve WAL notlarını içerir.
