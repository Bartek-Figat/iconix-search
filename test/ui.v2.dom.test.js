import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mount, type, press, tick, window } from './helpers/dom.js';

const items = [
  { id: 1, title: 'Run club shoes', category: 'Shoes', price: 120 },
  { id: 2, title: 'Trail runner', category: 'Shoes', price: 160 },
  { id: 3, title: 'Running socks', category: 'Socks', price: 15 },
  { id: 4, title: 'Wool socks', category: 'Socks', price: 22 },
  { id: 5, title: 'Water bottle', category: 'Gear', price: 30 },
];
const base = { items, keys: [{ name: 'title', weight: 3 }, 'category'], fields: { title: 'title', badge: 'category', meta: (i) => `$${i.price}` } };
let s;
afterEach(() => { s?.destroy(); s = null; history.replaceState(null, '', '/'); });
const titles = () => [...s.root.querySelectorAll('.ixs-results .ixs-title')].map((e) => e.textContent);
const change = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); };

describe('word forms (stemming)', () => {
  test('"running" finds "Run" and marks it', async () => {
    s = await mount(base);
    await s.setQuery('running');
    assert.ok(titles().includes('Run club shoes'));
    assert.ok([...s.root.querySelectorAll('.ixs-results mark')].some((m) => m.textContent === 'Run'));
  });
  test('Polish UI adds Polish word forms; stemming: false turns it off', async () => {
    s = await mount({ ...base, items: [{ id: 1, title: 'Buty do biegania' }], locale: 'pl' });
    await s.setQuery('butów');
    assert.deepEqual(titles(), ['Buty do biegania']);
    s.destroy();
    s = await mount({ ...base, items: [{ id: 1, title: 'Buty do biegania' }], locale: 'pl', stemming: false, fuzzy: false });
    await s.setQuery('butów');
    assert.deepEqual(titles(), []);
  });
});

describe('range filter', () => {
  test('min / max inputs filter, show the data range and clear', async () => {
    s = await mount({ ...base, facets: [{ key: 'price', type: 'range', label: 'Price', prefix: '$' }, 'category'] });
    const q = (b) => s.root.querySelector(`[data-range="price"][data-bound="${b}"]`);
    assert.equal(q('min').placeholder, '15');
    assert.equal(q('max').placeholder, '160');
    assert.equal(s.root.querySelector('.ixs-num-p').textContent, '$');
    change(q('min'), '20');
    change(q('max'), '130');
    assert.deepEqual(s.getFilters(), { price: [{ min: 20, max: 130 }] });
    assert.deepEqual(titles().sort(), ['Run club shoes', 'Water bottle', 'Wool socks']);
    assert.equal(q('min').value, '20', 'keeps the value after re-render');
    change(q('min'), '');
    change(q('max'), '');
    assert.deepEqual(s.getFilters(), {});
    assert.ok(s.root.querySelector('[data-facet="category"]'), 'value facets still work next to it');
  });
});

describe('grouped results', () => {
  test('groupBy renders titled sections in ranking order', async () => {
    s = await mount({ ...base, groupBy: 'category', layout: 'cards' });
    await s.setQuery('socks');
    assert.deepEqual([...s.root.querySelectorAll('.ixs-gtitle')].map((g) => g.firstChild.textContent), ['Socks']);
    await s.setQuery('');
    assert.deepEqual([...s.root.querySelectorAll('.ixs-gtitle')].map((g) => g.textContent), ['Shoes2', 'Socks2', 'Gear1']);
    const g = s.root.querySelector('.ixs-gres');
    assert.equal(g.dataset.layout, 'cards');
    assert.equal(g.getAttribute('role'), 'list');
  });
  test('clicks still select the right item inside groups', async () => {
    s = await mount({ ...base, groupBy: (i) => (i.price > 50 ? 'Premium' : 'Budget') });
    const seen = [];
    s.on('select', ({ item }) => seen.push(item.id));
    s.root.querySelectorAll('.ixs-gsec')[1].querySelector('.ixs-item').click();
    assert.equal(seen.length, 1);
    assert.ok([3, 4, 5].includes(seen[0]), 'a budget item');
  });
  test('table layout ignores grouping', async () => {
    s = await mount({ ...base, groupBy: 'category', layout: 'table' });
    assert.equal(s.root.querySelector('.ixs-gsec'), null);
    assert.ok(s.root.querySelector('table'));
  });
});

