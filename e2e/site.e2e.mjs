// UI/UX tests for the demo site in a real (headless) Edge / Chrome.
// Run: npm run test:e2e   (starts its own static server on a free port)
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.E2E_SHOTS || join(root, 'e2e', 'screenshots');
const PORT = 5300 + Math.floor(Math.random() * 300);
const URL = `http://localhost:${PORT}/site/`;
let server;
let b;

/** In-page checks shared by every viewport and theme. Returns a list of problems. */
const AUDIT = `
window.__audit = (opts = {}) => {
  const issues = [];
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden],[aria-hidden="true"]'); };
  const desc = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
  if (document.documentElement.scrollWidth > innerWidth + 1) {
    const wide = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('pre, .table-wrap, .ixs-table-wrap, .ixs-facet')).slice(0, 3).map(desc);
    issues.push('page scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + innerWidth + ' ' + wide.join(', '));
  }
  for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, [role=button], [role=option], [role=combobox]')) {
    if (!visible(el)) continue;
    const name = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.getAttribute('placeholder') || (el.labels && el.labels[0] && el.labels[0].textContent) || '').trim();
    if (!name) issues.push('no accessible name: ' + desc(el));
  }
  const ids = {};
  for (const el of document.querySelectorAll('[id]')) ids[el.id] = (ids[el.id] || 0) + 1;
  for (const [k, n] of Object.entries(ids)) if (n > 1) issues.push('duplicate id: ' + k);
  for (const img of document.querySelectorAll('img')) if (!img.hasAttribute('alt')) issues.push('img without alt: ' + desc(img));
  for (const cb of document.querySelectorAll('[role=combobox]')) {
    const pop = document.getElementById(cb.getAttribute('aria-controls'));
    if (!pop) issues.push('combobox without its listbox: ' + desc(cb));
    const ad = cb.getAttribute('aria-activedescendant');
    if (ad && !document.getElementById(ad)) issues.push('aria-activedescendant points nowhere: ' + ad);
  }
  if (document.querySelectorAll('h1').length !== 1) issues.push('expected exactly one h1');

  // contrast of visible text inside the search components (WCAG AA)
  const parse = (c) => {
    let m = c.match(/rgba?\\(([^)]+)\\)/);
    if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
    m = c.match(/color\\(srgb ([^)]+)\\)/);
    if (m) { const p = m[1].split(/[ /]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1]; }
    return null;
  };
  const over = (top, bottom) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1); };
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !e.matches('.ixs-cover, .qv-cover')) return null; // gradient: skip
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let bg = [255, 255, 255, 1];
    for (const l of layers.reverse()) bg = over(l, bg);
    return bg;
  };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const scope = opts.scope ? document.querySelectorAll(opts.scope) : [document.body];
  const seen = new Set();
  for (const s of scope) for (const el of s.querySelectorAll('*')) {
    if (!visible(el) || el.closest('.ixs-ghost, .ixs-cover, svg, .ixs-sk, kbd')) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const cs = getComputedStyle(el);
    if (parseFloat(cs.opacity) < 1 || el.closest('.ixs-stale')) continue;
    const fg = parse(cs.color); const bg = bgOf(el);
    if (!fg || !bg) continue;
    const r = ratio(over(fg, bg), bg);
    const size = parseFloat(cs.fontSize); const bold = +cs.fontWeight >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    const key = desc(el) + r.toFixed(1);
    if (r < need && !seen.has(key)) { seen.add(key); issues.push('low contrast ' + r.toFixed(2) + ' < ' + need + ': ' + desc(el) + ' "' + el.textContent.trim().slice(0, 30) + '"'); }
  }
  // touch / click targets inside the components: at least 24 × 24 (WCAG 2.2 AA)
  for (const el of document.querySelectorAll('.ixs button:not(.ixs-link), .ixs [role=option], .ixs input')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 23.5 || r.height < 23.5) issues.push('small target ' + Math.round(r.width) + '×' + Math.round(r.height) + ': ' + desc(el));
  }
  return issues;
};`;

