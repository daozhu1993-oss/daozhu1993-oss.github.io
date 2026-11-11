import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Run the actual page export handler with browser boundaries replaced, without any API call.
const source = await readFile(new URL('../planner.js', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('  async function exportPlan()'), source.indexOf("  document.addEventListener('DOMContentLoaded'"));
const markup = Array.from({ length: 21 }, (_, i) => `<article class="ai-day">第${i + 1}天</article>`).join('');
async function exportWith(styleSheets, fetchStyles) {
  const result = { downloads: 0, fetches: 0, messages: [] };
  class ExportURL extends URL {
    static createObjectURL(blob) { result.blob = blob; return 'blob:export-test'; }
    static revokeObjectURL() {}
  }
  const current = { title: '21天测试', checks: { errors: [] }, days: Array(21).fill({}) };
  const context = {
    current, structuredClone, Blob, URL: ExportURL, AbortSignal,
    document: { baseURI: 'https://example.test/travel/?preview=test', styleSheets,
      createElement: () => ({ click() { result.downloads++; } }) },
    fetch: async (...args) => { result.fetches++; return fetchStyles(...args); },
    status: (...args) => result.messages.push(args), escape: value => String(value),
    planMarkup: () => markup, setTimeout: callback => callback(),
  };
  await runInNewContext(`${handler}\nexportPlan()`, context);
  if (result.blob) result.html = await result.blob.text();
  assert.equal(context.current, current, 'Export must preserve the in-page itinerary');
  return result;
}

test('download keeps all 21 days and loaded paper styling when the server is offline', async () => {
  const unrelated = { href: 'https://fonts.example/style.css', get cssRules() { throw new Error('Cross origin'); } };
  const sheet = { href: 'https://example.test/travel/styles.css', cssRules: [
    { cssText: ':root { --paper: #f5f0e7; }' },
    { cssText: '@media (max-width: 600px) { .ai-day { padding: 12px; } }' },
  ] };
  const result = await exportWith([unrelated, sheet], () => { throw new Error('offline'); });
  assert.equal(result.fetches, 0);
  assert.equal(result.downloads, 1);
  assert.equal((result.html.match(/class="ai-day"/g) || []).length, 21);
  assert.match(result.html, /--paper: #f5f0e7/);
  assert.match(result.html, /@media/);
  assert.deepEqual(result.messages, []);
});

test('unreadable CSSOM falls back to a bounded same-origin stylesheet fetch', async () => {
  const sheet = { href: 'https://example.test/travel/styles.css', get cssRules() { throw new Error('Unavailable'); } };
  const result = await exportWith([sheet], (url, options) => {
    assert.equal(url, 'styles.css'); assert.ok(options.signal);
    return { ok: true, text: async () => 'body { color: #173b57; }' };
  });
  assert.equal(result.fetches, 1); assert.equal(result.downloads, 1);
  assert.match(result.html, /color: #173b57/);
});

test('offline, non-success and empty styles never download an unstyled itinerary', async () => {
  for (const fetchStyles of [
    () => { throw new Error('offline'); },
    () => ({ ok: false }),
    () => ({ ok: true, text: async () => '  ' }),
  ]) {
    const result = await exportWith([], fetchStyles);
    assert.equal(result.downloads, 0);
    assert.match(result.messages[0][0], /未下载不完整文件/);
    assert.equal(result.messages[0][1], true);
  }
});
