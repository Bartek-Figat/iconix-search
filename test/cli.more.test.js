import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, parseArgs, readItems, CliError } from '../bin/cli.js';

let dir, file;
const exec = (...argv) => { let out = ''; const code = run(argv, { out: (s) => { out += s; } }); return { code, out }; };
const quietErr = (fn) => { const w = process.stderr.write; let err = ''; process.stderr.write = (s) => { err += s; return true; }; try { return { ...fn(), err }; } finally { process.stderr.write = w; } };

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'ixs-cli2-'));
  file = join(dir, 'p.json');
  writeFileSync(file, JSON.stringify([
    { id: 1, title: 'Wireless Headphones', brand: 'Sony', category: 'Audio', tags: ['bluetooth'], price: 299 },
    { id: 2, title: 'Wired Earbuds', brand: 'JBL', category: 'Audio', tags: ['wired'], price: 39 },
    { id: 3, title: 'Bluetooth Speaker', brand: 'JBL', category: 'Audio', tags: ['bluetooth'], price: 89 },
    { id: 4, title: 'Keyboard', brand: 'Keychron', category: 'Input', tags: ['wireless'], price: 120 },
  ]));
  writeFileSync(join(dir, 'bad.json'), '{ nope');
  writeFileSync(join(dir, 'obj.json'), JSON.stringify({ count: 1 }));
  writeFileSync(join(dir, 'bad.ndjson'), '{"id":1}\n{oops}\n');
});
after(() => rmSync(dir, { recursive: true, force: true }));

describe('more arguments', () => {
  test('-- ends flags, unknown short flags pass through', () => {
    const a = parseArgs(['query', 'f.json', '--', '--not-a-flag', '-x']);
    assert.deepEqual(a._, ['query', 'f.json', '--not-a-flag', '-x']);
    assert.deepEqual(parseArgs(['-z', 'v']).flags, { z: 'v' });
    assert.deepEqual(parseArgs(['-h']).flags, { help: true });
  });
  test('boolean flags never swallow the next word', () => {
    assert.deepEqual(parseArgs(['--json', 'query']), { _: ['query'], flags: { json: true } });
  });
});

describe('input errors', () => {
  test('invalid JSON, no array, bad NDJSON line, missing file argument', () => {
    assert.throws(() => readItems(join(dir, 'bad.json')), /not valid JSON/);
    assert.throws(() => readItems(join(dir, 'obj.json')), /no array/);
    assert.throws(() => readItems(join(dir, 'bad.ndjson')), /line 2/);
    assert.throws(() => readItems(), CliError);
  });
  test('bad numbers, filters and missing prefix exit 2 with a message', () => {
    for (const argv of [['query', file, 'x', '--limit', '-3'], ['query', file, 'x', '--limit', 'abc'], ['query', file, '', '--filter', 'price>=cheap'], ['suggest', file], ['facets', file, '--by']]) {
      const r = quietErr(() => exec(...argv));
      assert.equal(r.code, 2, argv.join(' '));
      assert.match(r.err, /^iconix-search: /);
    }
  });
});

describe('text output', () => {
  test('query lists ranked lines and "more" hint', () => {
    const { code, out } = exec('query', file, 'audio', '--keys', 'title:3,category', '--limit', '1');
    assert.equal(code, 0);
    assert.match(out, /3 results for “audio”/);
    assert.match(out, /… 2 more/);
  });
  test('query with an empty string lists everything', () => {
    const { out } = exec('query', file, '', '--json');
    assert.equal(JSON.parse(out).total, 4);
  });
  test('suggest prints completions and corrections', () => {
    const { code, out } = exec('suggest', file, 'blu');
    assert.equal(code, 0);
    assert.match(out, /› bluetooth/);
    const fix = exec('suggest', file, 'bluetoth');
    assert.match(fix.out, /~ bluetooth/);
  });
  test('suggest with nothing to offer exits 1', () => {
    assert.equal(exec('suggest', file, 'qqqq').code, 1);
  });
  test('facets prints bars per key, filtered by a query', () => {
    const { code, out } = exec('facets', file, 'bluetooth', '--by', 'brand');
    assert.equal(code, 0);
    assert.match(out, /brand\n {2}Sony +1/);
    assert.match(out, /█/);
  });
  test('facets with no match exits 1', () => {
    assert.equal(exec('facets', file, 'qqqqqq', '--by', 'brand').code, 1);
  });
  test('stats prints items, weighted keys and top words', () => {
    const { out } = exec('stats', file, '--keys', 'title:3,brand');
    assert.match(out, /4 items · \d+ distinct words/);
    assert.match(out, /keys: title×3, brand/);
    assert.match(out, /top: /);
  });
  test('help command and the search alias', () => {
    assert.match(exec('help').out, /Query syntax/);
    assert.equal(JSON.parse(exec('search', file, 'keyboard', '--json').out).hits[0].id, 4);
  });
  test('fuzzy flag: auto, number and invalid', () => {
    assert.equal(exec('query', file, 'keybord', '--fuzzy', 'auto').code, 0);
    assert.equal(exec('query', file, 'keybord', '--fuzzy', '1').code, 0);
    assert.equal(quietErr(() => exec('query', file, 'x', '--fuzzy', 'lots')).code, 2);
  });
});
