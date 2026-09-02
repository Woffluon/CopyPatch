# @copypatch/next

[English](README.md) | [Türkçe](README.tr.md)

Next.js App Router için CopyPatch yardımcıları. React istemci entegrasyonunu, aynı köken rota işleyicilerini ve SSR/RSC snapshot okumayı birleştirir.

## Kurulum

```bash
pnpm add @copypatch/core @copypatch/react @copypatch/backend @copypatch/next
```

`NextCopyPatchProvider` ve `EditableText` istemci yüzeyini sağlar. `createCopyPatchRouteHandlers` catch-all route'u, `readPublishedSnapshot` ise colocated backend'den güvenli sunucu okumasını sağlar.

Unsafe istekler için `resolveContext` üzerinden güvenilir bir `clientAddress`
sağlayın. Forwarding header'larına otomatik olarak güvenilmez; adres yoksa istek
`CLIENT_ADDRESS_UNAVAILABLE` ile fail-closed olur. Bilinçli olarak paylaşımlı
rate-limit bucket'ı kullanan deployment'lar
`unsafeRequestWithoutClientAddress: 'shared-bucket'` seçeneğini açıkça
etkinleştirebilir. Snapshot fallback'i tam
`{ fallback: { revision, content } }` biçimindedir. Başarılı okumalar ve
fallback sonuçları her çağrıda yeni, derin salt-okunur bir kopya döndürür.

[Next.js rehberi](https://copypatch.vercel.app/tr/docs/nextjs) rota dosya yolunu ve tam entegrasyonu içerir.
