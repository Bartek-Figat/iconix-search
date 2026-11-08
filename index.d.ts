// Type definitions for @iconix/search

export type Layout = 'list' | 'cards' | 'grid' | 'compact' | 'media' | 'table';
export type Accessor<T = any> = string | ((item: T) => unknown);
export type KeyInput<T = any> = string | { name: string; weight?: number; get?: (item: T) => unknown };
export type FilterValue = string | number | Array<string | number> | { min?: number; max?: number }[] | ((value: unknown, item: any) => boolean);
export type Filters = Record<string, FilterValue>;
export type SortInput<T = any> = 'relevance' | string | { key: string; dir?: 'asc' | 'desc' } | ((a: T, b: T) => number);

export interface EngineOptions<T = any> {
  /** Keys to search with optional weights. Guessed from the first item when omitted. */
  keys?: KeyInput<T>[] | null;
  /** Id property or getter. Default 'id'. */
  id?: string | ((item: T) => string | number);
  /** Allowed typos: 'auto' (0 under 4 letters, 1 up to 7, 2 above), a number, or false. */
  fuzzy?: 'auto' | number | false;
  /** Match word prefixes (the last word always). Default true. */
  prefix?: boolean;
  /** Match inside words for terms of 3+ letters. Default true. */
  infix?: boolean;
  /** 'all' terms must match (default) or 'any'. */
  match?: 'all' | 'any';
  synonyms?: Record<string, string | string[]> | null;
  stopWords?: string[] | null;
  /** Multiplies the score of an item. */
  boost?: ((item: T) => number) | null;
  /** Keys to count values for. */
  facets?: string[] | null;
  /** Match other word forms ("running" -> "run", "butów" -> "buty"). Default 'en'; the UI uses 'en+pl' for a Polish locale. */
  stemming?: 'en' | 'pl' | 'en+pl' | ((word: string) => string) | false;
  /** 'bm25' (default) weighs rare words and short fields higher; 'simple' turns that off. */
  ranking?: 'bm25' | 'simple';
}

export interface ParsedQuery { terms: string[]; phrases: string[]; exclude: string[]; fields: Record<string, string[]>; text: string }
export interface Hit<T = any> { item: T; id: string | number; score: number; matches: Record<string, [number, number][]> }
export interface SearchResult<T = any> {
  hits: Hit<T>[];
  total: number;
  facets: Record<string, Record<string, number>>;
  query: string;
  parsed: ParsedQuery;
  /** A corrected query when nothing matched. */
  didYouMean: string | null;
  took: number;
}
export interface Suggestion { text: string; type: 'completion' | 'correction' | 'phrase'; count: number | null }

export declare class SearchIndex<T = any> {
  constructor(items?: T[], options?: EngineOptions<T>);
  readonly items: T[];
  readonly size: number;
  setItems(items: T[]): this;
  setOptions(options: EngineOptions<T>): void;
  add(item: T): this;
  remove(id: string | number): boolean;
  search(query?: string | ParsedQuery, options?: { filters?: Filters; sort?: SortInput<T>; limit?: number; offset?: number; facets?: string[] }): SearchResult<T>;
  suggest(query?: string, options?: { limit?: number; phrases?: string[] | null }): Suggestion[];
  correct(text: string): string | null;
  vocabulary(): Map<string, number>;
}
export declare function createIndex<T = any>(items?: T[], options?: EngineOptions<T>): SearchIndex<T>;
export declare function parseQuery(query: string, fieldNames?: string[] | null): ParsedQuery;
export declare function fold(text: string): string;
export declare function tokenize(text: string): { t: string; s: number; e: number }[];
export declare function distance(a: string, b: string, max?: number): number;
export declare function findRanges(text: string, query: string | ParsedQuery, options?: { fuzzy?: 'auto' | number | false; stemming?: EngineOptions['stemming'] }): [number, number][];
/** Escapes text and wraps matches in <mark>. */
export declare function highlight(text: string, rangesOrQuery: string | [number, number][], options?: { tag?: string; className?: string; stemming?: EngineOptions['stemming']; fuzzy?: 'auto' | number | false }): string;
export declare function snippet(text: string, query: string, options?: { length?: number; stemming?: EngineOptions['stemming'] }): string;
export declare function stemEn(word: string): string;
export declare function stemPl(word: string): string;
export declare function stemmerFor(option: EngineOptions['stemming'] | string | null): ((word: string) => string) | null;
export declare function escapeHtml(text: unknown): string;
export declare function mergeRanges(r: [number, number][]): [number, number][];
export declare const ENGINE_DEFAULTS: Required<EngineOptions>;

