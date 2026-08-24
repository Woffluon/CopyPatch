import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  site: 'https://copypatch.vercel.app',
  output: 'static',
  integrations: [react()],
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light-default',
        dark: 'github-dark-dimmed',
      },
      wrap: false,
      defaultColor: false,
    },
  },
});
