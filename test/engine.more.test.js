import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createIndex, SearchIndex, parseQuery, fold, tokenize, distance, typoBudget, findRanges, highlight, snippet, escapeHtml, mergeRanges, normalizeKeys,
} from '../src/engine.js';

const ids = (r) => r.hits.map((h) => h.id);
// timing checks mean nothing while coverage instruments the code
const timing = { skip: process.env.NODE_V8_COVERAGE ? 'timings are skipped under coverage' : false };

describe('text helpers', () => {
  test('fold handles special letters and keeps length', () => {
    for (const [a, b] of [['Łódź', 'lodz'], ['Straße', 'strase'], ['Ærø', 'aro'], ['ÇA VA', 'ca va'], ['İstanbul', 'istanbul']]) {
      assert.equal(fold(a), b, a);
      assert.equal(fold(a).length, a.length, `${a} length`);
    }
    assert.equal(fold(null), '');
    assert.equal(fold(42), '42');
  });
  test('tokenize returns offsets in the original string', () => {
    const t = tokenize('  Żółw, 3D-druk!');
    assert.deepEqual(t.map((x) => x.t), ['zolw', '3d', 'druk']);
    assert.equal('  Żółw, 3D-druk!'.slice(t[0].s, t[0].e), 'Żółw');
  });
  test('distance edge cases', () => {
    assert.equal(distance('', 'abc'), 3);
    assert.equal(distance('abc', ''), 3);
    assert.equal(distance('same', 'same'), 0);
    assert.equal(distance('abcdef', 'a', 2), 3, 'bails out above max');
    assert.equal(distance('ca', 'ac'), 1, 'transposition');
  });
  test('typo budget', () => {
    assert.equal(typoBudget('abc'), 0);
    assert.equal(typoBudget('abcd'), 1);
    assert.equal(typoBudget('abcdefgh'), 2);
    assert.equal(typoBudget('abcdefgh', false), 0);
    assert.equal(typoBudget('ab', 3), 3);
    assert.equal(typoBudget('model2024'), 0, 'terms with digits are exact');
  });
  test('mergeRanges merges overlaps and sorts', () => {
    assert.deepEqual(mergeRanges([[5, 8], [0, 2], [1, 4], [8, 9]]), [[0, 4], [5, 9]]);
    assert.deepEqual(mergeRanges([]), []);
  });
  test('findRanges: prefix, infix, typo and empty', () => {
    assert.deepEqual(findRanges('Bluetooth speaker', 'blue'), [[0, 4]]);
    assert.deepEqual(findRanges('Earbuds', 'buds'), [[3, 7]]);
    assert.deepEqual(findRanges('Headphones', 'hedphones'), [[0, 10]]);
    assert.deepEqual(findRanges('', 'x'), []);
    assert.deepEqual(findRanges('abc', ''), []);
  });
  test('highlight with ranges, custom tag and class, and escaping', () => {
    assert.equal(highlight('a<b>c', [[0, 1]], { tag: 'em', className: 'x"y' }), '<em class="x&quot;y">a</em>&lt;b&gt;c');
    assert.equal(highlight(null, 'x'), '');
    assert.equal(escapeHtml(`<'">&`), '&lt;&#39;&quot;&gt;&amp;');
  });
  test('snippet keeps short text, cuts around a late match', () => {
    assert.equal(snippet('short', 'x'), 'short');
    const long = `${'lorem ipsum '.repeat(30)}needle here ${'dolor sit '.repeat(20)}`;
    const s = snippet(long, 'needle', { length: 80 });
    assert.ok(s.startsWith('…') && s.endsWith('…'));
    assert.ok(s.includes('needle'));
    assert.ok(snippet(long, 'zzz', { length: 40 }).endsWith('…'));
  });
});

describe('parseQuery', () => {
  test('negated field, quoted field value, unknown field stays text', () => {
    const p = parseQuery('-brand:sony tag:"new in" 10:30 foo:bar', ['brand', 'tag']);
    assert.deepEqual(p.fields, { brand: ['!sony'], tag: ['new in'] });
    assert.deepEqual(p.terms, ['10', '30', 'foo', 'bar']);
  });
  test('negated phrase excludes all its words; unclosed quote still works', () => {
    const p = parseQuery('-"red shoes" "blue');
    assert.deepEqual(p.exclude, ['red', 'shoes']);
    assert.deepEqual(p.terms, ['blue']);
  });
  test('empty and whitespace queries', () => {
    assert.deepEqual(parseQuery('').terms, []);
    assert.deepEqual(parseQuery('   ').terms, []);
    assert.deepEqual(parseQuery(null).terms, []);
  });
});

