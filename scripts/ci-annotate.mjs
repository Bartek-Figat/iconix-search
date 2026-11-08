// Turns failed tests in a TAP file into GitHub annotations (readable on the run page and through the public API).
import { readFileSync } from 'node:fs';

const lines = readFileSync(process.argv[2] || 'e2e.tap', 'utf8').replace(/\r/g, '').split('\n');
const blocks = [];
lines.forEach((l, i) => {
  if (!/^\s*not ok /.test(l)) return;
  const depth = l.match(/^\s*/)[0].length;
  const body = [l.trim()];
  for (let k = i + 1; k < lines.length && body.length < 18; k++) {
    const d = lines[k].match(/^\s*/)[0].length;
    if (d <= depth && /^\s*(ok|not ok) /.test(lines[k])) break;
    if (/duration_ms|type: 'test'|failureType|^\s*\.\.\.$|^\s*---$/.test(lines[k])) continue;
    body.push(lines[k].trim());
  }
  blocks.push(body.join('\n'));
});
// the deepest failures first: they carry the actual assertion
blocks.sort((a, b) => (/subtests? failed|test failed/.test(a) ? 1 : 0) - (/subtests? failed|test failed/.test(b) ? 1 : 0));
for (const b of blocks.slice(0, 9)) console.log(`::error title=UI/UX test failed::${b.replace(/%/g, '%25').replace(/\n/g, '%0A')}`);
if (!blocks.length) console.log('::error title=UI/UX tests::failed before any test reported (see the log)');