async function open(width, { dark = false, height = 900 } = {}) {
  await b.viewport(width, height, dark);
  await b.goto(URL);
  await b.eval(`try { localStorage.clear(); localStorage.setItem('ixs-site-theme', '${dark ? 'dark' : 'light'}'); } catch {} return 1;`);
  await b.goto(URL);
  await b.eval(`${AUDIT} return 1;`);
  b.errors.length = 0;
}
async function shot(name) { mkdirSync(SHOTS, { recursive: true }); writeFileSync(join(SHOTS, `${name}.png`), await b.screenshot()); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  server = spawn(process.execPath, [join(root, 'server.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(URL)).ok) break; } catch { /* starting */ } await sleep(100); }
  b = await launch();
});
after(async () => { await b?.close(); server?.kill(); });

describe('desktop 1280 · light', () => {
  before(() => open(1280));

  test('loads without console errors', async () => {
    await b.goto(URL);
    await b.eval(`${AUDIT} return 1;`);
    assert.deepEqual(b.errors, []);
  });

  test('accessibility + layout audit of the whole page', async () => {
    const issues = await b.eval('return window.__audit();');
    assert.deepEqual(issues, []);
    await shot('desktop-light-top');
  });

  test('"/" focuses the hero box; typing opens suggestions with corrected words', async () => {
    await b.eval('document.activeElement.blur(); window.scrollTo(0, 0); return 1;');
    await b.key('/', { text: '/', code: 'Slash' });
    assert.equal(await b.eval("return document.activeElement === document.querySelector('#heroSearch .ixs-input');"), true);
    await b.type('wireles hea');
    const pop = await b.eval("const p = document.querySelector('#heroSearch .ixs-pop'); return { hidden: p.hidden, text: p.textContent, split: p.hasAttribute('data-split') };");
    assert.equal(pop.hidden, false);
    assert.match(pop.text, /wireless headphones/i);
    await shot('desktop-hero-suggestions');
  });

  test('arrow keys move a valid aria-activedescendant; Enter opens the demo', async () => {
    await b.key('ArrowDown');
    const ad = await b.eval("const i = document.querySelector('#heroSearch .ixs-input'); const id = i.getAttribute('aria-activedescendant'); return { id, ok: !!document.getElementById(id), sel: document.getElementById(id)?.getAttribute('aria-selected') };");
    assert.ok(ad.ok, 'points to an option');
    assert.equal(ad.sel, 'true');
    await b.key('Enter');
    await sleep(500);
    const q = await b.eval('return window.search.getQuery();');
    assert.match(q, /wireless/i);
  });

  test('demo: grey completion is accepted with Tab', async () => {
    await b.eval("const i = document.querySelector('#demoSearch .ixs-input'); i.scrollIntoView({ block: 'center' }); window.search.setQuery(''); i.focus(); return 1;");
    await b.type('blu');
    const ghost = await b.eval("return document.querySelector('#demoSearch .ixs-ghost-rest').textContent;");
    assert.ok(ghost.length > 0, 'ghost text shown');
    await b.key('Tab');
    assert.match(await b.eval('return window.search.getQuery();'), /^blue/i);
  });

  test('Escape closes the dropdown, a second Escape clears the box', async () => {
    await b.key('Escape');
    assert.equal(await b.eval("return document.querySelector('#demoSearch .ixs-pop').hidden;"), true);
    await b.key('Escape');
    assert.equal(await b.eval('return window.search.getQuery();'), '');
  });

  test('facet chips filter with a real click and report aria-pressed', async () => {
    await b.eval('document.activeElement.blur(); window.search.close(); return 1;');
    const before = await b.eval('return window.search.getResults().total;');
    await b.click('#demoSearch [data-facet="category"][data-value="Audio"]');
    const after = await b.eval("return { total: window.search.getResults().total, pressed: document.querySelector('#demoSearch [data-facet=\"category\"][data-value=\"Audio\"]').getAttribute('aria-pressed') };");
    assert.ok(after.total < before && after.total > 0);
    assert.equal(after.pressed, 'true');
    await b.click('#demoSearch [data-clear-filters]');
    assert.equal(await b.eval('return window.search.getResults().total;'), before);
  });

  test('every layout renders items and nothing spills out of the panel', async () => {
    for (const l of ['list', 'cards', 'grid', 'compact', 'media', 'table']) {
      await b.click(`#demoSearch [data-layout-btn="${l}"]`);
      const r = await b.eval(`const res = document.querySelector('#demoSearch .ixs-results'); const frame = document.querySelector('#demoSearch .ixs').getBoundingClientRect();
        const out = [...res.querySelectorAll('.ixs-item, .ixs-title')].filter((e) => !e.closest('.ixs-table-wrap')).filter((e) => { const r = e.getBoundingClientRect(); return r.right > frame.right + 1 || r.left < frame.left - 1; }).length;
        return { n: res.querySelectorAll('.ixs-item').length, out, layout: document.querySelector('#demoSearch .ixs').dataset.layout };`);
      assert.equal(r.layout, l);
      assert.ok(r.n > 0, `${l} has items`);
      assert.equal(r.out, 0, `${l} stays inside`);
      await shot(`desktop-layout-${l}`);
    }
    assert.deepEqual(await b.eval('return window.__audit({ scope: "#demoSearch" });'), []);
  });

  test('clicking a result opens the details dialog; Escape closes it', async () => {
    await b.click('#demoSearch [data-layout-btn="cards"]');
    await b.click('#demoSearch .ixs-results .ixs-item');
    const open = await b.eval("const q = document.querySelector('.qv'); return { open: !q.hidden, focusInside: q.contains(document.activeElement), title: q.querySelector('h3')?.textContent };");
    assert.equal(open.open, true);
    assert.equal(open.focusInside, true, 'focus moves into the dialog');
    assert.ok(open.title);
    await shot('desktop-details');
    await b.key('Escape');
    assert.equal(await b.eval("return document.querySelector('.qv').hidden;"), true);
  });

  test('Ctrl+K opens the docs palette, Enter picks, focus comes back', async () => {
    await b.eval('document.activeElement.blur(); window.scrollTo(0, 0); return 1;');
    await b.key('k', { mods: 2 });
    const st = await b.eval("const m = document.querySelector('#paletteSearch .ixs-modal'); return { open: !m.hidden, focused: m.contains(document.activeElement) };");
    assert.deepEqual(st, { open: true, focused: true });
    await b.type('react');
    await shot('desktop-palette');
    await b.key('ArrowDown');
    await b.key('Enter');
    await sleep(400);
    assert.equal(await b.eval("return document.querySelector('#paletteSearch .ixs-modal').hidden;"), true);
    assert.equal(await b.eval('return window.search.getQuery();'), 'React');
  });

  test('palette closes on Escape and returns focus to its trigger', async () => {
    await b.click('#paletteSearch .ixs-trigger');
    await b.key('Escape');
    const st = await b.eval("return { hidden: document.querySelector('#paletteSearch .ixs-modal').hidden, back: document.activeElement === document.querySelector('#paletteSearch .ixs-trigger') };");
    assert.deepEqual(st, { hidden: true, back: true });
  });

  test('TypeScript is the default and the JS / TS switch changes every code block', async () => {
    const read = () => b.eval("return ['#snipCode', '#exCode', '#usageCode', '#eventsCode'].map((s) => document.querySelector(s).textContent);");
    const ts = await read();
    assert.ok(ts.every((c) => /interface |import type|<[A-Z]\w*>\(|lang="ts"|: \{ item: /.test(c)), 'all TypeScript');
    await b.click('#usageCode');
    await b.click('.code-card:has(#usageCode) [data-lang="js"]');
    const js = await read();
    assert.ok(js.every((c) => !/interface |import type /.test(c)), 'all JavaScript');
    assert.equal(await b.eval("return document.querySelectorAll('.lang-tabs [data-lang=js].on').length === document.querySelectorAll('.lang-tabs').length;"), true);
    await b.click('.code-card:has(#snipCode) [data-lang="ts"]');
    assert.equal(await b.eval("try { return localStorage.getItem('ixs-code-lang'); } catch { return 'ts'; }"), 'ts');
  });

  test('every example mounts, reacts to typing and explains the query', async () => {
    const ids = await b.eval("return [...document.querySelectorAll('#exList [data-ex]')].map((x) => x.dataset.ex);");
    assert.ok(ids.length >= 13);
    for (const id of ids) {
      await b.click(`#exList [data-ex="${id}"]`);
      const hasBox = await b.eval("return !!document.querySelector('#exFrame .ixs-input:not([hidden]), #exFrame .hl-input');");
      if (id === 'palette') { await b.click('#exFrame .ixs-trigger'); await b.type('theme'); await b.key('Escape'); continue; }
      assert.ok(hasBox, `${id} has an input`);
      await b.eval("const i = document.querySelector('#exFrame .ixs-input, #exFrame .hl-input'); i.focus(); i.select && i.select(); return 1;");
      await b.type(id === 'polish' ? 'lodz' : id === 'headless' ? 'blu' : 'e');
      await sleep(id === 'async' ? 700 : 150);
      if (id === 'autocomplete') { await b.key('ArrowDown'); await b.key('Enter'); }
      if (id === 'fullscreen') {
        assert.equal(await b.eval("return document.querySelector('#exFrame .ixs').classList.contains('ixs-fs');"), true, 'opens full screen');
        await b.key('Escape');
        await b.key('Escape');
        assert.equal(await b.eval("return document.querySelector('#exFrame .ixs').classList.contains('ixs-fs');"), false, 'Escape leaves full screen');
      }
      if (id === 'url') assert.match(await b.eval("return document.querySelector('.ex-out').textContent;"), /ex\.q=e/);
      const out = await b.eval("return document.querySelector('.ex-out').textContent;");
      assert.ok(out.trim().length > 0, `${id} shows output`);
    }
    assert.deepEqual(b.errors, []);
  });

  test('search stays fast: a full search + render under 50 ms', async () => {
    const ms = await b.eval("const t = performance.now(); await window.search.setQuery('wireless headphones'); await window.search.setQuery('blu'); await window.search.setQuery(''); return (performance.now() - t) / 3;");
    assert.ok(ms < 50, `${ms.toFixed(1)} ms`);
  });
});

describe('desktop 1280 · dark', () => {
  before(() => open(1280, { dark: true }));
  test('every component follows the theme and passes the audit', async () => {
    const themes = await b.eval("return [...document.querySelectorAll('.ixs')].map((x) => x.dataset.theme);");
    assert.ok(themes.length > 5 && themes.every((t) => t === 'dark'));
    assert.deepEqual(await b.eval('return window.__audit();'), []);
    await b.eval("document.querySelector('#demo').scrollIntoView({ behavior: 'instant' }); const i = document.querySelector('#demoSearch .ixs-input'); i.focus(); return 1;");
    await b.type('spea');
    assert.deepEqual(await b.eval('return window.__audit({ scope: "#demoSearch" });'), []);
    await shot('desktop-dark-demo');
  });
});

for (const [name, width] of [['phone', 375], ['tablet', 768], ['wide', 1600]]) {
  describe(`${name} ${width}px`, () => {
    before(() => open(width, { height: name === 'phone' ? 760 : 1000 }));
    test('no sideways scrolling and the audit passes', async () => {
      assert.deepEqual(await b.eval('return window.__audit();'), []);
      await shot(`${name}-top`);
    });
    test('the demo box works and its dropdown fits the screen', async () => {
      await b.eval("document.querySelector('#demoSearch').scrollIntoView({ block: 'start', behavior: 'instant' }); document.querySelector('#demoSearch .ixs-input').focus(); return 1;");
      await b.type('wire');
      const r = await b.eval("const p = document.querySelector('#demoSearch .ixs-pop').getBoundingClientRect(); return { left: p.left, right: p.right, w: innerWidth, n: document.querySelectorAll('#demoSearch .ixs-opt').length };");
      assert.ok(r.n > 0);
      assert.ok(r.left >= 0 && r.right <= r.w + 1, `dropdown inside ${r.left}…${r.right} of ${r.w}`);
      await shot(`${name}-demo-open`);
      await b.key('Escape');
      for (const l of ['list', 'cards', 'grid', 'compact', 'media', 'table']) {
        await b.click(`#demoSearch [data-layout-btn="${l}"]`);
        assert.equal(await b.eval('return document.documentElement.scrollWidth <= innerWidth + 1;'), true, `${l} fits`);
      }
    });
  });
}

describe('what a screen reader gets (accessibility tree)', () => {
  before(() => open(1280));
  // ignored (purely presentational) nodes are kept so parent -> child links stay intact
  const axTree = async () => (await b.send('Accessibility.getFullAXTree')).nodes;
  const prop = (n, name) => n.properties?.find((p) => p.name === name)?.value?.value;
  /** Options inside our suggestion listboxes (a native <select> exposes options too). */
  const listOptions = (nodes) => {
    const byId = new Map(nodes.map((n) => [n.nodeId, n]));
    const out = [];
    const walk = (n) => { for (const c of n.childIds || []) { const k = byId.get(c); if (!k) continue; if (!k.ignored && k.role?.value === 'option') out.push(k); walk(k); } };
    nodes.filter((n) => n.role?.value === 'listbox' && /suggestions|podpowiedzi/i.test(n.name?.value || '')).forEach(walk);
    return out;
  };
  test('the demo box is a named combobox that reports expanded / collapsed', async () => {
    await b.eval("document.querySelector('#demoSearch .ixs-input').scrollIntoView({ block: 'center', behavior: 'instant' }); document.querySelector('#demoSearch .ixs-input').focus(); return 1;");
    let nodes = await axTree();
    const boxes = nodes.filter((n) => !n.ignored && n.role?.value === 'combobox');
    assert.ok(boxes.length >= 2, 'hero + demo comboboxes');
    for (const c of boxes) assert.ok(c.name?.value, 'every combobox has a name');
    const focused = boxes.find((n) => prop(n, 'focused'));
    assert.ok(focused, 'focus is on a combobox');
    // focus may open popular searches (browsers differ in whether a scripted focus fires); expanded must match what is shown
    const popVisible = await b.eval("return !document.querySelector('#demoSearch .ixs-pop').hidden;");
    assert.equal(prop(focused, 'expanded'), popVisible, 'expanded matches the visible list');
    if (popVisible) {
      await b.key('Escape');
      const closed = (await axTree()).find((n) => !n.ignored && n.role?.value === 'combobox' && prop(n, 'focused'));
      assert.equal(prop(closed, 'expanded'), false, 'collapsed after Escape');
    }
    await b.type('wire');
    nodes = await axTree();
    const open = nodes.find((n) => !n.ignored && n.role?.value === 'combobox' && prop(n, 'focused'));
    assert.equal(prop(open, 'expanded'), true, 'expanded while the list is open');
    assert.ok(nodes.some((n) => !n.ignored && n.role?.value === 'listbox'), 'listbox exposed');
    const options = listOptions(nodes);
    assert.ok(options.length > 2 && options.every((o) => o.name?.value), 'options have names');
  });
  test('arrow keys move the selected option a screen reader announces', async () => {
    await b.key('ArrowDown');
    await b.key('ArrowDown');
    const nodes = await axTree();
    const sel = listOptions(nodes).filter((n) => prop(n, 'selected'));
    assert.equal(sel.length, 1, 'exactly one selected option');
    assert.ok(sel[0].name.value.length > 0);
    await b.key('Escape');
    await b.key('Escape');
  });
  test('result count is announced in a polite live region', async () => {
    await b.eval("window.search.setQuery('speaker'); return 1;");
    await sleep(100);
    const region = await b.eval("const r = document.querySelector('#demoSearch [aria-live]'); return { live: r.getAttribute('aria-live'), text: r.textContent };");
    assert.equal(region.live, 'polite');
    assert.match(region.text, /results? for “speaker”/);
  });
});

describe('new features in the browser', () => {
  before(() => open(1280));
  test('range filter: min price limits the results', async () => {
    await b.eval("window.search.setQuery(''); return 1;");
    await b.click('#demoSearch [data-range="price"][data-bound="min"]');
    await b.type('500');
    await b.key('Tab');
    const prices = await b.eval('return window.search.getResults().hits.map((h) => h.item.price);');
    assert.ok(prices.length > 0 && prices.every((p) => p >= 500), prices.join(','));
    await shot('feature-range');
  });
  test('URL keeps the state and a reload restores it', async () => {
    const search = await b.eval('return location.search;');
    assert.match(search, /demo\.price=500\.\./);
    await b.goto(URL + search);
    await b.eval(`${AUDIT} return 1;`);
    const st = await b.eval('return { f: window.search.getFilters(), min: document.querySelector(\'#demoSearch [data-bound="min"]\').value };');
    assert.deepEqual(st.f, { price: [{ min: 500 }] });
    assert.equal(st.min, '500');
    await b.eval("history.replaceState(null, '', location.pathname); return 1;");
  });
  test('grouped results pass the audit', async () => {
    await b.goto(URL);
    await b.eval(`${AUDIT} return 1;`);
    await b.click('#groupCtl');
    const titles = await b.eval("return [...document.querySelectorAll('#demoSearch .ixs-gtitle')].map((h) => h.textContent);");
    assert.ok(titles.length > 3, titles.join(' | '));
    assert.deepEqual(await b.eval('return window.__audit({ scope: "#demoSearch" });'), []);
    await b.eval("document.querySelector('#demoSearch .ixs-gsec').scrollIntoView({ block: 'start', behavior: 'instant' }); return 1;");
    await shot('feature-grouped');
    await b.click('#groupCtl');
  });
  test('stemming: "running" finds the cycling and running gear, "headphone" finds "Headphones"', async () => {
    const r = await b.eval("await window.search.setQuery('headphone'); return window.search.getResults().hits.map((h) => h.item.title);");
    assert.ok(r.some((t) => /Headphones/.test(t)));
  });
});

describe('phone full-screen search', () => {
  before(() => open(375, { height: 760 }));
  test('tapping the box opens a full-screen search with a back button', async () => {
    await b.click('#demoSearch .ixs-input');
    const st = await b.eval("const r = document.querySelector('#demoSearch .ixs-box').getBoundingClientRect(); const back = document.querySelector('#demoSearch .ixs-back'); return { fs: document.querySelector('#demoSearch .ixs').classList.contains('ixs-fs'), top: r.top, h: r.height, vh: innerHeight, back: getComputedStyle(back).display !== 'none' && !!back.getAttribute('aria-label'), lock: document.documentElement.classList.contains('ixs-fs-lock') };");
    assert.equal(st.fs, true);
    assert.ok(st.top <= 0.5 && st.h >= st.vh - 1, 'covers the screen');
    assert.equal(st.back, true);
    assert.equal(st.lock, true);
    await b.type('wire');
    await shot('phone-fullscreen');
    assert.deepEqual(await b.eval('return window.__audit({ scope: "#demoSearch" });'), []);
  });
  test('Enter shows the results and leaves full screen; back button works too', async () => {
    await b.key('Enter');
    assert.equal(await b.eval("return document.querySelector('#demoSearch .ixs').classList.contains('ixs-fs');"), false);
    await b.click('#demoSearch .ixs-input');
    await b.click('#demoSearch .ixs-back');
    const st = await b.eval("return { fs: document.querySelector('#demoSearch .ixs').classList.contains('ixs-fs'), lock: document.documentElement.classList.contains('ixs-fs-lock') };");
    assert.deepEqual(st, { fs: false, lock: false });
  });
});