export interface Fields<T = any> {
  title?: Accessor<T>;
  subtitle?: Accessor<T> | null;
  description?: Accessor<T> | null;
  /** Image URL. */
  image?: Accessor<T> | null;
  /** SVG markup or a built-in icon name. */
  icon?: Accessor<T> | null;
  /** Tint for the thumbnail / cover. */
  color?: Accessor<T> | null;
  badge?: Accessor<T> | null;
  tags?: Accessor<T> | null;
  /** One value or a list, e.g. price and rating. */
  meta?: Accessor<T> | null;
  url?: Accessor<T> | null;
}

export interface RenderContext<T = any> {
  layout: Layout;
  query: string;
  index: number;
  highlight(text: string): string;
  esc(text: unknown): string;
  icon(name: string, size?: number): string;
  snippet(text: string, length?: number): string;
  matches: Hit<T>['matches'];
  search: Search<T>;
}

export interface SuggestionOption<T = any> { type: 'recent' | 'popular' | 'suggest' | 'correction' | 'hit' | 'submit'; text?: string; hit?: Hit<T>; count?: number | null }

export interface SearchOptions<T = any> extends EngineOptions<T> {
  items?: T[];
  /** Load results from a server instead of `items`. Stale requests are aborted. */
  source?: ((query: string, ctx: { signal?: AbortSignal; filters: Filters; sort: SortInput<T> }) => Promise<T[] | { items: T[]; total?: number }> | T[]) | null;
  /** Replace the built-in completions. */
  suggest?: ((query: string) => Promise<Array<string | Suggestion>> | Array<string | Suggestion>) | null;
  fields?: Fields<T>;
  columns?: { key: Accessor<T>; label: string; sortable?: boolean; align?: 'left' | 'right' | 'center'; render?: (item: T, ctx: { highlight(s: string): string; esc(s: unknown): string }) => string }[] | null;
  mode?: 'inline' | 'palette';
  results?: boolean;
  instant?: boolean;
  layout?: Layout;
  layouts?: Layout[];
  /** Chips per value, or `type: 'range'` for min / max number inputs (filters as [{ min, max }]). */
  facets?: Array<string | { key: string; label?: string; limit?: number; type?: 'values' } | { key: string; label?: string; type: 'range'; prefix?: string; step?: number }> | any;
  /** Phones: the focused box fills the screen. 'auto' (default) = viewport up to 640px. */
  fullscreen?: 'auto' | boolean;
  /** Keep query, filters, sort and layout in the address bar (replaceState). */
  url?: boolean | { prefix?: string };
  /** Show results in titled groups (all layouts but table). */
  groupBy?: Accessor<T> | null;
  /** Load the next page when "Show more" scrolls into view. */
  infinite?: boolean;
  sorts?: { label: string; value: SortInput<T> }[];
  filters?: Filters;
  sort?: SortInput<T>;
  query?: string;
  placeholder?: string | null;
  suggestions?: boolean;
  maxSuggestions?: number;
  maxHits?: number;
  phrases?: boolean;
  recent?: boolean;
  maxRecent?: number;
  storageKey?: string;
  popular?: string[];
  pageSize?: number;
  debounce?: number;
  minChars?: number;
  hotkey?: '/' | 'mod+k' | false;
  theme?: 'light' | 'dark' | 'auto';
  accent?: string | null;
  radius?: number | null;
  density?: 'compact' | 'comfortable' | 'spacious';
  locale?: string;
  strings?: Partial<Record<string, unknown>> | null;
  classNames?: Partial<Record<keyof typeof PARTS, string>>;
  navigate?: boolean;
  renderItem?: ((hit: Hit<T>, ctx: RenderContext<T>) => string | Node | null) | null;
  renderSuggestion?: ((option: SuggestionOption<T>, ctx: { query: string; highlight: typeof highlight; esc: typeof escapeHtml; icon: (name: string, size?: number) => string }) => string | null) | null;
  emptyState?: ((ctx: { query: string; didYouMean: string | null; filters: Filters }) => string | null) | null;

