// ======================================
// DEAPS GALLERY.JS v6.3 (server-side pagination, filtering & sorting, native share, rating distribution, rate limiting)
// Homepage, Category Management, System Categories are untouched.
// ======================================

const params = new URLSearchParams(window.location.search);
const galleryContainer = document.getElementById("galleryContainer");
const categoryTitle = document.getElementById("categoryTitle");
const subcategoryNav = document.getElementById("subcategoryNav");
const searchInput = document.getElementById("gallerySearch");
const categoryFilterSelect = document.getElementById("categoryFilter");
const sortSelect = document.getElementById("sortSelect");
const ratingFilterSelect = document.getElementById("ratingFilter");
const activeFilterChips = document.getElementById("activeFilterChips");
const breadcrumbNav = document.getElementById("breadcrumbNav");
const resultCount = document.getElementById("resultCount");
const loadMoreWrap = document.getElementById("loadMoreWrap");
const loadMoreBtn = document.getElementById("loadMoreBtn");

let currentCategoryRecord = null;
let currentSubcategories = [];
let activeSubcategoryId = null;
let currentData = [];
let filteredData = [];
let currentUser = null;
let currentViewMode = sessionStorage.getItem('deaps_view_mode') || 'grid';
let pageSize = 12;
let visibleCount = pageSize;
let currentOpenItem = null;
let selectedStarValue = 0;
let subcategoryCountsCache = {};

const SYSTEM_CATEGORIES = {
    featured: { id: null, name: "⭐ Featured", slug: "featured", icon: "bi-star-fill", color: "#D4AF37", isSystem: true },
    all: { id: null, name: "🎨 All Styles", slug: "all", icon: "bi-palette-fill", color: "#D4AF37", isSystem: true }
};

const CACHE_TTL_MS = 5 * 60 * 1000;

function getCachedData(key) {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;
        return parsed.data;
    } catch (e) { return null; }
}

function setCachedData(key, data) {
    try { sessionStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() })); } catch (e) {}
}

let state = GalleryState.readFromURL();

if (searchInput) searchInput.value = state.search || '';
if (sortSelect) sortSelect.value = state.sort || 'latest';
if (ratingFilterSelect) ratingFilterSelect.value = state.rating || '';

const currentCategorySlug = state.category || params.get("category");
const urlSubcategorySlug = state.subcategory || params.get("sub");
const selectedStyle = params.get("style");

applyViewModeClass(currentViewMode);

function renderGallerySkeleton() {
    galleryContainer.innerHTML = Array(8).fill(0).map(() => `
        <div class="col-xl-3 col-lg-4 col-md-6">
            <div class="skeleton-card">
                <div class="skeleton-shimmer" style="width:100%; aspect-ratio:4/5;"></div>
                <div class="p-3">
                    <div class="skeleton-shimmer" style="height:10px; width:40%; margin-bottom:10px; border-radius:4px;"></div>
                    <div class="skeleton-shimmer" style="height:16px; width:70%; border-radius:4px;"></div>
                </div>
            </div>
        </div>
    `).join('');
}

async function loadCategoryRecord() {
    if (!currentCategorySlug) {
        categoryTitle.innerHTML = "Gallery";
        return null;
    }

    if (SYSTEM_CATEGORIES[currentCategorySlug]) {
        currentCategoryRecord = SYSTEM_CATEGORIES[currentCategorySlug];
        categoryTitle.innerHTML = currentCategoryRecord.name;
        return currentCategoryRecord;
    }

    const cached = getCachedData('deaps_categories_cache');
    let cat = cached ? cached.find(c => c.slug === currentCategorySlug) : null;

    if (!cat) {
        const { data } = await supabaseClient
            .from('categories')
            .select('id, name, slug, icon, color')
            .eq('slug', currentCategorySlug)
            .eq('is_active', true)
            .single();
        cat = data;
    }

    currentCategoryRecord = cat;
    categoryTitle.innerHTML = cat ? cat.name : currentCategorySlug;
    return cat;
}

async function populateCategoryFilter() {
    if (!categoryFilterSelect) return;

    let cats = getCachedData('deaps_categories_cache');

    if (!cats) {
        const { data } = await supabaseClient
            .from('categories')
            .select('id, name, slug')
            .eq('is_active', true)
            .order('display_order', { ascending: true });
        cats = data || [];
        setCachedData('deaps_categories_cache', cats);
    }

    const options = ['<option value="">All Categories</option>']
        .concat(cats.map(c => `<option value="${c.slug}" ${currentCategorySlug === c.slug ? 'selected' : ''}>${c.name}</option>`));

    categoryFilterSelect.innerHTML = options.join('');
}

