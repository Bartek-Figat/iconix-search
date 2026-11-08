# Changelog

## 0.2.0

### Search engine
- **Inverted index.** Only documents that can match are scored. Building the index is about 8× faster (50,000 items in ~1 s instead of ~4.6 s), a search over 10,000 items takes 4–10 ms, and a query with no results returns almost instantly.
- **BM25-style ranking.** Rare words count more than common ones, and a match in a short field counts more than the same match in a long one. `ranking: 'simple'` turns this off.
- **Word forms (`stemming`).** “running” finds “run”, “headphones” finds “headphone”, “butów” finds “buty”. The default is `'en'`; a Polish UI uses `'en+pl'`. You can also pass `'pl'`, your own `(word) => stem`, or `false`. Word forms are highlighted too.
- Numbers and model codes match exactly: “1960” no longer finds “1930”.
- A typo in a word that is still being typed is only guessed from 5 letters on, so “spea” no longer finds “steam”.
- Items without a value now sort last in both directions.
- New exports: `stemEn`, `stemPl`, `stemmerFor`.

### Search box and results
- **Full screen on phones** (`fullscreen: 'auto'`, the default). Tapping the box opens a full-screen search with a back arrow, and the page behind does not scroll.
- **Shareable URLs** (`url: true` or `{ prefix }`). The query, filters, sort and layout are kept in the address bar and restored on reload or back / forward.
- **Range facets** (`{ key: 'price', type: 'range', prefix: '$' }`): min / max inputs, with the data range shown as placeholders.
- **Grouped results** (`groupBy`): titled sections in ranking order. Works in every layout except table.
- **Infinite scroll** (`infinite: true`).
- The dropdown shows suggestions and results side by side when there is room, with prices, and without duplicate rows.
- When a query finds nothing, the dropdown previews the results of the best suggestion.
- Picking a result that has no `url` puts its title in the box. `preventDefault()` now only stops navigation.
- Changing only the look (theme, accent, density, layout) no longer runs the search again, so a server is not queried for a theme change.
- Closing the palette returns focus to the button that opened it.
- Initials are used when an item has no image or icon.
- Table columns accept `align: 'right' | 'center'`.
- Accessibility: muted text, tags, initials and matches now meet the WCAG AA contrast ratio of 4.5:1.

### Tooling
- `npm run test:e2e`: UI/UX tests in headless Edge or Chrome. They cover 4 screen widths, both themes, an accessibility audit, the accessibility tree and the main user flows.
- `npm run bench` (speed on 1k / 10k / 50k items) and `npm run size` (bundle size).

## 0.1.0

- First release: search box with suggestions, six result layouts, facets, sorting, recent searches, ⌘K palette, async source, React / Vue / Web Component wrappers, CLI.
