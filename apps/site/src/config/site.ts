export interface NavItem {
  title: string;
  href: string;
  external?: boolean;
}

export interface DocsSection {
  title: string;
  items: {
    title: string;
    href: string;
    description?: string;
  }[];
}

export type Locale = 'en' | 'tr';

export const SITE_CONFIG = {
  name: 'CopyPatch',
  tagline: {
    en: 'Let clients edit the copy. Not the website.',
    tr: 'Metinleri müşterileriniz düzenlesin. Kodları ve tasarımı değil.',
  },
  description: {
    en: 'A lightweight, self-hosted, open-source inline copy editing system for React applications. Mark approved text, let clients edit directly on the live page, and keep your layout and code completely untouched.',
    tr: 'React uygulamaları için hafif, kendi sunucunuzda barındırılan, açık kaynak sayfa içi metin düzenleme sistemi. Onaylanan metinleri işaretleyin, müşterileriniz canlı sayfada doğrudan düzenlesin; kod ve tasarımınız korunsun.',
  },
  url: 'https://copypatch.vercel.app',
  githubUrl: 'https://github.com/woffluon/CopyPatch',
  author: 'Efe Arabacı',
  license: 'MIT',
  packages: {
    react: '@copypatch/react',
    core: '@copypatch/core',
    next: '@copypatch/next',
    backend: '@copypatch/backend',
    sqlite: '@copypatch/storage-sqlite',
    postgres: '@copypatch/storage-postgres',
    node: '@copypatch/node',
  },
  nav: {
    en: [
      { title: 'Overview', href: '/#how-it-works' },
      { title: 'Interactive Demo', href: '/#demo' },
      { title: 'Architecture', href: '/#architecture' },
      { title: 'Security', href: '/#security' },
      { title: 'Docs', href: '/docs' },
    ] as NavItem[],
    tr: [
      { title: 'Nasıl Çalışır', href: '/tr#how-it-works' },
      { title: 'Simülatör', href: '/tr#demo' },
      { title: 'Mimari', href: '/tr#architecture' },
      { title: 'Güvenlik', href: '/tr#security' },
      { title: 'Dokümanlar', href: '/tr/docs' },
    ] as NavItem[],
  },
  docsNav: {
    en: [
      {
        title: 'Getting Started',
        items: [
          { title: 'Introduction', href: '/docs', description: 'Overview and core design principles' },
          { title: 'Installation', href: '/docs/installation', description: 'Package installation and prerequisites' },
        ],
      },
      {
        title: 'Framework Integration',
        items: [
          { title: 'React & Vite', href: '/docs/react', description: 'Client provider and inline text components' },
          { title: 'Next.js App Router', href: '/docs/nextjs', description: 'Embedded route handlers and server snapshots' },
          { title: 'Vite + Node', href: '/docs/vite', description: 'Mounting CopyPatch in the application server' },
        ],
      },
      {
        title: 'Editing & Publishing',
        items: [
          { title: 'Edit Mode & Auth', href: '/docs/edit-mode', description: 'Activating ?copypatch=1 and authentication choices' },
          { title: 'Publishing Modes', href: '/docs/publishing', description: 'Draft, publish, and revision-conflict workflows' },
          { title: 'Multi-Locale', href: '/docs/locales', description: 'Managing locale snapshots and translations independently' },
        ],
      },
      {
        title: 'Infrastructure & Security',
        items: [
          { title: 'Backend & adapters', href: '/docs/server', description: 'Embedded v2 backend, auth, storage, and host adapters' },
          { title: 'Security Architecture', href: '/docs/security', description: 'Same-origin security, authentication, and threat model' },
          { title: 'Deployment Guide', href: '/docs/deployment', description: 'SQLite, PostgreSQL, and server-capable deployment' },
          { title: 'Troubleshooting', href: '/docs/troubleshooting', description: 'Common debugging patterns and FAQs' },
        ],
      },
    ] as DocsSection[],
    tr: [
      {
        title: 'Başlarken',
        items: [
          { title: 'Giriş', href: '/tr/docs', description: 'Genel bakış ve temel tasarım prensipleri' },
          { title: 'Kurulum', href: '/tr/docs/installation', description: 'Paket kurulumu ve önkoşullar' },
        ],
      },
      {
        title: 'Çerçeve Entegrasyonu',
        items: [
          { title: 'React & Vite', href: '/tr/docs/react', description: 'İstemci sağlayıcısı ve satır içi metin bileşenleri' },
          { title: 'Next.js App Router', href: '/tr/docs/nextjs', description: 'Gömülü rota işleyicileri ve sunucu anlık görüntüleri' },
          { title: 'Vite + Node', href: '/tr/docs/vite', description: 'CopyPatch’i uygulama sunucusuna bağlama' },
        ],
      },
      {
        title: 'Düzenleme ve Yayınlama',
        items: [
          { title: 'Düzenleme Modu & Yetkilendirme', href: '/tr/docs/edit-mode', description: '?copypatch=1 aktivasyonu ve kimlik doğrulama seçenekleri' },
          { title: 'Yayınlama Modları', href: '/tr/docs/publishing', description: 'Taslak, yayınlama ve revizyon çakışması akışları' },
          { title: 'Çoklu Dil İzolasyonu', href: '/tr/docs/locales', description: 'Dil anlık görüntülerini ve çevirileri bağımsız yönetme' },
        ],
      },
      {
        title: 'Altyapı ve Güvenlik',
        items: [
          { title: 'Backend & Adaptörler', href: '/tr/docs/server', description: 'Gömülü v2 backend, yetkilendirme, depolama ve host adaptörleri' },
          { title: 'Güvenlik Mimarisi', href: '/tr/docs/security', description: 'Same-origin güvenliği, kimlik doğrulama ve tehdit modeli' },
          { title: 'Dağıtım Rehberi', href: '/tr/docs/deployment', description: 'SQLite, PostgreSQL ve sunucu gerektiren dağıtım' },
          { title: 'Sorun Giderme & SSS', href: '/tr/docs/troubleshooting', description: 'Sık karşılaşılan hata ayıklama kalıpları ve yanıtlar' },
        ],
      },
    ] as DocsSection[],
  },
};

export function getNav(locale: Locale = 'en'): NavItem[] {
  return SITE_CONFIG.nav[locale] ?? SITE_CONFIG.nav.en;
}

export function getDocsNav(locale: Locale = 'en'): DocsSection[] {
  return SITE_CONFIG.docsNav[locale] ?? SITE_CONFIG.docsNav.en;
}

export function getTagline(locale: Locale = 'en'): string {
  return SITE_CONFIG.tagline[locale] ?? SITE_CONFIG.tagline.en;
}

export function getDescription(locale: Locale = 'en'): string {
  return SITE_CONFIG.description[locale] ?? SITE_CONFIG.description.en;
}
