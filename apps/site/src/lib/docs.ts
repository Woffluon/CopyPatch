import { getCollection, type CollectionEntry } from 'astro:content';
import type { DocsSection, Locale } from '../config/site';

type DocEntry = CollectionEntry<'docs'>;

const groups: Record<Locale, Record<DocEntry['data']['group'], string>> = {
  en: {
    'getting-started': 'Getting Started',
    'framework-guides': 'Framework Guides',
    'editing-publishing': 'Editing & Publishing',
    'operations-security': 'Operations & Security',
    'api-reference': 'API Reference',
  },
  tr: {
    'getting-started': 'Başlangıç',
    'framework-guides': 'Çerçeve Rehberleri',
    'editing-publishing': 'Düzenleme ve Yayınlama',
    'operations-security': 'Operasyon ve Güvenlik',
    'api-reference': 'API Referansı',
  },
};

const groupOrder = [
  'getting-started',
  'framework-guides',
  'editing-publishing',
  'operations-security',
  'api-reference',
] as const;

export function docPath(locale: Locale, slug: string): string {
  const prefix = locale === 'tr' ? '/tr/docs' : '/docs';
  return slug === 'overview' ? prefix : `${prefix}/${slug}`;
}

export async function getDocs(locale: Locale): Promise<DocEntry[]> {
  const entries = await getCollection('docs', (entry) => entry.id.startsWith(`${locale}/`));
  return entries.sort((left, right) => {
    const groupDiff = groupOrder.indexOf(left.data.group) - groupOrder.indexOf(right.data.group);
    return groupDiff || left.data.order - right.data.order || left.id.localeCompare(right.id);
  });
}

export async function getDoc(locale: Locale, slug: string): Promise<DocEntry | undefined> {
  const entries = await getDocs(locale);
  if (slug === 'overview') {
    return entries.find((entry) => entry.data.group === 'getting-started' && entry.data.order === 1);
  }
  return entries.find((entry) => getDocSlug(entry) === slug);
}

export function getDocSlug(entry: DocEntry): string {
  return entry.id.replace(/^(en|tr)\//, '');
}

export function buildDocsNav(locale: Locale, entries: DocEntry[]): DocsSection[] {
  return groupOrder.flatMap((group) => {
    const items = entries
      .filter((entry) => entry.data.group === group)
      .map((entry) => ({
        title: entry.data.title,
        href: docPath(locale, getDocSlug(entry)),
        description: entry.data.description,
      }));
    return items.length ? [{ title: groups[locale][group], items }] : [];
  });
}
