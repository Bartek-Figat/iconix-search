import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mount, type, press, tick } from './helpers/dom.js';

const items = [
  { id: 1, title: 'Wireless Headphones Pro', brand: 'Sony', category: 'Audio', tags: ['bluetooth', 'noise cancelling'], price: 299, description: 'Over-ear headphones with 30 hours of battery.', url: '/p/1' },
  { id: 2, title: 'Wired Earbuds', brand: 'JBL', category: 'Audio', tags: ['wired'], price: 39, description: 'Small and light.' },
  { id: 3, title: 'Mechanical Keyboard', brand: 'Keychron', category: 'Input', tags: ['wireless', 'rgb'], price: 120, description: 'Hot-swappable switches.' },
  { id: 4, title: 'Bluetooth Speaker', brand: 'JBL', category: 'Audio', tags: ['bluetooth', 'waterproof'], price: 89, description: 'Loud and waterproof.' },
  { id: 5, title: 'Wireless Mouse', brand: 'Logitech', category: 'Input', tags: ['wireless'], price: 49, description: 'Silent clicks.' },
];
const base = {
  items,
  keys: [{ name: 'title', weight: 3 }, 'brand', 'tags', 'description'],
  fields: { title: 'title', subtitle: 'brand', description: 'description', badge: 'category', tags: 'tags', meta: (it) => `$${it.price}`, url: 'url' },
  facets: [{ key: 'category', label: 'Category' }, { key: 'brand', label: 'Brand' }],
  sorts: [{ label: 'Price ↑', value: 'price' }, { label: 'Price ↓', value: '-price' }],
};
let s;
afterEach(() => { s?.destroy(); s = null; });
const titles = () => [...s.root.querySelectorAll('.ixs-results .ixs-title')].map((e) => e.textContent);
const options = () => [...s.el.pop.querySelectorAll('[data-o]')];

