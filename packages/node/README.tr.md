# @copypatch/node

[English](README.md) | [Türkçe](README.tr.md)

ESM-only Node.js 20+ adaptörleri ve `copypatch` başlangıç CLI aracı. Programatik kullanımda `import` zorunludur; CommonJS `require()` desteklenmez.

Backend ile yalnız kullandığınız depolama adaptörünü kurun. Parola hash komutu
ve parola doğrulamalı backend için Argon2 paketi gerekir:

```bash
pnpm add @copypatch/node @copypatch/backend @copypatch/storage-sqlite @node-rs/argon2
```

```bash
copypatch init --framework next --storage sqlite
copypatch doctor
printf 'parola' | copypatch hash --stdin
```

`createNodeHandler`, `expressMiddleware`, `fastifyCopyPatchHandler` ve `createHonoHandler`, ortak backend'i host sunucusuna bağlar. Express ve Fastify adaptörlerini body parser'lardan önce kaydedin. [Node ve Vite rehberi](https://copypatch.vercel.app/tr/docs/vite) çalışma sırasını açıklar.

Native Node adaptörleri varsayılan olarak socket adresini kullanır ve forwarding
header'larını yok sayar. Yalnız tüm trafiği alan güvenilir proxy bu header'ları
yeniden yazıyorsa `trustProxy: true` kullanın.

`copypatch init`, üretilen dosyaların doğrudan import ettiği CopyPatch
paketlerini host `package.json` dosyasına ekler; kurulum komutunu kendisi
çalıştırmaz. İncelemeniz için tespit edilen npm, pnpm veya Yarn install komutunu
yazar. `--dry-run` hiçbir dosyayı değiştirmez.
