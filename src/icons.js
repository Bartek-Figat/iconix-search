// Every icon in the search UI comes from @iconix/icons (https://bartek-figat.github.io/iconix-site/).
// The tree-shakable "lite" entry is used, so only these icons end up in your bundle.
import {
  toSvg,
  iconSearch, iconClose, iconHistory, iconSparkles, iconArrowRight, iconArrowUpLeft, iconCornerDownLeft,
  iconList, iconGrid, iconLayout, iconColumns, iconTable, iconImages, iconFilter, iconSortDescending,
  iconCommand, iconLoader, iconTrendingUp, iconSpellCheck, iconFile, iconCheck, iconCopy, iconSun, iconMoon,
  iconCoffee, iconPackage, iconStar, iconTag, iconKeyboard, iconZap, iconLayers, iconSliders, iconWebSearch,
  iconUser, iconBook, iconTerminal, iconCode, iconArrowLeft,
} from '@iconix/icons/lite';

export const ICONS = {
  search: iconSearch,
  x: iconClose,
  recent: iconHistory,
  sparkles: iconSparkles,
  arrow: iconArrowRight,
  back: iconArrowLeft,
  fill: iconArrowUpLeft,
  enter: iconCornerDownLeft,
  list: iconList,
  cards: iconLayout,
  grid: iconGrid,
  compact: iconColumns,
  table: iconTable,
  media: iconImages,
  filter: iconFilter,
  sort: iconSortDescending,
  command: iconCommand,
  loader: iconLoader,
  trending: iconTrendingUp,
  fix: iconSpellCheck,
  file: iconFile,
  check: iconCheck,
  copy: iconCopy,
  sun: iconSun,
  moon: iconMoon,
  coffee: iconCoffee,
  box: iconPackage,
  star: iconStar,
  tag: iconTag,
  keyboard: iconKeyboard,
  zap: iconZap,
  layers: iconLayers,
  sliders: iconSliders,
  web: iconWebSearch,
  user: iconUser,
  book: iconBook,
  terminal: iconTerminal,
  code: iconCode,
};

/** SVG markup for a built-in icon name, or '' when unknown. */
export function icon(name, size = 16) {
  const data = ICONS[name];
  if (!data) return '';
  return toSvg(data, { size, className: 'ixs-i' });
}

/** Any icon from @iconix/icons data (as exported by @iconix/icons/lite). */
export const iconFrom = (data, size = 16) => (data ? toSvg(data, { size, className: 'ixs-i' }) : '');