describe('box + suggestions', () => {
  test('renders an accessible combobox', async () => {
    s = await mount(base);
    const input = s.el.input;
    assert.equal(input.getAttribute('role'), 'combobox');
    assert.equal(input.getAttribute('aria-controls'), s.el.pop.id);
    assert.equal(input.getAttribute('aria-expanded'), 'false');
    assert.equal(s.el.pop.getAttribute('role'), 'listbox');
  });

  test('typing shows completions and top hits, and filters results live', async () => {
    s = await mount(base);
    type(s, 'wirel');
    await tick();
    assert.equal(s.el.input.getAttribute('aria-expanded'), 'true');
    const types = options().map((o) => o.dataset.type);
    assert.ok(types.includes('suggest'), 'has suggestions');
    assert.ok(types.includes('hit'), 'has hits');
    assert.ok(!types.includes('submit'), 'no search-for row: Enter does that');
    assert.ok(s.el.pop.hasAttribute('data-split'), 'suggestions and results side by side');
    assert.match(s.el.pop.textContent, /wireless/i);
    // exact prefix matches first; "Wired" only as a one-typo match after them
    assert.deepEqual(titles().slice(0, 3).sort(), ['Mechanical Keyboard', 'Wireless Headphones Pro', 'Wireless Mouse']);
    assert.ok(s.root.querySelector('.ixs-results mark'), 'matches highlighted');
  });

  test('ghost completion is accepted with Tab', async () => {
    s = await mount(base);
    type(s, 'blue');
    await tick();
    assert.equal(s.root.querySelector('.ixs-ghost-rest').textContent.length > 0, true);
    press(s.el.input, 'Tab');
    assert.match(s.getQuery(), /^bluetooth/);
  });

  test('arrow keys move the active option and Enter picks it', async () => {
    s = await mount(base);
    type(s, 'speak');
    await tick();
    press(s.el.input, 'ArrowDown');
    assert.equal(s.state.active, 0);
    assert.equal(s.el.input.getAttribute('aria-activedescendant'), options()[0].id);
    press(s.el.input, 'ArrowUp');
    assert.equal(s.state.active, options().length - 1, 'wraps to the end');
    const picked = [];
    s.on('select', ({ item }) => picked.push(item.id));
    // move to the first hit
    const hitIdx = options().findIndex((o) => o.dataset.type === 'hit');
    s._setActive(hitIdx);
    press(s.el.input, 'Enter');
    assert.deepEqual(picked, [4]);
    assert.equal(s.state.open, false);
  });

  test('picking a result without a url puts its title in the box', async () => {
    s = await mount({ ...base, fields: { ...base.fields, url: null } });
    type(s, 'mouse');
    await tick();
    const i = options().findIndex((o) => o.dataset.type === 'hit');
    options()[i].click();
    assert.equal(s.getQuery(), 'Wireless Mouse');
    assert.equal(s.state.open, false);
    assert.deepEqual(titles(), ['Wireless Mouse']);
  });

  test('preventDefault() stops navigation but the chosen item still fills the box', async () => {
    s = await mount({ ...base, results: false, onSelect: ({ preventDefault }) => preventDefault() });
    type(s, 'mouse');
    await tick();
    options().find((o) => o.dataset.type === 'hit').click();
    assert.equal(s.getQuery(), 'Wireless Mouse');
  });

  test('items without image or icon get initials', async () => {
    s = await mount({ items: [{ id: 1, name: 'Ada Nowak' }], keys: ['name'], fields: { title: 'name' }, layout: 'grid' });
    assert.equal(s.root.querySelector('.ixs-cover .ixs-initial').textContent, 'AN');
  });

  test('a title completion is not repeated when the same item is a result', async () => {
    s = await mount(base);
    type(s, 'bluetooth sp');
    await tick();
    const phrases = options().filter((o) => o.dataset.type === 'suggest' && /Bluetooth Speaker/.test(o.textContent));
    assert.equal(phrases.length, 0);
  });

  test('one letter does not complete to random words', async () => {
    s = await mount(base);
    type(s, 'w');
    await tick();
    assert.equal(options().filter((o) => o.dataset.type === 'suggest').length, 0);
    assert.ok(options().some((o) => o.dataset.type === 'hit'));
  });

  test('Escape closes, then clears', async () => {
    s = await mount(base);
    type(s, 'jbl');
    await tick();
    press(s.el.input, 'Escape');
    assert.equal(s.state.open, false);
    assert.equal(s.getQuery(), 'jbl');
    press(s.el.input, 'Escape');
    assert.equal(s.getQuery(), '');
  });

  test('Enter submits and stores a recent search, shown on an empty box', async () => {
    s = await mount(base);
    const subs = [];
    s.on('submit', ({ query }) => subs.push(query));
    type(s, 'keyboard');
    press(s.el.input, 'Enter');
    assert.deepEqual(subs, ['keyboard']);
    assert.deepEqual(s.getRecent(), ['keyboard']);
    type(s, '');
    await tick();
    const rec = options().filter((o) => o.dataset.type === 'recent');
    assert.equal(rec.length, 1);
    rec[0].querySelector('[data-rm]').click();
    assert.deepEqual(s.getRecent(), []);
  });

  test('popular searches on focus, clicking one runs it', async () => {
    s = await mount({ ...base, popular: ['bluetooth', 'mouse'] });
    s.el.input.focus();
    s.el.input.dispatchEvent(new Event('focus'));
    const pop = options().filter((o) => o.dataset.type === 'popular');
    assert.equal(pop.length, 2);
    pop[1].click();
    assert.equal(s.getQuery(), 'mouse');
    assert.deepEqual(titles(), ['Wireless Mouse']);
  });

  test('custom suggest() replaces built-in completions', async () => {
    s = await mount({ ...base, suggest: (q) => [`${q} deals`, `${q} reviews`] });
    type(s, 'mouse');
    await tick();
    const texts = options().filter((o) => o.dataset.type === 'suggest').map((o) => o.textContent.trim());
    assert.deepEqual(texts, ['mouse deals', 'mouse reviews']);
  });

  test('/ focuses the box, but not while typing elsewhere', async () => {
    s = await mount(base);
    const other = document.createElement('input');
    document.body.appendChild(other);
    other.focus();
    press(other, '/');
    assert.notEqual(document.activeElement, s.el.input);
    other.blur();
    press(document.body, '/');
    assert.equal(document.activeElement, s.el.input);
    other.remove();
  });
});

