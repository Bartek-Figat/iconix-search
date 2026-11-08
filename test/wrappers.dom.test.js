import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { window, tick, type } from './helpers/dom.js';

const items = [
  { id: 1, title: 'Getting started', section: 'Guide' },
  { id: 2, title: 'Theming', section: 'Guide' },
  { id: 3, title: 'Keyboard shortcuts', section: 'Reference' },
];

describe('web component', () => {
  test('<ixs-search> reads attributes, options and re-dispatches events', async () => {
    await import('../src/element.js');
    const el = document.createElement('ixs-search');
    el.setAttribute('layout', 'cards');
    el.setAttribute('placeholder', 'Search docs');
    el.options = { items, keys: ['title', 'section'], fields: { title: 'title', badge: 'section' }, debounce: 0, navigate: false };
    const seen = [];
    el.addEventListener('ixs:select', (e) => seen.push(e.detail.item.id));
    document.body.appendChild(el);
    assert.equal(el.api.getLayout(), 'cards');
    assert.equal(el.querySelector('.ixs-input').placeholder, 'Search docs');
    el.setAttribute('layout', 'compact');
    assert.equal(el.api.getLayout(), 'compact');
    el.options = { theme: 'dark' };
    assert.equal(el.api.root.dataset.theme, 'dark');
    el.querySelector('.ixs-results .ixs-item').click();
    assert.deepEqual(seen, [1]);
    el.remove();
    assert.equal(el.api, null, 'destroyed on disconnect');
  });
});

describe('React wrapper', () => {
  test('mounts, exposes the instance by ref, updates props and unmounts', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const React = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { act } = React;
    const { Search } = await import('../src/react.js');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const ref = React.createRef();
    const selected = [];
    await act(async () => { root.render(React.createElement(Search, { ref, items, keys: ['title'], layout: 'list', debounce: 0, onSelect: ({ item }) => selected.push(item.id), className: 'box' })); });
    assert.ok(ref.current, 'ref is the instance');
    assert.ok(host.querySelector('.box .ixs'));
    assert.equal(host.querySelectorAll('.ixs-results .ixs-item').length, 3);
    await act(async () => { root.render(React.createElement(Search, { ref, items: items.slice(0, 2), keys: ['title'], layout: 'grid', debounce: 0, onSelect: ({ item }) => selected.push(item.id * 10), className: 'box' })); });
    assert.equal(ref.current.getLayout(), 'grid');
    assert.equal(host.querySelectorAll('.ixs-results .ixs-item').length, 2);
    host.querySelector('.ixs-results .ixs-item').click();
    assert.deepEqual(selected, [10], 'latest callback is used');
    await act(async () => { root.unmount(); });
    assert.equal(host.querySelector('.ixs'), null);
    host.remove();
  });
});

describe('Vue wrapper', () => {
  test('mounts, emits, supports v-model and exposes api', async () => {
    const { createApp, h, ref, nextTick } = await import('vue');
    const { IxSearch } = await import('../src/vue.js');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const q = ref('');
    const comp = ref(null);
    const events = [];
    const layout = ref('list');
    const app = createApp({ render: () => h(IxSearch, { ref: comp, items, keys: ['title'], layout: layout.value, options: { debounce: 0 }, modelValue: q.value, 'onUpdate:modelValue': (v) => { q.value = v; }, onSearch: ({ total }) => events.push(total) }) });
    app.mount(host);
    await nextTick();
    const api = comp.value.api;
    assert.ok(api);
    type(api, 'theming');
    await tick();
    assert.equal(q.value, 'theming', 'v-model updated');
    assert.equal(events.at(-1), 1);
    layout.value = 'cards';
    await nextTick();
    assert.equal(api.getLayout(), 'cards');
    q.value = 'keyboard';
    await nextTick();
    assert.equal(api.getQuery(), 'keyboard');
    app.unmount();
    assert.equal(host.querySelector('.ixs'), null);
    host.remove();
  });
});

void window;
