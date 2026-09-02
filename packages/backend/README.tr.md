# @copypatch/backend

[English](README.md) | [Türkçe](README.tr.md)

Framework bağımsız CopyPatch v3 backend çalışma zamanı. Host uygulamanızın içine Web `Request`/`Response` API'si olarak gömülür; ikinci sunucu, port veya CORS yapılandırması gerektirmez.

## Kurulum

```bash
pnpm add @copypatch/backend @copypatch/storage-sqlite
```

`createCopyPatchBackend`, bir kalıcılık uygulaması ve tam olarak bir auth stratejisi ister: Argon2id `passphraseHash` veya `authAdapter`. Güvenli olmayan istekler tam eşleşen `Origin` başlığı ister.

Detaylı yapılandırma ve HTTP uç noktaları için [backend rehberine](https://copypatch.vercel.app/tr/docs/server) ve [HTTP API referansına](https://copypatch.vercel.app/tr/docs/http-api) bakın.
