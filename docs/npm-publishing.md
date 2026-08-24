# CopyPatch npm yayımlama kılavuzu

Doğrulama tarihi: **2026-08-24**. Bu kılavuz @copypatch/core, @copypatch/react, @copypatch/server ve @copypatch/next paketlerinin ilk public npm yayını ve sonraki sürümleri içindir.

## Repo ve sürüm sözleşmesi

- Public repository: https://github.com/Woffluon/CopyPatch. Dört manifestteki `repository.url`, aynı public repository'yi doğru owner/repository casing'iyle gösterir: `git+https://github.com/Woffluon/CopyPatch.git`.
- @copypatch scope'u kullanıcı tarafından sahiplenilmiştir; ilk yayın öncesi npm scope/package owner/write yetkisi hesap sahibi tarafından doğrulanır.
- Workspace pnpm 11.10.0, proje Node engine'i >=20.0.0 ister. Trusted publishing CI npm CLI >=11.5.1 ve Node >=22.14.0 kullanmalıdır.
- Paketler ESM-only'dir. CommonJS require() destek hedefi değildir.
- Hazırlanan çalışma ağacında root ve dört package lockstep `1.0.0`'dır. Bu değişiklikler onaylanan ilk release commit'inde birlikte yer almadan publish yapılmaz. npm yayımlanmış `name@version`'ı değiştirmez.

Scoped package'lar varsayılan restricted'dır; public yayın için --access public gerekir. [npm scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/) direct ve staged yayınları açıklar.

## Ön koşullar

Hesap sahibi:

1. npm'de @copypatch scope owner/write yetkisini doğrular.
2. 2FA'yı authorization and writes olarak açar. İlk yayın interactive 2FA ile yapılır; OTP/QR yalnızca terminalde kullanılır.
3. İlk makinede npm login yapar. OTP, .npmrc, token veya CI değişkenine yazılmaz.
4. Her package publish olduktan sonra npm package settings erişimini doğrular.

Publish için 2FA veya bypass-2FA GAT gerekir ([npm 2FA](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/), [npm access tokens](https://docs.npmjs.com/about-access-tokens/)). GAT repo/workflow'a konulmaz.

### Release metadata

Dört manifestte sürüm, repository URL ve publish ayarlarını kontrol edin. Hazırlanan değişiklikler bu alanları dört pakette birlikte tanımlar.

~~~json
{
  "name": "@copypatch/core",
  "version": "1.0.0",
  "type": "module",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Woffluon/CopyPatch.git",
    "directory": "packages/core"
  },
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  }
}
~~~

Gerçek name ve package `directory` alanlarını koruyun. Repository owner/name casing'i provenance kaynağıyla eşleşmelidir ([npm provenance](https://docs.npmjs.com/generating-provenance-statements/)). `publishConfig` override içindir ([pnpm package.json](https://pnpm.io/package_json)). İlk yayında ayrıca açık `--access public` verin.

Baseline pack snapshot'ında README yoktu. Bu hazırlık package-local README'leri ve otomasyonun README'yi zorunlu kılan tarball kontrolünü ekledi. Final pack'te README/Lisans yoksa publish yine durdurulur.

## Onaydan sonraki ilk release commit'i

Bu çalışma ağacı stage/commit/push edilmemiştir. Onaydan sonra npm hazırlık dosyaları tek commit'te, kullanıcıya ait `.gitignore` ve `apps/site/.astro/data-store.json` değişiklikleri hariç tutularak commit edilir. Planlanan tam mesaj:

~~~text
feat!: prepare CopyPatch for public npm release

- add complete npm package metadata and package-level documentation
- add commit-driven lockstep versioning and validation
- add idempotent npm trusted-publishing workflow
- document first-release and maintainer-only steps

BREAKING CHANGE: establish 1.0.0 as the first public npm release and enforce lockstep SemVer for all @copypatch packages.
~~~

Push sonrası `CI` geçer. `Publish` workflow'u paketlerin npm'de bulunmadığını saptayıp güvenli bir `bootstrap required` no-op'u verir; npm hesabı olmadan ilk yayını denemez ve henüz tag/GitHub Release oluşturmaz.

## İlk bootstrap: manuel 2FA

### 1. Temiz main ve kapı

PowerShell:

~~~powershell
Set-StrictMode -Version Latest
git status --short
git branch --show-current
node --version
pnpm --version
npm --version
npm config get registry
npm whoami
pnpm install --frozen-lockfile
pnpm run build
pnpm run typecheck
pnpm test
pnpm run test:e2e
pnpm run build:site
~~~

