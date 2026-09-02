# CopyPatch v3 Tehdit Modeli ve Güvenlik Durumu

[English](threat-model.md) | [Türkçe](threat-model.tr.md)

Uygulama rehberi için [güvenlik operasyonları sayfasına](https://copypatch.vercel.app/tr/docs/security) ve [HTTP API referansına](https://copypatch.vercel.app/tr/docs/http-api) bakın.

Bu belge, CopyPatch v3'ün güvenlik sınırlarını ve mimari tasarım kararlarını belgeler. Kimlik doğrulama, kalıcılık, API davranışları veya tehdit sınırları değiştiğinde bu belgeyi güncelleyin.

## Kapsam ve Çalışma Sınırı

CopyPatch v3 doğrudan ana uygulamanın içine `/__copypatch/api/v2` adresinde gömülür. Taşıma katmanı (transport), TLS/HTTPS, dağıtım ve rota erişim kontrolü ana uygulamanın sorumluluğundadır. CopyPatch harici uzak API, bağımsız sunucu süreci, CORS izin listesi veya proxy yapılandırmalarını desteklemez.

## Korunan Varlıklar

- Dil ve revizyon bazında ayrılmış yayınlanmış ve taslak metinler.
- Editör (`editor`) ve yayıncı (`publisher`) yetkilendirmesi.
- Oturum, CSRF ve hız sınırlama gizli anahtarları.
- SQLite veritabanı dosyaları ve PostgreSQL kayıtları.

## Güvenlik Denetimleri ve Tehdit Karşılaştırması

| Risk | Mimari Güvenlik Denetimi |
| --- | --- |
| **Depolanmış İşaretleme / XSS Enjeksiyonu** | CopyPatch yalnızca normalize edilmiş düz metin kabul eder ve render eder. Sıfır HTML çalıştırma. |
| **Siteler Arası İstek / Mutasyon (CSRF)** | Tüm güvenli olmayan istekler tam eşleşen same-origin `Origin` başlığı taşımalıdır. Dahili auth ayrıca bellek içi CSRF başlığı zorunlu tutar. |
| **Yetkisiz Düzenleme ve Yayın** | Dahili Argon2id parola oturumu veya host auth adaptörü kimliği belirler; mutasyonlar `editor` veya `publisher` rolü gerektirir. |
| **Kaba Kuvvet (Brute-Force) Girişleri** | Dahili kimlik doğrulaması 19 MiB Argon2id bellek sertliği ve kalıcı hız sınırlayıcı kullanır. |
| **Veritabanından Oturum Sızıntısı** | Kalıcılık motorları oturum, CSRF ve hız sınırlama belirteçlerinin yalnızca SHA-256 özetlerini (hash) saklar. |
| **Eşzamanlı Veri Ezilmesi** | Taslak ve yayın işlemleri beklenen revizyon numaralarını atomik olarak karşılaştırır (CAS) ve uyuşmazlıkta `409 REVISION_CONFLICT` döner. |
| **Depolama Kesintisi** | Yayın okuma işlemleri en son bellek içi anlık görüntüye veya boş yedek değere güvenle düşer (fail-safe). |

## Kimlik Doğrulama Stratejileri

`createCopyPatchBackend` tam olarak bir kimlik doğrulama stratejisi kabul eder:

- **Dahili Parola (`passphraseHash`):** CopyPatch tarafından yönetilen oturumlar. Çerezin `HttpOnly`, `SameSite=Strict` ve `Secure` olması nedeniyle yalnızca HTTPS üzerinden sunulmalıdır.
- **Host Auth Adaptörü (`authAdapter`):** Ana uygulama kullanıcıları zaten doğruluyorsa kullanılır. Adaptör rollere sahip bir kullanıcı döndürmeli ve her mutasyon isteğini doğrulamalıdır.

Host auth adaptörleri, ana uygulamanın CSRF korumasını, oturum yaşam döngüsünü ve güvenilir istemci IP adresini entegre etmekten sorumludur. Kalıcılık uygulamalarına asla ham oturum belirteçleri iletilmemelidir.

## Dağıtım Sorumlulukları

- API rotasını uygulamanın kendi HTTPS kökeni (same-origin) altında tutun.
- Veritabanı kimlik bilgilerini kısıtlayın ve yedekleme planınıza SQLite dosyasını ya da PostgreSQL veritabanını dahil edin.
- Trafik kabul etmeden önce kalıcılık migrasyonlarını (migrations) çalıştırın.
- Express ve benzeri Node çatılarında, ham istek gövdesine ihtiyaç duyan adaptörleri body parser ara yazılımlarından önce mount edin.
- Salt statik bir web dağıtımını düzenlenebilir bir CopyPatch örneği olarak açmayın.

## Geçmiş ve Durum

v2 sürümü, v1'deki bağımsız sunucu modelinin yerini aynı kökende çalışan gömülü adaptörlerle değiştirmiştir. `@copypatch/server` yeni entegrasyonlar için kullanımdan kaldırılmıştır; mevcut yayınlanmış sürümler npm üzerinden asla silinmeyecektir.
