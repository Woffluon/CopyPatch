# Astro SSR + React örneği

[English](README.md) | [Türkçe](README.tr.md)

Bu örnek statik site tarifi değildir. Aynı kökenli CopyPatch API'sini Astro SSR altında mount eder ve React adası için başlangıç snapshot'ını sunucuda okur.

Node uyumlu Astro adaptörü, `output: 'server'`, API rotasında `prerender = false` ve `COPYPATCH_PASSPHRASE_HASH` gerekir. Salt statik Astro, doğrulanmış API'yi veya doğrudan snapshot okumasını barındıramaz.
