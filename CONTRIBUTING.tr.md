# CopyPatch'e Katkıda Bulunma

[English](CONTRIBUTING.md) | [Türkçe](CONTRIBUTING.tr.md)

**CopyPatch** projesine katkıda bulunmak istediğiniz için teşekkür ederiz!

## Geliştirme Ortamı Kurulumu

1. **Ön Koşullar:**
   - Node.js >= 20 (Node.js 24 LTS önerilir)
   - `pnpm` >= 10.0.0

2. **Depoyu klonlayın ve bağımlılıkları yükleyin:**
   ```bash
   git clone https://github.com/woffluon/CopyPatch.git
   cd CopyPatch
   pnpm install
   ```

3. **Çalışma alanındaki tüm paketleri derleyin:**
   ```bash
   pnpm build
   ```

4. **Birim ve entegrasyon testlerini çalıştırın:**
   ```bash
   pnpm test
   ```

5. **Playwright E2E tarayıcı testlerini çalıştırın:**
   ```bash
   pnpm test:e2e
   ```

## Kod Kalitesi ve Mühendislik Felsefesi

- **Yalın Yüzey, Ciddi Kalite:** Karmaşık ve ağır soyutlamalar yerine her zaman basit, sağlam ve doğrudan temel yapıları (primitives) tercih edin.
- **Sıkı Düz Metin İlkesi:** CopyPatch yalnızca düz metin dizgilerini saklar. Zengin metin (rich-text), Markdown veya HTML kalıcılığı eklemeyin.
- **Önce Güvenlik:** Oturum çerezlerini `HttpOnly` ve `SameSite=Strict` tutun; durum değiştiren tüm uç noktalarda CSRF ve Same-Origin denetimlerini zorunlu kılın.
