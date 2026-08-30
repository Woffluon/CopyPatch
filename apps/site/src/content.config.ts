import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const docs = defineCollection({
  loader: glob({ base: './src/content/docs', pattern: '**/*.mdx' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    group: z.enum([
      'getting-started',
      'framework-guides',
      'editing-publishing',
      'operations-security',
      'api-reference',
    ]),
    order: z.number().int().positive(),
  }),
});

export const collections = { docs };
