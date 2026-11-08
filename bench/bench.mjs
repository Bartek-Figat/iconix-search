// npm run bench: search speed on generated catalogues of 1k / 10k / 50k items.
import { createIndex } from '../src/engine.js';

const WORDS = 'wireless headphones keyboard mouse laptop monitor speaker bluetooth camera drone phone tablet watch router printer kettle lamp cable charger gaming studio portable smart home audio video ergonomic mechanical ultrawide compact silent travel office outdoor kitchen garden fitness running cycling coffee espresso grinder blender vacuum robot cleaner purifier heater fan light bulb plug socket switch sensor alarm doorbell lock thermostat battery power bank adapter dock hub stand mount case cover sleeve bag backpack bottle mug glass chair desk shelf'.split(' ');
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = () => WORDS[Math.floor(rnd() * WORDS.length)];
const phrase = (n) => Array.from({ length: n }, pick).join(' ');
const make = (n) => Array.from({ length: n }, (_, i) => ({ id: i, title: `${phrase(3)} ${i}`, brand: pick(), tags: [pick(), pick()], description: phrase(18) }));

const QUERIES = ['wireless', 'wireles hedphones', 'blu', 'ergonomic mouse', 'running', '"smart home"', 'xyzzy'];
const rows = [];
for (const n of [1000, 10000, 50000]) {
  const items = make(n);
  let t = performance.now();
  const idx = createIndex(items, { keys: [{ name: 'title', weight: 3 }, 'brand', 'tags', { name: 'description', weight: 0.5 }] });
  idx.search('warmup');
  const build = performance.now() - t;
  const row = { items: n, 'index (ms)': build.toFixed(0) };
  for (const q of QUERIES) {
    idx.search(q);
    t = performance.now();
    const runs = 5;
    for (let k = 0; k < runs; k++) idx.search(q, { limit: 20 });
    row[q] = ((performance.now() - t) / runs).toFixed(2);
  }
  rows.push(row);
}
console.log('Search time in ms (lower is better):');
console.table(rows);
