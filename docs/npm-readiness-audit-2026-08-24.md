# CopyPatch npm readiness audit — 2026-08-24

**Kapsam:** @copypatch/core, @copypatch/react, @copypatch/server, @copypatch/next ilk public npm yayını.

**Durum:** Paketler registry'de yok; ilk kullanıcı yayını 2FA ile manuel yapılmalı. Baseline bulguları korunmuş, aşağıdaki final doğrulama bölümü hazırlanan çalışma ağacının release öncesi sonucunu kaydetmiştir. Commit/push/publish yapılmamıştır.

## İncelenen metadata

| Alan | Mevcut durum / karar |
| --- | --- |
| Public repository | https://github.com/Woffluon/CopyPatch |
| npm scope | @copypatch; owner kullanıcı tarafından doğrulanmış |
| Packages | core, react, server, next |
| Registry lookup | 2026-08-24 tarihinde dört adın tamamı npm view ile E404; henüz yayın yok |
| pnpm | 11.10.0 |
| Node engine | >=20.0.0 |
| Baseline manifest versions | Dört package manifestinde 0.1.0 |
| Hazırlanan manifest versions | Root + dört package lockstep 1.0.0 |
| Intended first public version | Dört package için birlikte 1.0.0 |
| Module model | ESM-only |
| Package files | Mevcut manifestlerde ağırlıkla yalnızca dist |
| repository.url | Hazırlanan dört manifestte `git+https://github.com/Woffluon/CopyPatch.git` + package directory |
| publishConfig | Hazırlanan dört manifestte public access + npmjs registry |
| README | Baseline'da yoktu; package-local README ve zorunlu pack kontrolü eklendi |

Registry E404 adların henüz yok olduğunu gösterir; scope ownership/publish permission tek başına kanıtlanmaz. İlk manual publish öncesi npm account/package settings kullanıcı tarafından doğrulanır.

## Güvenli yayın kararı

İlk yayın npm terminalinde interactive 2FA ile yapılır. Scoped package'lar için her komutta --access public verilir. GAT veya token repo'ya eklenmez; sonraki otomasyon GitHub OIDC trusted publisher ile token-free çalışır.

Tarball sırası dependency graph'a göre:

1. @copypatch/core@1.0.0
2. @copypatch/react@1.0.0 ve @copypatch/server@1.0.0
3. @copypatch/next@1.0.0

Tarball pnpm pack ile geçici destination'a alınır, manifest/file listesi incelenir, sonra npm publish tarball --access public yapılır. pnpm workspace:* / workspace:^ / workspace:~ pack sırasında 1.0.0 tabanlı registry semver'lerine dönüşür; bu tarball manifestinde doğrulanır.

### Trusted Publisher

İlk package kayıtlarından sonra her package npm settings'inde:

| Alan | Değer |
| --- | --- |
| Provider | GitHub Actions |
| Organization/user | Woffluon |
| Repository | CopyPatch |
| Workflow | publish.yml |
| Environment | Kullanılmıyorsa boş |
| Allowed action | npm publish |

publish.yml .github/workflows altında bulunmalı; publish job'ında id-token: write ve contents: read olmalı. CI Node >=22.14.0, npm >=11.5.1 kullanmalı. Public repository + public package + OIDC trusted publishing koşullarında provenance otomatik oluşur; private repository'de oluşmaz.

## Baseline doğrulama sonuçları

| Kontrol | Sonuç | Not |
| --- | --- | --- |
| Package build | **PASS** | Dört publish package build geçti |
| Typecheck | **PASS** | Workspace typecheck geçti |
| Unit/integration tests | **PASS** | 11 test geçti |
| Site build | **PASS** | Astro site build geçti |
| E2E | **PASS** | 4 E2E geçti |
| Bundle budgets | **PASS** | Mevcut bütçe kapıları yeşil |
| publint | **PASS** | Tüm publish paketleri iyi |
| attw | **PASS / beklenen uyarı** | ESM routes green; CommonJS require warning ESM-only için beklenen |
| Node 10 subpath | **N/A** | Node >=20; rapor destek matrisi dışında |
| pnpm audit --prod | **9 finding** | 2 high, 4 moderate, 3 low; private Astro site zincirinde |

Bu tablo baseline timestamp'idir; release commit'i sonrası final post-change test iddiası değildir.

## Final post-change doğrulama

