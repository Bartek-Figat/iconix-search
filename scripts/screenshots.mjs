// npm run screenshots: renders the demo site in headless Edge / Chrome and saves the README images to docs/screenshots/.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../e2e/browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'screenshots');
const PORT = 5600 + Math.floor(Math.random() * 200);
const URL = `http://localhost:${PORT}/site/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(out, { recursive: true });

const server = spawn(process.execPath, [join(root, 'server.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(URL)).ok) break; } catch { /* starting */ } await sleep(100); }
const b = await launch();

/** Loads the page in a theme, runs `prepare`, then saves the box around `selector` (plus padding). */
async function shot(name, { width = 1280, height = 900, dark = false, selector, pad = 24, prepare = '' }) {
  await b.viewport(width, height, dark);
  await b.goto(URL);
  await b.eval(`try { localStorage.clear(); localStorage.setItem('ixs-site-theme', '${dark ? 'dark' : 'light'}'); } catch {} return 1;`);
  await b.goto(URL);
  await b.eval(`document.documentElement.style.scrollBehavior = 'auto'; ${prepare}; return 1;`);
  await sleep(350);
  // clip is in page coordinates (viewport position + scroll)
  const box = selector ? await b.eval(`const rs = ${JSON.stringify([].concat(selector))}.map((q) => document.querySelector(q).getBoundingClientRect()); const r = { x: Math.min(...rs.map((a) => a.x)), y: Math.min(...rs.map((a) => a.y)), width: Math.max(...rs.map((a) => a.right)) - Math.min(...rs.map((a) => a.x)), height: Math.max(...rs.map((a) => a.bottom)) - Math.min(...rs.map((a) => a.y)) }; return { x: Math.max(0, r.x - ${pad}), y: Math.max(0, r.y + scrollY - ${pad}), w: Math.min(innerWidth, r.width + ${pad * 2}), h: r.height + ${pad * 2} };`) : null;
  const params = { format: 'png', captureBeyondViewport: !!box };
  if (box) params.clip = { x: box.x, y: box.y, width: box.w, height: Math.min(box.h, 2400), scale: 1 };
  const png = Buffer.from((await b.send('Page.captureScreenshot', params)).data, 'base64');
  writeFileSync(join(out, `${name}.png`), png);
  console.log('saved', name);
}
const typeIn = (sel, text) => `{ const i = document.querySelector('${sel}'); i.scrollIntoView({ block: 'start' }); window.scrollBy(0, -90); i.focus(); i.dispatchEvent(new Event('focus')); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true })); }`;

try {
  // 1. suggestions while typing (two-column dropdown)
  // the dropdown is absolutely positioned, so capture box + dropdown together
  await shot('suggestions', {
    height: 760,
    prepare: typeIn('#demoSearch .ixs-input', 'wire'),
    selector: ['#demoSearch .ixs-field', '#demoSearch .ixs-pop'],
    pad: 12,
  });
  // 2. results as cards with facets and a price range
  await shot('cards', {
    height: 1100,
    prepare: "document.querySelector('#demoSearch').scrollIntoView({ block: 'start' }); window.scrollBy(0, -90); window.search.setFilters({ price: [{ max: 300 }] })",
    selector: '#demoSearch .ixs',
    pad: 20,
  });
  // 3. the six layouts gallery
  await shot('layouts', { width: 1400, height: 2000, prepare: "document.querySelector('#layGrid').scrollIntoView({ block: 'start' }); window.scrollBy(0, -20)", selector: '#layGrid', pad: 8 });
  // 4. table layout, dark theme
  await shot('table-dark', {
    dark: true,
    height: 900,
    prepare: "document.querySelector('#demoSearch').scrollIntoView({ block: 'start' }); window.scrollBy(0, -90); window.search.setLayout('table'); window.search.setSort('price')",
    selector: '#demoSearch .ixs',
    pad: 20,
  });
  // 5. ⌘K palette
  await shot('palette', { height: 760, prepare: "document.querySelector('#paletteSearch .ixs-trigger').click(); const i = document.querySelector('#paletteSearch .ixs-input'); i.value = 'theme'; i.dispatchEvent(new Event('input', { bubbles: true }))", selector: '#paletteSearch .ixs-sheet', pad: 0 });
  // 6. phone full-screen search
  await shot('phone', { width: 390, height: 760, prepare: "const i = document.querySelector('#demoSearch .ixs-input'); i.scrollIntoView({ block: 'center' }); i.focus(); i.dispatchEvent(new Event('focus')); i.value = 'wire'; i.dispatchEvent(new Event('input', { bubbles: true }))" });
  // 7. hero
  await shot('hero', { height: 820, selector: '.hero .wrap', pad: 0 });
} finally {
  await b.close();
  server.kill();
}