describe('index options', () => {
  const books = [
    { id: 'a', title: 'The Hobbit', author: { name: 'Tolkien' }, tags: [['fantasy', 'classic']], year: 1937, rating: 4.7, published: new Date(1937, 8, 21) },
    { id: 'b', title: 'Dune', author: { name: 'Herbert' }, tags: ['sci-fi'], year: 1965, rating: 4.6, published: new Date(1965, 7, 1) },
    { id: 'c', title: 'The Left Hand of Darkness', author: { name: 'Le Guin' }, tags: ['sci-fi', 'classic'], year: 1969, rating: null },
  ];
  test('nested paths, nested arrays and getter keys', () => {
    const i = createIndex(books, { keys: ['title', 'author.name', 'tags', { name: 'decade', get: (b) => `${Math.floor(b.year / 10) * 10}s` }] });
    assert.deepEqual(ids(i.search('tolkien')), ['a']);
    assert.deepEqual(ids(i.search('fantasy')), ['a']);
    assert.deepEqual(ids(i.search('1960s')).sort(), ['b', 'c']);
  });
  test('keys guessed from the first item when not given', () => {
    const i = createIndex([{ id: 1, name: 'Ada', tags: ['x'], age: 3 }]);
    assert.deepEqual(i.keys.map((k) => k.name), ['name', 'tags']);
    assert.equal(i.keys[0].weight, 2);
    assert.deepEqual(createIndex([]).keys, []);
  });
  test('normalizeKeys accepts key alias', () => {
    assert.equal(normalizeKeys([{ key: 'x', weight: 2 }])[0].name, 'x');
  });
  test('match any, stop words and boost', () => {
    const any = createIndex(books, { keys: ['title'], match: 'any' });
    assert.deepEqual(ids(any.search('dune hobbit')).sort(), ['a', 'b']);
    const stop = createIndex(books, { keys: ['title'], stopWords: ['the', 'of'] });
    assert.equal(stop.search('the').total, 2, 'a stop word alone still searches');
    assert.deepEqual(ids(stop.search('the dune')), ['b']);
    const boosted = createIndex(books, { keys: ['tags'], boost: (b) => (b.id === 'c' ? 10 : 1) });
    assert.equal(ids(boosted.search('sci'))[0], 'c');
  });
  test('id option as a function', () => {
    const i = createIndex(books, { keys: ['title'], id: (b) => `book-${b.id}` });
    assert.deepEqual(ids(i.search('dune')), ['book-b']);
  });
  test('offset / limit paging', () => {
    const i = createIndex(books, { keys: ['title'] });
    const r = i.search('', { offset: 1, limit: 1 });
    assert.equal(r.total, 3);
    assert.deepEqual(ids(r), ['b']);
  });
  test('sorting: function, object, dates and nulls last', () => {
    const i = createIndex(books, { keys: ['title'] });
    assert.deepEqual(ids(i.search('', { sort: (a, b) => a.title.length - b.title.length })), ['b', 'a', 'c']);
    assert.deepEqual(ids(i.search('', { sort: { key: 'year', dir: 'desc' } })), ['c', 'b', 'a']);
    assert.deepEqual(ids(i.search('', { sort: '-published' })), ['b', 'a', 'c'], 'dates, missing value last');
    assert.deepEqual(ids(i.search('', { sort: 'rating' })), ['b', 'a', 'c'], 'null last');
    assert.deepEqual(ids(i.search('', { sort: '-rating' })), ['a', 'b', 'c'], 'null last when descending too');
  });
  test('filters: ranges, functions, numbers and empty values', () => {
    const i = createIndex(books, { keys: ['title'] });
    assert.deepEqual(ids(i.search('', { filters: { year: [{ min: 1960 }] } })), ['b', 'c']);
    assert.deepEqual(ids(i.search('', { filters: { year: [{ max: 1960 }] } })), ['a']);
    assert.deepEqual(ids(i.search('', { filters: { year: (y) => y % 2 === 1 } })), ['a', 'b', 'c']);
    assert.deepEqual(ids(i.search('', { filters: { year: 1965 } })), ['b']);
    assert.equal(i.search('', { filters: { year: [], tags: null } }).total, 3);
  });
  test('negated field filter in the query', () => {
    const i = createIndex(books, { keys: ['title', 'tags'] });
    assert.deepEqual(ids(i.search('-tags:sci')), ['a']);
  });
  test('multi-word synonyms', () => {
    const i = createIndex([{ id: 1, title: 'Television set 55' }], { keys: ['title'], synonyms: { tv: 'television set' } });
    assert.deepEqual(ids(i.search('tv')), [1]);
  });
  test('passing a parsed query object', () => {
    const i = createIndex(books, { keys: ['title'] });
    assert.deepEqual(ids(i.search(parseQuery('dune'))), ['b']);
  });
  test('matches report ranges per key', () => {
    const i = createIndex(books, { keys: ['title', 'tags'] });
    const h = i.search('classic hobbit').hits[0];
    assert.deepEqual(Object.keys(h.matches).sort(), ['tags', 'title']);
  });
  test('remove() of an unknown id', () => {
    assert.equal(createIndex(books, { keys: ['title'] }).remove('nope'), false);
  });
  test('works with non-array input and odd values', () => {
    const i = new SearchIndex(null, { keys: ['title'] });
    assert.equal(i.size, 0);
    i.setItems([{ id: 1, title: null }, { id: 2, title: 0 }, { id: 3 }]);
    assert.equal(i.search('0').total, 1);
  });
  test('suggest: empty, trailing space, phrases only, limit', () => {
    const i = createIndex(books, { keys: ['title', 'tags'] });
    assert.deepEqual(i.suggest(''), []);
    assert.deepEqual(i.suggest('the ').map((x) => x.type), []);
    const p = i.suggest('the ', { phrases: books.map((b) => b.title) });
    assert.ok(p.every((x) => x.type === 'phrase') && p.length > 0);
    assert.ok(i.suggest('c', { limit: 1 }).length <= 1);
  });
  test('correct() returns null when nothing changes or nothing is known', () => {
    const i = createIndex(books, { keys: ['title'] });
    assert.equal(i.correct('dune'), null);
    assert.equal(i.correct('qqqqqq'), null);
  });
  test('a typo in a short, still-being-typed word is not guessed', () => {
    const i = createIndex([{ id: 1, title: 'Speaker' }, { id: 2, title: 'Steam wand' }], { keys: ['title'] });
    assert.deepEqual(ids(i.search('spea')), [1]);
    assert.deepEqual(ids(i.search('speakr')), [1], 'longer words still forgive a typo');
  });
  test('1,000 items search fast enough', timing, () => {
    const words = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu'.split(' ');
    const items = Array.from({ length: 1000 }, (_, n) => ({ id: n, title: `${words[n % 12]} ${words[(n * 7) % 12]} ${n}`, body: words.join(' ') }));
    const i = createIndex(items, { keys: [{ name: 'title', weight: 3 }, 'body'] });
    i.search('gama');
    const t = performance.now();
    for (let k = 0; k < 10; k++) i.search('gama delt');
    assert.ok((performance.now() - t) / 10 < 25, 'under 25 ms per search');
  });
});

