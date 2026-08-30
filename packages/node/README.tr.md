# @copypatch/node

[English](README.md) | [Türkçe](README.tr.md)

Node.js 20+ adaptörleri ve `copypatch` başlangıç CLI aracı.

```bash
copypatch init --framework next --storage sqlite
copypatch doctor
printf 'parola' | copypatch hash --stdin
```

`createNodeHandler`, `expressMiddleware`, `fastifyCopyPatchHandler` ve `createHonoHandler`, ortak backend'i host sunucusuna bağlar. Express ve Fastify adaptörlerini body parser'lardan önce kaydedin. [Node ve Vite rehberi](https://copypatch.vercel.app/tr/docs/vite) çalışma sırasını açıklar.
