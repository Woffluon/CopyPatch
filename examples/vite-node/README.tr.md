# Vite + Node örneği

[English](README.md) | [Türkçe](README.tr.md)

Bu örnek, Vite'ı middleware modunda başlatır ve Node adaptörünü Vite SPA fallback'inden önce mount eder. Böylece kullanıcı arayüzü ve `/__copypatch/api/v2/*` aynı dağıtım ve kökende kalır.

`COPYPATCH_PASSPHRASE_HASH` ve isteğe bağlı `COPYPATCH_SQLITE_PATH` ayarlayın; ardından `pnpm --filter example-vite-node dev` çalıştırın.