Status yalnız size ait, bilinçli dosyaları göstermeli; yayın hazırlık commit'i artık `main` üzerinde olmalı. Registry çıktısı `https://registry.npmjs.org/`, `npm whoami` çıktısı doğru hesap olmalı. `@copypatch` organization owner/member ve package creation yetkisini npm web arayüzünde ayrıca doğrulayın. `publint`, attw ve bundle budget kapıları da yeşil olmalı. Bash'te aynı pnpm komutları `set -euo pipefail` ile çalıştırılır.

### 2. Geçici tarball ve inspection

pnpm pack, --pack-destination ile tarball'ı çalışma ağacı dışına alır ([pnpm pack](https://pnpm.io/cli/pack)).

~~~powershell
$ErrorActionPreference = 'Stop'
$packDir = Join-Path $env:TEMP ('copypatch-npm-1.0.0-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $packDir | Out-Null
pnpm --filter @copypatch/core pack --pack-destination $packDir
pnpm --filter @copypatch/react pack --pack-destination $packDir
pnpm --filter @copypatch/server pack --pack-destination $packDir
pnpm --filter @copypatch/next pack --pack-destination $packDir
Get-ChildItem $packDir -Filter '*.tgz' | Sort-Object Name
Get-ChildItem $packDir -Filter '*.tgz' | ForEach-Object { tar -tzf $_.FullName }
~~~

Her arşivde package/package.json name/version/type/exports/engines, README, LICENSE ve yalnızca hedeflenen dosyalar kontrol edilir. Secret, .env, database, fixture veya gereksiz source olmamalıdır. react/server/next tarball manifestlerinde workspace: kalmamalıdır.

pnpm, workspace:* / workspace:^ / workspace:~ değerlerini pack/publish sırasında target workspace version semver'lerine dönüştürür: workspace:* → 1.0.0, workspace:^ → ^1.0.0 ([pnpm workspace publishing](https://pnpm.io/workspaces#publishing-workspace-packages)). Tarball manifestini ayrıca okuyun.

### 3. Sıra ve publish

Core, sonra react/server, en son next. Tarball adları pnpm çıktısıyla doğrulanmalıdır.

~~~powershell
$registry = 'https://registry.npmjs.org/'
npm publish (Join-Path $packDir 'copypatch-core-1.0.0.tgz') --access public --registry $registry
npm publish (Join-Path $packDir 'copypatch-react-1.0.0.tgz') --access public --registry $registry
npm publish (Join-Path $packDir 'copypatch-server-1.0.0.tgz') --access public --registry $registry
npm publish (Join-Path $packDir 'copypatch-next-1.0.0.tgz') --access public --registry $registry
~~~

Her komutun interactive 2FA istemini tamamlayın. Biri başarısızsa sonraki package'a geçmeyin. Bash eşdeğerinde aynı npm publish komutları $packDir ve $registry ile çalışır.

Staged publish staging alanına gönderir, maintainer 2FA approve eder; 2FA'yı kaldırmaz. İlk bootstrap direct publish'tir ve trusted publisher allowed action yalnızca npm publish seçilir ([npm direct/staged](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)).

## Trusted publishing: ilk yayın sonrası

Her package registry kaydı oluşunca npm Settings → Trusted Publisher alanı package başına doldurulur:

| Alan | Değer |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | Woffluon |
| Repository | CopyPatch |
| Workflow filename | publish.yml; yalnızca filename |
| Environment | Kullanılmıyorsa boş |
| Allowed actions | Yalnızca npm publish |

Workflow .github/workflows/publish.yml altında bulunmalıdır. npm save sırasında config doğrulamaz; yanlış case/path publish'te görülür ([npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)).

~~~yaml
permissions:
  id-token: write
  contents: read
~~~

GitHub'a göre id-token: write repository write yetkisi vermez; yalnızca kısa ömürlü OIDC token istemesine izin verir ([GitHub OIDC](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-cloud-providers)). GitHub-hosted runner, Node >=22.14.0, npm >=11.5.1 ve pnpm 11.10.0 kullanılmalıdır.

Trusted OIDC publish public repository'den public package'a yapıldığında provenance attestation'ı otomatik üretir; NPM_TOKEN veya ayrıca --provenance gerekmez. Private repository'de public package için provenance oluşmaz ([npm automatic provenance](https://docs.npmjs.com/trusted-publishers/#automatic-provenance-generation)).

### BarePDF-style commit-driven gelecek akışı

1. Commit'in tam Conventional Commit mesajı belirlenir.
2. `pnpm release:prepare -- "feat(scope): exact message"` aynı mesajdan bump hesaplar ve root + dört package sürümünü atomik/lockstep hazırlar.
3. Testlerden sonra commit **aynı mesajla** oluşturulur. CI first-parent geçmişindeki her commit'in mesaj/sürüm geçişini doğrular.
4. `publish.yml` temiz main'de install, build/typecheck/test/bundle budget, güvenli geçici staging, tarball inspection ve OIDC `npm publish` çalıştırır.
5. Core → react/server → next sırası korunur; registry'de aynı exact version varsa idempotent rerun onu atlar.
6. Dört npm sürümü doğrulandıktan sonra immutable `vX.Y.Z` tag'i ve GitHub Release oluşturulur.

| Commit | npm etkisi |
| --- | --- |
| breaking (! veya BREAKING CHANGE) | major |
| feat | minor |
| fix, perf, refactor, build, security | patch |
| docs, ci, test, chore | bump yok |

Örnek:

~~~powershell
$message = 'fix(server): reject invalid origin configuration'
pnpm release:prepare -- $message
pnpm release:verify
pnpm build
pnpm typecheck
pnpm test
git diff --check
git commit -m $message
git push origin main
~~~

`feat!:` veya `BREAKING CHANGE:` major üretir. Her PR tek/squash edilebilir bir Conventional Commit olarak tutulmalıdır. GitHub'ın varsayılan `Merge pull request ...` mesajı sözleşmeye uymaz; squash merge kullanın veya first-parent'a giren her commit'i geçerli mesaj ve doğru lockstep sürümle hazırlayın.

## Doğrulama ve smoke

~~~powershell
npm view @copypatch/core@1.0.0 version dist.tarball dist.integrity --json --registry https://registry.npmjs.org/
npm view @copypatch/react@1.0.0 version dist.tarball dist.integrity --json --registry https://registry.npmjs.org/
npm view @copypatch/server@1.0.0 version dist.tarball dist.integrity --json --registry https://registry.npmjs.org/
npm view @copypatch/next@1.0.0 version dist.tarball dist.integrity --json --registry https://registry.npmjs.org/
New-Item -ItemType Directory -Force -Path (Join-Path $env:TEMP 'copypatch-npm-smoke-1.0.0') | Out-Null
Push-Location (Join-Path $env:TEMP 'copypatch-npm-smoke-1.0.0')
try {
  npm init -y
  npm install --ignore-scripts --registry https://registry.npmjs.org/ '@copypatch/core@1.0.0' '@copypatch/react@1.0.0' '@copypatch/server@1.0.0' '@copypatch/next@1.0.0'
  node --input-type=module -e "const m = await import('@copypatch/core'); console.log(Object.keys(m).length)"
  node --input-type=module -e "const m = await import('@copypatch/react'); console.log(Object.keys(m).length)"
} finally {
  Pop-Location
}
~~~

attw ESM routes green olmalıdır. CommonJS require warning'i ESM-only tasarım için beklenir; Node 10 subpath raporu Node >=20 destek matrisi dışındadır. Smoke import ile yapılır, require ile değil.

## Hata, güvenlik ve kurtarma

- E404/ENEEDAUTH: npm 11.5.1+, Node 22.14+, registry, scope owner, trusted publisher exact fields ve id-token: write kontrol edilir.
- 403/2FA: interactive 2FA tamamlanır; token'ları yasaklayan package ayarında GAT çözüm değildir.
- Partial publish: npm view @copypatch/<pkg>@1.0.0 version ile registry ölçülür; yayımlanmış package tekrar gönderilmez, yalnızca eksik package denenir.
- Yanlış tarball aynı version ile değiştirilemez; yeni patch (1.0.1) çıkarılır. Unpublish rollback değildir.
- workspace: kalmışsa veya README yoksa publish durdurulur.
- Token, OTP, .npmrc, OIDC JWT veya private key repository/tarball/log'a konulmaz. Trusted publishing'de NPM_TOKEN/NODE_AUTH_TOKEN kullanmayın.
- pnpm audit --prod site-only finding'leri ayrı güvenlik işi olarak takip edilir; Astro major upgrade gerektiren patch npm bootstrap ile karıştırılmaz.

İlk manuel dört publish ve trusted publisher ayarlarından sonra GitHub Actions → `Publish` → **Run workflow** ile release commit SHA'sını `target_sha` olarak verin. Workflow registry'deki `1.0.0` sürümlerini idempotent biçimde doğrular, npm publish'i atlar ve eşleşen `v1.0.0` tag/GitHub Release'i oluşturur.

## Resmi kaynaklar

- [npm scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
- [npm 2FA/package publishing](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm provenance](https://docs.npmjs.com/generating-provenance-statements/)
- [npm access tokens](https://docs.npmjs.com/about-access-tokens/)
- [pnpm publish](https://pnpm.io/cli/publish), [pnpm pack](https://pnpm.io/cli/pack), [pnpm workspace](https://pnpm.io/workspaces#publishing-workspace-packages), [pnpm package.json](https://pnpm.io/package_json)
- [GitHub OIDC](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-cloud-providers)
