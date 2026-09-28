import { FAVORITES_KEY, createFavorites, favoriteFirst } from './favorites.js';

const mounted = new WeakMap();
const COPY = {
  ja: {
    hint: '☆でお気に入りに登録。各市場の一覧の上部に表示し、このブラウザに保存します。',
    add: 'お気に入りに追加', remove: 'お気に入りから解除',
    added: 'お気に入りに追加しました。', removed: 'お気に入りを解除しました。',
    unsaved: 'このブラウザに保存できません。お気に入りはこのページを閉じるまで有効です。',
  },
  en: {
    hint: 'Tap ☆ to pin favorites to the top of each market. Saved in this browser.',
    add: 'Add to favorites', remove: 'Remove from favorites',
    added: 'Added to favorites.', removed: 'Removed from favorites.',
    unsaved: 'This browser could not save favorites. Changes last until this page is closed.',
  },
};
const star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.78 5.63L21 9.54l-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.93 1.06-6.2L3 9.54l6.22-.91Z"/></svg>';

// Enhance the app's replaceable search-results region. No API calls, polling,
// price changes, or handlers on the trade button; stars are sibling buttons.
export function mountMarketFavorites({ root = document.getElementById('main'), language = document.documentElement.lang, getStorage = () => window.localStorage } = {}) {
  if (!root) return () => {};
  if (mounted.has(root)) return mounted.get(root);
  const copy = COPY[language === 'en' ? 'en' : 'ja'];
  const favorites = createFavorites(getStorage);
  let current = null;
  const observer = new MutationObserver(enhance);
  const observe = () => observer.observe(root, { childList: true, subtree: true });
  function update(message = '') {
    if (!current || !root.contains(current.list)) return;
    observer.disconnect();
    try {
      const focused = document.activeElement;
      for (const row of current.rows) {
        const selected = favorites.has(row.symbol);
        row.star.setAttribute('aria-pressed', String(selected));
        row.star.setAttribute('aria-label', `${row.name}: ${selected ? copy.remove : copy.add}`);
        row.star.title = selected ? copy.remove : copy.add;
      }
      const sorted = favoriteFirst(current.rows, favorites.symbols);
      if (sorted.some((row, index) => current.list.children[index] !== row.element)) {
        for (const row of sorted) current.list.append(row.element);
        if (focused instanceof HTMLElement && current.list.contains(focused)) focused.focus({ preventScroll: true });
      }
      current.hint.textContent = favorites.saved ? (message || copy.hint) : copy.unsaved;
    } finally { observe(); }
  }
  function enhance() {
    const results = root.querySelector('#search-results');
    const list = results?.querySelector(':scope > .card');
    if (!list || current?.list === list) return;
    const buttons = [...list.querySelectorAll(':scope > button.stock-row[data-symbol]')];
    if (!buttons.length) return;
    observer.disconnect();
    try {
      const hint = document.createElement('p');
      hint.className = 'favorites-hint';
      hint.setAttribute('role', 'status');
      hint.setAttribute('aria-live', 'polite');
      results.insertBefore(hint, list);
      const rows = buttons.map(button => {
        const symbol = button.dataset.symbol;
        const name = button.querySelector('.stock-name')?.textContent || symbol;
        const element = document.createElement('div');
        element.className = 'market-favorite-row';
        list.insertBefore(element, button);
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'favorite-toggle';
        toggle.dataset.favoriteSymbol = symbol;
        toggle.innerHTML = star;
        toggle.addEventListener('click', event => {
          event.stopPropagation();
          const result = favorites.toggle(symbol);
          update(`${name}: ${result.selected ? copy.added : copy.removed}`);
        });
        element.append(button, toggle);
        return { symbol, name, element, star: toggle };
      });
      current = { list, rows, hint };
    } finally { observe(); }
    update();
  }
  function sync(event) {
    if (event.key !== FAVORITES_KEY && event.key !== null) return;
    // Ignore sessionStorage changes; never read or modify another preference.
    try { if (event.storageArea && event.storageArea !== getStorage()) return; } catch { return; }
    favorites.reload(event.key === null ? null : event.newValue);
    update();
  }
  window.addEventListener('storage', sync);
  observe();
  enhance();
  const cleanup = () => { observer.disconnect(); window.removeEventListener('storage', sync); mounted.delete(root); };
  mounted.set(root, cleanup);
  return cleanup;
}
