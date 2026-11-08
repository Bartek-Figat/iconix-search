import { createSearch, createIndex, highlight, escapeHtml as esc } from '../src/index.js';
import { icon } from '../src/icons.js';
import { DATASETS, products, docs, people } from './data.js';
import { hl, copy } from './util.js';
import { OPT_DOCS, API, EVENTS, KEYS, CLI, FEATURES, CSS_TOKENS } from './api-data.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const paintIcons = (root = document) => $$('[data-i]', root).forEach((el) => { el.outerHTML = icon(el.dataset.i, el.closest('.btn') ? 17 : 15); });

// ---------------------------------------------------------------- theme (shared by every instance on the page)
const html = document.documentElement;
const siteTheme = () => html.dataset.theme || 'light';
const instances = new Set();
const track = (s) => { instances.add(s); return s; };
function setThemeIcon() { $('#themeBtn').innerHTML = icon(siteTheme() === 'dark' ? 'sun' : 'moon', 18); }
$('#themeBtn').addEventListener('click', () => {
  const t = siteTheme() === 'dark' ? 'light' : 'dark';
  html.dataset.theme = t;
  try { localStorage.setItem('ixs-site-theme', t); } catch { /* private mode */ }
  setThemeIcon();
  for (const s of instances) if (s.root?.isConnected) s.setOptions({ theme: t }); else instances.delete(s);
});