describe('results panel', () => {
  test('all six layouts render items', async () => {
    s = await mount(base);
    for (const l of ['list', 'cards', 'grid', 'compact', 'media', 'table']) {
      s.setLayout(l);
      assert.equal(s.root.dataset.layout, l);
      assert.equal(s.root.querySelectorAll('.ixs-results .ixs-item').length, 5, l);
      assert.ok(s.root.querySelector(`[data-layout-btn="${l}"].on`), `${l} button active`);
    }
  });

  test('layout buttons switch layouts and emit', async () => {
    s = await mount(base);
    const seen = [];
    s.on('layout', ({ layout }) => seen.push(layout));
    s.root.querySelector('[data-layout-btn="cards"]').click();
    assert.equal(s.getLayout(), 'cards');
    assert.ok(s.root.querySelector('.ixs-cards-item .ixs-cover'));
    assert.deepEqual(seen, ['cards']);
  });

  test('facet chips filter with counts, clear filters resets', async () => {
    s = await mount(base);
    const chip = s.root.querySelector('[data-facet="brand"][data-value="JBL"]');
    assert.match(chip.textContent, /2/);
    chip.click();
    assert.deepEqual(titles().sort(), ['Bluetooth Speaker', 'Wired Earbuds']);
    assert.ok(s.root.querySelector('[data-facet="brand"][data-value="JBL"].on'));
    // other brand counts stay visible (disjunctive facets)
    assert.ok(s.root.querySelector('[data-facet="brand"][data-value="Sony"]'));
    s.root.querySelector('[data-clear-filters]').click();
    assert.equal(titles().length, 5);
  });

  test('sort select orders results', async () => {
    s = await mount(base);
    let sel = s.root.querySelector('.ixs-sort');
    sel.value = '-price';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    assert.equal(titles()[0], 'Wireless Headphones Pro');
    sel = s.root.querySelector('.ixs-sort');
    assert.equal(sel.value, '-price', 'keeps the selection after re-render');
    sel.value = 'price';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    assert.equal(titles()[0], 'Wired Earbuds');
  });

  test('table headers sort', async () => {
    s = await mount({ ...base, layout: 'table', columns: [{ key: 'title', label: 'Name', sortable: true }, { key: 'price', label: 'Price', sortable: true }] });
    s.root.querySelector('th[data-sort="price"]').click();
    assert.equal(titles()[0], 'Wired Earbuds');
    s.root.querySelector('th[data-sort="price"]').click();
    assert.equal(titles()[0], 'Wireless Headphones Pro');
    assert.equal(s.root.querySelector('th[data-sort="price"]').getAttribute('aria-sort'), 'descending');
  });

  test('empty state offers did-you-mean', async () => {
    s = await mount(base);
    await s.setQuery('keybaord mechanicl zzqx');
    const empty = s.root.querySelector('.ixs-empty');
    assert.ok(empty);
    const dym = empty.querySelector('[data-dym]');
    assert.ok(dym, 'has a correction');
    dym.click();
    assert.ok(titles().length >= 1);
  });

  test('show more pages through results', async () => {
    s = await mount({ ...base, pageSize: 2 });
    assert.equal(titles().length, 2);
    s.root.querySelector('[data-more]').click();
    assert.equal(titles().length, 4);
    s.root.querySelector('[data-more]').click();
    assert.equal(titles().length, 5);
    assert.equal(s.root.querySelector('[data-more]'), null);
  });

  test('clicking a result emits select', async () => {
    s = await mount({ ...base, fields: { ...base.fields, url: null } });
    const seen = [];
    s.on('select', ({ item, via }) => seen.push([item.id, via]));
    s.root.querySelectorAll('.ixs-results .ixs-item')[1].click();
    assert.deepEqual(seen, [[2, 'results']]);
  });

  test('renderItem replaces the markup, user text stays escaped', async () => {
    s = await mount({ ...base, items: [...items, { id: 9, title: '<img src=x onerror=alert(1)>', brand: 'X', category: 'Audio', price: 1 }], renderItem: (hit, { highlight }) => `<b class="custom">${highlight(hit.item.title)}</b>` });
    assert.equal(s.root.querySelectorAll('.custom').length, 6);
    assert.equal(s.root.querySelector('.ixs-results img'), null);
  });

  test('javascript: urls are neutralized', async () => {
    s = await mount({ ...base, items: [{ id: 1, title: 'Bad', url: 'javascript:alert(1)' }] });
    assert.equal(s.root.querySelector('.ixs-results a').getAttribute('href'), '#');
  });

  test('theme, density, accent and classNames', async () => {
    s = await mount({ ...base, theme: 'dark', density: 'compact', accent: '#db2777', classNames: { root: 'r', item: 'it', chip: 'ch' } });
    assert.equal(s.root.dataset.theme, 'dark');
    assert.equal(s.root.dataset.density, 'compact');
    assert.equal(s.root.style.getPropertyValue('--ixs-accent'), '#db2777');
    assert.ok(s.root.classList.contains('r'));
    assert.ok(s.root.querySelector('.ixs-item.it'));
    assert.ok(s.root.querySelector('.ixs-chip.ch'));
    s.setOptions({ theme: 'light' });
    assert.equal(s.root.dataset.theme, 'light');
  });

  test('Polish strings and plural forms', async () => {
    s = await mount({ ...base, locale: 'pl-PL' });
    assert.equal(s.el.input.placeholder, 'Szukaj…');
    await s.setQuery('wireless');
    assert.match(s.root.querySelector('.ixs-count').textContent, /3 wyniki dla „wireless”/);
  });

  test('instant: false only updates results on Enter', async () => {
    s = await mount({ ...base, instant: false });
    type(s, 'mouse');
    await tick();
    assert.equal(titles().length, 5);
    press(s.el.input, 'Enter');
    assert.deepEqual(titles(), ['Wireless Mouse']);
  });
});

