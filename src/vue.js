import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Search as Core } from './search.js';

const EVENTS = ['search', 'select', 'submit', 'query', 'filter', 'sort', 'layout', 'suggestionSelect', 'open', 'close', 'error'];
const PROPS = ['items', 'keys', 'fields', 'facets', 'sorts', 'layout', 'layouts', 'placeholder', 'theme', 'locale', 'mode', 'source'];
const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

/**
 * <IxSearch :items="products" :keys="['title','brand']" layout="cards" v-model="query" @select="open" ref="search" />
 * Pass any core option as a prop (or all at once through :options). The exposed `api` is the Search instance.
 */
export const IxSearch = defineComponent({
  name: 'IxSearch',
  inheritAttrs: false,
  props: {
    options: { type: Object, default: () => ({}) },
    modelValue: { type: String, default: undefined },
    items: { type: Array, default: undefined },
    keys: { type: Array, default: undefined },
    fields: { type: Object, default: undefined },
    facets: { type: Array, default: undefined },
    sorts: { type: Array, default: undefined },
    layout: { type: String, default: undefined },
    layouts: { type: Array, default: undefined },
    placeholder: { type: String, default: undefined },
    theme: { type: String, default: undefined },
    locale: { type: String, default: undefined },
    mode: { type: String, default: undefined },
    source: { type: Function, default: undefined },
  },
  emits: ['update:modelValue', ...EVENTS.map(kebab)],
  setup(props, { emit, expose, attrs }) {
    const el = ref(null);
    let s = null;
    const collect = () => {
      const o = { ...props.options };
      for (const k of PROPS) if (props[k] !== undefined) o[k] = props[k];
      if (props.modelValue !== undefined) o.query = props.modelValue;
      return o;
    };
    onMounted(() => {
      s = new Core(el.value, collect());
      s.on('*', (name, payload) => {
        if (EVENTS.includes(name)) emit(kebab(name), payload);
        if (name === 'query' || name === 'submit') emit('update:modelValue', payload.query);
      });
    });
    onBeforeUnmount(() => { s && s.destroy(); s = null; });
    watch(() => props.items, (v) => s && v && s.setItems(v));
    watch(() => props.modelValue, (v) => { if (s && v !== undefined && v !== s.getQuery()) s.setQuery(v); });
    watch(() => [props.keys, props.fields, props.facets, props.sorts, props.layout, props.layouts, props.placeholder, props.theme, props.locale, props.mode, props.source, props.options], () => {
      if (!s) return;
      const o = collect();
      delete o.items;
      delete o.query;
      s.setOptions(o);
    }, { deep: true });
    expose({ get api() { return s; } });
    return () => h('div', { ...attrs, ref: el });
  },
});

export const IconixSearchPlugin = { install(app) { app.component('IxSearch', IxSearch); } };
export default IxSearch;
