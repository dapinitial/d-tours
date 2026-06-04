// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// D-Tours runs as a server app on DO App Platform so we get API routes
// (likes/comments, digest triggers) alongside mostly-prerendered marketing pages.
// Visitor pages opt into `export const prerender = true` for speed; CMS + API stay dynamic.
export default defineConfig({
  site: 'https://shotgundetour.com',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { port: 4321, host: true },
  devToolbar: { enabled: false }, // hide the local dev toolbar (dev-only; never on prod)
});
