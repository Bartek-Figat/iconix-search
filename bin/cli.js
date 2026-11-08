#!/usr/bin/env node
// iconix-search CLI: search, suggest and inspect JSON / NDJSON data from the terminal or CI.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createIndex, findRanges } from '../src/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = c(1), dim = c(2), yellow = c(33), blue = c(34), green = c(32);

export class CliError extends Error {}

export function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { args._.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const k = eq > 0 ? a.slice(2, eq) : a.slice(2);
      let v = eq > 0 ? a.slice(eq + 1) : undefined;
      if (v === undefined) v = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') && !/^-[a-z]$/i.test(argv[i + 1]) && !['json', 'help', 'version', 'exact'].includes(k) ? argv[++i] : true;
      if (k === 'filter') (args.flags.filter ||= []).push(v);
      else args.flags[k] = v;
    } else if (/^-[a-z]$/i.test(a)) {
      const map = { k: 'keys', n: 'limit', s: 'sort', f: 'filter', h: 'help', v: 'version' };
      const k = map[a[1]] || a[1];
      if (['help', 'version'].includes(k)) args.flags[k] = true;
      else if (k === 'filter') (args.flags.filter ||= []).push(argv[++i]);
      else args.flags[k] = argv[++i];
    } else args._.push(a);
  }
  return args;
}

