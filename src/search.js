// @iconix/search UI: a search box with suggestions plus a results panel in six layouts.
import { SearchIndex, ENGINE_DEFAULTS, highlight, snippet, escapeHtml as esc, fold, parseQuery } from './engine.js';
import { icon, ICONS } from './icons.js';
import { getStrings } from './i18n.js';

export const LAYOUTS = ['list', 'cards', 'grid', 'compact', 'media', 'table'];

/** Every part that accepts extra classes through `classNames`. */
export const PARTS = {
  root: 'ixs', box: 'ixs-box', field: 'ixs-field', input: 'ixs-input', pop: 'ixs-pop', option: 'ixs-opt',
  bar: 'ixs-bar', chip: 'ixs-chip', results: 'ixs-results', item: 'ixs-item', empty: 'ixs-empty', more: 'ixs-more',
  trigger: 'ixs-trigger', modal: 'ixs-modal',
};

export const DEFAULTS = {
  // data
  items: [],
  keys: null, // ['title', { name: 'tags', weight: 2 }]; guessed from the first item when null
  id: 'id',
  fuzzy: 'auto',
  match: 'all',
  synonyms: null,
  stopWords: null,
  boost: null,
  source: null, // async (query, { signal, filters, sort }) => items | { items, total }
  suggest: null, // async/sync (query) => string[]; replaces the built-in completions
  // how an item is displayed (keys or (item) => value)
  fields: { title: 'title', subtitle: null, description: null, image: null, icon: null, color: null, badge: null, tags: null, meta: null, url: null },
  columns: null, // table layout: [{ key, label, sortable }]
  // ui
  mode: 'inline', // 'inline' | 'palette'
  results: true, // render the results panel (inline mode)
  instant: true, // update results while typing (false: on Enter only)
  layout: 'list',
  layouts: LAYOUTS,
  facets: [], // ['category'] or [{ key: 'category', label: 'Category', limit: 8 }]
  sorts: [], // [{ label: 'Price ↑', value: 'price' }, { label: 'Newest', value: '-date' }]
  filters: {},
  sort: 'relevance',
  query: '',
  placeholder: null,
  suggestions: true,
  maxSuggestions: 5,
  maxHits: 4, // items previewed in the dropdown
  phrases: true, // complete whole titles as well as words
  recent: true,
  maxRecent: 5,
  storageKey: 'default',
  popular: [],
  pageSize: 12,
  debounce: 60,
  minChars: 1,
  hotkey: '/', // '/', 'mod+k' or false
  theme: 'light', // 'light' | 'dark' | 'auto'
  accent: null,
  radius: null,
  density: 'comfortable', // 'compact' | 'comfortable' | 'spacious'
  locale: 'en',
  strings: null,
  classNames: {},
  navigate: true, // choosing an item with a url in the dropdown opens it
  fullscreen: 'auto', // phones: the focused box takes the whole screen ('auto' = up to 640px wide, true, false)
  url: false, // keep query, filters, sort and layout in the address bar: true or { prefix: 's.' }
  groupBy: null, // key or (item) => label: results in titled groups (all layouts but table)
  infinite: false, // load the next page when "Show more" scrolls into view
  renderItem: null, // (hit, ctx) => html string | Node
  renderSuggestion: null, // (option, ctx) => html string
  emptyState: null, // (ctx) => html string
};

const ENGINE_KEYS = Object.keys(ENGINE_DEFAULTS);
let uid = 0;
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const isEditable = (el) => el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));
const pick = (item, f) => (f == null ? undefined : typeof f === 'function' ? f(item) : String(f).split('.').reduce((o, k) => (o == null ? o : o[k]), item));
const list = (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v.filter((x) => x != null && x !== '') : [v]);
/** "Ada Nowak" -> "AN" (or "A"); used when an item has no image or icon. */
const initials = (title, n = 2) => title.trim().split(/\s+/).filter(Boolean).slice(0, n).map((w) => [...w][0]).join('').toUpperCase() || '·';
const safeUrl = (u) => (/^\s*(javascript|data|vbscript):/i.test(String(u)) ? '#' : String(u));