describe('async source', () => {
  test('calls source, aborts stale requests and renders', async () => {
    const calls = [];
    s = await mount({
      ...base,
      items: [],
      source: (q, { signal }) => new Promise((res) => {
        calls.push(q);
        setTimeout(() => res(signal?.aborted ? [] : items.filter((i) => i.title.toLowerCase().includes(q.toLowerCase()))), 5);
      }),
    });
    await tick(20);
    type(s, 'w');
    type(s, 'wired');
    await tick(200);
    assert.equal(calls.at(-1), 'wired');
    assert.deepEqual(titles(), ['Wired Earbuds']);
    assert.equal(s.state.loading, false);
  });

  test('cosmetic option changes do not call the server again', async () => {
    const calls = [];
    s = await mount({ ...base, items: [], source: async (q) => { calls.push(q); return items; } });
    await tick(20);
    const n = calls.length;
    await s.setOptions({ theme: 'dark', accent: '#db2777', density: 'compact' });
    s.setLayout('cards');
    await tick(20);
    assert.equal(calls.length, n);
    assert.equal(s.root.dataset.theme, 'dark');
    await s.setOptions({ filters: { brand: ['JBL'] } });
    await tick(20);
    assert.equal(calls.length, n + 1, 'filters do');
  });

  test('errors show an error state', async () => {
    s = await mount({ ...base, items: [], source: async () => { throw new Error('boom'); } });
    const errs = [];
    s.on('error', ({ error }) => errs.push(error.message));
    await s.setQuery('x');
    assert.deepEqual(errs.slice(-1), ['boom']);
    assert.match(s.root.querySelector('.ixs-empty').textContent, /failed/);
  });
});

describe('palette mode', () => {
  test('Ctrl+K opens a dialog with hits, Esc closes it', async () => {
    s = await mount({ ...base, mode: 'palette' });
    assert.ok(s.el.trigger);
    assert.equal(s.el.modal.hidden, true);
    press(document.body, 'k', { ctrlKey: true });
    assert.equal(s.el.modal.hidden, false);
    assert.equal(document.activeElement, s.el.input);
    type(s, 'mouse');
    await tick();
    assert.ok(options().some((o) => o.dataset.type === 'hit'));
    press(s.el.input, 'Escape');
    assert.equal(s.el.modal.hidden, true);
  });
});