/** Reads items from a .json file (array, or the first array property such as { items: [] }) or .ndjson / .jsonl. */
export function readItems(file) {
  if (!file) throw new CliError('Missing input file');
  const path = resolve(file);
  if (!existsSync(path)) throw new CliError(`File not found: ${file}`);
  const text = readFileSync(path, 'utf8');
  if (/\.(nd)?jsonl?$/i.test(path) && !/^\s*[[{]\s*"?\w*"?\s*:?\s*\[/.test(text) && text.trim().split('\n').length > 1 && !text.trim().startsWith('[')) {
    return text.split('\n').filter((l) => l.trim()).map((l, i) => {
      try { return JSON.parse(l); } catch { throw new CliError(`${file}: line ${i + 1} is not valid JSON`); }
    });
  }
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new CliError(`${file} is not valid JSON: ${e.message}`); }
  if (Array.isArray(data)) return data;
  const arr = data && Object.values(data).find(Array.isArray);
  if (!arr) throw new CliError(`${file} has no array of items`);
  return arr;
}

const int = (v, name, def) => {
  if (v === undefined || v === true) return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new CliError(`--${name} must be a whole number, got "${v}"`);
  return n;
};
const keysFlag = (v) => (v === undefined || v === true ? null : String(v).split(',').map((k) => {
  const [name, w] = k.trim().split(':');
  return w ? { name, weight: Number(w) || 1 } : name;
}).filter(Boolean));
const filtersFlag = (list = []) => {
  const out = {};
  for (const f of [].concat(list)) {
    const m = /^([^=<>]+)(=|>=|<=)(.*)$/.exec(String(f));
    if (!m) throw new CliError(`--filter must look like key=value, key>=10 or key<=10, got "${f}"`);
    const [, k, op, v] = m;
    if (op === '=') (out[k] ||= []).push(...v.split('|'));
    else {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new CliError(`--filter ${k}${op} needs a number, got "${v}"`);
      out[k] = [{ ...(out[k]?.[0] || {}), [op === '>=' ? 'min' : 'max']: n }];
    }
  }
  return out;
};
const label = (item, keys) => {
  const k = typeof keys?.[0] === 'string' ? keys[0] : keys?.[0]?.name;
  return String(item[k] ?? item.title ?? item.name ?? item.id ?? JSON.stringify(item));
};
const mark = (text, query) => {
  if (!tty) return text;
  let out = '';
  let last = 0;
  for (const [a, b] of findRanges(text, query)) { out += text.slice(last, a) + yellow(text.slice(a, b)); last = b; }
  return out + text.slice(last);
};

const HELP = `${bold('iconix-search')} ${dim(`v${pkg.version}`)}  search JSON data from the terminal

${bold('Usage')}
  iconix-search query   <file> <query…>   ranked results with typo tolerance
  iconix-search suggest <file> <prefix…>  completions for a partial query
  iconix-search facets  <file> --by k1,k2 [query…]  value counts per key
  iconix-search stats   <file>            items, searchable keys, top words

${bold('Options')}
  -k, --keys title:3,tags   keys to search, with optional weights (default: every text key)
  -n, --limit 10            number of results
  -s, --sort -price         sort by a key (prefix - for descending)
  -f, --filter brand=JBL    filter (repeatable): key=a|b, key>=10, key<=99
      --fuzzy 0|1|2|auto    typo tolerance (default auto)
      --json                machine-readable output

${bold('Query syntax')}  "exact phrase"  -exclude  field:value

Exit codes: 0 ok · 1 nothing found · 2 usage error`;

/** Runs the CLI. Returns the exit code; output goes through `out`. */
export function run(argv, { out = (s) => process.stdout.write(s) } = {}) {
  const print = (s = '') => out(`${s}\n`);
  let args;
  try {
    args = parseArgs(argv);
    const { flags } = args;
    if (flags.version) { print(pkg.version); return 0; }
    const [cmd, file, ...rest] = args._;
    if (flags.help || !cmd || cmd === 'help') { print(HELP); return 0; }
    if (!['query', 'search', 'suggest', 'facets', 'stats'].includes(cmd)) throw new CliError(`Unknown command "${cmd}". Run iconix-search --help`);
    const items = readItems(file);
    const keys = keysFlag(flags.keys);
    const fuzzy = flags.fuzzy === undefined ? 'auto' : flags.fuzzy === 'auto' ? 'auto' : int(flags.fuzzy, 'fuzzy');
    const facetKeys = cmd === 'facets' ? String(flags.by === true || !flags.by ? '' : flags.by).split(',').filter(Boolean) : [];
    if (cmd === 'facets' && !facetKeys.length) throw new CliError('facets needs --by key1,key2');
    const idx = createIndex(items, { keys, fuzzy, facets: facetKeys });
    const q = rest.join(' ');
    const json = flags.json === true;

    if (cmd === 'query' || cmd === 'search') {
      const limit = int(flags.limit, 'limit', 10);
      const r = idx.search(q, { limit, sort: flags.sort === true ? undefined : flags.sort, filters: filtersFlag(flags.filter) });
      if (json) print(JSON.stringify({ query: q, total: r.total, didYouMean: r.didYouMean, hits: r.hits.map((h) => ({ id: h.id, score: +h.score.toFixed(4), matches: h.matches, item: h.item })) }, null, 2));
      else {
        print(`${bold(r.total)} ${r.total === 1 ? 'result' : 'results'}${q ? ` for “${q}”` : ''} ${dim(`· ${r.took.toFixed(1)} ms`)}`);
        r.hits.forEach((h, i) => print(`${dim(String(i + 1).padStart(3))}  ${mark(label(h.item, idx.keys.map((k) => k.name)), q)}  ${dim(`#${h.id} · ${h.score.toFixed(2)}`)}`));
        if (r.total > r.hits.length) print(dim(`     … ${r.total - r.hits.length} more (use --limit)`));
        if (!r.total && r.didYouMean) print(`Did you mean ${blue(r.didYouMean)}?`);
      }
      return r.total ? 0 : 1;
    }
    if (cmd === 'suggest') {
      if (!q) throw new CliError('suggest needs a prefix');
      const s = idx.suggest(q, { limit: int(flags.limit, 'limit', 8) });
      if (json) print(JSON.stringify(s, null, 2));
      else for (const x of s) print(`${x.type === 'correction' ? yellow('~') : green('›')} ${x.text}${x.count != null ? dim(`  ${x.count}`) : ''}`);
      return s.length ? 0 : 1;
    }
    if (cmd === 'facets') {
      const r = idx.search(q, { filters: filtersFlag(flags.filter) });
      if (json) print(JSON.stringify({ total: r.total, facets: r.facets }, null, 2));
      else for (const k of facetKeys) {
        print(bold(k));
        const rows = Object.entries(r.facets[k] || {}).sort((a, b) => b[1] - a[1]);
        const w = Math.max(0, ...rows.map(([v]) => v.length));
        for (const [v, n] of rows) print(`  ${v.padEnd(w)}  ${String(n).padStart(4)}  ${dim('█'.repeat(Math.max(1, Math.round((n / r.total) * 24))))}`);
      }
      return r.total ? 0 : 1;
    }
    // stats
    const vocab = [...idx.vocabulary()].sort((a, b) => b[1] - a[1]);
    const top = vocab.slice(0, int(flags.limit, 'limit', 10));
    const st = { items: items.length, keys: idx.keys.map((k) => ({ name: k.name, weight: k.weight })), words: vocab.length, top: top.map(([word, docs]) => ({ word, docs })) };
    if (json) print(JSON.stringify(st, null, 2));
    else {
      print(`${bold(st.items)} items · ${bold(st.words)} distinct words`);
      print(`keys: ${st.keys.map((k) => (k.weight !== 1 ? `${k.name}${dim(`×${k.weight}`)}` : k.name)).join(', ')}`);
      print(`top:  ${st.top.map((t) => `${t.word}${dim(`(${t.docs})`)}`).join('  ')}`);
    }
    return 0;
  } catch (e) {
    if (e instanceof CliError) { process.stderr.write(`iconix-search: ${e.message}\n`); return 2; }
    throw e;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = run(process.argv.slice(2));
