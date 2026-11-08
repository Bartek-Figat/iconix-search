// Reference tables for the site.
export const OPT_DOCS = [
  ['items', '[]', 'The data to search. Any objects.'],
  ['keys', 'guessed', 'Keys to search, with optional weights: <code>[{ name: \'title\', weight: 3 }, \'tags\']</code>. Nested paths like <code>author.name</code> work.'],
  ['fields', '{ title: \'title\' }', 'What to show: <code>title</code>, <code>subtitle</code>, <code>description</code>, <code>image</code>, <code>icon</code>, <code>color</code>, <code>badge</code>, <code>tags</code>, <code>meta</code>, <code>url</code>. A key or <code>(item) =&gt; value</code>.'],
  ['layout', "'list'", "<code>'list' | 'cards' | 'grid' | 'compact' | 'media' | 'table'</code>"],
  ['layouts', 'all six', 'Layouts offered in the switcher. One entry hides the switcher.'],
  ['facets', '[]', 'Keys to filter by, shown as chips with counts: <code>[\'brand\']</code> or <code>[{ key, label, limit }]</code>. <code>{ key: \'price\', type: \'range\', prefix: \'$\' }</code> gives min / max inputs.'],
  ['sorts', '[]', 'Sort choices: <code>[{ label: \'Price\', value: \'price\' }, { label: \'Newest\', value: \'-date\' }]</code>.'],
  ['filters', '{}', 'Initial filters: <code>{ brand: [\'Sony\'], price: [{ min: 50, max: 200 }] }</code>.'],
  ['columns', 'auto', 'Table layout columns: <code>[{ key, label, sortable, render }]</code>.'],
  ['source', 'null', 'Async search on a server: <code>(query, { signal, filters, sort }) =&gt; items</code>. Old requests are aborted.'],
  ['suggest', 'null', 'Your own completions: <code>(query) =&gt; string[]</code>, sync or async.'],
  ['mode', "'inline'", "<code>'palette'</code> renders a trigger button and a ⌘K dialog."],
  ['results', 'true', 'Render the results panel. <code>false</code> gives an autocomplete box with hits in the dropdown.'],
  ['instant', 'true', 'Update results while typing. <code>false</code> waits for Enter.'],
  ['stemming', "'en'", 'Other word forms: <code>\'en\'</code>, <code>\'pl\'</code>, <code>\'en+pl\'</code>, your own <code>(word) =&gt; stem</code> or <code>false</code>. A Polish UI uses <code>\'en+pl\'</code>.'],
  ['ranking', "'bm25'", 'Rare words and short fields count more. <code>\'simple\'</code> turns that off.'],
  ['fuzzy', "'auto'", 'Typos allowed: <code>\'auto\'</code> (0 under 4 letters, 1 up to 7, 2 above), a number, or <code>false</code>.'],
  ['match', "'all'", "<code>'all'</code> words must match, or <code>'any'</code>."],
  ['synonyms', 'null', '<code>{ tv: [\'television\'] }</code>, both directions.'],
  ['stopWords', 'null', 'Words to ignore unless they are the whole query.'],
  ['boost', 'null', '<code>(item) =&gt; number</code> multiplies the score, e.g. to lift items in stock.'],
  ['suggestions', 'true', 'Show completions and corrections in the dropdown.'],
  ['maxSuggestions', '5', 'How many completions to show.'],
  ['maxHits', '4', 'Results previewed in the dropdown (more in palette and autocomplete mode).'],
  ['phrases', 'true', 'Also complete whole titles.'],
  ['recent', 'true', 'Remember searches in <code>localStorage</code>.'],
  ['maxRecent', '5', 'How many recent searches to keep.'],
  ['storageKey', "'default'", 'Separates the history of several boxes.'],
  ['popular', '[]', 'Searches shown when the box is empty.'],
  ['pageSize', '12', 'Results per “Show more” step.'],
  ['debounce', '60', 'Milliseconds to wait while typing (at least 150 with a <code>source</code>).'],
  ['minChars', '1', 'Characters needed before searching.'],
  ['hotkey', "'/'", "<code>'/'</code>, <code>'mod+k'</code> or <code>false</code>."],
  ['placeholder', 'localized', 'Placeholder text.'],
  ['query', "''", 'Initial query.'],
  ['sort', "'relevance'", 'Initial sort.'],
  ['theme', "'light'", "<code>'light' | 'dark' | 'auto'</code>"],
  ['accent', 'null', 'Accent color (focus ring, links).'],
  ['radius', 'null', 'Corner radius in px.'],
  ['density', "'comfortable'", "<code>'compact' | 'comfortable' | 'spacious'</code>"],
  ['locale', "'en'", 'UI language: <code>en</code> and <code>pl</code> ship in the box.'],
  ['strings', 'null', 'Override any UI string.'],
  ['classNames', '{}', 'Extra classes per part: root, box, field, input, pop, option, bar, chip, results, item, empty, more, trigger, modal.'],
  ['navigate', 'true', 'Choosing a dropdown hit that has a <code>url</code> opens it.'],
  ['fullscreen', "'auto'", 'On phones (up to 640px) the focused box fills the screen, with a back button. <code>true</code> / <code>false</code> to force.'],
  ['url', 'false', 'Keep query, filters, sort and layout in the address bar so results can be shared. <code>{ prefix: \'s.\' }</code> to namespace.'],
  ['groupBy', 'null', 'A key or <code>(item) =&gt; label</code>: results in titled groups, in ranking order.'],
  ['infinite', 'false', 'Load the next page automatically when “Show more” scrolls into view.'],
  ['renderItem', 'null', '<code>(hit, ctx) =&gt; html | Node</code>. <code>ctx.highlight()</code> escapes and marks matches.'],
  ['renderSuggestion', 'null', '<code>(option, ctx) =&gt; html</code> for dropdown rows.'],
  ['emptyState', 'null', '<code>(ctx) =&gt; html</code> when nothing matches.'],
];

