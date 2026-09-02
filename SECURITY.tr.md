# Güvenlik Politikası

[English](SECURITY.md) | [Türkçe](SECURITY.tr.md)

## Desteklenen Sürümler

CopyPatch v3 aktif olarak desteklenen ana sürüm serisidir. v1 sürümündeki `@copypatch/server` paketi yeni entegrasyonlar için kullanımdan kaldırılmıştır; mevcut kullanıcılar geçiş yaparken paketler npm üzerinde kalmaya devam edecektir.

| Sürüm | Destek Durumu |
| --- | --- |
| `2.x` | Güncel ve aktif desteklenen ana sürüm |
| `1.x` ve öncesi | Yalnızca geçiş desteği, yeni özellik eklenmez |

## Güvenlik Modeli

CopyPatch v3 doğrudan ana uygulamanın içine `/__copypatch/api/v2` rotasında yerleşir. Değişiklik yapan mutasyon istekleri tam olarak eşleşen same-origin `Origin` başlığı gerektirir. CopyPatch harici API kökenini, CORS yapılandırmasını veya proxy tabanlı dağıtımları desteklemez.

Backend iki kimlik doğrulama seçeneği sunar:

- **Dahili Parola:** Argon2id, güvenli `HttpOnly` `SameSite=Strict` çerezleri, kısa ömürlü bellek içi CSRF belirteçleri ve kalıcı hız sınırları kullanır.
- **Host Auth Adaptörü:** Ana uygulamanın kullanıcısını tanımlar ve mutasyonları ana uygulamanın CSRF veya istek doğrulama kurallarıyla denetler.

Tüm içerikler normalize edilmiş düz metin olarak işlenir. Depolama adaptörleri açık oturum anahtarlarını değil, yalnızca SHA-256 özetlerini saklar. Rol denetimleri `editor` ve `publisher` eylemlerini birbirinden ayırır. Ayrıntılar için [tehdit modeli](docs/threat-model.tr.md) belgesini inceleyin. Operasyon ayrıntıları için [güvenlik mimarisi rehberine](https://copypatch.vercel.app/tr/docs/security) ve [HTTP API referansına](https://copypatch.vercel.app/tr/docs/http-api) bakın.

## Güvenlik Açığı Bildirimi

Lütfen tespit ettiğiniz güvenlik açıklarını herkese açık issue açmak yerine özel olarak bildirin:

- [GitHub Security Advisory (Taslak Bildirim)](https://github.com/woffluon/CopyPatch/security/advisories/new) formunu doldurun.
- Form uygun değilse GitHub üzerinden proje yöneticisiyle doğrudan iletişime geçin.

Bildiriminizde etkilenen paketi, sürümü, minimum yeniden üretme adımlarını (reproduction), etki analizini ve varsa çözüm önerinizi belirtin. Raporları iki iş günü içinde yanıtlamayı ve düzeltme hazırlandıktan sonra koordineli şekilde yayınlamayı hedefliyoruz.
