import type { DefineComponent, Plugin } from 'vue';
import type { SearchOptions, Layout, Fields, KeyInput } from './index';

export declare const IxSearch: DefineComponent<{
  options?: SearchOptions;
  modelValue?: string;
  items?: unknown[];
  keys?: KeyInput[];
  fields?: Fields;
  facets?: SearchOptions['facets'];
  sorts?: SearchOptions['sorts'];
  layout?: Layout;
  layouts?: Layout[];
  placeholder?: string;
  theme?: 'light' | 'dark' | 'auto';
  locale?: string;
  mode?: 'inline' | 'palette';
  source?: SearchOptions['source'];
}>;
export declare const IconixSearchPlugin: Plugin;
export default IxSearch;
