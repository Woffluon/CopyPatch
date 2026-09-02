# @copypatch/storage-sqlite

[English](README.md) | [Türkçe](README.tr.md)

CopyPatch v3 için SQLite kalıcılığı. Tek sunuculu veya kalıcı diski olan dağıtımlar için uygundur.

```bash
pnpm add @copypatch/core @copypatch/storage-sqlite better-sqlite3
```

`@copypatch/storage-sqlite`, `better-sqlite3@12` çalışma zamanıyla aynı olacak
şekilde Node.js `20.x`, `22.x`, `23.x`, `24.x`, `25.x` ve `26.x` sürümlerini
destekler. Node.js 21 desteklenmez. Bu aralık yalnız SQLite paketine özgüdür;
diğer CopyPatch paketlerinin `>=20` gereksinimini değiştirmez.

`createSQLitePersistence` ile adaptörü oluşturun ve trafik almadan önce `migrate()` çağırın. Mutasyonlar taslak ve yayınlanmış revizyonlar üzerinde atomik compare-and-swap kullanır. Uygulama kapanırken `close()` çağırın.

[Dağıtım rehberi](https://copypatch.vercel.app/tr/docs/deployment) kalıcı volume ve WAL notlarını içerir.