if (categoryFilterSelect) categoryFilterSelect.addEventListener('change', () => {
    const newCategory = categoryFilterSelect.value || null;
    if (newCategory === currentCategorySlug) return;
    window.location.href = `gallery.html${newCategory ? `?category=${newCategory}` : ''}`;
});

async function loadSubcategoryDefsOnly() {
    if (!currentCategoryRecord || currentCategoryRecord.isSystem || !subcategoryNav) {
        if (subcategoryNav) subcategoryNav.innerHTML = '';
        currentSubcategories = [];
        activeSubcategoryId = null;
        return;
    }

    const { data, error } = await supabaseClient
        .from('subcategories')
        .select('id, name, slug, icon, color')
        .eq('category_id', currentCategoryRecord.id)
        .eq('is_active', true)
        .eq('show_on_home', true)
        .order('display_order', { ascending: true });

    if (error || !data || !data.length) {
        currentSubcategories = [];
        subcategoryNav.innerHTML = '';
        return;
    }

    currentSubcategories = data;

    let initialSubId = null;
    if (urlSubcategorySlug) {
        const match = currentSubcategories.find(s => s.slug === urlSubcategorySlug);
        if (match) initialSubId = match.id;
    } else {
        const remembered = sessionStorage.getItem(`deaps_last_sub_${currentCategorySlug}`);
        if (remembered && currentSubcategories.some(s => s.id === remembered)) {
            initialSubId = remembered;
        }
    }

    activeSubcategoryId = initialSubId;
    renderSubcategoryNav();
}

function renderSubcategoryNav() {
    if (!subcategoryNav) return;

    const allCount = activeSubcategoryId === null ? totalServerCount : Object.values(subcategoryCountsCache).reduce((a, b) => a + b, 0);
    const countFor = (subId) => subcategoryCountsCache[subId] != null ? subcategoryCountsCache[subId] : '';

    const chips = [
        `<button type="button" class="btn btn-sm ${activeSubcategoryId === null ? 'btn-warning' : 'btn-outline-light'}" onclick="selectSubcategory(null)">
            <i class="bi bi-grid"></i> All ${allCount ? `(${allCount})` : ''}
        </button>`
    ].concat(currentSubcategories.map(sub => `
        <button type="button" class="btn btn-sm ${activeSubcategoryId === sub.id ? 'btn-warning' : 'btn-outline-light'}" onclick="selectSubcategory('${sub.id}')">
            <i class="bi ${sub.icon || 'bi-tag'}"></i> ${sub.name} ${countFor(sub.id) !== '' ? `(${countFor(sub.id)})` : ''}
        </button>
    `));

    subcategoryNav.style.overflowX = 'auto';
    subcategoryNav.style.whiteSpace = 'nowrap';
    subcategoryNav.style.paddingBottom = '8px';
    subcategoryNav.innerHTML = `<div class="d-flex gap-2 flex-nowrap mb-3">${chips.join('')}</div>`;
}

async function selectSubcategory(subId) {
    activeSubcategoryId = subId;

    if (subId) {
        sessionStorage.setItem(`deaps_last_sub_${currentCategorySlug}`, subId);
    } else {
        sessionStorage.removeItem(`deaps_last_sub_${currentCategorySlug}`);
    }

    const matchedSub = currentSubcategories.find(s => s.id === subId);
    state.subcategory = matchedSub ? matchedSub.slug : null;
    syncUrlAndChips();

    renderSubcategoryNav();
    await resetAndFetchFirstPage();
}

let totalServerCount = 0;
let isFetchingPage = false;
let noMoreServerData = false;

