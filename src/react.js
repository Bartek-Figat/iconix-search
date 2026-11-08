'use client';
import { createElement, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { Search as Core } from './search.js';

const OWN = new Set(['className', 'style', 'id']);
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * <Search items={products} keys={['title', 'brand']} layout="cards" onSelect={({ item }) => open(item)} ref={apiRef} />
 * Every core option is a prop. `ref` gives you the Search instance (setQuery(), setLayout(), toggleFilter()…).
 */
export const Search = forwardRef(function Search(props, ref) {
  const el = useRef(null);
  const inst = useRef(null);
  const prev = useRef({});

  useIsoLayoutEffect(() => {
    const opts = {};
    for (const k in props) if (!OWN.has(k)) opts[k] = props[k];
    inst.current = new Core(el.current, opts);
    prev.current = props;
    return () => { inst.current.destroy(); inst.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const s = inst.current;
    if (!s || prev.current === props) return;
    const patch = {};
    let changed = false;
    for (const k in props) {
      if (OWN.has(k) || props[k] === prev.current[k]) continue;
      if (typeof props[k] === 'function' && /^on[A-Z]/.test(k)) { s.o[k] = props[k]; continue; } // callbacks never re-render
      patch[k] = props[k];
      changed = true;
    }
    prev.current = props;
    if (changed) s.setOptions(patch);
  });

  useImperativeHandle(ref, () => inst.current, [inst.current]);
  return createElement('div', { ref: el, className: props.className, style: props.style, id: props.id });
});

export default Search;