// ---------------------------------------------------------------- item details (what a click on a result opens)
const detailEl = document.createElement('div');
detailEl.className = 'qv';
detailEl.hidden = true;
detailEl.innerHTML = '<div class="qv-scrim"></div><div class="qv-card" role="dialog" aria-modal="true" aria-labelledby="qvTitle" tabindex="-1"></div>';
document.body.appendChild(detailEl);
let detailBack = null;
const datasetOf = (item) => (item.id?.startsWith('p') ? 'products' : item.id?.startsWith('d') ? 'docs' : 'people');
function showDetail(item) {
  const d = DATASETS[datasetOf(item)];
  const f = d.fields;
  const get = (k) => (k == null ? null : typeof k === 'function' ? k(item) : item[k]);
  const meta = [].concat(get(f.meta) || []);
  const tags = [].concat(get(f.tags) || []);
  const title = get(f.title);
  const cover = item.icon || `<span class="qv-initial">${esc(String(title).split(' ').map((w) => w[0]).slice(0, 2).join(''))}</span>`;
  const card = detailEl.querySelector('.qv-card');
  card.style.setProperty('--c', item.color || 'var(--accent)');
  card.innerHTML = `
    <div class="qv-cover">${cover}${get(f.badge) ? `<span class="qv-badge">${esc(get(f.badge))}</span>` : ''}<button class="qv-x" aria-label="Close">${icon('x', 18)}</button></div>
    <div class="qv-body">
      <p class="qv-sub">${esc(get(f.subtitle) ?? '')}</p>
      <h3 id="qvTitle">${esc(title)}</h3>
      ${get(f.description) ? `<p class="qv-desc">${esc(get(f.description))}</p>` : ''}
      ${tags.length ? `<div class="qv-tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="qv-foot"><span class="qv-meta">${meta.map((m, i) => (i ? `<span>${esc(m)}</span>` : `<b>${esc(m)}</b>`)).join('')}</span>
      <button class="btn btn-dark qv-cta">${d === DATASETS.products ? 'Add to cart' : d === DATASETS.docs ? 'Read the page' : 'Send a message'}</button></div>
    </div>`;
  detailBack = document.activeElement;
  detailEl.hidden = false;
  card.focus();
}
function hideDetail() { if (detailEl.hidden) return; detailEl.hidden = true; detailBack?.focus?.(); }
detailEl.addEventListener('click', (e) => { if (e.target.closest('.qv-x, .qv-scrim, .qv-cta')) hideDetail(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !detailEl.hidden) { e.stopPropagation(); hideDetail(); } }, true);
/** Clicking a result card opens the details; picking a dropdown row fills the box (the library default). */
const openOnClick = (s) => { s.on('select', ({ item, via, preventDefault }) => { if (via === 'results') { preventDefault(); showDetail(item); } }); return s; };

const dataOpts = (name) => {
  const d = DATASETS[name];
  return { items: d.items, keys: d.keys, fields: d.fields, facets: d.facets, sorts: d.sorts, columns: d.columns, synonyms: d.synonyms || null, popular: d.popular, placeholder: d.placeholder };
};

// ---------------------------------------------------------------- hero: autocomplete only
const hero = track(createSearch('#heroSearch', {
  ...dataOpts('products'),
  results: false,
  maxHits: 5,
  hotkey: '/',
  navigate: false,
  storageKey: 'hero',
  theme: siteTheme(),
  placeholder: 'Search products — try a typo…',
  onSelect: ({ item }) => openInDemo('products', item.title),
  onSubmit: ({ query }) => openInDemo('products', query),
}));
$$('[data-hero]').forEach((b) => b.addEventListener('click', () => { hero.el.input.focus(); hero.setQuery(b.dataset.hero, { keepOpen: true }); }));

// ---------------------------------------------------------------- header: ⌘K palette over the docs
track(createSearch('#paletteSearch', {
  ...dataOpts('docs'),
  facets: [],
  mode: 'palette',
  hotkey: 'mod+k',
  navigate: false,
  storageKey: 'palette',
  placeholder: 'Search docs',
  theme: siteTheme(),
  onSelect: ({ item }) => openInDemo('docs', item.title),
}));

// ---------------------------------------------------------------- main demo
const custom = { data: 'products', accent: null, density: 'comfortable', locale: 'en', fuzzy: 'auto', radius: 12, instant: true, facets: true, group: false, infinite: false };
const GROUP_KEY = { products: 'category', docs: 'section', people: 'team' };
let layoutNow = DATASETS.products.layout;
const logEl = $('#evLog');
function log(name, text) {
  const t = new Date().toLocaleTimeString('en-GB');
  logEl.insertAdjacentHTML('afterbegin', `<div><i>${t}</i> <b>${esc(name)}</b> ${esc(text)}</div>`);
  while (logEl.children.length > 60) logEl.lastChild.remove();
}
$('#logClear').addEventListener('click', () => { logEl.innerHTML = ''; });

const demoOpts = () => {
  const d = DATASETS[custom.data];
  return {
    ...dataOpts(custom.data),
    facets: custom.facets ? d.facets : [],
    layout: layoutNow,
    accent: custom.accent,
    density: custom.density,
    locale: custom.locale,
    placeholder: custom.locale === 'pl' ? null : d.placeholder,
    fuzzy: custom.fuzzy === 'auto' ? 'auto' : +custom.fuzzy,
    radius: custom.radius,
    instant: custom.instant,
    groupBy: custom.group ? GROUP_KEY[custom.data] : null,
    infinite: custom.infinite,
  };
};
let lastSearchLog = 0;
const demo = track(createSearch('#demoSearch', {
  ...demoOpts(),
  hotkey: false,
  navigate: false,
  storageKey: 'demo',
  url: { prefix: 'demo.' }, // try it: filter, then copy the address
  theme: siteTheme(),
  pageSize: 12,
  onSearch: ({ query, total, result }) => {
    const now = Date.now();
    if (now - lastSearchLog < 250 && logEl.firstChild?.dataset?.kind === 'search') logEl.firstChild.remove();
    lastSearchLog = now;
    log('search', `“${query}” → ${total} ${result.didYouMean ? `(did you mean “${result.didYouMean}”?)` : ''}`);
    logEl.firstChild.dataset.kind = 'search';
  },
  onSelect: ({ item, via }) => log('select', `${item.title || item.name} (from ${via})`),
  onSubmit: ({ query }) => log('submit', `“${query}”`),
  onSuggestionSelect: ({ text, type }) => log('suggestionSelect', `${type}: “${text}”`),
  onFilter: ({ filters }) => log('filter', JSON.stringify(filters)),
  onSort: ({ sort }) => log('sort', String(sort)),
  onLayout: ({ layout }) => { layoutNow = layout; log('layout', layout); renderSnippet(); },
}));
openOnClick(demo);
window.search = demo; // handy for poking around in devtools

function openInDemo(data, query) {
  if (custom.data !== data) setData(data);
  $('#demo').scrollIntoView({ behavior: 'smooth', block: 'start' });
  demo.setQuery(query, { submit: true });
}

function renderTabs() {
  $('#dataTabs').innerHTML = Object.entries(DATASETS).map(([k, d]) => `<button role="tab" data-d="${k}" aria-selected="${k === custom.data}" class="${k === custom.data ? 'on' : ''}">${esc(d.label)} <span class="badge">${d.items.length}</span></button>`).join('');
  $('#tryRow').innerHTML = `<span class="try-l">Try:</span>${DATASETS[custom.data].tries.map((t) => `<button data-try="${esc(t)}">${esc(t)}</button>`).join('')}`;
}
function setData(name) {
  custom.data = name;
  layoutNow = DATASETS[name].layout;
  demo.setOptions({ ...demoOpts(), query: '', filters: {}, sort: 'relevance' });
  renderTabs();
  renderSnippet();
}
$('#dataTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (b) setData(b.dataset.d); });
$('#tryRow').addEventListener('click', (e) => {
  const b = e.target.closest('[data-try]');
  if (!b) return;
  demo.el.input.focus();
  demo.setQuery(b.dataset.try, { keepOpen: true });
});

const ACCENTS = [null, '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#18181b'];
$('#accentCtl').innerHTML = ACCENTS.map((c, i) => `<button data-c="${c || ''}" style="--c:${c || '#2563eb'}" class="${i === 0 ? 'on' : ''}" aria-label="${c || 'default accent'}"></button>`).join('');
$('#accentCtl').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  $$('#accentCtl button').forEach((x) => x.classList.toggle('on', x === b));
  custom.accent = b.dataset.c || null;
  demo.setOptions({ accent: custom.accent });
  renderSnippet();
});
$$('.custom .seg').forEach((seg) => seg.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  $$('button', seg).forEach((x) => x.classList.toggle('on', x === b));
  custom[seg.dataset.opt] = b.dataset.v;
  demo.setOptions(demoOpts());
  renderSnippet();
}));
$('#radiusCtl').addEventListener('input', (e) => { custom.radius = +e.target.value; demo.setOptions({ radius: custom.radius }); renderSnippet(); });
$('#instantCtl').addEventListener('change', (e) => { custom.instant = e.target.checked; demo.setOptions({ instant: custom.instant }); renderSnippet(); });
$('#facetsCtl').addEventListener('change', (e) => { custom.facets = e.target.checked; demo.setOptions({ facets: custom.facets ? DATASETS[custom.data].facets : [] }); renderSnippet(); });
$('#groupCtl').addEventListener('change', (e) => { custom.group = e.target.checked; demo.setOptions({ groupBy: custom.group ? GROUP_KEY[custom.data] : null }); renderSnippet(); });
$('#infiniteCtl').addEventListener('change', (e) => { custom.infinite = e.target.checked; demo.setOptions({ infinite: custom.infinite }); renderSnippet(); });
$('#urlCtl').addEventListener('change', (e) => { demo.setOptions({ url: e.target.checked ? { prefix: 'demo.' } : false }); if (!e.target.checked) history.replaceState(null, '', location.pathname + location.hash); renderSnippet(); });

// ---------------------------------------------------------------- TypeScript / JavaScript switch for every code block
let codeLang = 'ts';
try { codeLang = localStorage.getItem('ixs-code-lang') || 'ts'; } catch { /* storage blocked */ }
const codeRenderers = new Set();
const onLangChange = (fn) => { codeRenderers.add(fn); return fn; };
function addLangTabs(codeEl) {
  const head = codeEl.closest('.code-card').querySelector('.code-h');
  head.querySelector('.copy').insertAdjacentHTML('beforebegin', '<div class="tabs mini lang-tabs" role="group" aria-label="Language"><button data-lang="ts">TypeScript</button><button data-lang="js">JavaScript</button></div>');
  head.querySelectorAll('[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === codeLang));
}
function setCodeLang(lang) {
  codeLang = lang;
  try { localStorage.setItem('ixs-code-lang', lang); } catch { /* storage blocked */ }
  $$('.lang-tabs [data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === lang));
  codeRenderers.forEach((fn) => fn());
}
document.addEventListener('click', (e) => { const b = e.target.closest('.lang-tabs [data-lang]'); if (b) setCodeLang(b.dataset.lang); });

// ---------------------------------------------------------------- config snippet
let snipLang = 'react';
const TYPE_OF = { products: 'Product', docs: 'Doc', people: 'Person' };
/** An array / object literal, one entry per line when it would be long. pad = indent of the closing bracket. */
const lit = (open, parts, close, pad) => {
  const one = `${open}${parts.join(', ')}${close}`;
  return one.length <= 56 ? one.replace(/^\{(\S)/, '{ $1').replace(/(\S)\}$/, '$1 }') : `${open}\n${parts.map((p) => `${pad}  ${p},`).join('\n')}\n${pad}${close}`;
};
const keysSrc = (keys, pad) => lit('[', keys.map((k) => (typeof k === 'string' ? `'${k}'` : `{ name: '${k.name}', weight: ${k.weight} }`)), ']', pad);
function snippetCode() {
  const d = DATASETS[custom.data];
  const f = d.fields;
  const pad = snipLang === 'react' ? '  ' : snipLang === 'vue' ? '    ' : '  ';
  const fieldParts = Object.entries(f).filter(([, v]) => typeof v === 'string').map(([k, v]) => `${k}: '${v}'`);
  const props = [
    ['items', custom.data, 'expr'],
    ['keys', keysSrc(d.keys, pad), 'expr'],
    ['fields', lit('{', fieldParts, '}', pad), 'expr'],
    ['layout', layoutNow],
    custom.facets && ['facets', `[${d.facets.map((x) => `'${x.key}'`).join(', ')}]`, 'expr'],
    d.sorts?.length && ['sorts', lit('[', d.sorts.map((x) => `{ label: '${x.label}', value: '${x.value}' }`), ']', pad), 'expr'],
    custom.accent && ['accent', custom.accent],
    custom.density !== 'comfortable' && ['density', custom.density],
    custom.locale !== 'en' && ['locale', custom.locale],
    custom.fuzzy !== 'auto' && ['fuzzy', custom.fuzzy === '0' ? 'false' : custom.fuzzy, 'expr'],
    custom.radius !== 12 && ['radius', String(custom.radius), 'expr'],
    !custom.instant && ['instant', 'false', 'expr'],
    custom.group && ['groupBy', GROUP_KEY[custom.data]],
    custom.infinite && ['infinite', 'true', 'expr'],
    $('#urlCtl')?.checked && ['url', 'true', 'expr'],
  ].filter(Boolean);
  const ts = codeLang === 'ts';
  const T = TYPE_OF[custom.data];
  const typeImport = ts ? `\nimport type { ${T} } from './types';` : '';
  if (snipLang === 'react') {
    return `import { Search } from '@iconix/search/react';\nimport '@iconix/search/css';${typeImport}\n\n<Search\n${props.map(([k, v, t]) => `  ${k}=${t ? `{${v}}` : `"${v}"`}`).join('\n')}\n  onSelect={({ item }${ts ? `: { item: ${T} }` : ''}) => open(item)}\n/>`;
  }
  if (snipLang === 'vue') {
    return `<script setup${ts ? ' lang="ts"' : ''}>\nimport { IxSearch } from '@iconix/search/vue';\nimport '@iconix/search/css';${typeImport}\n</script>\n\n<template>\n  <IxSearch\n${props.map(([k, v, t]) => `    ${t ? ':' : ''}${k}="${String(v).replace(/"/g, "'")}"`).join('\n')}\n    @select="({ item }) => open(item)"\n  />\n</template>`;
  }
  return `import { createSearch } from '@iconix/search';\nimport '@iconix/search/css';${typeImport}\n\nconst search = createSearch${ts ? `<${T}>` : ''}('#search', {\n${props.map(([k, v, t]) => `  ${k}: ${t ? v : `'${v}'`},`).join('\n')}\n  onSelect: ({ item }) => open(item),\n});`;
}
function renderSnippet() { $('#snipCode').innerHTML = hl(snippetCode()); }
addLangTabs($('#snipCode'));
onLangChange(renderSnippet);
$('#snipTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  snipLang = b.dataset.t;
  $$('#snipTabs button').forEach((x) => x.classList.toggle('on', x === b));
  renderSnippet();
});
$('#snipCopy').addEventListener('click', (e) => copy(snippetCode(), e.currentTarget));

// ---------------------------------------------------------------- layouts gallery
const LAYS = [
  ['list', 'list', 'List', 'docs', 'Thumbnail, title, subtitle, a snippet around the match and tags. The default for docs and content.'],
  ['cards', 'cards', 'Cards', 'products', 'Cover with icon or image, badge, description and a footer for price or rating. Built for catalogues.'],
  ['grid', 'grid', 'Grid', 'people', 'Square tiles with a title and one line. Galleries, people, icons, files.'],
  ['compact', 'compact', 'Compact', 'docs', 'One dense row per result. Command lists, files, settings.'],
  ['media', 'media', 'Media', 'products', 'Large cover on the left, long description on the right. Articles, courses, listings.'],
  ['table', 'table', 'Table', 'people', 'Columns you choose, sortable headers. Admin panels and data.'],
];
$('#layGrid').innerHTML = LAYS.map(([id, ic, name, , desc]) => `
  <article class="lay"><div class="lay-h"><span class="tool-i">${icon(ic, 17)}</span><h4>${name}</h4><code>layout: '${id}'</code></div>
  <p>${desc}</p><div class="lay-body" id="lay-${id}"></div></article>`).join('');
for (const [id, , , data] of LAYS) {
  const d = DATASETS[data];
  openOnClick(track(createSearch(`#lay-${id}`, {
    ...dataOpts(data),
    facets: [],
    sorts: [],
    layouts: [id],
    layout: id,
    pageSize: { list: 3, cards: 3, grid: 8, compact: 6, media: 2, table: 6 }[id],
    ...(id === 'table' ? { columns: [{ key: 'name', label: 'Name', sortable: true }, { key: 'role', label: 'Role', sortable: true }, { key: 'team', label: 'Team', sortable: true }, { key: 'city', label: 'City', sortable: true }] } : {}),
    hotkey: false,
    navigate: false,
    recent: false,
    popular: [],
    maxHits: 0,
    density: 'compact',
    placeholder: `Filter ${d.label.toLowerCase()}…`,
    theme: siteTheme(),
  })));
}