describe('stemming + ranking (v2)', async () => {
  const { stemEn, stemPl, stemmerFor } = await import('../src/engine.js');
  test('English stems', () => {
    const cases = { running: 'run', headphones: 'headphone', boxes: 'box', batteries: 'battery', glass: 'glass', status: 'status', stopped: 'stop', cases: 'case', run: 'run' };
    for (const [w, s] of Object.entries(cases)) assert.equal(stemEn(w), s, w);
  });
  test('Polish stems (folded words)', () => {
    for (const [w, s] of Object.entries({ buty: 'but', butow: 'but', butami: 'but', klawiatury: 'klawiatur', klawiatura: 'klawiatur', kot: 'kot' })) assert.equal(stemPl(w), s, w);
  });
  test('stemmerFor resolves option values', () => {
    assert.equal(stemmerFor(false), null);
    assert.equal(stemmerFor('xx'), null);
    assert.equal(stemmerFor('en+pl')('butami'), 'but');
    assert.equal(stemmerFor((w) => w.slice(0, 2))('hello'), 'he');
  });
  test('stemming finds other word forms, and can be turned off', () => {
    const items = [{ id: 1, title: 'Run club' }, { id: 2, title: 'Noise-cancelling headphone' }, { id: 3, title: 'Wygodne buty do biegania' }];
    const en = createIndex(items, { keys: ['title'] });
    assert.deepEqual(ids(en.search('running')), [1]);
    assert.deepEqual(ids(en.search('headphones')), [2]);
    assert.equal(createIndex(items, { keys: ['title'], stemming: false, fuzzy: false }).search('running').total, 0);
    const pl = createIndex(items, { keys: ['title'], stemming: 'pl' });
    assert.deepEqual(ids(pl.search('butów')), [3]);
  });
  test('stem matches rank below exact ones', () => {
    const i = createIndex([{ id: 'a', title: 'Runs fast' }, { id: 'b', title: 'Run fast' }], { keys: ['title'] });
    assert.deepEqual(ids(i.search('run')), ['b', 'a']);
  });
  test('rare words weigh more than common ones (BM25-style)', () => {
    const items = [
      { id: 'common', title: 'Black case', tags: ['black'] },
      { id: 'rare', title: 'Black titanium', tags: ['black'] },
      ...Array.from({ length: 20 }, (_, n) => ({ id: `x${n}`, title: `Black case ${n}`, tags: ['case'] })),
    ];
    const i = createIndex(items, { keys: ['title', 'tags'], match: 'any' });
    assert.equal(ids(i.search('case titanium'))[0], 'rare');
    const simple = createIndex(items, { keys: ['title', 'tags'], match: 'any', ranking: 'simple' });
    assert.ok(simple.search('case titanium').total > 0);
  });
  test('a match in a short field beats the same match in a long one', () => {
    const i = createIndex([{ id: 'long', title: 'Lamp with a very long descriptive product name' }, { id: 'short', title: 'Lamp' }], { keys: ['title'] });
    assert.equal(ids(i.search('lamp'))[0], 'short');
  });
  test('the inverted index returns exactly what a full scan would', () => {
    const W = 'alpha beta gamma delta epsilon zeta eta theta'.split(' ');
    const items = Array.from({ length: 300 }, (_, n) => ({ id: n, title: `${W[n % 8]} ${W[(n * 3) % 8]}`, body: `${W[(n * 5) % 8]} item ${n}` }));
    const i = createIndex(items, { keys: ['title', 'body'] });
    for (const q of ['alpha', 'gam', 'zeta theta', 'epsilom', 'beta -gamma', 'item']) {
      const fast = ids(i.search(q)).sort((a, b) => a - b);
      // reference: a fresh index with a multi-word synonym forces the full scan path
      const scan = createIndex(items, { keys: ['title', 'body'], synonyms: { [q.split(' ')[0].replace('-', '')]: ['never used phrase'] } });
      assert.deepEqual(fast, ids(scan.search(q)).sort((a, b) => a - b), q);
    }
  });
  test('highlight and snippet understand stems when asked', () => {
    assert.equal(highlight('Run club', 'running', { stemming: 'en' }), '<mark>Run</mark> club');
    assert.equal(highlight('Run club', 'running'), 'Run club');
    const long = `${'x '.repeat(100)}headphone here`;
    assert.match(snippet(long, 'headphones', { length: 40, stemming: 'en' }), /headphone/);
  });
  test('50,000 items: index under 3 s, typical search under 60 ms', timing, () => {
    const W = 'wireless headphones keyboard mouse laptop monitor speaker bluetooth camera drone phone tablet watch router printer kettle'.split(' ');
    const items = Array.from({ length: 50000 }, (_, n) => ({ id: n, title: `${W[n % 16]} ${W[(n * 7) % 16]} ${n}`, tags: [W[(n * 3) % 16]] }));
    let t = performance.now();
    const i = createIndex(items, { keys: [{ name: 'title', weight: 3 }, 'tags'] });
    i.search('warm');
    assert.ok(performance.now() - t < 3000, `index ${(performance.now() - t).toFixed(0)} ms`);
    t = performance.now();
    const r = i.search('wireles', { limit: 20 }); // one typo, ~3,000 matches to rank
    const ms = performance.now() - t;
    assert.ok(r.total > 0);
    assert.ok(ms < 60, `search ${ms.toFixed(1)} ms`);
  });
});
