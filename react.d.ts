import type { ForwardRefExoticComponent, RefAttributes, CSSProperties } from 'react';
import type { Search as Core, SearchOptions } from './index';

export interface SearchProps<T = any> extends SearchOptions<T> {
  className?: string;
  style?: CSSProperties;
  id?: string;
}
export declare const Search: ForwardRefExoticComponent<SearchProps & RefAttributes<Core>>;
export default Search;
