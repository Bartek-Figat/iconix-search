// Minimal browser environment for DOM tests (jsdom).
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window;
const define = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
for (const k of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'CustomEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'customElements', 'SVGElement', 'Element', 'HTMLDivElement', 'DocumentFragment', 'MutationObserver', 'localStorage', 'history', 'location', 'FocusEvent']) {
  define(k, k === 'window' ? w : typeof w[k] === 'function' && !/^[A-Z]/.test(k) ? w[k].bind(w) : w[k]);
}
define('navigator', w.navigator);

export { w as window };
export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** Mounts a search into a fresh container; s.destroy() also removes the container. */
export async function mount(options = {}) {
  const { createSearch } = await import('../../src/index.js');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const s = createSearch(host, { debounce: 0, navigate: false, storageKey: `t${Math.random()}`, ...options });
  const destroy = s.destroy.bind(s);
  s.destroy = () => { destroy(); host.remove(); };
  return s;
}

/** Types into the search box like a user: sets the value and fires input. */
export function type(s, text) {
  const input = s.el.input;
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
export const press = (el, key, extra = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }));
