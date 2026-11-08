// npm run size: what the package adds to a bundle (minified by a simple whitespace/comment strip, then gzip).
// Not a real minifier, so the numbers are an upper bound; a bundler with terser will be a bit smaller.
import { readFileSync } from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const strip = (code, css) => (css
  ? code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1')
  : code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\n\s+/g, '\n').replace(/\n+/g, '\n'));
const groups = {
  'engine only (@iconix/search/engine)': ['engine.js'],
  'UI component (engine + search + i18n + icons glue)': ['engine.js', 'search.js', 'i18n.js', 'icons.js', 'index.js'],
  'stylesheet (search.css)': ['search.css'],
  'React wrapper': ['react.js'],
  'Vue wrapper': ['vue.js'],
  'Web Component': ['element.js'],
};
const rows = [];
for (const [name, files] of Object.entries(groups)) {
  const raw = files.map((f) => readFileSync(join(src, f), 'utf8')).join('\n');
  const min = files.map((f) => strip(readFileSync(join(src, f), 'utf8'), f.endsWith('.css'))).join('\n');
  rows.push({ part: name, 'source KB': (raw.length / 1024).toFixed(1), 'stripped KB': (min.length / 1024).toFixed(1), 'gzip KB': (gzipSync(min, { level: 9 }).length / 1024).toFixed(1), 'brotli KB': (brotliCompressSync(min).length / 1024).toFixed(1) });
}
console.table(rows);
console.log('Plus @iconix/icons/lite, tree-shaken: the 39 icons used (~1.4 KB gzip) and its SVG renderer (core.js, see below).');
console.log('core.js gzip KB:', (gzipSync(readFileSync(join(src, '..', 'node_modules', '@iconix', 'icons', 'dist', 'core.js')), { level: 9 }).length / 1024).toFixed(1));