// ---------------------------------------------------------------- examples
const sleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('Aborted', 'AbortError')); });
});
const EXAMPLES = [
  {
    id: 'palette', type: 'Doc', group: 'Patterns', title: '⌘K command palette',
    desc: 'mode: "palette" renders a trigger button. Ctrl K (⌘K on a Mac) or a click opens a dialog with results right in the dropdown.',
    code: `createSearch('#palette', {
  mode: 'palette',
  hotkey: 'mod+k',
  items: docs,
  keys: [{ name: 'title', weight: 3 }, 'tags', 'description'],
  fields: { title: 'title', subtitle: 'section', icon: 'icon', url: 'url' },
  popular: ['palette', 'react', 'facets'],
  onSelect: ({ item }) => router.push(item.url),
});`,
    mount(frame, out) {
      frame.innerHTML = '<p class="ex-note">Click the button, or press <kbd>Ctrl</kbd> <kbd>K</kbd> in the page header. Type, use <kbd>↑</kbd> <kbd>↓</kbd> and <kbd>Enter</kbd>.</p><div id="exPal"></div>';
      return createSearch('#exPal', { ...dataOpts('docs'), facets: [], mode: 'palette', hotkey: false, navigate: false, storageKey: 'ex-pal', theme: siteTheme(), onSelect: ({ item }) => { out.textContent = `select → ${item.title}`; } });
    },
  },
  {
    id: 'autocomplete', type: 'Person', ownSelect: true, ownOut: true, group: 'Patterns', title: 'Autocomplete field',
    desc: 'results: false gives a plain autocomplete input. Picking a person fills the form; preventDefault() keeps the page where it is.',
    code: `createSearch('#assignee', {
  results: false,
  items: people,
  keys: ['name', 'role', 'team'],
  fields: { title: 'name', subtitle: 'role', color: 'color' },
  placeholder: 'Assign to…',
  recent: false,
  onSelect: ({ item, preventDefault }) => {
    preventDefault();
    form.assignee.value = item.email;
  },
});`,
    mount(frame, out) {
      frame.innerHTML = '<p class="ex-note">A form field: type a name, a role (“designer”) or a city with or without accents (“lodz”).</p><div id="exAc" style="max-width:420px"></div>';
      return createSearch('#exAc', { ...dataOpts('people'), facets: [], results: false, maxHits: 6, recent: false, popular: [], hotkey: false, navigate: false, placeholder: 'Assign to…', theme: siteTheme(), onSelect: ({ item, preventDefault }) => { preventDefault(); out.textContent = `assignee = ${item.email}`; } });
    },
  },
  {
    id: 'async', type: 'Person', ownOut: true, group: 'Patterns', title: 'Search a server',
    desc: 'Pass an async source. It gets the query, the active filters and an AbortSignal; typing fast cancels the previous request. Here the “server” waits 400 ms: type quickly or click a team and watch the log.',
    code: `createSearch('#people', {
  source: async (query, { signal, filters }) => {
    const params = new URLSearchParams({ q: query, ...filters });
    const res = await fetch(\`/api/people?\${params}\`, { signal });
    return res.json(); // an array, or { items, total }
  },
  fields: { title: 'name', subtitle: 'role', badge: 'team', tags: 'skills', color: 'color' },
  facets: ['team'],
  layout: 'compact',
});`,
    mount(frame, out) {
      frame.innerHTML = '<p class="ex-note">Each line below is one request to the fake server. Older requests are cancelled while you type.</p><div id="exAsync"></div>';
      const serverIdx = createIndex(people, { keys: DATASETS.people.keys });
      let n = 0;
      return createSearch('#exAsync', {
        ...dataOpts('people'), items: [], sorts: [], facets: [{ key: 'team', label: 'Team' }], layout: 'compact', layouts: ['compact', 'table'], hotkey: false, navigate: false, recent: false, theme: siteTheme(), pageSize: 8,
        source: async (q, { signal, filters }) => {
          const id = ++n;
          const params = new URLSearchParams({ q });
          for (const [k, v] of Object.entries(filters)) params.set(k, [].concat(v).join(','));
          const line = (status, extra = '') => `#${id}  ${status.padEnd(8)}GET /api/people?${params}${extra}`;
          const lines = () => out.textContent.split('\n').filter(Boolean);
          const swap = (txt) => { out.textContent = lines().map((l) => (l.startsWith(`#${id} `) ? txt : l)).join('\n'); };
          out.textContent = [line('pending'), ...lines()].slice(0, 6).join('\n');
          try { await sleep(400, signal); } catch (e) { swap(line('aborted')); throw e; }
          const found = serverIdx.search(q, { filters }).hits.map((h) => h.item);
          swap(line('200', `  → ${found.length} people`));
          return found;
        },
      });
    },
  },
  {
    id: 'render', type: 'Product', ownSelect: true, group: 'Rendering', title: 'Custom product cards',
    desc: 'renderItem returns your own markup for each result. ctx.highlight() escapes the text and marks the matched part.',
    code: `createSearch('#shop', {
  items: products,
  keys: [{ name: 'title', weight: 3 }, 'brand', 'tags'],
  layout: 'cards',
  layouts: ['cards'],
  renderItem: (hit, { highlight }) => {
    const p = hit.item;
    return \`<div class="pc" style="--c:\${p.color}">
      <div class="pc-top"><span class="pc-ic">\${p.icon}</span>\${p.isNew ? '<span class="pc-new">New</span>' : ''}</div>
      <div class="pc-b">
        <b>\${highlight(p.title)}</b>
        <span class="pc-stars">\${'★'.repeat(Math.round(p.rating))}<span>\${p.rating}</span></span>
        <div class="pc-f"><span class="pc-price">$\${p.price}</span><span class="pc-cta">Add to cart</span></div>
      </div>
    </div>\`;
  },
});`,
    mount(frame, out) {
      frame.innerHTML = '<div id="exRender"></div>';
      return createSearch('#exRender', {
        ...dataOpts('products'), facets: [{ key: 'category', label: 'Category' }], layout: 'cards', layouts: ['cards'], pageSize: 8, hotkey: false, navigate: false, theme: siteTheme(), recent: false,
        onSelect: ({ item, preventDefault }) => { preventDefault(); out.textContent = `added to cart → ${item.title} ($${item.price})`; },
        renderItem: (hit, { highlight: h }) => {
          const p = hit.item;
          return `<div class="pc" style="--c:${p.color}"><div class="pc-top"><span class="pc-ic">${p.icon}</span>${p.isNew ? '<span class="pc-new">New</span>' : ''}</div><div class="pc-b"><b>${h(p.title)}</b><small style="color:var(--muted)">${h(p.brand)}</small><span class="pc-stars">${'★'.repeat(Math.round(p.rating))}<span>${p.rating}</span></span><div class="pc-f"><span class="pc-price">$${p.price.toLocaleString('en-US')}</span><span class="pc-cta">Add to cart</span></div></div></div>`;
        },
      });
    },
  },
  {
    id: 'people', type: 'Person', group: 'Rendering', title: 'People directory',
    desc: 'A grid of people with initials as avatars, a team facet and sorting by name or start year. No images needed: color + initial make the cover.',
    code: `createSearch('#team', {
  items: people,
  keys: [{ name: 'name', weight: 3 }, 'role', 'team', 'city', 'skills'],
  fields: { title: 'name', subtitle: 'role', badge: 'team', tags: 'skills', meta: 'city', color: 'color' },
  facets: [{ key: 'team', label: 'Team' }],
  sorts: [{ label: 'Name A–Z', value: 'name' }, { label: 'Newest first', value: '-since' }],
  layout: 'grid',
  layouts: ['grid', 'list', 'table'],
});`,
    mount(frame) {
      frame.innerHTML = '<div id="exPeople"></div>';
      return createSearch('#exPeople', { ...dataOpts('people'), facets: [{ key: 'team', label: 'Team' }], layout: 'grid', layouts: ['grid', 'list', 'table'], hotkey: false, navigate: false, theme: siteTheme(), pageSize: 8 });
    },
  },
  {
    id: 'classnames', type: 'Doc', group: 'Rendering', title: 'Style any part',
    desc: 'classNames adds your own classes (Tailwind works) and every color is a CSS variable. This one is rounder, pink and spacious.',
    code: `createSearch('#styled', {
  items: docs,
  layout: 'media',
  layouts: ['media', 'cards'],
  density: 'spacious',
  accent: '#db2777',
  radius: 20,
  classNames: { item: 'tw-card' }, // your own classes on any part, Tailwind included
});`,
    css: `/* the same look with plain CSS */
.ixs {
  --ixs-accent: #db2777;
  --ixs-radius: 20px;
}
.ixs .tw-card { border-radius: 20px; }`,
    mount(frame) {
      frame.innerHTML = '<div id="exStyled"></div>';
      return createSearch('#exStyled', { ...dataOpts('docs'), layout: 'media', layouts: ['media', 'cards'], density: 'spacious', accent: '#db2777', radius: 20, classNames: { item: 'tw-card' }, hotkey: false, navigate: false, theme: siteTheme(), pageSize: 4 });
    },
  },
  {
    id: 'syntax', type: 'Product', group: 'Search', title: 'Query syntax and synonyms',
    desc: 'Quotes for phrases, a minus to exclude, field:value to filter, and synonyms in both directions. Try the buttons.',
    code: `createSearch('#q', {
  items: products,
  keys: [{ name: 'title', weight: 3 }, 'brand', 'category', 'tags'],
  synonyms: { laptop: ['notebook'], tv: ['television'], phone: ['mobile'] },
  layout: 'compact',
});

// "noise cancelling"   exact phrase
// usb-c -cable          exclude a word
// brand:lumo wifi       filter by a field
// notebook              synonym of laptop`,
    mount(frame) {
      frame.innerHTML = `<div class="try" style="margin-bottom:12px">${['"noise cancelling"', 'usb-c -cable', 'brand:lumo wifi', 'notebook', 'television', 'category:audio -wired'].map((t) => `<button data-q="${esc(t)}">${esc(t)}</button>`).join('')}</div><div id="exSyntax"></div>`;
      const s = createSearch('#exSyntax', { ...dataOpts('products'), facets: [], layout: 'compact', layouts: ['compact', 'list'], hotkey: false, navigate: false, theme: siteTheme(), pageSize: 8 });
      frame.querySelector('.try').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) s.setQuery(b.dataset.q, { submit: true }); });
      return s;
    },
  },
  {
    id: 'polish', type: 'Person', group: 'Search', title: 'Polish UI and accents',
    desc: 'locale: "pl" switches the strings (with correct plurals: 1 wynik, 3 wyniki, 5 wyników). Search folds accents both ways.',
    code: `createSearch('#zespol', {
  locale: 'pl',
  items: people,
  keys: ['name', 'role', 'city'],
  fields: { title: 'name', subtitle: 'role', badge: 'team', meta: 'city', color: 'color' },
});
// "lodz" finds Łódź, "wisniewski" finds Wiśniewski`,
    mount(frame) {
      frame.innerHTML = `<div class="try" style="margin-bottom:12px">${['lodz', 'wisniewski', 'gdansk', 'krakow'].map((t) => `<button data-q="${t}">${t}</button>`).join('')}</div><div id="exPl"></div>`;
      const s = createSearch('#exPl', { ...dataOpts('people'), placeholder: null, locale: 'pl', layout: 'list', layouts: ['list', 'compact'], facets: [{ key: 'team', label: 'Zespół' }], sorts: [], hotkey: false, navigate: false, theme: siteTheme(), pageSize: 5 });
      frame.querySelector('.try').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) s.setQuery(b.dataset.q, { submit: true }); });
      return s;
    },
  },
  {
    id: 'url', type: 'Product', ownOut: true, group: 'Patterns', title: 'Shareable URL',
    desc: 'url: true keeps the query, filters, sort and layout in the address bar, so a search can be bookmarked or sent. Reloading the page restores it. Defaults are left out to keep links short.',
    code: `createSearch('#shop', {
  items: products,
  keys: [{ name: 'title', weight: 3 }, 'brand', 'tags'],
  facets: ['category', { key: 'price', type: 'range', prefix: '$' }],
  sorts: [{ label: 'Price', value: 'price' }],
  url: { prefix: 'shop.' }, // or url: true for plain ?q=…&category=…
});
// → /products?shop.q=wireless&shop.category=Audio&shop.price=..300&shop.sort=price`,
    mount(frame, out) {
      frame.innerHTML = '<p class="ex-note">Type, click a category or set a price: the address below follows. Copy it into a new tab and the same search opens.</p><div id="exUrl"></div>';
      const s = createSearch('#exUrl', {
        ...dataOpts('products'), facets: [{ key: 'category', label: 'Category' }, { key: 'price', label: 'Price', type: 'range', prefix: '$' }],
        sorts: [{ label: 'Price', value: 'price' }], layout: 'compact', layouts: ['compact', 'list'], pageSize: 5, hotkey: false, navigate: false, theme: siteTheme(), url: { prefix: 'ex.' },
      });
      const show = () => { const p = new URLSearchParams(location.search); const mine = [...p].filter(([k]) => k.startsWith('ex.')); out.textContent = `address  ${location.pathname}${mine.length ? `?${mine.map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%7C/g, '|')}`).join('&')}` : ''}`; };
      s.on('search', show);
      s.on('layout', show);
      show();
      // leave the address clean when another example opens
      const destroy = s.destroy.bind(s);
      s.destroy = () => { destroy(); const p = new URLSearchParams(location.search); for (const k of [...p.keys()]) if (k.startsWith('ex.')) p.delete(k); history.replaceState(null, '', `${location.pathname}${p.toString() ? `?${p}` : ''}${location.hash}`); };
      return s;
    },
  },
  {
    id: 'fullscreen', type: 'Doc', group: 'Patterns', title: 'Full screen on phones',
    desc: 'On a phone (up to 640px) the focused box fills the screen, with a back arrow, bigger rows and the page behind locked. It is on by default; here it is forced so you can try it on a desktop.',
    code: `createSearch('#docs', {
  items: docs,
  keys: [{ name: 'title', weight: 3 }, 'tags', 'description'],
  fields: { title: 'title', subtitle: 'section', icon: 'icon' },
  fullscreen: 'auto', // default: phones only. true = always, false = never
  onFullscreen: ({ open }) => console.log(open ? 'full screen' : 'back to the page'),
});`,
    mount(frame) {
      frame.innerHTML = '<p class="ex-note">Click the box. <kbd>Esc</kbd>, the ← arrow, <kbd>Enter</kbd> or picking a result closes it.</p><div id="exFs" style="max-width:520px"></div>';
      return createSearch('#exFs', { ...dataOpts('docs'), facets: [], sorts: [], layout: 'compact', layouts: ['compact'], pageSize: 4, hotkey: false, navigate: false, theme: siteTheme(), fullscreen: true, maxHits: 6 });
    },
  },
  {
    id: 'ranges', type: 'Product', group: 'Rendering', title: 'Price range and groups',
    desc: 'A range facet gives min / max inputs (the placeholders show the data range); groupBy puts the results under titles, in ranking order.',
    code: `createSearch('#shop', {
  items: products,
  keys: [{ name: 'title', weight: 3 }, 'brand', 'tags'],
  fields: { title: 'title', subtitle: 'brand', icon: 'icon', color: 'color', meta: (p) => \`$\${p.price}\` },
  facets: [
    { key: 'price', label: 'Price', type: 'range', prefix: '$' },
    { key: 'brand', label: 'Brand', limit: 5 },
  ],
  groupBy: 'category',
  layout: 'compact',
});`,
    mount(frame) {
      frame.innerHTML = '<div id="exRanges"></div>';
      return createSearch('#exRanges', {
        ...dataOpts('products'), facets: [{ key: 'price', label: 'Price', type: 'range', prefix: '$' }, { key: 'brand', label: 'Brand', limit: 5 }],
        sorts: [], groupBy: 'category', layout: 'compact', layouts: ['compact', 'grid'], filters: { price: [{ max: 100 }] }, pageSize: 12, hotkey: false, navigate: false, theme: siteTheme(),
      });
    },
  },
  {
    id: 'stemming', type: 'Doc', group: 'Search', title: 'Word forms',
    desc: 'stemming matches other forms of a word: “filtering” finds “filters”, “keyboards” finds “keyboard”. Typos are off here so you see only word forms. Switch it off to compare.',
    code: `createSearch('#docs', {
  items: docs,
  keys: [{ name: 'title', weight: 3 }, 'tags', 'description'],
  stemming: 'en',  // 'pl' | 'en+pl' | (word) => stem | false; a Polish UI uses 'en+pl'
  fuzzy: false,    // only to show word forms on their own
});`,
    mount(frame) {
      const tries = ['filtering', 'keyboards', 'searching', 'styled', 'shortcuts'];
      frame.innerHTML = `<div class="try" style="margin-bottom:12px">${tries.map((t) => `<button data-q="${t}">${t}</button>`).join('')}<span class="try-l" style="margin-left:8px">Stemming</span><div class="seg" id="exStemSeg"><button data-v="en" class="on">On</button><button data-v="off">Off</button></div></div><div id="exStem"></div>`;
      const s = createSearch('#exStem', { ...dataOpts('docs'), facets: [], sorts: [], layout: 'list', layouts: ['list', 'compact'], pageSize: 4, hotkey: false, navigate: false, theme: siteTheme(), fuzzy: false, stemming: 'en' });
      frame.querySelector('.try').addEventListener('click', (e) => {
        const q = e.target.closest('[data-q]');
        if (q) s.setQuery(q.dataset.q, { submit: true });
        const v = e.target.closest('#exStemSeg [data-v]');
        if (v) {
          frame.querySelectorAll('#exStemSeg button').forEach((b) => b.classList.toggle('on', b === v));
          s.setOptions({ stemming: v.dataset.v === 'en' ? 'en' : false });
        }
      });
      s.setQuery('filtering', { submit: true });
      return s;
    },
  },
  {
    id: 'headless', type: 'Product', ownOut: true, group: 'Search', title: 'Engine without UI',
    desc: 'createIndex() gives you search, suggest, correct and highlight for your own components, or for Node.',
    code: `import { createIndex, highlight } from '@iconix/search';

const idx = createIndex(products, { keys: [{ name: 'title', weight: 3 }, 'brand', 'tags'] });

input.addEventListener('input', () => {
  const { hits, total, took, didYouMean } = idx.search(input.value, { limit: 6 });
  list.innerHTML = hits.map((h) => \`<li>\${highlight(h.item.title, input.value)}<small>\${h.score.toFixed(2)}</small></li>\`).join('');
});

idx.suggest('blu');   // [{ text: 'bluetooth', type: 'completion', count: 6 }]
idx.correct('spekr'); // 'speaker'`,
    mount(frame, out) {
      frame.innerHTML = '<input class="hl-input" placeholder="Type to search with the engine only…" value="blutooth"><ul class="hl-list"></ul>';
      const idx = createIndex(products, { keys: DATASETS.products.keys });
      const input = frame.querySelector('input');
      const listEl = frame.querySelector('ul');
      const runIt = () => {
        const q = input.value;
        const r = idx.search(q, { limit: 6 });
        listEl.innerHTML = r.hits.map((h) => `<li><span>${highlight(h.item.title, q)}</span><small>score ${h.score.toFixed(2)}</small></li>`).join('') || '<li>No results</li>';
        const sug = idx.suggest(q, { limit: 3 }).map((s) => s.text);
        out.textContent = `total: ${r.total} · took: ${r.took.toFixed(2)} ms\nsuggest: ${JSON.stringify(sug)}${r.didYouMean ? `\ndidYouMean: "${r.didYouMean}"` : ''}`;
      };
      input.addEventListener('input', runIt);
      runIt();
      return null;
    },
  },
];
// ---------------------------------------------------------------- TypeScript versions of the examples
const TS_TYPES = {
  Product: `interface Product {
  id: string;
  title: string;
  brand: string;
  category: string;
  price: number;
  rating: number;
  tags: string[];
  description: string;
  icon: string; // SVG markup
  color: string;
  url: string;
  isNew?: boolean;
}`,
  Doc: `interface Doc {
  id: string;
  title: string;
  section: string;
  description: string;
  tags: string[];
  icon: string; // SVG markup
  url: string;
  read: string;
  updated: string; // ISO date
}`,
  Person: `interface Person {
  id: string;
  name: string;
  team: string;
  role: string;
  city: string;
  skills: string[];
  color: string;
  email: string;
  since: number;
}`,
};
const DATA_VAR = { Product: 'products', Doc: 'docs', Person: 'people' };
function toTS(ex) {
  const T = ex.type;
  let code = ex.code.replace(/createSearch\(/g, `createSearch<${T}>(`).replace(/createIndex\((\w+),/g, `createIndex<${T}>($1,`);
  const lines = [];
  if (!/^import /m.test(code)) lines.push("import { createSearch } from '@iconix/search';");
  else code = code.replace(/^(import .*\n)+\n?/m, (m) => { lines.push(m.trim()); return ''; });
  lines.push('', TS_TYPES[T], '', `declare const ${DATA_VAR[T]}: ${T}[];`);
  if (ex.id === 'headless') lines.push('declare const input: HTMLInputElement;', 'declare const list: HTMLUListElement;');
  if (ex.id === 'palette') lines.push('declare const router: { push(url: string): void };');
  if (ex.id === 'autocomplete') lines.push('declare const form: HTMLFormElement & { assignee: HTMLInputElement };');
  return `${lines.join('\n')}\n\n${code}`;
}
const withCss = (ex, code) => (ex.css ? `${code}\n\n${ex.css}` : code);

/** What the search understood: shown under examples that have no output of their own. */
function describeSearch({ query, total, filters, result }) {
  const p = result.parsed || {};
  const rows = [`query     "${query}"`];
  if (query) {
    const parts = [];
    if (p.terms?.length) parts.push(`words: ${p.terms.join(', ')}`);
    if (p.phrases?.length) parts.push(`phrase: "${p.phrases.join('", "')}"`);
    if (p.exclude?.length) parts.push(`without: ${p.exclude.join(', ')}`);
    for (const [k, v] of Object.entries(p.fields || {})) parts.push(`${k} = ${v.join(', ')}`);
    rows.push(`parsed    ${parts.join(' · ') || '(nothing to match)'}`);
  }
  const f = Object.entries(filters || {}).map(([k, v]) => `${k} = ${[].concat(v).join(' | ')}`);
  if (f.length) rows.push(`filters   ${f.join(' · ')}`);
  rows.push(`results   ${total}${result.took != null ? ` in ${result.took.toFixed(1)} ms` : ''}${result.didYouMean ? ` · did you mean "${result.didYouMean}"?` : ''}`);
  return rows.join('\n');
}

let exCurrent = null;
let exRender = null;
addLangTabs($('#exCode'));
const exOut = document.createElement('div');
exOut.className = 'ex-out';
const groups = [...new Set(EXAMPLES.map((e) => e.group))];
$('#exList').innerHTML = groups.map((g) => `<div class="ex-g">${g}</div>${EXAMPLES.filter((e) => e.group === g).map((e) => `<button data-ex="${e.id}">${esc(e.title)}</button>`).join('')}`).join('');
function showExample(id) {
  const ex = EXAMPLES.find((e) => e.id === id) || EXAMPLES[0];
  exCurrent?.destroy?.();
  $$('#exList button').forEach((b) => b.classList.toggle('on', b.dataset.ex === ex.id));
  $('#exTitle').textContent = ex.title;
  $('#exDesc').textContent = ex.desc;
  const renderCode = () => {
    const code = withCss(ex, codeLang === 'ts' ? toTS(ex) : ex.code);
    $('#exCode').innerHTML = hl(code);
    $('#exCopy').onclick = (e) => copy(code, e.currentTarget);
  };
  if (exRender) codeRenderers.delete(exRender);
  exRender = onLangChange(renderCode);
  renderCode();
  const frame = $('#exFrame');
  exOut.textContent = '';
  exCurrent = ex.mount(frame, exOut);
  if (exCurrent) {
    track(exCurrent);
    if (!ex.ownSelect) openOnClick(exCurrent);
    if (!ex.ownOut) {
      exCurrent.on('search', (d) => { exOut.textContent = describeSearch(d); });
      if (exCurrent.getResults()) exOut.textContent = describeSearch({ query: exCurrent.getQuery(), total: exCurrent.getResults().total, filters: exCurrent.getFilters(), result: exCurrent.getResults() });
    }
  }
  frame.appendChild(exOut);
}
$('#exList').addEventListener('click', (e) => { const b = e.target.closest('[data-ex]'); if (b) showExample(b.dataset.ex); });

// ---------------------------------------------------------------- features
$('#featGrid').innerHTML = FEATURES.map(([ic, t, d]) => `<div class="tool"><div class="tool-h"><span class="tool-i">${icon(ic, 17)}</span><h4>${t}</h4></div><p>${d}</p></div>`).join('');

// ---------------------------------------------------------------- usage
const USAGE = {
  React: ['jsx', 'Works in Vite, CRA and Next.js (the entry carries "use client").', `import { Search } from '@iconix/search/react';
import '@iconix/search/css';

export default function ProductSearch({ products }) {
  return (
    <Search
      items={products}
      keys={[{ name: 'title', weight: 3 }, 'brand', 'tags']}
      fields={{ title: 'title', subtitle: 'brand', image: 'image', badge: 'category', meta: (p) => \`$\${p.price}\`, url: 'url' }}
      facets={['category', 'brand']}
      layout="cards"
      onSelect={({ item }) => console.log(item)}
    />
  );
}`],
  Vue: ['vue', 'Vue 3.3+. In Nuxt, wrap it in <ClientOnly>.', `<script setup>
import { ref } from 'vue';
import { IxSearch } from '@iconix/search/vue';
import '@iconix/search/css';

const query = ref('');
const props = defineProps({ docs: Array });
</script>

<template>
  <IxSearch v-model="query" :items="docs" :keys="['title', 'tags', 'body']" layout="list" @select="({ item }) => open(item)" />
  <p>Searching for: {{ query }}</p>
</template>`],
  'Web Component': ['html', 'For plain HTML, Svelte, Angular or a CMS. Events are DOM events prefixed with ixs:.', `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@iconix/search/src/search.css">
<script type="module" src="https://cdn.jsdelivr.net/npm/@iconix/search/src/element.js/+esm"></script>

<ixs-search id="s" layout="grid" placeholder="Search icons"></ixs-search>

<script type="module">
  const el = document.getElementById('s');
  el.options = { items: await (await fetch('/items.json')).json(), keys: ['title', 'tags'] };
  el.addEventListener('ixs:select', (e) => console.log(e.detail.item));
</script>`],
  Vanilla: ['js', 'No framework: one function, one element.', `import { createSearch } from '@iconix/search';
import '@iconix/search/css';

const search = createSearch('#search', {
  items,
  keys: ['title', 'tags'],
  layout: 'list',
  facets: ['type'],
});

search.on('select', ({ item }) => location.assign(item.url));
search.setQuery('getting started');`],
  Engine: ['js', 'Only the index, for your own UI or Node scripts.', `import { createIndex } from '@iconix/search/engine';

const idx = createIndex(items, { keys: [{ name: 'title', weight: 3 }, 'body'], facets: ['type'] });
const { hits, facets, didYouMean } = idx.search('instal guide', { filters: { type: ['doc'] }, limit: 10 });`],
};
const USAGE_TS = {
  React: ['tsx', `import { Search } from '@iconix/search/react';
import '@iconix/search/css';

interface Product {
  id: string;
  title: string;
  brand: string;
  category: string;
  image: string;
  price: number;
  url: string;
}

export default function ProductSearch({ products }: { products: Product[] }) {
  return (
    <Search
      items={products}
      keys={[{ name: 'title', weight: 3 }, 'brand', 'tags']}
      fields={{ title: 'title', subtitle: 'brand', image: 'image', badge: 'category', meta: (p: Product) => \`$\${p.price}\`, url: 'url' }}
      facets={['category', 'brand']}
      layout="cards"
      onSelect={({ item }: { item: Product }) => console.log(item.title)}
    />
  );
}`],
  Vue: ['vue', `<script setup lang="ts">
import { ref } from 'vue';
import { IxSearch } from '@iconix/search/vue';
import '@iconix/search/css';

interface Doc { id: string; title: string; tags: string[]; body: string; url: string }

const query = ref('');
defineProps<{ docs: Doc[] }>();
const open = (doc: Doc) => window.location.assign(doc.url);
</script>

<template>
  <IxSearch v-model="query" :items="docs" :keys="['title', 'tags', 'body']" layout="list" @select="({ item }) => open(item)" />
  <p>Searching for: {{ query }}</p>
</template>`],
  'Web Component': ['ts', `<!-- index.html -->
<ixs-search id="s" layout="grid" placeholder="Search icons"></ixs-search>

// main.ts
import '@iconix/search/element';
import '@iconix/search/css';
import type { Search, SearchOptions } from '@iconix/search';

interface Icon { id: string; title: string; tags: string[] }
type SearchElement = HTMLElement & { options: SearchOptions<Icon>; api: Search<Icon> };

const el = document.getElementById('s') as SearchElement;
const items: Icon[] = await (await fetch('/items.json')).json();
el.options = { items, keys: ['title', 'tags'] };
el.addEventListener('ixs:select', (e) => console.log((e as CustomEvent<{ item: Icon }>).detail.item));`],
  Vanilla: ['ts', `import { createSearch } from '@iconix/search';
import '@iconix/search/css';

interface Page { id: string; title: string; tags: string[]; type: string; url: string }
declare const items: Page[];

const search = createSearch<Page>('#search', {
  items,
  keys: ['title', 'tags'],
  layout: 'list',
  facets: ['type'],
});

search.on('select', ({ item }: { item: Page }) => location.assign(item.url));
search.setQuery('getting started');`],
  Engine: ['ts', `import { createIndex } from '@iconix/search/engine';

interface Page { id: string; title: string; body: string; type: 'doc' | 'blog' }
declare const items: Page[];

const idx = createIndex<Page>(items, { keys: [{ name: 'title', weight: 3 }, 'body'], facets: ['type'] });
const { hits, facets, didYouMean } = idx.search('instal guide', { filters: { type: ['doc'] }, limit: 10 });
hits[0]?.item.title; // typed as Page`],
};
let usageNow = 'React';
$('#usageTabs').innerHTML = Object.keys(USAGE).map((k) => `<button data-u="${k}" class="${k === usageNow ? 'on' : ''}">${k}</button>`).join('');
const usageCode = () => (codeLang === 'ts' ? USAGE_TS[usageNow] : USAGE[usageNow])[codeLang === 'ts' ? 1 : 2];
function renderUsage() {
  const [lang, note] = USAGE[usageNow];
  const label = { jsx: 'React', vue: 'Vue SFC', html: 'HTML', js: usageNow === 'Engine' ? 'Engine' : 'Vanilla' }[lang];
  $('#usageLang').textContent = `${label} · ${codeLang === 'ts' ? (lang === 'jsx' ? 'TSX' : 'TypeScript') : lang === 'jsx' ? 'JSX' : 'JavaScript'}`;
  $('#usageNote').textContent = note;
  $('#usageCode').innerHTML = hl(usageCode());
  $$('#usageTabs button').forEach((b) => b.classList.toggle('on', b.dataset.u === usageNow));
}
$('#usageTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-u]'); if (b) { usageNow = b.dataset.u; renderUsage(); } });
$('#usageCopy').addEventListener('click', (e) => copy(usageCode(), e.currentTarget));
addLangTabs($('#usageCode'));
onLangChange(renderUsage);

const EVENTS_JS = `const search = createSearch('#search', {
  items,
  onSelect: ({ item, via, preventDefault }) => { preventDefault(); router.push(item.url); },
  onSearch: ({ query, total }) => analytics.track('search', { query, total }),
  onSubmit: ({ query }) => console.log('Enter pressed:', query),
});

search.on('filter', ({ filters }) => saveToUrl(filters));`;
const EVENTS_TS = `import { createSearch, type Filters } from '@iconix/search';

interface Page { id: string; title: string; url: string }
declare const items: Page[];
declare const router: { push(url: string): void };
declare const analytics: { track(event: string, data: object): void };
declare function saveToUrl(filters: Filters): void;

const search = createSearch<Page>('#search', {
  items,
  onSelect: ({ item, via, preventDefault }) => { preventDefault(); router.push(item.url); },
  onSearch: ({ query, total }) => analytics.track('search', { query, total }),
  onSubmit: ({ query }) => console.log('Enter pressed:', query),
});

search.on('filter', ({ filters }: { filters: Filters }) => saveToUrl(filters));`;
const renderEvents = () => { $('#eventsCode').innerHTML = hl(codeLang === 'ts' ? EVENTS_TS : EVENTS_JS); };
$('#eventsCopy').addEventListener('click', (e) => copy(codeLang === 'ts' ? EVENTS_TS : EVENTS_JS, e.currentTarget));
addLangTabs($('#eventsCode'));
onLangChange(renderEvents);
renderEvents();

// ---------------------------------------------------------------- CLI + reference tables
$('#cliDemo').innerHTML = hl(`$ npx iconix-search query products.json "wireles hedphones"
2 results for “wireles hedphones” · 0.4 ms
  1  Wireless Headphones Pro  #p1 · 6.21
  2  Studio Monitor Headphones  #p2 · 1.88

$ npx iconix-search query products.json usb-c --filter "price<=100" --sort -price --limit 3
$ npx iconix-search suggest products.json blu
› bluetooth  5
$ npx iconix-search facets products.json --by category,brand
$ npx iconix-search stats products.json --json`).replace(/\$ /g, '<span class="tk-c">$ </span>');
$('#cliTable tbody').innerHTML = CLI.map(([c, d]) => `<tr><td>${c}</td><td>${d}</td></tr>`).join('');
$('#optsTable tbody').innerHTML = OPT_DOCS.map(([k, def, d]) => `<tr><td>${k}</td><td>${esc(def)}</td><td>${d}</td></tr>`).join('');
$('#apiTable tbody').innerHTML = API.map(([k, d]) => `<tr><td>${k}</td><td>${d}</td></tr>`).join('');
$('#eventsTable tbody').innerHTML = EVENTS.map(([k, d]) => `<tr><td>${k}</td><td>${d}</td></tr>`).join('');
$('#keysGrid').innerHTML = KEYS.map(([l, ks]) => `<div><span>${l}</span><span>${ks.map((k) => `<kbd>${k}</kbd>`).join('')}</span></div>`).join('');
$('#cssCode').innerHTML = hl(CSS_TOKENS, 'css');

$$('[data-copy]').forEach((b) => b.addEventListener('click', () => copy(b.dataset.copy, b)));

// ---------------------------------------------------------------- go
paintIcons();
setThemeIcon();
renderTabs();
renderSnippet();
showExample('palette');
renderUsage();
void docs;
window.__ixsCode = { toTS, withCss, EXAMPLES, USAGE_TS, EVENTS_TS }; // dev handle for checking the TypeScript samples
