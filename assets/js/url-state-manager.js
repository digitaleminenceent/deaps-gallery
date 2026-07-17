// ======================================
// DEAPS URL STATE MANAGER (Phase 1, v1.1)
// Reusable module for Gallery Browser state <-> URL synchronization
// Does NOT touch homepage, category management, or system categories.
// ======================================

const GalleryState = (function () {

  const DEFAULTS = {
    category: null,
    subcategory: null,
    search: '',
    sort: 'latest',
    rating: null,
    view: 'grid'
  };

  const PRESETS = {
    new: { sort: 'latest' },
    newest: { sort: 'latest' },
    top: { sort: 'rating' },
    'top-rated': { sort: 'rating' },
    featured: { category: 'featured' },
    all: { category: 'all' }
  };

  function parsePresetFromPath() {
    const path = window.location.pathname;
    const match = path.match(/\/styles\/([a-z-]+)/i);
    if (match && PRESETS[match[1].toLowerCase()]) {
      return PRESETS[match[1].toLowerCase()];
    }
    return null;
  }

  function parsePresetFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const preset = params.get('preset');
    if (preset && PRESETS[preset.toLowerCase()]) {
      return PRESETS[preset.toLowerCase()];
    }
    return null;
  }

  function readFromURL() {
    const params = new URLSearchParams(window.location.search);
    const preset = parsePresetFromPath() || parsePresetFromQuery();

    const state = { ...DEFAULTS, ...(preset || {}) };

    if (params.has('category')) state.category = params.get('category');
    if (params.has('sub')) state.subcategory = params.get('sub');
    if (params.has('search')) state.search = params.get('search');
    if (params.has('sort')) state.sort = params.get('sort');
    if (params.has('rating')) state.rating = params.get('rating');
    if (params.has('view')) state.view = params.get('view');

    return state;
  }

  function writeToURL(state, opts = {}) {
    const params = new URLSearchParams();

    if (state.category) params.set('category', state.category);
    if (state.subcategory) params.set('sub', state.subcategory);
    if (state.search) params.set('search', state.search);
    if (state.sort && state.sort !== DEFAULTS.sort) params.set('sort', state.sort);
    if (state.rating) params.set('rating', state.rating);
    if (state.view && state.view !== DEFAULTS.view) params.set('view', state.view);

    const query = params.toString();
    const newUrl = window.location.pathname + (query ? `?${query}` : '');

    if (opts.replace) {
      window.history.replaceState(state, '', newUrl);
    } else {
      window.history.pushState(state, '', newUrl);
    }
  }

  const SESSION_KEY = 'deaps_gallery_browse_state';

  function saveSessionState(state, scrollY) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ state, scrollY, savedAt: Date.now() }));
    } catch (e) {}
  }

  function loadSessionState() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.savedAt > 30 * 60 * 1000) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function clearSessionState() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  return {
    DEFAULTS,
    readFromURL,
    writeToURL,
    saveSessionState,
    loadSessionState,
    clearSessionState
  };

})();