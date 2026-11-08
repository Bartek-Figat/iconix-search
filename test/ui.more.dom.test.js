import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mount, type, press, tick, window } from './helpers/dom.js';

const items = [
  { id: 1, title: 'Wireless Headphones', brand: 'Sony', category: 'Audio', price: 299, icon: 'star', tags: ['bt'] },
  { id: 2, title: 'Wired Earbuds', brand: 'JBL', category: 'Audio', price: 39, image: 'https://example.com/e.png' },
  { id: 3, title: 'Mechanical Keyboard', brand: 'Keychron', category: 'Input', price: 120, icon: '<svg class="own"></svg>' },
  { id: 4, title: 'Bluetooth Speaker', brand: 'JBL', category: 'Audio', price: 89 },
  { id: 5, title: 'Wireless Mouse', brand: 'Logitech', category: 'Input', price: 49 },
];
const base = {
  items,
  keys: [{ name: 'title', weight: 3 }, 'brand', 'tags'],
  fields: { title: 'title', subtitle: 'brand', badge: 'category', icon: 'icon', image: 'image', meta: (i) => `$${i.price}` },
  facets: ['category', 'brand'],
  sorts: [{ label: 'Cheapest', value: 'price' }],
};
let s;
afterEach(() => { s?.destroy(); s = null; });
const options = () => [...s.el.pop.querySelectorAll('[data-o]')];
const titles = () => [...s.root.querySelectorAll('.ixs-results .ixs-title')].map((e) => e.textContent);

describe('keyboard', () => {
  test('Home / End jump to the first / last option', async () => {
    s = await mount(base);
    type(s, 'wire');
    await tick();
    press(s.el.input, 'ArrowDown');
    press(s.el.input, 'End');
    assert.equal(s.state.active, options().length - 1);
    press(s.el.input, 'Home');
    assert.equal(s.state.active, 0);
  });
  test('ArrowDown on a closed box opens it', async () => {
    s = await mount(base);
    type(s, 'wire');
    await tick();
    press(s.el.input, 'Escape');
    assert.equal(s.state.open, false);
    press(s.el.input, 'ArrowDown');
    assert.equal(s.state.open, true);
  });
  test('ArrowRight at the end accepts the grey completion without a trailing space', async () => {
    s = await mount(base);
    type(s, 'mech');
    await tick();
    s.el.input.setSelectionRange(4, 4);
    press(s.el.input, 'ArrowRight');
    assert.match(s.getQuery(), /^mechanical/i, 'the best completion (here the full title) is accepted');
  });
  test('Tab on an active suggestion copies it into the box', async () => {
    s = await mount({ ...base, phrases: false });
    type(s, 'wir');
    await tick();
    const i = options().findIndex((o) => o.dataset.type === 'suggest');
    s._setActive(i);
    press(s.el.input, 'Tab');
    assert.match(s.getQuery(), /^wire/);
    assert.equal(s.state.open, true, 'stays open to keep typing');
  });
  test('Shift+Tab is left alone', async () => {
    s = await mount(base);
    type(s, 'mech');
    await tick();
    const ev = new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    s.el.input.dispatchEvent(ev);
    assert.equal(ev.defaultPrevented, false);
    assert.equal(s.getQuery(), 'mech');
  });
  test('keys during IME composition are ignored', async () => {
    s = await mount(base);
    type(s, 'wire');
    await tick();
    s.el.input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
    assert.equal(s.state.open, true);
  });
  test('mod+k hotkey focuses an inline box', async () => {
    s = await mount({ ...base, hotkey: 'mod+k' });
    press(document.body, 'k', { metaKey: true });
    assert.equal(document.activeElement, s.el.input);
  });
  test('hotkey: false ignores / and Ctrl K', async () => {
    s = await mount({ ...base, hotkey: false });
    document.activeElement?.blur?.();
    press(document.body, '/');
    press(document.body, 'k', { ctrlKey: true });
    assert.notEqual(document.activeElement, s.el.input);
  });
  test('Enter / Space on a result card opens it', async () => {
    s = await mount(base);
    const seen = [];
    s.on('select', ({ item }) => seen.push(item.id));
    const card = s.root.querySelector('.ixs-results .ixs-item');
    press(card, 'Enter');
    press(card, ' ');
    assert.deepEqual(seen, [1, 1]);
  });
});

