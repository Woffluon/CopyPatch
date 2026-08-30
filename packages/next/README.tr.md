# @copypatch/next

[English](README.md) | [Türkçe](README.tr.md)

Next.js App Router için CopyPatch yardımcıları. React istemci entegrasyonunu, aynı köken rota işleyicilerini ve SSR/RSC snapshot okumayı birleştirir.

## Kurulum

```bash
pnpm add @copypatch/core @copypatch/react @copypatch/backend @copypatch/next
```

`NextCopyPatchProvider` ve `EditableText` istemci yüzeyini sağlar. `createCopyPatchRouteHandlers` catch-all route'u, `readPublishedSnapshot` ise colocated backend'den güvenli sunucu okumasını sağlar.

[Next.js rehberi](https://copypatch.vercel.app/tr/docs/nextjs) rota dosya yolunu ve tam entegrasyonu içerir.
