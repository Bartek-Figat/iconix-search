import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createIndex, parseQuery, highlight, fold, distance } from '../src/engine.js';

const items = [
  { id: 1, title: 'Wireless Headphones Pro', brand: 'Sony', tags: ['audio', 'bluetooth'], category: 'Audio', price: 299 },
  { id: 2, title: 'Wired earbuds', brand: 'JBL', tags: ['audio'], category: 'Audio', price: 39 },
  { id: 3, title: 'Mechaniczna klawiatura Żółw', brand: 'Keychron', tags: ['keyboard'], category: 'Input', price: 120 },
  { id: 4, title: 'Bluetooth speaker', brand: 'JBL', tags: ['audio', 'bluetooth'], category: 'Audio', price: 89 },
];
const idx = () => createIndex(items, { keys: [{ name: 'title', weight: 3 }, 'brand', 'tags'], facets: ['category', 'brand'] });
const ids = (r) => r.hits.map((h) => h.id);

describe('engine', () => {
  test('fold keeps length and strips diacritics', () => {
    assert.equal(fold('Żółć Łódź'), 'zolc lodz');
    assert.equal(fold('Żółć').length, 4);
  });
  test('distance counts transpositions as one edit', () => {
    assert.equal(distance('teh', 'the'), 1);
    assert.equal(distance('kitten', 'sitting'), 3);
  });
  test('typos, prefixes and diacritics match', () => {
    assert.deepEqual(ids(idx().search('wireles hedphones')), [1]);
    assert.deepEqual(ids(idx().search('blue')), [4, 1]);
    assert.deepEqual(ids(idx().search('zolw')), [3]);
  });
  test('query syntax: exclude, field and phrase', () => {
    assert.deepEqual(ids(idx().search('audio -wired')).sort(), [1, 4]);
    assert.deepEqual(ids(idx().search('brand:jbl')), [2, 4]);
    assert.deepEqual(ids(idx().search('"bluetooth speaker"')), [4]);
    const p = parseQuery('red "running shoe" -kids brand:nike', ['brand']);
    assert.deepEqual(p.fields, { brand: ['nike'] });
    assert.deepEqual(p.exclude, ['kids']);
  });
  test('filters, disjunctive facets and sorting', () => {
    const r = idx().search('audio', { filters: { brand: ['JBL'] }, sort: '-price' });
    assert.deepEqual(ids(r), [4, 2]);
    assert.deepEqual(r.facets.brand, { Sony: 1, JBL: 2 });
  });
  test('did you mean and suggestions', () => {
    assert.equal(idx().search('bluetoth spaeker xyzzyq').total, 0);
    assert.equal(idx().correct('speakr'), 'speaker');
    assert.equal(idx().suggest('blu')[0].text, 'bluetooth');
  });
  test('suggestions fix typos in earlier words and only offer queries that find something', () => {
    const s = idx().suggest('wireles hea');
    assert.equal(s[0].text, 'wireless headphones');
    assert.ok(s.every((x) => x.count > 0));
  });
  test('typo matches rank after exact ones', () => {
    const i = createIndex([{ id: 'a', title: 'Wired cable' }, { id: 'b', title: 'Wireless mouse' }], { keys: ['title'] });
    assert.deepEqual(ids(i.search('wirel')), ['b', 'a']);
  });
  test('cached term tables are dropped when data or options change', () => {
    const i = createIndex([{ id: 1, title: 'Alpha' }], { keys: ['title'] });
    assert.equal(i.search('beta').total, 0);
    i.add({ id: 2, title: 'Beta' });
    assert.equal(i.search('beta').total, 1);
    i.setItems([{ id: 3, title: 'Gamma' }]);
    assert.equal(i.search('beta').total, 0);
    i.setOptions({ fuzzy: false });
    assert.equal(i.search('gama').total, 0, 'no typos allowed');
    i.setOptions({ fuzzy: 1 });
    assert.equal(i.search('gama').total, 1);
    assert.equal(i.remove(3), true);
    assert.equal(i.size, 0);
  });
  test('synonyms work both ways', () => {
    const i = createIndex([{ id: 1, title: 'Notebook 14' }, { id: 2, title: 'Television 55' }], { keys: ['title'], synonyms: { laptop: ['notebook'], tv: ['television'] } });
    assert.deepEqual(ids(i.search('laptop')), [1]);
    assert.deepEqual(ids(i.search('tv')), [2]);
  });
  test('filler words and description-only words are not suggested', () => {
    const i = createIndex([{ id: 1, title: 'Wireless mouse', description: 'Works with whatever' }], { keys: [{ name: 'title', weight: 2 }, { name: 'description', weight: 0.5 }] });
    assert.deepEqual(i.suggest('wi').map((x) => x.text), ['wireless']);
  });
  test('very short queries ignore low-weight fields like descriptions', () => {
    const i = createIndex([{ id: 1, title: 'Lamp', description: 'works with wifi' }, { id: 2, title: 'Wired mouse', description: 'small' }], { keys: [{ name: 'title', weight: 2 }, { name: 'description', weight: 0.5 }] });
    assert.deepEqual(ids(i.search('w')), [2]);
    assert.deepEqual(ids(i.search('wifi')), [1], 'longer words still search descriptions');
  });
  test('highlight escapes html', () => {
    assert.equal(highlight('Żółw <b>', 'zolw'), '<mark>Żółw</mark> &lt;b&gt;');
  });
});
