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
};

export function getNav(locale: Locale = 'en'): NavItem[] {
  return SITE_CONFIG.nav[locale] ?? SITE_CONFIG.nav.en;
}

export function getTagline(locale: Locale = 'en'): string {
  return SITE_CONFIG.tagline[locale] ?? SITE_CONFIG.tagline.en;
}

export function getDescription(locale: Locale = 'en'): string {
  return SITE_CONFIG.description[locale] ?? SITE_CONFIG.description.en;
}
