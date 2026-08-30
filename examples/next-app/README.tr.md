# Next.js App Router örneği

[English](README.md) | [Türkçe](README.tr.md)

Bu örnek, `@copypatch/backend` paketini aynı Next.js Node dağıtımına gömer. Catch-all rota `/__copypatch/api/v2/*` yolunun sahibidir ve sayfa ilk snapshot'ı doğrudan backend'den okur.

Editörü kullanmadan önce `COPYPATCH_PASSPHRASE_HASH` ayarlayın. İsteğe bağlı `COPYPATCH_SQLITE_PATH` veritabanı yolunu belirler. Parola yoksa sayfa fallback metni render eder, API rota üzerinde geliştirme gizli anahtarı etkinleştirilmez.

Tam akış için [Next.js rehberini](https://copypatch.vercel.app/tr/docs/nextjs) açın.
