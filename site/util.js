import { icon } from '../src/icons.js';

export const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
// ---------------------------------------------------------------- tiny highlighter
export const RE = {
  js: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(import|from|export|default|const|let|function|return|new|await|async|if|else|true|false|null|setup|interface|type|declare|as|string|number|boolean)\b|(<\/?[A-Za-z][\w.-]*|\/?>)|\b(\d+(?:\.\d+)?)\b/g,
  css: /(\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*")|(@media|:root|\.ixs[\w-]*)|(--[\w-]+)|(#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|%)?)/g,
};
export function hl(code, lang = 'js') {
  const out = [];
  let last = 0;
  code.replace(RE[lang], (m, ...g) => {
    const idx = g[g.length - 2];
    out.push(esc(code.slice(last, idx)));
    const cls = g[0] ? 'c' : g[1] ? 's' : g[2] ? 'k' : g[3] ? 't' : 'n';
    out.push(`<span class="tk-${cls}">${esc(m)}</span>`);
    last = idx + m.length;
    return m;
  });
  out.push(esc(code.slice(last)));
  return out.join('');
}
export async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked */ }
  if (!btn) return;
  const old = btn.innerHTML;
  btn.innerHTML = `${icon('check', 15)}Copied`;
  setTimeout(() => { btn.innerHTML = old; }, 1400);
}

