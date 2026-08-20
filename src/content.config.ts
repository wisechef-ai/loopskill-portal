// rev 7.2 hotfix: Astro v6 requires the new `loader` API for content collections.
// The legacy `type: 'content'` is parsed as empty unless the file resolver is wired explicitly.
// Switching to `loader: glob(...)` fixes the "collection does not exist or is empty" build warning
// and unlocks /blog/<slug>/ pages.
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    // Optional — only set when a post frontmatter actually declares a later
    // edit date. buildBlogPostingSchema() falls back to pubDate when absent
    // rather than inventing a "last updated" signal (gap/schema).
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('WiseChef'),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { blog };
