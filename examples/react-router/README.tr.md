# React Router v7 örneği

[English](README.md) | [Türkçe](README.tr.md)

Bu fixture, SSR etkin React Router v7 Framework Mode kullanır. Resource route, `/__copypatch/api/v2/*` isteklerini colocated backend'e iletir; ana loader sunucu snapshot'ını okur.

`COPYPATCH_PASSPHRASE_HASH` ve isteğe bağlı `COPYPATCH_SQLITE_PATH` ayarlayın. Aynı kökenli oturum, origin doğrulaması ve API için bu yapıyı statik SPA olarak dağıtmayın.
