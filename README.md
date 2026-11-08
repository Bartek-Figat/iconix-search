# @iconix/search

A search box with suggestions and a results panel for React, Vue and the web, from the makers of [@iconix/icons](https://bartek-figat.github.io/iconix-site/) and [@iconix/calendar](https://www.npmjs.com/package/@iconix/calendar).

- **Suggestions while you type:** word completions, typo corrections, whole-title completions, top results, recent and popular searches. Grey inline completion, accepted with <kbd>Tab</kbd> or <kbd>→</kbd>.
- **Forgiving search:** typos (`hedphones`), prefixes (`blue`), word forms (`running` finds `run`, `butów` finds `buty`), accents (`zolw` finds `Żółw`), synonyms, field weights, `"exact phrase"`, `-exclude` and `field:value`.
- **Ranks like a search engine:** an inverted index with BM25-style weighting: rare words and short fields count more, typo matches rank after exact ones.
- **Six result layouts:** list, cards, grid, compact, media and table, switchable at runtime.
- **Facets (chips or min / max ranges), sorting, grouped results, “show more” or infinite scroll, empty state with “did you mean”** and a ⌘K **palette mode**.
- **Full-screen search on phones** and **shareable URLs** (`url: true` keeps query, filters, sort and layout in the address bar).
- Local data or an async `source` (stale requests are aborted). Keyboard and screen-reader friendly (ARIA combobox).
- **Icons by [@iconix/icons](https://www.npmjs.com/package/@iconix/icons)**, its only runtime dependency. A CLI is included. MIT licensed.

```bash
npm i @iconix/search
```

## React

```jsx
import { Search } from '@iconix/search/react';
import '@iconix/search/css';

<Search
  items={products}
  keys={[{ name: 'title', weight: 3 }, 'brand', 'tags']}
  fields={{ title: 'title', subtitle: 'brand', image: 'image', badge: 'category', meta: (p) => `$${p.price}`, url: 'url' }}
  facets={['category', 'brand']}
  layout="cards"
  onSelect={({ item }) => console.log(item)}
/>
```

## Vue

```vue
<script setup>
import { IxSearch } from '@iconix/search/vue';
import '@iconix/search/css';
const query = ref('');
</script>

<template>
  <IxSearch v-model="query" :items="docs" :keys="['title', 'body']" layout="list" @select="({ item }) => open(item)" />
</template>
```

## Web Component / plain JavaScript

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@iconix/search/src/search.css">
<script type="module" src="https://cdn.jsdelivr.net/npm/@iconix/search/src/element.js/+esm"></script>
<ixs-search layout="cards" placeholder="Search products"></ixs-search>
```

```js
import { createSearch } from '@iconix/search';
const search = createSearch('#search', { items, keys: ['title', 'tags'], layout: 'grid' });
search.setQuery('wireless');
search.toggleFilter('brand', 'Sony');
```

## From a server

```js
createSearch('#search', {
  source: (query, { signal, filters }) => fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal }).then((r) => r.json()),
  fields: { title: 'name', description: 'summary', url: 'href' },
});
```

## The engine on its own

```js
import { createIndex } from '@iconix/search/engine';
const idx = createIndex(products, { keys: ['title', 'brand'], facets: ['brand'] });
idx.search('wireles hedphones', { filters: { brand: ['Sony'] }, sort: '-price', limit: 10 });
idx.suggest('blu'); // [{ text: 'bluetooth', type: 'completion', count: 6 }]
```

## Facets, groups and URLs

```js
createSearch('#shop', {
  items: products,
  facets: ['brand', { key: 'price', type: 'range', label: 'Price', prefix: '$' }],
  groupBy: 'category',
  url: true,          // ?q=…&brand=Sony&price=50..200&sort=-price&view=cards
  infinite: true,
});
```

## Word forms

`stemming: 'en'` (default) strips common English endings; a Polish UI (`locale: 'pl'`) uses `'en+pl'`. Pass `'pl'`, `'en+pl'`, your own `(word) => stem`, or `false`.

## Performance

`npm run bench` on generated catalogues (Node 22, laptop):

| items | build index | typical search |
|---|---|---|
| 1,000 | ~40 ms | 0.5–2 ms |
| 10,000 | ~230 ms | 4–10 ms |
| 50,000 | ~1 s | 15–40 ms |

Beyond ~20,000 items, or when data lives on a server, use `source`.

## Size

`npm run size` (gzip, before a real minifier, so an upper bound): engine 8 KB, UI component with engine 23 KB, CSS 5 KB, icons with their renderer ~6 KB. Wrappers under 1 KB each.

## Keyboard

`/` (or `⌘/Ctrl K` in palette mode) focus · `↑ ↓` move · `Enter` open or search · `Tab` / `→` accept the completion · `Esc` close, then clear.

## CLI

```bash
npx iconix-search query products.json "wireless headphones" --filter brand=Sony --sort -price
npx iconix-search suggest products.json blu
npx iconix-search facets products.json --by brand,category
npx iconix-search stats products.json --json
```

Exit codes: `0` ok, `1` nothing found, `2` usage error.

## Theming

Every color, the radius and the fonts are CSS variables on `.ixs` (`--ixs-bg`, `--ixs-fg`, `--ixs-accent`, `--ixs-radius`, `--ixs-font`, …). `theme: 'dark' | 'auto'` switches the palette; `classNames` adds your own classes to any part.

## Testing

- `npm test`: unit and DOM tests (node:test + jsdom).
- `npm run test:e2e`: UI/UX tests in headless Edge or Chrome (`BROWSER=/path/to/chrome`): real keys and clicks at 375–1600 px in both themes, an accessibility audit (names, ARIA wiring, WCAG AA contrast, 24 px targets), the accessibility tree a screen reader gets, and the main user flows.

## License

MIT © Bartek Figatowski