function buildServerQuery() {
    let query = supabaseClient
        .from('images')
        .select('id, title, description, category, category_id, subcategory_id, preview_url, price, style_code, is_featured, created_at, avg_rating, total_ratings, bookmark_count', { count: 'exact' })
        .eq('is_active', true);

    if (currentCategorySlug === "featured") {
        query = query.eq('is_featured', true);
    } else if (currentCategorySlug === "all") {
        // no extra filter
    } else if (currentCategorySlug) {
        query = query.eq('category', currentCategorySlug);
    }

    if (activeSubcategoryId) {
        query = query.eq('subcategory_id', activeSubcategoryId);
    }

    const keyword = (state.search || '').trim();
    if (keyword) {
        query = query.or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%,style_code.ilike.%${keyword}%`);
    }

    const minRating = state.rating ? parseInt(state.rating) : 0;
    if (minRating > 0) {
        query = query.gte('avg_rating', minRating);
    }

    const sortMap = {
        latest: { col: 'created_at', asc: false },
        oldest: { col: 'created_at', asc: true },
        az: { col: 'title', asc: true },
        za: { col: 'title', asc: false },
        rating: { col: 'avg_rating', asc: false },
        most_rated: { col: 'total_ratings', asc: false }
    };
    const sortKey = state.sort && state.sort !== 'random' ? state.sort : 'latest';
    const sortCfg = sortMap[sortKey] || sortMap.latest;
    query = query.order(sortCfg.col, { ascending: sortCfg.asc });

    return query;
}

async function fetchServerPage(offset, limit) {
    isFetchingPage = true;
    const { data, error, count } = await buildServerQuery().range(offset, offset + limit - 1);
    isFetchingPage = false;

    if (error) {
        console.error(error);
        return { rows: [], count: 0 };
    }
    return { rows: data || [], count: count || 0 };
}

async function loadGallery() {
    renderGallerySkeleton();

    await loadCategoryRecord();
    await populateCategoryFilter();
    await loadSubcategoryDefsOnly();
    await loadUserBookmarks();

    renderBreadcrumbs();
    updatePageMeta();

    const restored = GalleryState.loadSessionState();
    if (restored && !selectedStyle) {
        state = { ...state, ...restored.state };
        if (searchInput) searchInput.value = state.search || '';
        if (sortSelect) sortSelect.value = state.sort || 'latest';
        if (ratingFilterSelect) ratingFilterSelect.value = state.rating || '';
        GalleryState.clearSessionState();
        await resetAndFetchFirstPage();
        setTimeout(() => window.scrollTo(0, restored.scrollY || 0), 60);
    } else {
        await resetAndFetchFirstPage();
    }

    if (selectedStyle) {
        setTimeout(() => openStyle(selectedStyle), 300);
    }
}

async function resetAndFetchFirstPage() {
    visibleCount = pageSize;
    noMoreServerData = false;
    const { rows, count } = await fetchServerPage(0, pageSize);
    currentData = rows;
    totalServerCount = count;
    filteredData = rows;
    if (rows.length < pageSize) noMoreServerData = true;
    await refreshSubcategoryCounts();
    renderResultCount();
    renderGalleryPage();
}

async function loadMoreServerPage() {
    if (isFetchingPage || noMoreServerData) return;
    const { rows } = await fetchServerPage(currentData.length, pageSize);
    if (rows.length < pageSize) noMoreServerData = true;
    currentData = currentData.concat(rows);
    filteredData = currentData;
    visibleCount = currentData.length;
    renderResultCount();
    renderGalleryPage();
}

async function refreshSubcategoryCounts() {
    if (!currentCategoryRecord || currentCategoryRecord.isSystem || !subcategoryNav || !currentSubcategories.length) return;

    const counts = await Promise.all(currentSubcategories.map(async sub => {
        const { count } = await supabaseClient
            .from('images')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true)
            .eq('subcategory_id', sub.id);
        return { id: sub.id, count: count || 0 };
    }));

    subcategoryCountsCache = Object.fromEntries(counts.map(c => [c.id, c.count]));
    renderSubcategoryNav();
}

let userBookmarkIds = new Set();

async function loadUserBookmarks() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    currentUser = user;
    userBookmarkIds = new Set();

    if (!user) return;

    const { data } = await supabaseClient
        .from('favorites')
        .select('image_id')
        .eq('user_id', user.id);

    (data || []).forEach(row => userBookmarkIds.add(row.image_id));
}

async function toggleBookmark(imageId, iconEl) {
    if (!currentUser) {
        window.location.href = 'index.html';
        return;
    }

    const isBookmarked = userBookmarkIds.has(imageId);

    if (isBookmarked) {
        const { error } = await supabaseClient.from('favorites').delete()
            .eq('user_id', currentUser.id).eq('image_id', imageId);
        if (!error) {
            userBookmarkIds.delete(imageId);
            if (iconEl) iconEl.classList.remove('active');
            await logBrowseAudit('bookmark_remove', imageId);
        }
    } else {
        const { error } = await supabaseClient.from('favorites').insert({ user_id: currentUser.id, image_id: imageId });
        if (!error) {
            userBookmarkIds.add(imageId);
            if (iconEl) iconEl.classList.add('active');
            await logBrowseAudit('bookmark_add', imageId);
        }
    }
}

async function logBrowseAudit(action, imageId) {
    try {
        await supabaseClient.from('audit_log').insert({
            admin_id: currentUser ? currentUser.id : null,
            admin_email: currentUser ? currentUser.email : null,
            action,
            entity_type: 'image',
            entity_id: imageId,
            entity_name: null
        });
    } catch (e) {}
}

let searchDebounceTimer = null;

function debouncedSearch() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(async () => {
        state.search = searchInput.value.trim();
        syncUrlAndChips();
        await resetAndFetchFirstPage();
    }, 300);
}

function renderResultCount() {
    if (!resultCount) return;
    resultCount.textContent = `${totalServerCount} style${totalServerCount === 1 ? '' : 's'} found`;
}

function isNew(createdAt) {
    if (!createdAt) return false;
    const days = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
    return days <= 14;
}

function renderStarsHtml(rating) {
    const full = Math.round(rating || 0);
    let html = '';
    for (let i = 1; i <= 5; i++) {
        html += `<i class="bi ${i <= full ? 'bi-star-fill' : 'bi-star'}"></i>`;
    }
    return html;
}

async function renderRatingDistribution(imageId, totalRatings) {
    const container = document.getElementById('modalRatingDistribution');
    if (!container) return;

    if (!totalRatings || totalRatings === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `<div class="text-secondary small py-2"><i class="spinner-border spinner-border-sm"></i> Loading breakdown...</div>`;

    const { data, error } = await supabaseClient
        .from('ratings')
        .select('rating')
        .eq('image_id', imageId);

    if (error || !data) {
        container.innerHTML = '';
        return;
    }

    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    data.forEach(r => { if (counts[r.rating] !== undefined) counts[r.rating]++; });
    const total = data.length || 1;

    container.innerHTML = `
        <div class="rating-distribution mt-2">
            ${[5, 4, 3, 2, 1].map(star => {
                const pct = Math.round((counts[star] / total) * 100);
                return `
                    <div class="d-flex align-items-center gap-2 mb-1">
                        <span class="small text-secondary" style="width:32px;">${star}★</span>
                        <div class="flex-grow-1" style="background:#2a2a2a; border-radius:4px; height:8px; overflow:hidden;">
                            <div style="width:${pct}%; height:100%; background:#D4AF37;"></div>
                        </div>
                        <span class="small text-secondary" style="width:40px; text-align:right;">${counts[star]}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderGalleryPage() {
    galleryContainer.innerHTML = "";

    if (currentData.length === 0) {
        galleryContainer.innerHTML = `
            <div class="col-12 empty-state-v2">
                <i class="bi bi-inbox"></i>
                <h3 class="mt-3">No Style Found</h3>
                <p class="text-secondary">Try a different category, filter, or search keyword.</p>
                <button class="btn btn-outline-warning mt-2" onclick="resetFilters()">Reset Filters</button>
            </div>
        `;
        loadMoreWrap.style.display = 'none';
        return;
    }

    const pageItems = currentData;

    let colClass = "col-xl-3 col-lg-4 col-md-6";
    if (currentViewMode === 'large') colClass = "col-xl-4 col-lg-6 col-md-6";
    if (currentViewMode === 'compact') colClass = "col-xl-2 col-lg-3 col-md-4 col-6";

    pageItems.forEach(item => {
        const bookmarked = userBookmarkIds.has(item.id);
        galleryContainer.innerHTML += `
            <div class="${colClass}">
                <div class="style-card-v2" tabindex="0" role="button" aria-label="View ${item.title}" onclick="openStyle('${item.id}')" onkeypress="if(event.key==='Enter') openStyle('${item.id}')">
                    <div class="thumb-wrap">
                        <img src="${item.preview_url}" loading="lazy" alt="${item.title}">
                        <div class="badge-row">
                            ${item.is_featured ? '<span class="badge bg-warning text-dark"><i class="bi bi-star-fill"></i> Featured</span>' : ''}
                            ${isNew(item.created_at) ? '<span class="badge bg-info text-dark">New</span>' : ''}
                        </div>
                        <span class="bookmark-icon ${bookmarked ? 'active' : ''}" role="button" aria-label="Bookmark this style" onclick="event.stopPropagation(); toggleBookmark('${item.id}', this)">
                            <i class="bi bi-heart-fill"></i>
                        </span>
                        <div class="quick-actions">
                            <button aria-label="View style" onclick="event.stopPropagation(); openStyle('${item.id}')"><i class="bi bi-eye"></i></button>
                            <button aria-label="Share style" onclick="event.stopPropagation(); openShareModal('${item.id}')"><i class="bi bi-share"></i></button>
                        </div>
                    </div>
                    <div class="card-body-v2">
                        <div class="cat-tags">${item.category || ''}${(currentSubcategories.find(s => s.id === item.subcategory_id) || {}).name ? ' &middot; ' + currentSubcategories.find(s => s.id === item.subcategory_id).name : ''}</div>
                        <h6 class="style-name">${item.title}</h6>
                        <div class="rating-row">
                            ${item.total_ratings > 0
                                ? `${renderStarsHtml(item.avg_rating)} <span>${(item.avg_rating || 0).toFixed(1)} (${item.total_ratings})</span>`
                                : `<span class="no-rating">No ratings yet</span>`}
                            ${item.bookmark_count > 0 ? `<span class="bookmark-count-badge ms-2"><i class="bi bi-heart-fill"></i> ${item.bookmark_count}</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    loadMoreWrap.style.display = noMoreServerData ? 'none' : 'block';
}

loadMoreBtn.addEventListener('click', async () => {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'Loading...';
    await loadMoreServerPage();
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = 'Load More';
});

async function resetFilters() {
    if (searchInput) searchInput.value = '';
    state.search = '';
    state.rating = null;
    state.sort = 'latest';
    if (sortSelect) sortSelect.value = 'latest';
    if (ratingFilterSelect) ratingFilterSelect.value = '';
    activeSubcategoryId = null;
    sessionStorage.removeItem(`deaps_last_sub_${currentCategorySlug}`);
    state.subcategory = null;
    syncUrlAndChips();
    renderSubcategoryNav();
    await resetAndFetchFirstPage();
}

function applyViewModeClass(mode) {
    galleryContainer.classList.remove('view-grid', 'view-large', 'view-compact');
    galleryContainer.classList.add(`view-${mode}`);

    document.querySelectorAll('#viewGridBtn, #viewLargeBtn, #viewCompactBtn').forEach(b => b.classList.remove('active', 'btn-warning'));
    document.querySelectorAll('#viewGridBtn, #viewLargeBtn, #viewCompactBtn').forEach(b => b.classList.add('btn-outline-light'));

    const map = { grid: 'viewGridBtn', large: 'viewLargeBtn', compact: 'viewCompactBtn' };
    const activeBtn = document.getElementById(map[mode]);
    if (activeBtn) {
        activeBtn.classList.remove('btn-outline-light');
        activeBtn.classList.add('btn-warning', 'active');
    }
}

function setViewMode(mode) {
    currentViewMode = mode;
    sessionStorage.setItem('deaps_view_mode', mode);
    state.view = mode;
    applyViewModeClass(mode);
    syncUrlAndChips();
    renderGalleryPage();
}

document.getElementById('viewGridBtn').addEventListener('click', () => setViewMode('grid'));
document.getElementById('viewLargeBtn').addEventListener('click', () => setViewMode('large'));
document.getElementById('viewCompactBtn').addEventListener('click', () => setViewMode('compact'));

function renderBreadcrumbs() {
    if (!breadcrumbNav) return;
    const parts = [`<li class="breadcrumb-item"><a href="index.html" class="text-warning">Home</a></li>`];

    if (currentCategoryRecord) {
        const label = currentCategoryRecord.name;
        parts.push(`<li class="breadcrumb-item"><a href="gallery.html?category=${currentCategoryRecord.slug}" class="text-warning">${label}</a></li>`);
    }

    const activeSub = currentSubcategories.find(s => s.id === activeSubcategoryId);
    if (activeSub) {
        parts.push(`<li class="breadcrumb-item active" aria-current="page">${activeSub.name}</li>`);
    } else if (currentCategoryRecord) {
        parts[parts.length - 1] = parts[parts.length - 1].replace('breadcrumb-item', 'breadcrumb-item active').replace(/<a[^>]*>|<\/a>/g, '');
    }

    breadcrumbNav.innerHTML = parts.join('');
}

function updatePageMeta() {
    const name = currentCategoryRecord ? currentCategoryRecord.name : 'Gallery';
    const title = `${name} — DEAPS Gallery`;
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageDescription').setAttribute('content', `Browse ${name} AI-generated photography styles at DEAPS Gallery.`);
    document.getElementById('ogTitle').setAttribute('content', title);
    document.getElementById('ogDescription').setAttribute('content', `Browse ${name} AI-generated photography styles.`);
    document.getElementById('twitterTitle').setAttribute('content', title);
    document.getElementById('twitterDescription').setAttribute('content', `Browse ${name} AI-generated photography styles.`);

    const canonical = document.getElementById('canonicalLink');
    const cleanParams = new URLSearchParams();
    if (state.category) cleanParams.set('category', state.category);
    const cleanQuery = cleanParams.toString();
    canonical.setAttribute('href', window.location.origin + window.location.pathname + (cleanQuery ? `?${cleanQuery}` : ''));
}

function syncUrlAndChips() {
    GalleryState.writeToURL(state, { replace: true });
    renderActiveChips();
}

function renderActiveChips() {
    if (!activeFilterChips) return;
    const chips = [];

    if (state.search) chips.push({ label: `Search: "${state.search}"`, clear: () => { state.search=''; if(searchInput) searchInput.value=''; } });
    if (state.rating) chips.push({ label: `${state.rating}★ & up`, clear: () => { state.rating=null; if(ratingFilterSelect) ratingFilterSelect.value=''; } });
    if (activeSubcategoryId) {
        const sub = currentSubcategories.find(s => s.id === activeSubcategoryId);
        if (sub) chips.push({ label: sub.name, clear: () => selectSubcategory(null) });
    }
    if (state.sort && state.sort !== 'latest') {
        const labels = { oldest:'Oldest', az:'A–Z', za:'Z–A', rating:'Highest Rated', most_rated:'Most Rated', random:'Random' };
        chips.push({ label: `Sort: ${labels[state.sort] || state.sort}`, clear: () => { state.sort='latest'; if(sortSelect) sortSelect.value='latest'; } });
    }

    activeFilterChips.innerHTML = chips.map((c, i) => `
        <span class="filter-chip">${c.label} <button aria-label="Remove filter" data-idx="${i}">&times;</button></span>
    `).join('');

    activeFilterChips.querySelectorAll('button').forEach((btn, i) => {
        btn.addEventListener('click', async () => {
            chips[i].clear();
            syncUrlAndChips();
            await resetAndFetchFirstPage();
        });
    });
}

if (searchInput) searchInput.addEventListener('input', debouncedSearch);

if (sortSelect) sortSelect.addEventListener('change', async () => {
    state.sort = sortSelect.value;
    syncUrlAndChips();
    await resetAndFetchFirstPage();
});

if (ratingFilterSelect) ratingFilterSelect.addEventListener('change', async () => {
    state.rating = ratingFilterSelect.value || null;
    syncUrlAndChips();
    await resetAndFetchFirstPage();
});

async function openStyle(id) {
    const item = currentData.find(x => x.id === id || x.style_code === id);
    if (!item) return;

    currentOpenItem = item;
    selectedStarValue = 0;

    GalleryState.saveSessionState(state, window.scrollY);

    document.getElementById("modalImage").src = item.preview_url;
    document.getElementById("modalImage").alt = item.title;
    document.getElementById("modalCode").textContent = item.style_code || '';
    document.getElementById("modalTitle").textContent = item.title;

    document.getElementById("modalBadges").innerHTML = `
        ${item.is_featured ? '<span class="badge bg-warning text-dark"><i class="bi bi-star-fill"></i> Featured</span>' : ''}
        ${isNew(item.created_at) ? '<span class="badge bg-info text-dark">New</span>' : ''}
    `;

    document.getElementById("modalRatingStars").innerHTML = renderStarsHtml(item.avg_rating);
    document.getElementById("modalRatingSummary").textContent = item.total_ratings > 0
        ? `${(item.avg_rating || 0).toFixed(1)} out of 5 (${item.total_ratings} rating${item.total_ratings === 1 ? '' : 's'})`
        : 'No ratings yet';

    await renderRatingDistribution(item.id, item.total_ratings);

    document.getElementById("modalTags").innerHTML = item.description
        ? `<p class="small text-secondary mb-0">${item.description}</p>` : '';

    resetStarSelector();
    await loadExistingUserRating(item.id);

    const phone = "6.016425079e+10";
    const message = `Hi DEAPS 👋\n\nSaya berminat dengan:\n\n${item.style_code || ''} - ${item.title}\nRM${item.price}`;

    document.getElementById("bookBtn").onclick = function () {
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
    };

    const favBtn = document.getElementById("favoriteBtn");
    favBtn.innerHTML = userBookmarkIds.has(item.id)
        ? '<i class="bi bi-heart-fill"></i> Bookmarked'
        : '<i class="bi bi-heart"></i> Bookmark';
    favBtn.onclick = async function () {
        await toggleBookmark(item.id, null);
        favBtn.innerHTML = userBookmarkIds.has(item.id)
            ? '<i class="bi bi-heart-fill"></i> Bookmarked'
            : '<i class="bi bi-heart"></i> Bookmark';
        const msgBox = document.getElementById("actionMsg");
        if (!currentUser) {
            msgBox.innerHTML = `<span class="text-danger">Sila login dulu di homepage untuk bookmark.</span>`;
        } else {
            msgBox.innerHTML = userBookmarkIds.has(item.id)
                ? `<span class="text-success">Ditambah ke bookmark! ❤️</span>`
                : `<span class="text-secondary">Dibuang dari bookmark.</span>`;
        }
    };

    document.getElementById("cartBtn").onclick = async function () {
        const msgBox = document.getElementById("actionMsg");
        const { data: { user } } = await supabaseClient.auth.getUser();

        if (!user) {
            msgBox.innerHTML = `<span class="text-danger">Sila login dulu di homepage untuk add to cart.</span>`;
            return;
        }

        const { error } = await supabaseClient.from('cart_items').insert({
            user_id: user.id, image_id: item.id, quantity: 1
        });

        if (error) {
            msgBox.innerHTML = `<span class="text-danger">${error.message}</span>`;
            return;
        }
        msgBox.innerHTML = `<span class="text-success">Ditambah ke cart! 🛒</span>`;
    };

    document.getElementById("shareBtn").onclick = () => openShareModal(item.id);

    const modal = new bootstrap.Modal(document.getElementById("styleModal"));
    modal.show();
}

document.getElementById('styleModal').addEventListener('hidden.bs.modal', () => {
    const restored = GalleryState.loadSessionState();
    if (restored) window.scrollTo(0, restored.scrollY || 0);
});

function resetStarSelector() {
    document.querySelectorAll('.star-input').forEach(star => star.classList.remove('filled'));
    document.getElementById('submitRatingBtn').disabled = true;
    document.getElementById('ratingMsg').innerHTML = '';
}

function setStarValue(value) {
    selectedStarValue = value;
    document.querySelectorAll('.star-input').forEach(s => {
        s.classList.toggle('filled', parseInt(s.dataset.value) <= selectedStarValue);
    });
    document.getElementById('submitRatingBtn').disabled = false;
}

document.querySelectorAll('.star-input').forEach(star => {
    star.setAttribute('tabindex', '0');
    star.setAttribute('role', 'radio');
    star.setAttribute('aria-label', `${star.dataset.value} star${star.dataset.value === '1' ? '' : 's'}`);

    star.addEventListener('click', () => setStarValue(parseInt(star.dataset.value)));

    star.addEventListener('keydown', (e) => {
        const current = parseInt(star.dataset.value);
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setStarValue(current);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            const next = Math.min(current + 1, 5);
            setStarValue(next);
            document.querySelector(`.star-input[data-value="${next}"]`).focus();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            const prev = Math.max(current - 1, 1);
            setStarValue(prev);
            document.querySelector(`.star-input[data-value="${prev}"]`).focus();
        }
    });
});

async function loadExistingUserRating(imageId) {
    if (!currentUser) return;
    const { data } = await supabaseClient
        .from('ratings')
        .select('rating')
        .eq('user_id', currentUser.id)
        .eq('image_id', imageId)
        .maybeSingle();

    if (data) {
        setStarValue(data.rating);
        document.getElementById('ratingMsg').innerHTML = `<span class="text-secondary">You rated this ${data.rating}★. Submitting again will update it.</span>`;
    }
}

document.getElementById('submitRatingBtn').addEventListener('click', async () => {
    const msgBox = document.getElementById('ratingMsg');

    if (!currentUser) {
        msgBox.innerHTML = `<span class="text-danger">Sila login dulu di homepage untuk rating.</span>`;
        return;
    }
    if (!currentOpenItem || selectedStarValue < 1) return;

    const btn = document.getElementById('submitRatingBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const { data: allowed, error: rateLimitError } = await supabaseClient.rpc('check_rating_rate_limit', {
        p_user_id: currentUser.id
    });

    if (rateLimitError || allowed === false) {
        msgBox.innerHTML = `<span class="text-danger">Too many ratings submitted too quickly. Please wait a moment and try again.</span>`;
        btn.textContent = 'Submit Rating';
        btn.disabled = false;
        return;
    }

    const { error } = await supabaseClient.from('ratings').upsert({
        user_id: currentUser.id,
        image_id: currentOpenItem.id,
        rating: selectedStarValue,
        updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,image_id' });

    btn.textContent = 'Submit Rating';
    btn.disabled = false;

    if (error) {
        msgBox.innerHTML = `<span class="text-danger">${error.message}</span>`;
        return;
    }

    msgBox.innerHTML = `<span class="text-success">Thank you! Your rating has been saved.</span>`;
    await logBrowseAudit('rating_submit', currentOpenItem.id);

    const { data: refreshed } = await supabaseClient
        .from('images').select('avg_rating, total_ratings').eq('id', currentOpenItem.id).single();
    if (refreshed) {
        currentOpenItem.avg_rating = refreshed.avg_rating;
        currentOpenItem.total_ratings = refreshed.total_ratings;
        const idx = currentData.findIndex(i => i.id === currentOpenItem.id);
        if (idx > -1) currentData[idx] = { ...currentData[idx], ...refreshed };
        document.getElementById("modalRatingStars").innerHTML = renderStarsHtml(refreshed.avg_rating);
        document.getElementById("modalRatingSummary").textContent = `${(refreshed.avg_rating || 0).toFixed(1)} out of 5 (${refreshed.total_ratings} rating${refreshed.total_ratings === 1 ? '' : 's'})`;
        await renderRatingDistribution(currentOpenItem.id, refreshed.total_ratings);
        renderGalleryPage();
    }
});

function buildShareUrl(imageId) {
    const item = currentData.find(i => i.id === imageId);
    const base = window.location.origin + window.location.pathname;
    return `${base}?category=${item ? item.category : ''}&style=${item ? item.style_code : imageId}`;
}

async function openShareModal(imageId) {
    const item = currentData.find(i => i.id === imageId);
    if (!item) return;

    const url = buildShareUrl(imageId);
    const shareText = `Check out this AI style: ${item.title}`;

    if (navigator.share) {
        try {
            await navigator.share({ title: item.title, text: shareText, url });
            logBrowseAudit('share_native', imageId);
            return;
        } catch (err) {
            if (err.name === 'AbortError') return;
        }
    }

    const text = encodeURIComponent(shareText);
    const encodedUrl = encodeURIComponent(url);

    const options = [
        { label: 'WhatsApp', icon: 'bi-whatsapp', href: `https://wa.me/?text=${text}%20${encodedUrl}` },
        { label: 'Facebook', icon: 'bi-facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
        { label: 'X', icon: 'bi-twitter-x', href: `https://twitter.com/intent/tweet?text=${text}&url=${encodedUrl}` },
        { label: 'Telegram', icon: 'bi-telegram', href: `https://t.me/share/url?url=${encodedUrl}&text=${text}` },
        { label: 'LinkedIn', icon: 'bi-linkedin', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}` },
        { label: 'Reddit', icon: 'bi-reddit', href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${text}` },
        { label: 'Pinterest', icon: 'bi-pinterest', href: `https://pinterest.com/pin/create/button/?url=${encodedUrl}&description=${text}` },
        { label: 'Discord', icon: 'bi-discord', href: `https://discord.com/channels/@me` },
        { label: 'Email', icon: 'bi-envelope', href: `mailto:?subject=${text}&body=${encodedUrl}` }
    ];

    document.getElementById('shareOptions').innerHTML = options.map(o => `
        <a href="${o.href}" target="_blank" rel="noopener" class="btn btn-outline-light" aria-label="Share via ${o.label}">
            <i class="bi ${o.icon}"></i>
        </a>
    `).join('');

    document.getElementById('shareUrlInput').value = url;

    document.getElementById('copyLinkBtn').onclick = () => {
        navigator.clipboard.writeText(url);
        document.getElementById('copyLinkBtn').textContent = 'Copied!';
        setTimeout(() => { document.getElementById('copyLinkBtn').textContent = 'Copy Link'; }, 1500);
    };

    logBrowseAudit('share_click', imageId);

    const modal = new bootstrap.Modal(document.getElementById('shareModal'));
    modal.show();
}

async function updateAuthArea() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const authArea = document.getElementById('authArea');

    if (user) {
        authArea.innerHTML = `
            <a href="account.html" class="btn btn-outline-light btn-sm me-1">My Account</a>
            <span class="text-white small me-2">${user.email}</span>
            <button class="btn btn-outline-light btn-sm" id="logoutBtn">Logout</button>
        `;
        document.getElementById('logoutBtn').addEventListener('click', async () => {
            await supabaseClient.auth.signOut();
            updateAuthArea();
        });
    } else {
        authArea.innerHTML = `<a href="index.html" class="btn btn-outline-warning btn-sm">Login</a>`;
    }
}

updateAuthArea();

syncUrlAndChips();
loadGallery();

console.log("Gallery Loaded Successfully (v6.3 — added rating rate-limiting)");