describe('pointer + focus', () => {
  test('hovering an option makes it active', async () => {
    s = await mount(base);
    type(s, 'wire');
    await tick();
    options()[2].dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true }));
    assert.equal(s.state.active, 2);
    assert.equal(options()[2].getAttribute('aria-selected'), 'true');
  });
  test('clicking outside closes the dropdown, clicking inside keeps it', async () => {
    s = await mount(base);
    type(s, 'wire');
    await tick();
    s.el.pop.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    assert.equal(s.state.open, true);
    document.body.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    assert.equal(s.state.open, false);
  });
  test('focus leaving the box closes the dropdown', async () => {
    s = await mount(base);
    type(s, 'wire');
    await tick();
    const other = document.createElement('button');
    document.body.appendChild(other);
    other.focus();
    s.root.dispatchEvent(new window.FocusEvent('focusout', { relatedTarget: other, bubbles: true }));
    await tick();
    assert.equal(s.state.open, false);
    other.remove();
  });
  test('clear button empties the box and keeps focus', async () => {
    s = await mount(base);
    type(s, 'wire');
    await tick();
    assert.equal(s.el.clear.hidden, false);
    s.el.clear.click();
    assert.equal(s.getQuery(), '');
    assert.equal(s.el.clear.hidden, true);
    assert.equal(document.activeElement, s.el.input);
  });
});

describe('dropdown content', () => {
  test('nothing typed and nothing to show: dropdown stays closed', async () => {
    s = await mount({ ...base, recent: false, popular: [] });
    s.el.input.focus();
    s.el.input.dispatchEvent(new window.Event('focus'));
    assert.equal(s.el.pop.hidden, true);
  });
  test('zero results previews what the best suggestion would find', async () => {
    s = await mount({ ...base, suggest: () => ['mouse'] });
    type(s, 'qqqq');
    await tick();
    const head = [...s.el.pop.querySelectorAll('.ixs-group-h')].map((h) => h.textContent).join('|');
    assert.match(head, /Top results · /);
    assert.ok(options().some((o) => o.dataset.type === 'hit'));
  });
  test('recent searches: newest first, no duplicates, capped, clear all', async () => {
    s = await mount({ ...base, maxRecent: 2 });
    for (const q of ['one', 'two', 'One ', 'three']) { type(s, q); press(s.el.input, 'Enter'); }
    assert.deepEqual(s.getRecent(), ['three', 'One']);
    s.clearRecent();
    assert.deepEqual(s.getRecent(), []);
  });
  test('recent searches still work when storage throws', async () => {
    const orig = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    try {
      s = await mount(base);
      s.addRecent('kept in memory');
      assert.deepEqual(s.getRecent(), ['kept in memory']);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', orig);
    }
  });
  test('recent: false hides history', async () => {
    s = await mount({ ...base, recent: false });
    s.addRecent('x');
    assert.deepEqual(s.getRecent(), []);
  });
  test('renderSuggestion replaces option markup (null falls back)', async () => {
    s = await mount({ ...base, renderSuggestion: (o) => (o.type === 'hit' ? `<i class="mine">${o.hit.item.title}</i>` : null) });
    type(s, 'wire');
    await tick();
    assert.ok(s.el.pop.querySelector('.mine'));
    assert.ok(options().some((o) => o.dataset.type === 'suggest' && !o.querySelector('.mine')));
  });
  test('suggestionSelect fires when a completion is clicked', async () => {
    s = await mount({ ...base, phrases: false });
    const seen = [];
    s.on('suggestionSelect', (d) => seen.push(d.type));
    type(s, 'blu');
    await tick();
    options().find((o) => o.dataset.type === 'suggest').click();
    assert.deepEqual(seen, ['suggest']);
    assert.equal(s.state.open, false);
  });
  test('suggestions: false still shows result previews', async () => {
    s = await mount({ ...base, suggestions: false });
    type(s, 'wire');
    await tick();
    assert.ok(options().every((o) => o.dataset.type === 'hit'));
  });
  test('user text in suggestions, chips and recent is escaped', async () => {
    const evil = '<img src=x onerror=alert(1)>';
    s = await mount({ ...base, items: [...items, { id: 9, title: evil, brand: evil, category: evil, price: 1 }] });
    s.addRecent(evil);
    s.el.input.focus();
    s.el.input.dispatchEvent(new window.Event('focus'));
    type(s, 'img');
    await tick();
    assert.equal(s.root.querySelector('img[src="x"]'), null);
  });
});

