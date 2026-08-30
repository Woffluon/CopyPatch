import type { APIRoute } from 'astro';
import { SITE_CONFIG } from '../config/site';
import { docPath, getDocSlug, getDocs } from '../lib/docs';

export const GET: APIRoute = async () => {
  const [englishDocs, turkishDocs] = await Promise.all([getDocs('en'), getDocs('tr')]);
  const staticPages = [
    '',
    '/tr',
    ...englishDocs.map((entry) => docPath('en', getDocSlug(entry))),
    ...turkishDocs.map((entry) => docPath('tr', getDocSlug(entry))),
  ];

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages
  .map(
    (page) => `  <url>
    <loc>${SITE_CONFIG.url}${page}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${page === '' || page === '/tr' ? 'weekly' : 'monthly'}</changefreq>
    <priority>${page === '' || page === '/tr' ? '1.0' : page.includes('/docs') ? '0.8' : '0.5'}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(sitemapXml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
};
