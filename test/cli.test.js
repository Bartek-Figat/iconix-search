import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { run, parseArgs, readItems, CliError } from '../bin/cli.js';

let dir, file, nd;
const exec = (...argv) => { let out = ''; const code = run(argv, { out: (s) => { out += s; } }); return { code, out }; };

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'ixs-cli-'));
  file = join(dir, 'products.json');
  writeFileSync(file, JSON.stringify({ items: [
    { id: 'a', title: 'Wireless Headphones', brand: 'Sony', category: 'Audio', price: 299 },
    { id: 'b', title: 'Wired Earbuds', brand: 'JBL', category: 'Audio', price: 39 },
    { id: 'c', title: 'Bluetooth Speaker', brand: 'JBL', category: 'Audio', price: 89 },
    { id: 'd', title: 'Mechanical Keyboard', brand: 'Keychron', category: 'Input', price: 120 },
  ] }));
  nd = join(dir, 'docs.ndjson');
  writeFileSync(nd, '{"id":1,"title":"Getting started"}\n{"id":2,"title":"Theming guide"}\n');
});
after(() => rmSync(dir, { recursive: true, force: true }));

describe('arguments + input', () => {
  test('flags, repeatable filters, short aliases', () => {
    const a = parseArgs(['query', 'x.json', 'red', '--json', '-n', '5', '-f', 'brand=JBL', '--filter=price>=10', '--keys', 'title:3,tags']);
    assert.deepEqual(a._, ['query', 'x.json', 'red']);
    assert.deepEqual(a.flags, { json: true, limit: '5', filter: ['brand=JBL', 'price>=10'], keys: 'title:3,tags' });
  });
  test('reads arrays, wrapped arrays and NDJSON', () => {
    assert.equal(readItems(file).length, 4);
    assert.equal(readItems(nd)[1].title, 'Theming guide');
    assert.throws(() => readItems(join(dir, 'nope.json')), CliError);
  });
});

describe('commands', () => {
  test('query ranks with typos and exits 0', () => {
    const { code, out } = exec('query', file, 'wireles', '--json');
    assert.equal(code, 0);
    const r = JSON.parse(out);
    assert.equal(r.hits[0].id, 'a');
  });
  test('filters and sort', () => {
    const r = JSON.parse(exec('query', file, '', '--filter', 'brand=JBL', '--sort', '-price', '--json').out);
    assert.deepEqual(r.hits.map((h) => h.id), ['c', 'b']);
    const r2 = JSON.parse(exec('query', file, '', '--filter', 'price<=100', '--json').out);
    assert.deepEqual(r2.hits.map((h) => h.id).sort(), ['b', 'c']);
  });
  test('no results exits 1 and suggests a correction', () => {
    const { code, out } = exec('query', file, 'keybord', '--fuzzy', '0');
    assert.equal(code, 1);
    assert.match(out, /Did you mean .*keyboard/);
  });
  test('suggest completes words', () => {
    const r = JSON.parse(exec('suggest', file, 'blu', '--json').out);
    assert.equal(r[0].text, 'bluetooth');
  });
  test('facets counts values', () => {
    const r = JSON.parse(exec('facets', file, '--by', 'brand,category', '--json').out);
    assert.deepEqual(r.facets.brand, { Sony: 1, JBL: 2, Keychron: 1 });
    assert.equal(r.facets.category.Audio, 3);
  });
  test('stats lists keys and words', () => {
    const r = JSON.parse(exec('stats', file, '--json').out);
    assert.equal(r.items, 4);
    assert.ok(r.keys.some((k) => k.name === 'title'));
  });
  test('usage errors exit 2', () => {
    assert.equal(exec('nope', file).code, 2);
    assert.equal(exec('facets', file).code, 2);
    assert.equal(exec('query', file, 'x', '--filter', 'bad').code, 2);
  });
  test('help and version', () => {
    assert.match(exec('--help').out, /Usage/);
    assert.match(exec('--version').out, /^\d+\.\d+\.\d+/);
  });
  test('runs as a real binary', () => {
    const p = spawnSync(process.execPath, ['bin/cli.js', 'query', file, 'speaker'], { encoding: 'utf8' });
    assert.equal(p.status, 0);
    assert.match(p.stdout, /Bluetooth Speaker/);
  });
});