describe('results', () => {
  test('icons: built-in name, own SVG, image, and initials fallback', async () => {
    s = await mount({ ...base, layout: 'list' });
    const thumbs = [...s.root.querySelectorAll('.ixs-results .ixs-thumb')];
    assert.ok(thumbs[0].querySelector('svg.ixs-i'), 'built-in icon');
    assert.ok(thumbs[1].querySelector('img[loading="lazy"]'), 'image');
    assert.ok(thumbs[2].querySelector('svg.own'), 'own svg');
    assert.equal(thumbs[3].querySelector('.ixs-initial').textContent, 'BS', 'initials');
  });
  test('emptyState replaces the empty panel', async () => {
    s = await mount({ ...base, emptyState: ({ query }) => `<p class="mine">Nothing for ${query}</p>` });
    await s.setQuery('zzzzzz');
    assert.match(s.root.querySelector('.ixs-empty .mine').textContent, /zzzzzz/);
  });
  test('setFilters with a range and setSort by label', async () => {
    s = await mount(base);
    await s.setFilters({ price: [{ max: 100 }] });
    assert.deepEqual(titles().sort(), ['Bluetooth Speaker', 'Wired Earbuds', 'Wireless Mouse']);
    await s.setSort('Cheapest');
    assert.equal(titles()[0], 'Wired Earbuds');
    await s.setSort(null);
    assert.equal(s.state.sort, 'relevance');
  });
  test('selected chips stay visible even with zero results', async () => {
    s = await mount(base);
    await s.toggleFilter('brand', 'Sony');
    await s.setQuery('keyboard');
    assert.ok(s.root.querySelector('[data-facet="brand"][data-value="Sony"].on'));
    assert.ok(s.root.querySelector('.ixs-empty [data-clear-filters]'));
  });
  test('setItems / getItems', async () => {
    s = await mount(base);
    await s.setItems([{ id: 7, title: 'Only one' }]);
    assert.deepEqual(s.getItems().map((i) => i.id), [7]);
    assert.deepEqual(titles(), ['Only one']);
  });
  test('minChars waits before searching', async () => {
    s = await mount({ ...base, minChars: 3 });
    type(s, 'wi');
    await tick();
    assert.equal(titles().length, 5, 'still everything');
    type(s, 'wir');
    await tick();
    assert.ok(titles().length < 5);
  });
  test('the live region announces the result count', async () => {
    s = await mount(base);
    await s.setQuery('wireless');
    assert.equal(s.el.sr.getAttribute('aria-live'), 'polite');
    assert.match(s.el.sr.textContent, /2 results for “wireless”/);
  });
  test('layout buttons expose aria-pressed and invalid layouts are ignored', async () => {
    s = await mount(base);
    s.setLayout('nope');
    assert.equal(s.getLayout(), 'list');
    s.setLayout('grid');
    assert.equal(s.root.querySelector('[data-layout-btn="grid"]').getAttribute('aria-pressed'), 'true');
    assert.equal(s.root.querySelector('[data-layout-btn="list"]').getAttribute('aria-pressed'), 'false');
  });
  test('a single layout hides the switcher', async () => {
    s = await mount({ ...base, layouts: ['cards'] });
    assert.equal(s.root.querySelector('.ixs-layouts'), null);
    assert.equal(s.getLayout(), 'cards');
  });
  test('results: false renders no panel', async () => {
    s = await mount({ ...base, results: false });
    assert.equal(s.root.querySelector('.ixs-results'), null);
  });
});