export const API = [
  ['setQuery(q, { submit })', 'Sets the text and searches. <code>submit</code> also saves it as a recent search.'],
  ['getQuery() · getResults()', 'The current text and the last result (<code>hits</code>, <code>total</code>, <code>facets</code>, <code>didYouMean</code>).'],
  ['submit() · search(q)', 'Same as pressing Enter.'],
  ['setFilters(f) · toggleFilter(key, value) · clearFilters()', 'Change filters from code.'],
  ['setSort(value)', 'Sort by a key (<code>\'-price\'</code> for descending), a sorts value or <code>\'relevance\'</code>.'],
  ['setLayout(name) · getLayout()', 'Switch layouts.'],
  ['setItems(items) · getItems()', 'Replace the data.'],
  ['setOptions(patch)', 'Change any option.'],
  ['focus() · open() · close()', 'Focus the box, open or close the dropdown.'],
  ['openPalette() · closePalette()', 'Palette mode dialog.'],
  ['getRecent() · addRecent(q) · removeRecent(q) · clearRecent()', 'Recent searches.'],
  ['on(name, fn) → off', 'Listen to events (<code>\'*\'</code> for all).'],
  ['index', 'The <code>SearchIndex</code>: <code>search()</code>, <code>suggest()</code>, <code>correct()</code>.'],
  ['destroy()', 'Removes the DOM and listeners.'],
];

export const EVENTS = [
  ['search', '<code>{ query, hits, total, filters, sort, result }</code> after every search'],
  ['select', '<code>{ item, hit, query, via, preventDefault() }</code> a result was opened'],
  ['submit', '<code>{ query }</code> Enter or a suggestion'],
  ['query', '<code>{ query }</code> on every keystroke'],
  ['suggestionSelect', '<code>{ text, type, via }</code>'],
  ['filter · sort · layout', '<code>{ filters }</code> · <code>{ sort }</code> · <code>{ layout }</code>'],
  ['open · close', 'The dropdown opened or closed'],
  ['fullscreen', '<code>{ open }</code> the phone full-screen mode opened or closed'],
  ['error', '<code>{ error }</code> the async source failed'],
];

export const KEYS = [
  ['Focus the search', ['/']],
  ['Open the palette', ['Ctrl', 'K']],
  ['Move through suggestions', ['↑', '↓']],
  ['Open or search', ['Enter']],
  ['Accept the grey completion', ['Tab']],
  ['…or', ['→']],
  ['Close, then clear', ['Esc']],
  ['First / last option', ['Home', 'End']],
];

