import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('homepage declares the production canonical URL', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\/gaeddirang\.com\/">/);
});

test('sitemap contains only canonical pages and no query variants', async () => {
  const sitemap = await readFile(new URL('sitemap.xml', root), 'utf8');
  assert.ok(!sitemap.includes('?program='));
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(locations.length, 16);
  assert.equal(new Set(locations).size, locations.length);
  assert.ok(locations.every((url) => url.startsWith('https://gaeddirang.com/')));
});

test('public CDN dependency is version-pinned and blank-target links are isolated', async () => {
  for (const file of ['index.html', 'admin/index.html', 'preview/index.html']) {
    const html = await readFile(new URL(file, root), 'utf8');
    assert.ok(!html.includes('@supabase/supabase-js@2/'));
    assert.match(html, /<meta name="referrer" content="strict-origin-when-cross-origin"\s*\/?>/);
  }
  const html = await readFile(new URL('index.html', root), 'utf8');
  const blankLinks = [...html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].map((match) => match[0]);
  assert.ok(blankLinks.length > 0);
  assert.ok(blankLinks.every((tag) => /rel="[^"]*noopener[^"]*"/.test(tag)));
});