describe('options + lifecycle', () => {
  test('strings override and Polish plurals', async () => {
    const { getStrings } = await import('../src/i18n.js');
    const pl = getStrings('pl-PL');
    assert.equal(pl.count(1, 'x'), '1 wynik dla „x”');
    assert.equal(pl.count(2, 'x'), '2 wyniki dla „x”');
    assert.equal(pl.count(5, 'x'), '5 wyników dla „x”');
    assert.equal(pl.count(12, 'x'), '12 wyników dla „x”');
    assert.equal(pl.count(22, 'x'), '22 wyniki dla „x”');
    assert.equal(pl.count(1), '1 pozycja');
    assert.equal(pl.count(3), '3 pozycje');
    assert.equal(pl.count(7), '7 pozycji');
    assert.equal(getStrings('de').placeholder, 'Search…', 'unknown language falls back to English');
    s = await mount({ ...base, strings: { placeholder: 'Find it' } });
    assert.equal(s.el.input.placeholder, 'Find it');
  });
  test('setOptions with a new placeholder rebuilds but keeps the query', async () => {
    s = await mount(base);
    await s.setQuery('wire');
    await s.setOptions({ placeholder: 'Changed' });
    assert.equal(s.el.input.placeholder, 'Changed');
    assert.equal(s.el.input.value, 'wire');
  });
  test('palette: trigger and scrim open / close, focus returns', async () => {
    s = await mount({ ...base, mode: 'palette', classNames: { modal: 'mm', trigger: 'tt' } });
    assert.ok(s.root.querySelector('.ixs-modal.mm'));
    s.el.trigger.click();
    assert.equal(s.el.modal.hidden, false);
    s.el.modal.querySelector('.ixs-scrim').click();
    assert.equal(s.el.modal.hidden, true);
    assert.equal(document.activeElement, s.el.trigger);
  });
  test('palette: picking a hit closes the dialog', async () => {
    s = await mount({ ...base, mode: 'palette' });
    s.openPalette();
    type(s, 'mouse');
    await tick();
    options().find((o) => o.dataset.type === 'hit').click();
    assert.equal(s.el.modal.hidden, true);
  });
  test('target can be a selector; a missing target throws', async () => {
    const { createSearch } = await import('../src/index.js');
    const host = document.createElement('div');
    host.id = 'here';
    document.body.appendChild(host);
    const x = createSearch('#here', { items });
    assert.ok(host.querySelector('.ixs'));
    x.destroy();
    host.remove();
    assert.throws(() => createSearch('#nowhere'), /not found/);
  });
  test('destroy removes the DOM, listeners and handlers', async () => {
    s = await mount({ ...base, hotkey: '/' });
    const root = s.root;
    let destroyed = 0;
    s.on('destroy', () => destroyed++);
    s.destroy();
    assert.equal(root.isConnected, false);
    assert.equal(destroyed, 1);
    press(document.body, '/');
    s = null;
  });
  test('off() removes a listener and * receives every event', async () => {
    s = await mount(base);
    const all = [];
    const fn = () => all.push('x');
    s.on('search', fn);
    s.on('*', (name) => all.push(name));
    s.off('search', fn);
    await s.setQuery('wire');
    assert.ok(!all.includes('x'));
    assert.ok(all.includes('search'));
  });
});
