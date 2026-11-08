import { Search } from './search.js';

const ATTRS = ['placeholder', 'layout', 'theme', 'locale', 'mode', 'density', 'accent', 'radius', 'hotkey', 'query', 'results', 'storage-key'];
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const parse = (k, v) => {
  if (k === 'radius') return +v;
  if (k === 'results') return v !== 'false';
  if (k === 'hotkey' && v === 'false') return false;
  return v;
};

/**
 * <ixs-search layout="cards" placeholder="Search products"></ixs-search>
 * el.options = { items, keys, fields, facets, ... }  ·  el.api -> Search instance
 * Events are re-dispatched as DOM events prefixed with "ixs:" (e.g. "ixs:select").
 * Light DOM on purpose, so the regular stylesheet applies.
 */
export class IxsSearchElement extends HTMLElement {
  static get observedAttributes() { return ATTRS; }
  constructor() { super(); this._opts = {}; }
  set options(o) { this._opts = { ...this._opts, ...o }; if (this.api) this.api.setOptions(o); }
  get options() { return this._opts; }
  connectedCallback() {
    if (this.api) return;
    if (!this.style.display) this.style.display = 'block';
    const o = { ...this._opts };
    for (const a of ATTRS) if (this.hasAttribute(a)) o[camel(a)] = parse(camel(a), this.getAttribute(a));
    this.api = new Search(this, o);
    this.api.on('*', (name, detail) => this.dispatchEvent(new CustomEvent(`ixs:${name}`, { detail, bubbles: true })));
  }
  disconnectedCallback() { this.api?.destroy(); this.api = null; }
  attributeChangedCallback(name, _, v) {
    if (!this.api) return;
    const k = camel(name);
    this.api.setOptions({ [k]: parse(k, v) });
  }
}
if (typeof customElements !== 'undefined' && !customElements.get('ixs-search')) customElements.define('ixs-search', IxsSearchElement);