export const CLI = [
  ['iconix-search query &lt;file&gt; &lt;query&gt;', 'Ranked results with typos allowed. <code>--filter brand=Sony</code>, <code>--filter price&lt;=100</code>, <code>--sort -price</code>, <code>--limit</code>, <code>--keys title:3,tags</code>.'],
  ['iconix-search suggest &lt;file&gt; &lt;prefix&gt;', 'Completions and corrections for a partial query.'],
  ['iconix-search facets &lt;file&gt; --by brand,category', 'Value counts, optionally for a query.'],
  ['iconix-search stats &lt;file&gt;', 'Item count, searchable keys and the most common words.'],
];

export const FEATURES = [
  ['sparkles', 'Suggestions as you type', 'Word completions ranked by how often they appear, whole-title completions and the top results, all in one dropdown.'],
  ['fix', 'Typo tolerance', '“hedphones” finds headphones. Typo matches rank after exact ones, so precise queries stay precise.'],
  ['arrow', 'Inline completion', 'The rest of the best completion appears in grey. Tab or → accepts it.'],
  ['book', 'Word forms', '“running” finds “run”, “headphones” finds “headphone”, “butów” finds “buty”. English by default, Polish added for a Polish UI.'],
  ['trending', 'BM25-style ranking', 'Rare words count more than common ones, a match in a short title more than in a long description. An inverted index keeps 10,000 items under 10 ms.'],
  ['web', 'Accents and Polish letters', '“zolw” finds “Żółw”, “lodz” finds “Łódź”. Folding keeps highlights in the right place.'],
  ['code', 'Query syntax', '<code>"exact phrase"</code>, <code>-exclude</code> and <code>field:value</code> in the box and the CLI.'],
  ['filter', 'Facets with counts', 'Chips per value with live counts that stay useful while you filter (disjunctive faceting).'],
  ['sort', 'Sorting', 'Relevance, any key, descending with a minus, or your own compare function.'],
  ['cards', 'Six layouts', 'List, cards, grid, compact, media and table, switchable at runtime.'],
  ['fix', '“Did you mean”', 'Nothing found? The closest known words are offered in one click.'],
  ['recent', 'Recent and popular', 'Recent searches per box in localStorage, plus your own popular list.'],
  ['user', 'Full screen on phones', 'Tapping the box on a phone opens a full-screen search with a back button, like native apps.'],
  ['copy', 'Shareable URLs', 'url: true keeps the query, filters, sort and layout in the address bar.'],
  ['sliders', 'Range filters and groups', 'Min / max inputs for prices or years, and results grouped under titles.'],
  ['command', '⌘K palette', 'One option turns the box into a dialog for docs and apps.'],
  ['zap', 'Server search', 'An async source with an AbortSignal; stale requests are cancelled and a skeleton shows while loading.'],
  ['keyboard', 'Keyboard first', 'Arrows, Enter, Tab, Esc, Home and End, plus a global / or Ctrl K shortcut.'],
  ['check', 'Accessible', 'ARIA combobox and listbox, aria-activedescendant and a live result count for screen readers.'],
  ['layers', 'Highlights and snippets', 'Matches are marked in titles, tags and descriptions; long text is cut around the first match.'],
  ['sliders', 'Theming', 'CSS variables, dark and auto themes, accent, radius, density and classNames for every part.'],
  ['terminal', 'CLI', 'Query, suggest, facets and stats for JSON files, with exit codes for CI.'],
  ['box', 'Engine on its own', 'createIndex() without UI, for your own components or Node scripts.'],
];

export const CSS_TOKENS = `.ixs {
  --ixs-bg: #fff;
  --ixs-bg-soft: #fafafa;
  --ixs-bg-muted: #f4f4f5;
  --ixs-fg: #09090b;
  --ixs-muted: #71717a;
  --ixs-border: #e4e4e7;
  --ixs-accent: #2563eb;
  --ixs-mark: color-mix(in srgb, #facc15 50%, transparent);
  --ixs-radius: 12px;
  --ixs-font: inherit;
  --ixs-h: 46px;          /* height of the box */
  --ixs-gap: 14px;        /* gap between results */
  --ixs-card-min: 230px;  /* min card width in the cards layout */
}
.ixs[data-theme="dark"] { --ixs-bg: #09090b; --ixs-fg: #fafafa; /* … */ }`;
