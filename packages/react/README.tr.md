# @copypatch/react

[English](README.md) | [Türkçe](README.tr.md)

CopyPatch için React sağlayıcısı, satır içi metin bileşeni, hook'lar ve isteğe bağlı düzenleyici katmanı.

## Kurulum

```bash
pnpm add @copypatch/core @copypatch/react
```

`CopyPatchProvider` locale ve isteğe bağlı sunucu snapshot'ını yönetir. `EditableText`, ziyaretçiler için düz metin render eder; yalnızca `?copypatch=1` ile etkinleşen düzenleme modunda düzenlenebilir olur. Öznitelik ve buton etiketlerinde `useCopyPatch` kullanın.

Lazy editor çalışma zamanı yüklenemezse hatayı uygulamanın telemetry veya hata
arayüzüne aktarmak için `CopyPatchProvider` üzerinde `onEditorLoadError`
callback'ini kullanın. `useCopyPatchStore`, mutable implementation sınıfı yerine
readonly `CopyPatchStoreApi` sözleşmesini döndürür.

Host uygulaması aynı kökende `/__copypatch/api/v2` altında backend'i mount etmelidir. [React rehberi](https://copypatch.vercel.app/tr/docs/react) kurulum akışını, [API referansı](https://copypatch.vercel.app/tr/docs/api-reference) dışa aktarımları açıklar.
