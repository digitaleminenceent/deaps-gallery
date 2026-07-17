// ======================================
// DEAPS APP.JS v4.2 (Supabase — dynamic categories + system categories, cached, with counts, lazy loading, badges)
// ======================================

document.addEventListener("DOMContentLoaded", () => {

    initSearch();

    loadCategories();

    loadFeatured();

    loadNewest();

});

// ======================================
// SESSION CACHE HELPER (reduces repeat API calls)
// ======================================

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedData(key) {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;
        return parsed.data;
    } catch (e) {
        return null;
    }
}

function setCachedData(key, data) {
    try {
        sessionStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (e) {
        // sessionStorage unavailable or full — fail silently, not critical
    }
}

// ======================================
// LAST SELECTED NAV (session memory)
// ======================================

function setLastNav(slug) {
    try {
        sessionStorage.setItem('deaps_last_nav', slug);
    } catch (e) {}
}

// ======================================
// CATEGORIES (system + dynamic, from Supabase, cached, with item counts)
// ======================================

function renderCategorySkeleton(grid) {
    grid.innerHTML = Array(8).fill(0).map(() => `
        <div class="col-lg-3 col-md-4 col-6">
            <div class="category-card" style="background:#181818; opacity:.5;"></div>
        </div>
    `).join('');
}

function buildCategoryCardHtml(cat) {
    return `

<div class="col-lg-3 col-md-4 col-6">

<a href="gallery.html?category=${cat.slug}" class="text-decoration-none" onclick="setLastNav('${cat.slug}')">

<div class="category-card" style="position:relative;">

${cat.banner_url
    ? `<img src="${cat.banner_url}" loading="lazy">`
    : `<div style="width:100%; height:100%; background:${cat.color || '#D4AF37'}22; display:flex; align-items:center; justify-content:center;">
         <i class="bi ${cat.icon || 'bi-folder'}" style="font-size:3rem; color:${cat.color || '#D4AF37'};"></i>
       </div>`
}

${cat.badge ? `<span class="badge bg-warning text-dark position-absolute top-0 end-0 m-2">${cat.badge}</span>` : ''}

<div class="overlay">

<h4>${cat.name}</h4>

<p class="small mb-0" style="opacity:.75;">${cat.itemCount} item${cat.itemCount === 1 ? '' : 's'}</p>

</div>

</div>

</a>

</div>

`;
}

async function loadCategories() {

    const grid = document.getElementById("categoryGrid");

    if (!grid) return;

    renderCategorySkeleton(grid);

    let categories = getCachedData('deaps_categories_cache');

    if (!categories) {
        const { data, error } = await supabaseClient
            .from('categories')
            .select('id, name, slug, icon, color, banner_url')
            .eq('is_active', true)
            .eq('show_on_home', true)
            .order('display_order', { ascending: true });

        if (error || !data) {
            grid.innerHTML = `<p class="text-secondary text-center w-100">Tiada kategori tersedia.</p>`;
            return;
        }

        categories = data;
        setCachedData('deaps_categories_cache', categories);
    }

    // Single query to get all active images (used for both All Styles count and per-category counts)
    const { data: imageRefs } = await supabaseClient
        .from('images')
        .select('category_id, is_featured')
        .eq('is_active', true);

    const countMap = {};
    let featuredCount = 0;
    const allStylesCount = (imageRefs || []).length;

    (imageRefs || []).forEach(row => {
        if (row.category_id) countMap[row.category_id] = (countMap[row.category_id] || 0) + 1;
        if (row.is_featured) featuredCount++;
    });

    const systemCards = [
        {
            slug: "featured",
            name: "⭐ Featured",
            icon: "bi-star-fill",
            color: "#D4AF37",
            banner_url: null,
            badge: null,
            itemCount: featuredCount
        },
        {
            slug: "all",
            name: "🎨 All Styles",
            icon: "bi-palette-fill",
            color: "#D4AF37",
            banner_url: null,
            badge: null,
            itemCount: allStylesCount
        }

        // FUTURE READY — uncomment when these features are implemented
        // { slug: "editors-choice", name: "Editor's Choice", icon: "bi-award-fill", color: "#D4AF37", banner_url: null, itemCount: 0, badge: null },
        // { slug: "trending", name: "Trending Styles", icon: "bi-graph-up-arrow", color: "#D4AF37", banner_url: null, itemCount: 0, badge: "🔥" },
        // { slug: "new-arrivals", name: "New Arrivals", icon: "bi-stars", color: "#D4AF37", banner_url: null, itemCount: 0, badge: "New" },
        // { slug: "most-rated", name: "Most Rated", icon: "bi-heart-fill", color: "#D4AF37", banner_url: null, itemCount: 0, badge: null },
        // { slug: "most-shared", name: "Most Shared", icon: "bi-share-fill", color: "#D4AF37", banner_url: null, itemCount: 0, badge: null },
        // { slug: "community-favorites", name: "Community Favorites", icon: "bi-people-fill", color: "#D4AF37", banner_url: null, itemCount: 0, badge: null },
        // { slug: "seasonal", name: "Seasonal Collections", icon: "bi-snow", color: "#D4AF37", banner_url: null, itemCount: 0, badge: null }
    ];

    const dynamicCards = (categories || []).map(cat => ({
        ...cat,
        badge: null,
        itemCount: countMap[cat.id] || 0
    }));

    if (!dynamicCards.length && !systemCards.length) {
        grid.innerHTML = `<p class="text-secondary text-center w-100">Tiada kategori tersedia.</p>`;
        return;
    }

    const allCards = [...systemCards, ...dynamicCards];

    grid.innerHTML = allCards.map(buildCategoryCardHtml).join('');

}

// ======================================
// SEARCH
// ======================================

function initSearch() {

    const input = document.querySelector(".search-box input");
    const button = document.querySelector(".search-box button");

    if (!input) return;

    input.addEventListener("keypress", function (e) {

        if (e.key === "Enter") {

            searchStyle();

        }

    });

    if (button) {

        button.onclick = searchStyle;

    }

}

async function searchStyle() {

    const input = document.querySelector(".search-box input");

    const keyword = input.value.trim().toLowerCase();

    if (keyword === "") {

        alert("Please enter Style Code.");

        return;

    }

    // Try exact style code match first
    let { data, error } = await supabaseClient
        .from('images')
        .select('id, title, category, style_code')
        .eq('is_active', true)
        .ilike('style_code', keyword)
        .limit(1);

    // Fallback: title contains keyword
    if (!data || data.length === 0) {
        const fallback = await supabaseClient
            .from('images')
            .select('id, title, category, style_code')
            .eq('is_active', true)
            .ilike('title', `%${keyword}%`)
            .limit(1);

        data = fallback.data;
        error = fallback.error;
    }

    if (error || !data || data.length === 0) {

        alert("Style not found.");

        return;

    }

    const result = data[0];

    window.location.href =
        `gallery.html?category=${result.category}&style=${result.style_code}`;

}

// ======================================
// FEATURED (newest 4 active images)
// ======================================

async function loadFeatured() {

    const box = document.getElementById("featuredStyles");

    if (!box) return;

    const { data, error } = await supabaseClient
        .from('images')
        .select('id, title, category, preview_url, style_code')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(4);

    if (error || !data) return;

    data.forEach(item => {

        box.innerHTML += `

<div class="col-lg-3 col-md-4 col-6">

<div class="style-card">

<img
src="${item.preview_url}"
class="img-fluid"
loading="lazy">

<div class="p-3">

<h6 class="text-warning">

${item.style_code || ''}

</h6>

<h5>

${item.title}

</h5>

<a

href="gallery.html?category=${item.category}&style=${item.style_code}"

class="btn btn-warning w-100">

View Style

</a>

</div>

</div>

</div>

`;

    });

}

// ======================================
// NEW ARRIVAL (next 4 newest active images)
// ======================================

async function loadNewest() {

    const box = document.getElementById("newStyles");

    if (!box) return;

    const { data, error } = await supabaseClient
        .from('images')
        .select('id, title, category, preview_url, style_code')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .range(4, 7);

    if (error || !data) return;

    data.forEach(item => {

        box.innerHTML += `

<div class="col-lg-3 col-md-4 col-6">

<div class="style-card">

<img
src="${item.preview_url}"
class="img-fluid"
loading="lazy">

<div class="p-3">

<h6 class="text-warning">

${item.style_code || ''}

</h6>

<h5>

${item.title}

</h5>

<a

href="gallery.html?category=${item.category}&style=${item.style_code}"

class="btn btn-outline-warning w-100">

View Style

</a>

</div>

</div>

</div>

`;

    });

}

console.log("DEAPS App Loaded (Supabase, system + dynamic categories, v4.2)");