import type { APIRoute } from 'astro';
import { SITE_CONFIG } from '../config/site';

export const GET: APIRoute = async () => {
  const staticPages = [
    '',
    '/tr',
    '/docs',
    '/docs/installation',
    '/docs/react',
    '/docs/nextjs',
    '/docs/vite',
    '/docs/server',
    '/docs/edit-mode',
    '/docs/publishing',
    '/docs/locales',
    '/docs/security',
    '/docs/deployment',
    '/docs/troubleshooting',
    '/tr/docs',
    '/tr/docs/installation',
    '/tr/docs/react',
    '/tr/docs/nextjs',
    '/tr/docs/vite',
    '/tr/docs/server',
    '/tr/docs/edit-mode',
    '/tr/docs/publishing',
    '/tr/docs/locales',
    '/tr/docs/security',
    '/tr/docs/deployment',
    '/tr/docs/troubleshooting',
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