  onSearch?: (e: { query: string; hits: Hit<T>[]; total: number; filters: Filters; sort: SortInput<T>; result: SearchResult<T> }, s: Search<T>) => void;
  onSelect?: (e: { item: T; hit: Hit<T>; query: string; via: 'suggestions' | 'results'; preventDefault(): void }, s: Search<T>) => void;
  onSubmit?: (e: { query: string }, s: Search<T>) => void;
  onQuery?: (e: { query: string }, s: Search<T>) => void;
  onFilter?: (e: { filters: Filters }, s: Search<T>) => void;
  onSort?: (e: { sort: SortInput<T> }, s: Search<T>) => void;
  onLayout?: (e: { layout: Layout }, s: Search<T>) => void;
  onSuggestionSelect?: (e: { text: string; type: string; via: string }, s: Search<T>) => void;
  onError?: (e: { error: unknown }, s: Search<T>) => void;
  onFullscreen?: (e: { open: boolean }, s: Search<T>) => void;
}

export declare class Search<T = any> {
  constructor(target: string | HTMLElement, options?: SearchOptions<T>);
  readonly root: HTMLElement;
  readonly index: SearchIndex<T>;
  on(name: string, fn: (...args: any[]) => void): () => void;
  off(name: string, fn: (...args: any[]) => void): void;
  getQuery(): string;
  setQuery(query: string, options?: { submit?: boolean; keepOpen?: boolean }): Promise<SearchResult<T>>;
  search(query: string): Promise<SearchResult<T>>;
  submit(): Promise<SearchResult<T>>;
  getResults(): SearchResult<T> | null;
  getFilters(): Filters;
  setFilters(filters: Filters): Promise<SearchResult<T>>;
  toggleFilter(key: string, value: string): Promise<SearchResult<T>>;
  clearFilters(): Promise<SearchResult<T>>;
  setSort(sort: SortInput<T>): Promise<SearchResult<T>>;
  getLayout(): Layout;
  setLayout(layout: Layout): void;
  setItems(items: T[]): Promise<SearchResult<T>>;
  getItems(): T[];
  setOptions(options: Partial<SearchOptions<T>>): Promise<SearchResult<T>>;
  focus(): void;
  open(): void;
  close(): void;
  openPalette(): void;
  closePalette(): void;
  getRecent(): string[];
  addRecent(query: string): void;
  removeRecent(query: string): void;
  clearRecent(): void;
  destroy(): void;
}
export declare function createSearch<T = any>(target: string | HTMLElement, options?: SearchOptions<T>): Search<T>;
export declare const DEFAULTS: SearchOptions;
export declare const LAYOUTS: Layout[];
export declare const PARTS: { root: string; box: string; field: string; input: string; pop: string; option: string; bar: string; chip: string; results: string; item: string; empty: string; more: string; trigger: string; modal: string };
export declare const STRINGS: Record<string, Record<string, unknown>>;
export declare function getStrings(locale?: string, overrides?: Record<string, unknown> | null): Record<string, any>;
export declare const ICONS: Record<string, unknown>;
export declare function icon(name: string, size?: number): string;
export declare function iconFrom(data: unknown, size?: number): string;