export class Search {
  constructor(target, options = {}) {
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) throw new Error('@iconix/search: target element not found');
    this.host = host;
    this.o = { ...DEFAULTS, ...options, fields: { ...DEFAULTS.fields, ...(options.fields || {}) } };
    this.uid = `ixs${++uid}`;
    this.handlers = {};
    this.state = {
      query: String(this.o.query || ''),
      submitted: String(this.o.query || ''),
      filters: { ...(this.o.filters || {}) },
      sort: this.o.sort,
      layout: this.o.layouts.includes(this.o.layout) ? this.o.layout : this.o.layouts[0],
      shown: this.o.pageSize,
      active: -1,
      open: false,
      loading: false,
      error: null,
      palette: false,
    };
    this.index = new SearchIndex(this.o.items, this._engineOpts());
    this.result = null;
    this.suggestions = [];
    this._recentMem = [];
    this._build();
    this._bindGlobal();
    if (this.o.url) {
      this._readUrl();
      this.el.input.value = this.state.query;
      this.root.dataset.layout = this.state.layout;
      // back / forward between pages that changed the address keeps the search in step
      this._onPop = () => { this._readUrl(); this.el.input.value = this.state.query; this.root.dataset.layout = this.state.layout; this._run(); };
      window.addEventListener('popstate', this._onPop);
    }
    this._run({ immediate: true });
  }

  // ------------------------------------------------------------- events
  on(name, fn) { (this.handlers[name] ||= new Set()).add(fn); return () => this.off(name, fn); }
  off(name, fn) { this.handlers[name]?.delete(fn); }
  emit(name, detail = {}) {
    const cb = this.o[`on${cap(name)}`];
    if (typeof cb === 'function') cb(detail, this);
    this.handlers[name]?.forEach((f) => f(detail, this));
    this.handlers['*']?.forEach((f) => f(name, detail, this));
  }

  get t() { return getStrings(this.o.locale, this.o.strings); }
  _engineOpts() {
    const e = {};
    for (const k of ENGINE_KEYS) if (k in this.o) e[k] = this.o[k];
    e.facets = this._facetDefs().filter((f) => f.type !== 'range').map((f) => f.key);
    if (!this.o.keys) e.keys = null;
    e.stemming = this._stemming();
    return e;
  }
  /** Word-form matching: what the user set, or English plus Polish for a Polish UI. */
  _stemming() { return 'stemming' in this.o ? this.o.stemming : /^pl/i.test(this.o.locale || '') ? 'en+pl' : 'en'; }
  /** Highlighter that knows the current stemming (so "running" also marks "run"). */
  _hl(text, q) { return highlight(text, q, { stemming: this._stemming(), fuzzy: this.o.fuzzy }); }
  _facetDefs() { return (this.o.facets || []).map((f) => (typeof f === 'string' ? { key: f, label: cap(f) } : { label: cap(f.key), ...f })); }
  _cls(part) { const c = this.o.classNames?.[part]; return c ? ` ${esc(c)}` : ''; }

  // ------------------------------------------------------------- dom
  _build() {
    const o = this.o;
    const t = this.t;
    const root = document.createElement('div');
    root.className = `ixs${this._cls('root')}`;
    this.host.innerHTML = '';
    this.host.appendChild(root);
    this.root = root;
    this._applyLook();
    const hint = o.hotkey === '/' ? '<kbd>/</kbd>' : o.hotkey === 'mod+k' ? `<kbd>${this._mod()}K</kbd>` : '';
    const box = `
      <div class="ixs-box${this._cls('box')}" role="search">
        <div class="ixs-field${this._cls('field')}">
          <button type="button" class="ixs-back" aria-label="${esc(t.back)}">${icon('back', 18)}</button>
          <span class="ixs-lead" aria-hidden="true">${icon('search', 18)}</span>
          <div class="ixs-inwrap">
            <span class="ixs-ghost" aria-hidden="true"><span class="ixs-ghost-typed"></span><span class="ixs-ghost-rest"></span></span>
            <input class="ixs-input${this._cls('input')}" type="text" role="combobox" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false"
              aria-label="${esc(t.label)}" aria-autocomplete="list" aria-expanded="false" aria-controls="${this.uid}-pop" placeholder="${esc(o.placeholder ?? t.placeholder)}">
          </div>
          <span class="ixs-spin" hidden aria-hidden="true">${icon('loader', 16)}</span>
          <button type="button" class="ixs-clear" hidden aria-label="${esc(t.clear)}">${icon('x', 16)}</button>
          ${o.mode === 'palette' ? '<kbd class="ixs-hint">Esc</kbd>' : hint ? `<span class="ixs-hint">${hint}</span>` : ''}
        </div>
        <div class="ixs-pop${this._cls('pop')}" id="${this.uid}-pop" role="listbox" aria-label="${esc(t.suggestions)}" hidden></div>
      </div>`;
    if (o.mode === 'palette') {
      root.dataset.mode = 'palette';
      root.innerHTML = `
        <button type="button" class="ixs-trigger${this._cls('trigger')}" aria-haspopup="dialog">${icon('search', 16)}<span>${esc(o.placeholder ?? t.placeholder)}</span>${hint || `<kbd>${this._mod()}K</kbd>`}</button>
        <div class="ixs-modal${this._cls('modal')}" role="dialog" aria-modal="true" aria-label="${esc(t.label)}" hidden><div class="ixs-scrim"></div><div class="ixs-sheet">${box}</div></div>
        <div class="ixs-sr" aria-live="polite"></div>`;
    } else {
      root.dataset.mode = 'inline';
      root.innerHTML = `${box}
        ${o.results ? `<div class="ixs-bar${this._cls('bar')}" hidden></div><div class="ixs-results${this._cls('results')}" id="${this.uid}-res"></div><div class="ixs-foot"></div>` : ''}
        <div class="ixs-sr" aria-live="polite"></div>`;
    }
    const $ = (s) => root.querySelector(s);
    this.el = {
      input: $('.ixs-input'), pop: $('.ixs-pop'), clear: $('.ixs-clear'), spin: $('.ixs-spin'), ghostTyped: $('.ixs-ghost-typed'), ghostRest: $('.ixs-ghost-rest'),
      bar: $('.ixs-bar'), results: $('.ixs-results'), foot: $('.ixs-foot'), sr: $('.ixs-sr'), modal: $('.ixs-modal'), trigger: $('.ixs-trigger'),
    };
    this.el.input.value = this.state.query;
    this._bindLocal();
  }

  _mod() { return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘' : 'Ctrl '; }

  _applyLook() {
    const r = this.root;
    const o = this.o;
    r.dataset.theme = o.theme || 'light';
    r.dataset.density = o.density || 'comfortable';
    r.dataset.layout = this.state.layout;
    r.style.setProperty('--ixs-accent', o.accent || '');
    if (!o.accent) r.style.removeProperty('--ixs-accent');
    if (o.radius != null) r.style.setProperty('--ixs-radius', `${o.radius}px`); else r.style.removeProperty('--ixs-radius');
  }

  _bindLocal() {
    const { input, pop, clear } = this.el;
    input.addEventListener('input', () => {
      this.state.query = input.value;
      this.state.active = -1;
      this.state.shown = this.o.pageSize;
      this.emit('query', { query: input.value });
      this._schedule();
      this._open();
      this._renderChrome();
    });
    input.addEventListener('focus', () => { this._enterFullscreen(); this._open(); });
    this.root.querySelector('.ixs-back').addEventListener('click', () => { this._exitFullscreen(); input.blur(); });
    input.addEventListener('keydown', (e) => this._onKey(e));
    input.addEventListener('click', () => this._open());
    clear.addEventListener('click', () => { this.setQuery(''); input.focus(); });
    pop.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the input
    pop.addEventListener('click', (e) => {
      const rm = e.target.closest('[data-rm]');
      if (rm) { this.removeRecent(rm.dataset.rm); this._renderPop(); return; }
      if (e.target.closest('[data-clear-recent]')) { this.clearRecent(); this._renderPop(); return; }
      const opt = e.target.closest('[data-o]');
      if (opt) this._choose(+opt.dataset.o, 'click');
    });
    pop.addEventListener('mousemove', (e) => {
      const opt = e.target.closest('[data-o]');
      if (opt && +opt.dataset.o !== this.state.active) this._setActive(+opt.dataset.o, false);
    });
    this.root.addEventListener('focusout', (e) => {
      if (this.state.palette) return;
      if (!e.relatedTarget || !this.root.querySelector('.ixs-box').contains(e.relatedTarget)) setTimeout(() => { if (document.activeElement !== input) this.close(); }, 0);
    });
    this.root.addEventListener('click', (e) => this._onRootClick(e));
    this.root.addEventListener('change', (e) => {
      if (e.target.matches('.ixs-sort')) this.setSort(e.target.value);
      if (e.target.matches('[data-range]')) {
        const key = e.target.dataset.range;
        const box = e.target.closest('.ixs-range');
        const num = (sel) => { const v = box.querySelector(sel).value; return v === '' ? null : Number(v); };
        const min = num('[data-bound="min"]');
        const max = num('[data-bound="max"]');
        const f = { ...this.state.filters };
        if (min == null && max == null) delete f[key];
        else f[key] = [{ ...(min != null ? { min } : {}), ...(max != null ? { max } : {}) }];
        this.setFilters(f);
      }
    });
    this.root.addEventListener('keydown', (e) => {
      const item = e.target.closest?.('.ixs-item[role="button"]');
      if (item && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); item.click(); }
      if (this.state.palette && e.key === 'Escape') { e.preventDefault(); this.closePalette(); }
    });
    if (this.el.trigger) this.el.trigger.addEventListener('click', () => this.openPalette());
    if (this.el.modal) this.el.modal.querySelector('.ixs-scrim').addEventListener('click', () => this.closePalette());
  }

  _bindGlobal() {
    this._onDocKey = (e) => {
      if (e.defaultPrevented || e.isComposing) return;
      const hk = this.o.hotkey;
      const modK = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k';
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditable(e.target);
      if ((hk === 'mod+k' && modK) || (hk === '/' && slash) || (this.o.mode === 'palette' && modK)) {
        e.preventDefault();
        if (this.o.mode === 'palette') this.state.palette ? this.closePalette() : this.openPalette();
        else { this.el.input.focus(); this.el.input.select(); }
      }
    };
    this._onDocDown = (e) => { if (this.state.open && !this.state.palette && !this.root.querySelector('.ixs-box').contains(e.target)) this.close(); };
    document.addEventListener('keydown', this._onDocKey);
    document.addEventListener('pointerdown', this._onDocDown);
  }

  _onRootClick(e) {
    const t = e.target;
    const chip = t.closest('[data-facet]');
    if (chip) { this.toggleFilter(chip.dataset.facet, chip.dataset.value); return; }
    const lay = t.closest('[data-layout-btn]');
    if (lay) { this.setLayout(lay.dataset.layoutBtn); return; }
    if (t.closest('[data-clear-filters]')) { this.clearFilters(); return; }
    const dym = t.closest('[data-dym]');
    if (dym) { this.setQuery(dym.dataset.dym, { submit: true }); return; }
    if (t.closest('[data-more]')) { this.state.shown += this.o.pageSize; this._renderResults(); this._renderFoot(); return; }
    const th = t.closest('th[data-sort]');
    if (th) { const k = th.dataset.sort; this.setSort(this.state.sort === k ? `-${k}` : k); return; }
    const item = t.closest('.ixs-results .ixs-item');
    if (item) {
      const hit = this._visible()[+item.dataset.idx];
      if (hit) this._select(hit, 'results', e);
    }
  }

  // ------------------------------------------------------------- keyboard in the box
  _onKey(e) {
    if (e.isComposing) return;
    const n = this._options.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!this.state.open) { this._open(true); return; }
        if (n) this._setActive(this.state.active + 1 >= n ? 0 : this.state.active + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (n) this._setActive(this.state.active <= 0 ? n - 1 : this.state.active - 1);
        break;
      case 'Home': case 'End':
        if (this.state.open && this.state.active >= 0 && n) { e.preventDefault(); this._setActive(e.key === 'Home' ? 0 : n - 1); }
        break;
      case 'Tab':
      case 'ArrowRight': {
        const g = this._ghost();
        const atEnd = this.el.input.selectionStart === this.el.input.value.length;
        if (g && atEnd && !e.shiftKey) { e.preventDefault(); this.setQuery(g + (e.key === 'Tab' ? ' ' : ''), { keepOpen: true }); }
        else if (e.key === 'Tab' && this.state.active >= 0 && this._options[this.state.active]?.text != null && !e.shiftKey) {
          e.preventDefault();
          this.setQuery(this._options[this.state.active].text, { keepOpen: true });
        }
        break;
      }
      case 'Enter':
        e.preventDefault();
        if (this.state.open && this.state.active >= 0) this._choose(this.state.active, 'keyboard');
        else this.submit();
        break;
      case 'Escape':
        if (this.state.palette) return; // handled by the root listener
        if (this.state.fs && !this.state.open) { e.preventDefault(); this._exitFullscreen(); this.el.input.blur(); return; }
        if (this.state.open && (this._options.length || this.state.query)) { e.preventDefault(); this.close(); }
        else if (this.state.query) { e.preventDefault(); this.setQuery(''); }
        break;
      default:
    }
  }

  _setActive(i, scroll = true) {
    this.state.active = i;
    const opts = this.el.pop.querySelectorAll('[data-o]');
    opts.forEach((el) => {
      const on = +el.dataset.o === i;
      el.classList.toggle('on', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on && scroll && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    });
    if (i >= 0) this.el.input.setAttribute('aria-activedescendant', `${this.uid}-o${i}`);
    else this.el.input.removeAttribute('aria-activedescendant');
    this._renderGhost();
  }

  _choose(i, via) {
    const opt = this._options[i];
    if (!opt) return;
    if (opt.type === 'hit') { this._select(opt.hit, 'suggestions'); return; }
    if (opt.type === 'submit') { this.submit(); return; }
    this.setQuery(opt.text, { submit: true });
    this.emit('suggestionSelect', { text: opt.text, type: opt.type, via });
  }

  _select(hit, via, ev) {
    let prevented = false;
    const detail = { item: hit.item, hit, query: this.state.query, via, preventDefault: () => { prevented = true; } };
    if (this.state.query.trim()) this.addRecent(this.state.query.trim());
    this.emit('select', detail);
    if (prevented && ev) ev.preventDefault();
    if (via === 'suggestions') {
      this.close();
      this._exitFullscreen();
      const url = pick(hit.item, this.o.fields.url);
      if (url && !prevented && typeof location !== 'undefined' && this.o.navigate) location.assign(safeUrl(url));
      else if (!this.state.palette) {
        // no page to open: show the chosen item in the box and the results
        const title = String(pick(hit.item, this.o.fields.title) ?? '');
        if (title) { this.el.input.value = this.state.query = this.state.submitted = title; this._run(); this._renderChrome(); }
      }
      if (this.state.palette) this.closePalette();
    }
  }

  // ------------------------------------------------------------- open / close
  _open(force = false) {
    if (!this.o.suggestions && !this.o.recent && !this.state.palette) return;
    if (this.state.open && !force) { this._renderPop(); return; }
    this.state.open = true;
    this._renderPop();
    this.emit('open');
  }
  open() { this.el.input.focus(); this._open(true); }
  close() {
    if (!this.state.open) return;
    this.state.open = false;
    this.state.active = -1;
    this.el.pop.hidden = true;
    this.el.input.setAttribute('aria-expanded', 'false');
    this.el.input.removeAttribute('aria-activedescendant');
    this._renderGhost();
    this.emit('close');
  }
  openPalette() {
    if (!this.el.modal) return;
    this.state.palette = true;
    const active = document.activeElement;
    // return focus where it came from; the trigger when that was the page itself or the dialog
    this._lastFocus = active && active !== document.body && !this.el.modal.contains(active) ? active : this.el.trigger;
    this.el.modal.hidden = false;
    this.root.classList.add('ixs-palette-open');
    this.el.input.focus();
    this._open(true);
    this.emit('paletteOpen');
  }
  closePalette() {
    if (!this.el.modal || !this.state.palette) return;
    this.state.palette = false;
    this.close();
    this.el.modal.hidden = true;
    this.root.classList.remove('ixs-palette-open');
    if (this._lastFocus && this._lastFocus.focus) this._lastFocus.focus();
    this.emit('paletteClose');
  }

  // ------------------------------------------------------------- searching
  _schedule() {
    clearTimeout(this._timer);
    const d = this.o.source ? Math.max(this.o.debounce, 150) : this.o.debounce;
    if (!d) return this._run();
    this._timer = setTimeout(() => this._run(), d);
  }

  /** Runs the current query. Resolves with the result. */
  _run({ immediate = false } = {}) {
    clearTimeout(this._timer);
    const q = this.state.query;
    const resultsQuery = this.o.instant ? q : this.state.submitted;
    const short = q.trim().length > 0 && q.trim().length < this.o.minChars;
    const opts = { filters: this.state.filters, sort: this.state.sort, facets: this._facetDefs().map((f) => f.key) };
    if (this.o.source) return this._runRemote(short ? '' : resultsQuery, opts, immediate);
    this.result = this.index.search(short ? '' : resultsQuery, opts);
    if (this.o.suggest) this._suggestFor(q).then(() => { if (this.state.open && this.state.query === q) { this._renderPop(); this._renderGhost(); } });
    else this._suggestFor(q);
    this._afterSearch();
    return Promise.resolve(this.result);
  }

  async _runRemote(query, opts) {
    this._ctrl?.abort();
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    this._ctrl = ctrl;
    this.state.loading = true;
    this.state.error = null;
    this._renderChrome();
    if (!this.result) this._renderResults();
    try {
      const res = await this.o.source(query, { signal: ctrl?.signal, filters: opts.filters, sort: opts.sort });
      if (ctrl?.signal.aborted) return this.result;
      const items = Array.isArray(res) ? res : res?.items || [];
      const local = new SearchIndex(items, { ...this._engineOpts() });
      const r = local.search('', { ...opts, sort: opts.sort === 'relevance' ? null : opts.sort });
      r.query = query;
      r.parsed = parseQuery(query);
      if (!Array.isArray(res) && res?.total != null) r.total = res.total;
      this.result = r;
      this._remoteIndex = local;
    } catch (err) {
      if (err?.name === 'AbortError') return this.result;
      this.state.error = err;
      this.result = { hits: [], total: 0, facets: {}, query, parsed: parseQuery(query), didYouMean: null, took: 0 };
      this.emit('error', { error: err });
    } finally {
      if (this._ctrl === ctrl) this.state.loading = false;
    }
    await this._suggestFor(this.state.query);
    this._afterSearch();
    return this.result;
  }

  async _suggestFor(q) {
    const o = this.o;
    if (!o.suggestions || !q.trim()) { this.suggestions = []; return; }
    if (o.suggest) {
      try {
        const r = await o.suggest(q);
        this.suggestions = (r || []).slice(0, o.maxSuggestions).map((s) => (typeof s === 'string' ? { text: s, type: 'completion' } : s));
      } catch { this.suggestions = []; }
      return;
    }
    const idx = o.source ? this._remoteIndex : this.index;
    if (!idx) { this.suggestions = []; return; }
    const phrases = o.phrases ? idx.items.map((it) => pick(it, o.fields.title)).filter(Boolean).map(String) : null;
    this.suggestions = idx.suggest(q, { limit: o.maxSuggestions, phrases });
  }

  _afterSearch() {
    const r = this.result;
    this._renderChrome();
    if (this.state.open) this._renderPop();
    if (this.o.results && this.el.results) { this._renderBar(); this._renderResults(); this._renderFoot(); }
    this.el.sr.textContent = this.state.query.trim() ? this.t.count(r.total, this.state.query.trim()) : '';
    this._writeUrl();
    this.emit('search', { query: r.query, hits: r.hits, total: r.total, filters: { ...this.state.filters }, sort: this.state.sort, result: r });
  }

  // ------------------------------------------------------------- public API
  getQuery() { return this.state.query; }
  getResults() { return this.result; }
  /** Sets the box text and searches right away. { submit } also records it in recent searches. */
  setQuery(q, { submit = false, keepOpen = false } = {}) {
    q = String(q ?? '');
    this.state.query = q;
    this.el.input.value = q;
    this.state.active = -1;
    this.state.shown = this.o.pageSize;
    if (submit) this.state.submitted = q;
    const p = this._run();
    if (submit) {
      if (q.trim()) this.addRecent(q.trim());
      this.close();
      this.emit('submit', { query: q });
    } else if (keepOpen || document.activeElement === this.el.input) this._open(true);
    this._renderChrome();
    return p;
  }
  /** Same as pressing Enter: closes the dropdown, records the query, updates results. */
  submit() {
    this._exitFullscreen();
    const q = this.state.query;
    this.state.submitted = q;
    if (q.trim()) this.addRecent(q.trim());
    const p = this._run();
    this.close();
    this.emit('submit', { query: q });
    return p;
  }
  search(q) { return this.setQuery(q, { submit: true }); }

  getFilters() { return JSON.parse(JSON.stringify(this.state.filters)); }
  setFilters(f) { this.state.filters = { ...(f || {}) }; this.state.shown = this.o.pageSize; this.emit('filter', { filters: this.getFilters() }); return this._run(); }
  toggleFilter(key, value) {
    const cur = new Set(list(this.state.filters[key]).map(String));
    cur.has(String(value)) ? cur.delete(String(value)) : cur.add(String(value));
    const f = { ...this.state.filters };
    if (cur.size) f[key] = [...cur]; else delete f[key];
    return this.setFilters(f);
  }
  clearFilters() { return this.setFilters({}); }
  setSort(sort) {
    const def = (this.o.sorts || []).find((s) => String(s.value) === String(sort) || s.label === sort);
    this.state.sort = def ? def.value : sort || 'relevance';
    this.emit('sort', { sort: this.state.sort });
    return this._run();
  }
  getLayout() { return this.state.layout; }
  setLayout(layout) {
    if (!LAYOUTS.includes(layout) || layout === this.state.layout) return;
    this.state.layout = layout;
    this.root.dataset.layout = layout;
    if (this.el.results) { this._renderBar(); this._renderResults(); }
    this._writeUrl();
    this.emit('layout', { layout });
  }
  setItems(items) { this.o.items = items || []; this.index.setItems(this.o.items); return this._run(); }
  getItems() { return this.index.items.slice(); }
  focus() { this.o.mode === 'palette' ? this.openPalette() : this.el.input.focus(); }

  setOptions(patch = {}) {
    const prev = this.o;
    this.o = { ...prev, ...patch, fields: { ...prev.fields, ...(patch.fields || {}) } };
    if (patch.items) this.index.setItems(patch.items);
    if (ENGINE_KEYS.some((k) => k in patch) || 'facets' in patch) { const { facets, ...e } = this._engineOpts(); this.index.setOptions({ ...e, facets }); }
    if ('filters' in patch) this.state.filters = { ...(patch.filters || {}) };
    if ('sort' in patch) this.state.sort = patch.sort;
    if ('layout' in patch && LAYOUTS.includes(patch.layout)) this.state.layout = patch.layout;
    if ('query' in patch) this.state.query = this.state.submitted = String(patch.query ?? '');
    const rebuild = ['mode', 'results', 'placeholder', 'locale', 'strings', 'hotkey', 'classNames'].some((k) => k in patch);
    if (rebuild) { this._build(); }
    else { this._applyLook(); if (this.el.input.value !== this.state.query) this.el.input.value = this.state.query; }
    this.root.dataset.layout = this.state.layout;
    // only options that change what is found trigger a new search (a server is not asked again for a theme change)
    const SEARCH_KEYS = [...ENGINE_KEYS, 'items', 'source', 'suggest', 'filters', 'sort', 'query', 'facets', 'instant', 'minChars', 'suggestions', 'maxSuggestions', 'phrases', 'fields', 'stemming', 'url'];
    const changed = (k) => k in patch && patch[k] !== prev[k];
    if (SEARCH_KEYS.some(changed) || !this.result) return this._run();
    this._renderChrome();
    if (this.state.open) this._renderPop();
    if (this.o.results && this.el.results) { this._renderBar(); this._renderResults(); this._renderFoot(); }
    return Promise.resolve(this.result);
  }

  // ------------------------------------------------------------- recent searches
  _storeKey() { return `ixs-recent:${this.o.storageKey}`; }
  getRecent() {
    if (!this.o.recent) return [];
    try {
      const v = JSON.parse(localStorage.getItem(this._storeKey()) || 'null');
      if (Array.isArray(v)) return v.slice(0, this.o.maxRecent);
    } catch { /* storage blocked */ }
    return this._recentMem.slice(0, this.o.maxRecent);
  }
  _saveRecent(listv) {
    this._recentMem = listv;
    try { localStorage.setItem(this._storeKey(), JSON.stringify(listv)); } catch { /* storage blocked */ }
  }
  addRecent(q) {
    if (!this.o.recent || !q) return;
    const f = fold(q).trim();
    this._saveRecent([q, ...this.getRecent().filter((x) => fold(x).trim() !== f)].slice(0, Math.max(this.o.maxRecent, 1)));
  }
  removeRecent(q) { this._saveRecent(this.getRecent().filter((x) => x !== q)); }
  clearRecent() { this._saveRecent([]); }

  // ------------------------------------------------------------- rendering: box + dropdown
  _renderChrome() {
    const has = this.state.query.length > 0;
    this.el.clear.hidden = !has;
    this.el.spin.hidden = !this.state.loading;
    this.root.classList.toggle('ixs-has-q', has);
    this.root.classList.toggle('ixs-loading', this.state.loading);
    const hint = this.root.querySelector('.ixs-field > .ixs-hint');
    if (hint && this.o.mode !== 'palette') hint.hidden = has;
    this._renderGhost();
  }

  /** The inline completion shown in grey after the caret (accepted with Tab or →). */
  _ghost() {
    const q = this.state.query;
    if (!q || !this.state.open || this.state.active >= 0) return null;
    const s = this.suggestions.find((x) => x.type !== 'correction');
    if (!s) return null;
    return s.text.toLowerCase().startsWith(q.toLowerCase()) && s.text.length > q.length ? q + s.text.slice(q.length) : null;
  }
  _renderGhost() {
    const g = this._ghost();
    this.el.ghostTyped.textContent = g ? this.state.query : '';
    this.el.ghostRest.textContent = g ? g.slice(this.state.query.length) : '';
  }

  _buildOptions() {
    const o = this.o;
    const q = this.state.query.trim();
    const groups = [];
    if (!q) {
      const recent = this.getRecent();
      if (recent.length) groups.push({ id: 'recent', label: this.t.recent, action: `<button type="button" class="ixs-link" data-clear-recent>${esc(this.t.clearRecent)}</button>`, options: recent.map((text) => ({ type: 'recent', text })) });
      const popular = list(o.popular).filter((p) => !recent.includes(p));
      if (popular.length) groups.push({ id: 'popular', label: this.t.popular, options: popular.map((text) => ({ type: 'popular', text })) });
      if (this.state.palette && this.result) {
        const hits = this.result.hits.slice(0, Math.max(o.maxHits, 6));
        if (hits.length) groups.push({ id: 'hits', label: this.t.results, options: hits.map((hit) => ({ type: 'hit', hit })) });
      }
    } else {
      if (o.suggestions && this.suggestions.length) groups.push({ id: 'suggest', label: this.t.suggestions, options: this.suggestions.map((s) => ({ type: s.type === 'correction' ? 'correction' : 'suggest', kind: s.type, text: s.text, count: s.count })) });
      const showHits = this.state.palette || !o.results || o.maxHits > 0;
      const limit = this.state.palette || !o.results ? Math.max(o.maxHits, 6) : o.maxHits;
      if (showHits && this.result && limit) {
        let hits = this.result.hits.slice(0, limit);
        let label = this.t.results;
        // nothing matched as typed: preview what the best suggestion would find
        const best = this.suggestions[0];
        if (!hits.length && best && !this.o.source) {
          hits = this.index.search(best.text, { filters: this.state.filters, limit }).hits;
          label = `${this.t.results} · ${best.text}`;
        }
        if (hits.length) groups.push({ id: 'hits', label, options: hits.map((hit) => ({ type: 'hit', hit })) });
      }
      // a title completion that is also a result row is shown once, as the result
      const hitGroup = groups.find((g) => g.id === 'hits');
      const sug = groups.find((g) => g.id === 'suggest');
      if (hitGroup && sug) {
        const titles = new Set(hitGroup.options.map((x) => fold(String(pick(x.hit.item, o.fields.title) ?? '')).trim()));
        sug.options = sug.options.filter((x) => !(x.kind === 'phrase' && titles.has(fold(x.text).trim())));
        if (!sug.options.length) groups.splice(groups.indexOf(sug), 1);
      }
    }
    return groups;
  }

  _renderPop() {
    const pop = this.el.pop;
    const groups = this._buildOptions();
    this._options = groups.flatMap((g) => g.options);
    if (this.state.active >= this._options.length) this.state.active = -1;
    if (!this.state.open || !this._options.length) {
      pop.hidden = true;
      pop.innerHTML = '';
      this.el.input.setAttribute('aria-expanded', 'false');
      this._options = this.state.open ? this._options : [];
      this._renderGhost();
      return;
    }
    let i = 0;
    const side = groups.filter((g) => g.id !== 'hits');
    const hitsG = groups.filter((g) => g.id === 'hits');
    const split = side.length > 0 && hitsG.length > 0;
    pop.toggleAttribute('data-split', split);
    const ordered = split ? [...side, ...hitsG] : groups; // option indexes follow the visual order
    const groupHtml = (g) => `
      <div class="ixs-group" role="group"${g.label ? ` aria-label="${esc(g.label)}"` : ''} data-group="${g.id}">
        ${g.label ? `<div class="ixs-group-h" aria-hidden="true"><span>${esc(g.label)}</span>${g.action || ''}</div>` : ''}
        ${g.options.map((opt) => this._optionHtml(opt, i++)).join('')}
      </div>`;
    const body = split
      ? `<div class="ixs-col ixs-col-side">${side.map(groupHtml).join('')}</div><div class="ixs-col ixs-col-hits">${hitsG.map(groupHtml).join('')}</div>`
      : ordered.map(groupHtml).join('');
    this._options = ordered.flatMap((g) => g.options);
    pop.innerHTML = `<div class="ixs-pop-body">${body}</div>` + `
      <div class="ixs-pop-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> ${esc(this.t.navigate)}</span><span><kbd>↵</kbd> ${esc(this.t.select)}</span><span><kbd>Tab</kbd> ${esc(this.t.complete)}</span><span><kbd>Esc</kbd> ${esc(this.t.close)}</span></div>`;
    pop.hidden = false;
    this.el.input.setAttribute('aria-expanded', 'true');
    this._setActive(this.state.active, false);
  }

  _optionHtml(opt, i) {
    const q = this.state.query;
    const id = `${this.uid}-o${i}`;
    const base = `class="ixs-opt${this._cls('option')}${i === this.state.active ? ' on' : ''}" id="${id}" role="option" aria-selected="${i === this.state.active}" data-o="${i}" data-type="${opt.type}"`;
    if (this.o.renderSuggestion) {
      const custom = this.o.renderSuggestion(opt, { query: q, highlight: (s, qq = q) => this._hl(s, qq), esc, icon });
      if (custom != null) return `<div ${base}>${custom}</div>`;
    }
    if (opt.type === 'hit') {
      const it = opt.hit.item;
      const f = this.o.fields;
      const title = pick(it, f.title) ?? '';
      const sub = pick(it, f.subtitle) ?? pick(it, f.badge) ?? '';
      const meta = list(pick(it, f.meta))[0];
      return `<div ${base}>${this._thumb(it, 'sm')}<span class="ixs-opt-main"><span class="ixs-opt-t">${this._hl(title, q)}</span>${sub ? `<span class="ixs-opt-s">${this._hl(String(sub), q)}</span>` : ''}</span>${meta != null ? `<span class="ixs-opt-m">${esc(meta)}</span>` : ''}<span class="ixs-opt-go" aria-hidden="true">${icon('enter', 14)}</span></div>`;
    }
    if (opt.type === 'submit') return `<div ${base}><span class="ixs-opt-ic">${icon('search', 15)}</span><span class="ixs-opt-main"><span class="ixs-opt-t">${esc(this.t.searchFor(opt.text))}</span></span><span class="ixs-opt-go" aria-hidden="true">${icon('enter', 14)}</span></div>`;
    const ic = { recent: 'recent', popular: 'trending', correction: 'fix', suggest: opt.kind === 'phrase' ? 'file' : 'search' }[opt.type];
    let text;
    if (opt.type === 'recent' || opt.type === 'popular') text = esc(opt.text);
    else if (fold(opt.text).startsWith(fold(q)) && q) text = `${esc(opt.text.slice(0, q.length))}<b>${esc(opt.text.slice(q.length))}</b>`; // typed part plain, completion bold
    else text = this._hl(opt.text, q);
    const count = opt.count != null && opt.type !== 'recent' ? `<span class="ixs-opt-n">${opt.count}</span>` : '';
    const rm = opt.type === 'recent' ? `<button type="button" class="ixs-opt-x" tabindex="-1" data-rm="${esc(opt.text)}" aria-label="${esc(this.t.removeRecent)}">${icon('x', 13)}</button>` : '';
    return `<div ${base}><span class="ixs-opt-ic">${icon(ic, 15)}</span><span class="ixs-opt-main"><span class="ixs-opt-t">${text}</span></span>${count}${rm}</div>`;
  }

  // ------------------------------------------------------------- rendering: results
  _renderBar() {
    const bar = this.el.bar;
    const r = this.result;
    if (!bar || !r) return;
    const o = this.o;
    const t = this.t;
    const q = (this.o.instant ? this.state.query : this.state.submitted).trim();
    const facets = this._facetDefs().map((fd) => {
      if (fd.type === 'range') return this._rangeHtml(fd);
      const counts = r.facets?.[fd.key] || {};
      const sel = list(this.state.filters[fd.key]).map(String);
      const vals = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, fd.limit || 8).map(([v]) => v);
      for (const s of sel) if (!vals.includes(s)) vals.push(s);
      if (!vals.length) return '';
      return `<div class="ixs-facet" role="group" aria-label="${esc(fd.label)}"><span class="ixs-facet-l">${esc(fd.label)}</span>${vals.map((v) => {
        const on = sel.includes(v);
        return `<button type="button" class="ixs-chip${this._cls('chip')}${on ? ' on' : ''}" aria-pressed="${on}" data-facet="${esc(fd.key)}" data-value="${esc(v)}">${on ? icon('check', 13) : ''}${esc(v)}<span class="ixs-chip-n">${counts[v] || 0}</span></button>`;
      }).join('')}</div>`;
    }).join('');
    const anyFilter = Object.values(this.state.filters).some((v) => list(v).length);
    const sorts = o.sorts?.length ? `<label class="ixs-sortw">${icon('sort', 14)}<span class="ixs-sr">${esc(t.sort)}</span><select class="ixs-sort" aria-label="${esc(t.sort)}"><option value="relevance">${esc(t.relevance)}</option>${o.sorts.map((s) => `<option value="${esc(s.value)}"${String(s.value) === String(this.state.sort) ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>` : '';
    const layouts = o.layouts.length > 1 ? `<div class="ixs-layouts" role="group" aria-label="${esc(t.layout)}">${o.layouts.map((l) => `<button type="button" data-layout-btn="${l}" class="${l === this.state.layout ? 'on' : ''}" aria-pressed="${l === this.state.layout}" title="${esc(t.layouts[l] || l)}" aria-label="${esc(t.layouts[l] || l)}">${icon(l, 15)}</button>`).join('')}</div>` : '';
    bar.hidden = false;
    bar.innerHTML = `
      <div class="ixs-bar-row">
        <span class="ixs-count">${esc(t.count(r.total, q))}${q && r.took != null ? `<span class="ixs-took"> · ${Math.max(0, r.took).toFixed(r.took < 10 ? 1 : 0)} ms</span>` : ''}</span>
        <span class="ixs-bar-r">${anyFilter ? `<button type="button" class="ixs-link" data-clear-filters>${esc(t.clearFilters)}</button>` : ''}${sorts}${layouts}</span>
      </div>
      ${facets ? `<div class="ixs-facets">${facets}</div>` : ''}`;
  }

  _rangeHtml(fd) {
    const nums = (this.o.source ? this._remoteIndex?.items : this.index.items || []).map((it) => Number(pick(it, fd.key))).filter(Number.isFinite);
    const lo = nums.length ? Math.min(...nums) : '';
    const hi = nums.length ? Math.max(...nums) : '';
    const cur = list(this.state.filters[fd.key])[0] || {};
    const t = this.t;
    const input = (bound, ph, val) => `<label class="ixs-num"><span class="ixs-sr">${esc(fd.label)} ${esc(t[bound])}</span>${fd.prefix ? `<span class="ixs-num-p" aria-hidden="true">${esc(fd.prefix)}</span>` : ''}<input type="number" inputmode="decimal" data-range="${esc(fd.key)}" data-bound="${bound}" placeholder="${esc(ph)}" value="${val ?? ''}"${fd.step ? ` step="${fd.step}"` : ''}></label>`;
    return `<div class="ixs-facet ixs-range" role="group" aria-label="${esc(fd.label)}"><span class="ixs-facet-l">${esc(fd.label)}</span>${input('min', lo, cur.min)}<span class="ixs-range-dash" aria-hidden="true">–</span>${input('max', hi, cur.max)}</div>`;
  }

  _visible() { return this.result ? this.result.hits.slice(0, this.state.shown) : []; }

  _renderResults() {
    const box = this.el.results;
    if (!box) return;
    const layout = this.state.layout;
    box.dataset.layout = layout;
    box.className = `ixs-results${this._cls('results')}`;
    if (this.state.loading && !this.result) { box.innerHTML = this._skeleton(layout); return; }
    const r = this.result;
    if (!r) { box.innerHTML = ''; return; }
    box.classList.toggle('ixs-stale', this.state.loading);
    if (!r.hits.length) { box.innerHTML = this._empty(r); return; }
    const hits = this._visible();
    const q = r.query;
    if (layout === 'table') { box.innerHTML = this._table(hits, q); return; }
    const groupBy = this.o.groupBy;
    if (groupBy) {
      // groups keep the ranking: a group appears where its best result would be
      const groups = new Map();
      hits.forEach((hit, i) => {
        const label = String(pick(hit.item, groupBy) ?? '—');
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push([hit, i]);
      });
      box.removeAttribute('role');
      box.classList.add('ixs-grouped');
      box.innerHTML = [...groups].map(([label, rows]) => `<section class="ixs-gsec" aria-label="${esc(label)}"><h3 class="ixs-gtitle">${esc(label)}<span>${rows.length}</span></h3><div class="ixs-gres" data-layout="${layout}" role="list">${rows.map(([hit, i]) => this._itemHtml(hit, i, layout, q)).join('')}</div></section>`).join('');
    } else {
      box.setAttribute('role', 'list');
      box.innerHTML = hits.map((hit, i) => this._itemHtml(hit, i, layout, q)).join('');
    }
    if (this.o.renderItem) {
      // Nodes returned by renderItem are mounted after the HTML pass
      box.querySelectorAll('[data-node]').forEach((el) => { const n = this._nodes?.[+el.dataset.node]; if (n) el.replaceWith(n); });
      this._nodes = null;
    }
  }

  _renderFoot() {
    const foot = this.el.foot;
    if (!foot) return;
    const r = this.result;
    const left = r ? Math.max(0, r.hits.length - this.state.shown) : 0;
    foot.innerHTML = left ? `<button type="button" class="ixs-more${this._cls('more')}" data-more>${esc(this.t.more(Math.min(left, this.o.pageSize)))}</button>` : '';
    if (this.o.infinite && left && typeof IntersectionObserver !== 'undefined') {
      this._io?.disconnect();
      this._io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { this._io.disconnect(); this.state.shown += this.o.pageSize; this._renderResults(); this._renderFoot(); }
      }, { rootMargin: '200px' });
      this._io.observe(foot.firstElementChild);
    }
  }

  _ctx(hit, layout, q, i) {
    return { layout, query: q, index: i, highlight: (s) => this._hl(s, q), esc, icon, snippet: (s, n) => snippet(s, q, { length: n, stemming: this._stemming() }), matches: hit.matches, search: this };
  }

  _itemHtml(hit, i, layout, q) {
    const it = hit.item;
    const f = this.o.fields;
    const url = pick(it, f.url);
    const tag = url ? 'a' : 'div';
    const attrs = url ? `href="${esc(safeUrl(url))}"` : 'role="button" tabindex="0"';
    const open = `<${tag} class="ixs-item ixs-${layout}-item${this._cls('item')}" ${attrs} data-idx="${i}" data-id="${esc(hit.id)}">`;
    if (this.o.renderItem) {
      const out = this.o.renderItem(hit, this._ctx(hit, layout, q, i));
      if (out != null) {
        if (typeof out === 'string') return `<div role="listitem" class="ixs-li">${open}${out}</${tag}></div>`;
        (this._nodes ||= [])[i] = out;
        return `<div role="listitem" class="ixs-li">${open}<span data-node="${i}"></span></${tag}></div>`;
      }
    }
    const title = String(pick(it, f.title) ?? '');
    const sub = pick(it, f.subtitle);
    const descRaw = pick(it, f.description);
    const len = { list: 160, cards: 120, media: 220, compact: 0, grid: 0 }[layout];
    const desc = descRaw && len ? this._hl(snippet(String(descRaw), q, { length: len, stemming: this._stemming() }), q) : '';
    const badge = pick(it, f.badge);
    const tags = list(pick(it, f.tags)).slice(0, layout === 'compact' ? 2 : 4);
    const meta = list(pick(it, f.meta));
    const H = (s) => this._hl(String(s), q);
    const badgeHtml = badge ? `<span class="ixs-badge">${H(badge)}</span>` : '';
    const tagsHtml = tags.length ? `<span class="ixs-tags">${tags.map((x) => `<span class="ixs-tag">${H(x)}</span>`).join('')}</span>` : '';
    const metaHtml = meta.length ? `<span class="ixs-meta">${meta.map((m) => `<span>${esc(m)}</span>`).join('')}</span>` : '';
    const titleHtml = `<span class="ixs-title">${H(title)}</span>`;
    const subHtml = sub ? `<span class="ixs-sub">${H(sub)}</span>` : '';
    const descHtml = desc ? `<span class="ixs-desc">${desc}</span>` : '';
    let body;
    switch (layout) {
      case 'cards':
        body = `${this._cover(it, badgeHtml)}<span class="ixs-body">${titleHtml}${subHtml}${descHtml}${tagsHtml}</span>${metaHtml ? `<span class="ixs-cfoot">${metaHtml}</span>` : ''}`;
        break;
      case 'grid':
        body = `${this._cover(it, '')}<span class="ixs-body">${titleHtml}${subHtml || metaHtml}${subHtml && meta.length ? `<span class="ixs-grid-meta">${esc(meta.join(' · '))}</span>` : ''}</span>`;
        break;
      case 'media':
        body = `${this._cover(it, '')}<span class="ixs-body">${badgeHtml}${titleHtml}${subHtml}${descHtml}${tagsHtml}${metaHtml}</span>`;
        break;
      case 'compact':
        body = `${this._thumb(it, 'xs')}${titleHtml}${subHtml}${badgeHtml}${metaHtml}<span class="ixs-go" aria-hidden="true">${icon('enter', 14)}</span>`;
        break;
      default: // list
        body = `${this._thumb(it, 'md')}<span class="ixs-body"><span class="ixs-row">${titleHtml}${badgeHtml}</span>${subHtml}${descHtml}${tagsHtml}</span>${metaHtml}`;
    }
    return `<div role="listitem" class="ixs-li">${open}${body}</${tag}></div>`;
  }

  _iconHtml(it, size) {
    const v = pick(it, this.o.fields.icon);
    if (!v) return '';
    if (typeof v === 'string' && v.trim().startsWith('<svg')) return v; // trusted markup from your data
    if (typeof v === 'string' && ICONS[v]) return icon(v, size);
    return '';
  }
  _thumb(it, size) {
    const f = this.o.fields;
    const img = pick(it, f.image);
    const color = pick(it, f.color);
    const px = { xs: 15, sm: 16, md: 20 }[size];
    if (img) return `<span class="ixs-thumb ixs-thumb-${size} has-img"><img src="${esc(safeUrl(img))}" alt="" loading="lazy"></span>`;
    const ic = this._iconHtml(it, px);
    const title = String(pick(it, f.title) ?? '');
    return `<span class="ixs-thumb ixs-thumb-${size}"${color ? ` style="--c:${esc(color)}"` : ''}>${ic || `<span class="ixs-initial">${esc(initials(title, size === 'md' ? 2 : 1))}</span>`}</span>`;
  }
  _cover(it, overlay) {
    const f = this.o.fields;
    const img = pick(it, f.image);
    const color = pick(it, f.color);
    if (img) return `<span class="ixs-cover has-img"><img src="${esc(safeUrl(img))}" alt="" loading="lazy">${overlay}</span>`;
    const ic = this._iconHtml(it, 34);
    const title = String(pick(it, f.title) ?? '');
    return `<span class="ixs-cover"${color ? ` style="--c:${esc(color)}"` : ''}>${ic || `<span class="ixs-initial">${esc(initials(title, 2))}</span>`}${overlay}</span>`;
  }

  _table(hits, q) {
    const f = this.o.fields;
    const cols = this.o.columns || [
      { key: f.title, label: 'Name', sortable: typeof f.title === 'string' },
      f.subtitle && { key: f.subtitle, label: '' },
      f.badge && { key: f.badge, label: '', sortable: typeof f.badge === 'string' },
      f.meta && { key: f.meta, label: '' },
    ].filter(Boolean);
    const sortKey = String(this.state.sort || '').replace(/^-/, '');
    const dir = String(this.state.sort || '').startsWith('-') ? 'descending' : 'ascending';
    const head = cols.map((c) => {
      const sortable = c.sortable && typeof c.key === 'string';
      const on = sortable && sortKey === c.key;
      const al = c.align === 'right' || c.align === 'center' ? ` data-align="${c.align}"` : '';
      return `<th scope="col"${al}${sortable ? ` data-sort="${esc(c.key)}" class="ixs-th-sort${on ? ' on' : ''}" aria-sort="${on ? dir : 'none'}"` : ''}>${esc(c.label)}${sortable ? `<span class="ixs-th-i">${on ? (dir === 'ascending' ? '↑' : '↓') : '↕'}</span>` : ''}</th>`;
    }).join('');
    const rows = hits.map((hit, i) => {
      const it = hit.item;
      const url = pick(it, f.url);
      const cells = cols.map((c, ci) => {
        const v = list(pick(it, c.key)).join(', ');
        const inner = c.render ? c.render(it, { highlight: (s) => this._hl(s, q), esc }) : ci === 0 ? `<span class="ixs-cell1">${this._thumb(it, 'xs')}<span class="ixs-title">${this._hl(v, q)}</span></span>` : this._hl(v, q);
        const al = c.align === 'right' || c.align === 'center' ? ` data-align="${c.align}"` : '';
        return ci === 0 && url ? `<td${al}><a href="${esc(safeUrl(url))}" class="ixs-cell-a">${inner}</a></td>` : `<td${al}>${inner}</td>`;
      }).join('');
      return `<tr class="ixs-item ixs-table-item${this._cls('item')}" data-idx="${i}" data-id="${esc(hit.id)}"${url ? '' : ' tabindex="0" role="button"'}>${cells}</tr>`;
    }).join('');
    this.el.results.removeAttribute('role');
    return `<div class="ixs-table-wrap"><table class="ixs-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  _skeleton(layout) {
    const n = layout === 'grid' ? 8 : layout === 'cards' ? 6 : 5;
    return Array.from({ length: n }, () => `<div class="ixs-li"><div class="ixs-item ixs-${layout}-item ixs-skel"><span class="ixs-sk ixs-sk-a"></span><span class="ixs-sk ixs-sk-b"></span><span class="ixs-sk ixs-sk-c"></span></div></div>`).join('');
  }

  _empty(r) {
    const t = this.t;
    const ctx = { query: r.query, didYouMean: r.didYouMean, filters: this.getFilters(), esc, icon };
    if (this.o.emptyState) { const c = this.o.emptyState(ctx); if (c != null) return `<div class="ixs-empty${this._cls('empty')}">${c}</div>`; }
    const anyFilter = Object.values(this.state.filters).some((v) => list(v).length);
    this.el.results.removeAttribute('role');
    return `<div class="ixs-empty${this._cls('empty')}">
      <span class="ixs-empty-i">${icon(this.state.error ? 'zap' : 'search', 22)}</span>
      <p class="ixs-empty-t">${esc(this.state.error ? t.error : r.query ? `${t.empty} · “${r.query}”` : t.empty)}</p>
      ${r.didYouMean ? `<p class="ixs-dym">${esc(t.didYouMean)} <button type="button" class="ixs-link" data-dym="${esc(r.didYouMean)}">${esc(r.didYouMean)}</button>?</p>` : `<p class="ixs-empty-h">${esc(t.emptyHint)}</p>`}
      ${anyFilter ? `<button type="button" class="ixs-btn" data-clear-filters>${esc(t.clearFilters)}</button>` : ''}
    </div>`;
  }

  // ------------------------------------------------------------- phone full-screen mode
  _fsWanted() {
    const f = this.o.fullscreen;
    if (this.o.mode === 'palette' || !f) return false;
    if (f === true) return true;
    return typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;
  }
  _enterFullscreen() {
    if (this.state.fs || !this._fsWanted()) return;
    this.state.fs = true;
    this.root.classList.add('ixs-fs');
    document.documentElement.classList.add('ixs-fs-lock');
    this.emit('fullscreen', { open: true });
  }
  _exitFullscreen() {
    if (!this.state.fs) return;
    this.state.fs = false;
    this.root.classList.remove('ixs-fs');
    if (!document.querySelector('.ixs.ixs-fs')) document.documentElement.classList.remove('ixs-fs-lock');
    this.emit('fullscreen', { open: false });
  }

  // ------------------------------------------------------------- URL state
  _urlPrefix() { return typeof this.o.url === 'object' && this.o.url?.prefix ? this.o.url.prefix : ''; }
  _readUrl() {
    if (typeof location === 'undefined') return;
    const p = new URLSearchParams(location.search);
    const pre = this._urlPrefix();
    const q = p.get(`${pre}q`);
    if (q != null) this.state.query = this.state.submitted = q;
    const sort = p.get(`${pre}sort`);
    if (sort) this.state.sort = sort;
    const view = p.get(`${pre}view`);
    if (view && this.o.layouts.includes(view)) this.state.layout = view;
    const filters = {};
    for (const fd of this._facetDefs()) {
      const v = p.get(`${pre}${fd.key}`);
      if (v == null || v === '') continue;
      if (fd.type === 'range') {
        const [a, b] = v.split('..');
        filters[fd.key] = [{ ...(a !== '' && a != null ? { min: Number(a) } : {}), ...(b !== '' && b != null ? { max: Number(b) } : {}) }];
      } else filters[fd.key] = v.split('|');
    }
    if (Object.keys(filters).length) this.state.filters = filters;
  }
  _writeUrl() {
    if (!this.o.url || typeof history === 'undefined' || typeof location === 'undefined') return;
    const p = new URLSearchParams(location.search);
    const pre = this._urlPrefix();
    const set = (k, v) => (v == null || v === '' ? p.delete(pre + k) : p.set(pre + k, v));
    set('q', (this.o.instant ? this.state.query : this.state.submitted).trim());
    set('sort', this.state.sort && this.state.sort !== 'relevance' && typeof this.state.sort === 'string' ? this.state.sort : null);
    set('view', this.state.layout !== (this.o.layouts.includes(this.o.layout) ? this.o.layout : this.o.layouts[0]) ? this.state.layout : null);
    for (const fd of this._facetDefs()) {
      const v = list(this.state.filters[fd.key]);
      if (fd.type === 'range') { const r = v[0]; set(fd.key, r && (r.min != null || r.max != null) ? `${r.min ?? ''}..${r.max ?? ''}` : null); }
      else set(fd.key, v.length ? v.join('|') : null);
    }
    const next = `${location.pathname}${p.toString() ? `?${p}` : ''}${location.hash}`;
    if (next !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(history.state, '', next);
  }

  destroy() {
    clearTimeout(this._timer);
    this._ctrl?.abort();
    this._io?.disconnect();
    this._exitFullscreen();
    if (this._onPop) window.removeEventListener('popstate', this._onPop);
    document.removeEventListener('keydown', this._onDocKey);
    document.removeEventListener('pointerdown', this._onDocDown);
    this.emit('destroy');
    this.root?.remove();
    this.handlers = {};
  }
}

export const createSearch = (target, options) => new Search(target, options);