| Kontrol | Sonuç | Not |
| --- | --- | --- |
| Frozen install | **PASS** | pnpm 11.10.0, lockfile değişmeden |
| Lockstep/release contract | **PASS** | Root + dört package 1.0.0; release suite 6/6 |
| Package build | **PASS** | Dört publish package |
| Workspace typecheck | **PASS** | 0 hata/uyarı/hint |
| Unit/integration tests | **PASS** | Vitest 11/11 |
| Site build | **PASS** | 27 static page |
| E2E | **PASS** | Chromium 4/4 |
| Bundle budgets | **PASS** | React public/lazy editor bütçeleri içinde |
| Custom release tarballs | **PASS** | Dört 1.0.0 tarball; README + LICENSE; `workspace:` yok |
| `npm publish --dry-run` | **PASS** | Dört tarball, public access; gerçek publish yok |
| publint 0.3.24 | **PASS / öneri** | React temiz; core/server/next yalnız optional `sideEffects` önerisi |
| attw 0.18.5 | **PASS / beklenen uyarı** | ESM ve bundler yolları green; CJS warning, Node 10 subpath destek dışı |
| Clean consumer smoke | **PASS** | Dört tarball install; root/subpath ESM importları ve CLI help çalıştı |
| Consumer `npm audit` | **PASS** | 0 vulnerability |
| Monorepo `pnpm audit --prod` | **Ayrı site işi** | 2 high, 4 moderate, 3 low; yalnız private Astro site path'leri |
| Diff whitespace | **PASS** | `git diff --check` temiz |

## Bulgular ve release gate'leri

### Kapatıldı — README remediation

Baseline pack snapshot README içermiyordu. Package-local README'ler eklendi; release pack kodu README'yi zorunlu kılıyor ve dört final tarball'da varlığı doğrulandı.

### Kapatıldı — Version/repository alignment

Root + dört package `1.0.0` olarak hizalandı. Pack sırasında internal `workspace:*` aralıkları exact `1.0.0` olur. Repository metadata'sı public GitHub kaynağını doğru casing ile gösterir. Değişiklikler henüz commit edilmediği için bu kapı, onaylanan release commit'inin dosyaların tamamını içermesine bağlıdır.

### P1 — Trusted publisher

Trusted publisher package registry kaydı olmadan kurulamaz. İlk dört manual publish sonrası her package settings'inde Woffluon / CopyPatch / publish.yml / npm publish kaydı yapılır. npm save sırasında validation yapmadığı için ilk CI çalıştırmasında exact-match ayrıca kontrol edilir.

### P2 — Site-only dependency findings

pnpm audit --prod dokuz bulgu bildirdi: 2 high, 4 moderate, 3 low. İncelenen path'ler private Astro site zincirine aittir; publish tarball/package dependency path'lerinde aynı bulgular görünmedi. Güvenli düzeltme Astro major upgrade gerektirdiğinden bu iş npm bootstrap kapsamına alınmadı; ayrı, planlı site security işi olarak takip edilmelidir. Bu, npm package'larının genel olarak risksiz olduğu iddiası değildir; audit kapsamının publish yüzeyine taşınmadığını kaydeder.

## ESM-only kararı

attw import/ESM yolları green'dir. require warning beklenir; package CommonJS entrypoint vaat etmez. Node 10 subpath raporu proje engine'i >=20 olduğu için desteklenen runtime'ı etkilemez. Install smoke node --input-type=module ile yapılır.

## Sonraki release politikası

BarePDF-style commit-driven akışta temiz main release commit'i install → build/typecheck/test → güvenli temp staging + npm pack → tarball inspection → OIDC npm publish çalıştırır. Core → react/server → next sırası ve immutable version kuralı korunur.

| Conventional Commit | Bump |
| --- | --- |
| breaking (! veya BREAKING CHANGE) | major |
| feat | minor |
| fix, perf, refactor, build, security | patch |
| docs, ci, test, chore | bump yok |

## Immutable version ve kurtarma

npm yayımlanmış name@version'ı değiştirilemez.

- Partial publish sonrası npm view @copypatch/pkg@1.0.0 version ile registry durumu ölçülür.
- Yayımlanmış package tekrar gönderilmez; yalnızca eksik package aynı doğrulanmış sürüm/tarball ile denenir.
- Tarball yanlışsa yeni patch (1.0.1) çıkarılır; unpublish rollback stratejisi değildir.
- Hata çözülmeden dependent package yayınlanmaz.

## Resmi kaynaklar

- [npm scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
- [npm 2FA/package publishing](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm provenance](https://docs.npmjs.com/generating-provenance-statements/)
- [pnpm pack](https://pnpm.io/cli/pack), [pnpm publish](https://pnpm.io/cli/publish), [pnpm workspace publishing](https://pnpm.io/workspaces#publishing-workspace-packages), [pnpm package.json](https://pnpm.io/package_json)
- [GitHub OIDC](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-cloud-providers)