describe('URL state', () => {
  test('reads the query, filters, sort and layout from the address', async () => {
    history.replaceState(null, '', '/?q=socks&category=Socks&sort=-price&view=compact&price=..20');
    s = await mount({ ...base, url: true, facets: ['category', { key: 'price', type: 'range' }], layouts: ['list', 'compact'] });
    assert.equal(s.getQuery(), 'socks');
    assert.equal(s.el.input.value, 'socks');
    assert.equal(s.getLayout(), 'compact');
    assert.deepEqual(s.getFilters(), { category: ['Socks'], price: [{ max: 20 }] });
    assert.deepEqual(titles(), ['Running socks']);
  });
  test('writes changes back, leaves defaults out, keeps other params', async () => {
    history.replaceState(null, '', '/page?keep=1#top');
    s = await mount({ ...base, url: { prefix: 's.' }, facets: ['category'], sorts: [{ label: 'Price', value: 'price' }] });
    await s.setQuery('socks');
    await s.toggleFilter('category', 'Socks');
    await s.setSort('price');
    s.setLayout('cards');
    const p = new URLSearchParams(location.search);
    assert.equal(p.get('keep'), '1');
    assert.equal(p.get('s.q'), 'socks');
    assert.equal(p.get('s.category'), 'Socks');
    assert.equal(p.get('s.sort'), 'price');
    assert.equal(p.get('s.view'), 'cards');
    assert.equal(location.hash, '#top');
    await s.setQuery('');
    await s.clearFilters();
    const after = new URLSearchParams(location.search);
    assert.equal(after.get('s.q'), null);
    assert.equal(after.get('s.category'), null);
  });
  test('popstate re-reads the address', async () => {
    s = await mount({ ...base, url: true });
    history.replaceState(null, '', '/?q=bottle');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
    await tick();
    assert.equal(s.getQuery(), 'bottle');
    assert.deepEqual(titles(), ['Water bottle']);
  });
});

describe('phone full-screen mode', () => {
  const focus = () => s.el.input.dispatchEvent(new window.Event('focus'));
  test('focus opens it, the back button and Escape close it', async () => {
    s = await mount({ ...base, fullscreen: true });
    const changes = [];
    s.on('fullscreen', ({ open }) => changes.push(open));
    s.el.input.focus();
    focus();
    assert.ok(s.root.classList.contains('ixs-fs'));
    assert.ok(document.documentElement.classList.contains('ixs-fs-lock'), 'the page behind does not scroll');
    s.root.querySelector('.ixs-back').click();
    assert.ok(!s.root.classList.contains('ixs-fs'));
    assert.ok(!document.documentElement.classList.contains('ixs-fs-lock'));
    focus();
    s.close();
    press(s.el.input, 'Escape');
    assert.ok(!s.root.classList.contains('ixs-fs'));
    assert.deepEqual(changes, [true, false, true, false]);
  });
  test('Enter and picking a result leave full-screen', async () => {
    s = await mount({ ...base, fullscreen: true });
    focus();
    type(s, 'socks');
    press(s.el.input, 'Enter');
    assert.ok(!s.root.classList.contains('ixs-fs'));
    focus();
    type(s, 'wool');
    await tick();
    s.el.pop.querySelector('[data-type="hit"]').click();
    assert.ok(!s.root.classList.contains('ixs-fs'));
  });
  test('fullscreen "auto" stays off without a phone-sized screen, and never in palette mode', async () => {
    s = await mount(base);
    focus();
    assert.ok(!s.root.classList.contains('ixs-fs'));
    s.destroy();
    s = await mount({ ...base, mode: 'palette', fullscreen: true });
    s.openPalette();
    assert.ok(!s.root.classList.contains('ixs-fs'));
  });
});

describe('infinite scroll', () => {
  test('loads the next page when "Show more" becomes visible', async () => {
    let cb;
    globalThis.IntersectionObserver = class { constructor(fn) { cb = fn; } observe() {} disconnect() {} };
    try {
      s = await mount({ ...base, pageSize: 2, infinite: true });
      assert.equal(titles().length, 2);
      cb([{ isIntersecting: true }]);
      assert.equal(titles().length, 4);
      cb([{ isIntersecting: true }]);
      assert.equal(titles().length, 5);
      assert.equal(s.root.querySelector('[data-more]'), null);
    } finally { delete globalThis.IntersectionObserver; }
  });
});
