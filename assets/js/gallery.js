// ======================================
// DEAPS GALLERY.JS v4.1 (Supabase — dynamic category/subcategory + system categories)
// ======================================

const params = new URLSearchParams(window.location.search);

const currentCategorySlug = params.get("category");

const selectedStyle = params.get("style");

const urlSubcategorySlug = params.get("sub");

const galleryContainer = document.getElementById("galleryContainer");

const categoryTitle = document.getElementById("categoryTitle");

const subcategoryNav = document.getElementById("subcategoryNav");

const searchInput = document.getElementById("gallerySearch");

let currentCategoryRecord = null;

let currentSubcategories = [];

let activeSubcategoryId = null; // null = "All"

let currentData = [];

// ======================================
// SYSTEM CATEGORIES (virtual, not stored in Supabase)
// ======================================

const SYSTEM_CATEGORIES = {
    featured: { id: null, name: "⭐ Featured", slug: "featured", icon: "bi-star-fill", color: "#D4AF37", isSystem: true },
    all: { id: null, name: "🎨 All Styles", slug: "all", icon: "bi-palette-fill", color: "#D4AF37", isSystem: true }
};

// ======================================
// SESSION CACHE HELPER (shared pattern with app.js)
// ======================================

const CACHE_TTL_MS = 5 * 60 * 1000;

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
    } catch (e) {}
}

// ======================================
// SKELETON / LOADING STATE
// ======================================

function renderGallerySkeleton() {
    galleryContainer.innerHTML = Array(8).fill(0).map(() => `
        <div class="col-xl-3 col-lg-4 col-md-6">
            <div class="style-card" style="opacity:.4;">
                <div style="width:100%; aspect-ratio:4/5; background:#1a1a1a;"></div>
                <div class="p-3">
                    <div style="height:12px; width:40%; background:#222; margin-bottom:10px; border-radius:4px;"></div>
                    <div style="height:18px; width:70%; background:#222; border-radius:4px;"></div>
                </div>
            </div>
        </div>
    `).join('');
}

// ======================================
// LOAD CATEGORY RECORD (system categories + dynamic, no hardcoded names)
// ======================================

async function loadCategoryRecord() {
    if (!currentCategorySlug) {
        categoryTitle.innerHTML = "Gallery";
        return null;
    }

    // System categories (Featured / All Styles) — no database lookup
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

// ======================================
// LOAD SUBCATEGORIES (dynamic, with counts — skipped for system categories)
// ======================================

async function loadSubcategories() {
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

    // Determine initial selection: URL param > session memory > "All"
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

    const allCount = currentData.length;

    const countFor = (subId) => currentData.filter(item => item.subcategory_id === subId).length;

    const chips = [
        `<button type="button" class="btn btn-sm ${activeSubcategoryId === null ? 'btn-warning' : 'btn-outline-light'}" onclick="selectSubcategory(null)">
            <i class="bi bi-grid"></i> All (${allCount})
        </button>`
    ].concat(currentSubcategories.map(sub => `
        <button type="button" class="btn btn-sm ${activeSubcategoryId === sub.id ? 'btn-warning' : 'btn-outline-light'}" onclick="selectSubcategory('${sub.id}')">
            <i class="bi ${sub.icon || 'bi-tag'}"></i> ${sub.name} (${countFor(sub.id)})
        </button>
    `));

    subcategoryNav.style.overflowX = 'auto';
    subcategoryNav.style.whiteSpace = 'nowrap';
    subcategoryNav.style.paddingBottom = '8px';
    subcategoryNav.innerHTML = `<div class="d-flex gap-2 flex-nowrap mb-4">${chips.join('')}</div>`;
}

function selectSubcategory(subId) {
    activeSubcategoryId = subId;

    // Remember selection for this session
    if (subId) {
        sessionStorage.setItem(`deaps_last_sub_${currentCategorySlug}`, subId);
    } else {
        sessionStorage.removeItem(`deaps_last_sub_${currentCategorySlug}`);
    }

    renderSubcategoryNav();
    applyFilters();
}

// ======================================
// LOAD GALLERY ITEMS FROM SUPABASE
// ======================================

async function loadGallery() {

  renderGallerySkeleton();

  await loadCategoryRecord();

  let query = supabaseClient
    .from('images')
    .select('id, title, description, category, category_id, subcategory_id, preview_url, price, style_code, is_featured')
    .eq('is_active', true);

  if (currentCategorySlug === "featured") {
    query = query.eq('is_featured', true);
  } else if (currentCategorySlug === "all") {
    // No extra filter — show every active image
  } else if (currentCategorySlug) {
    query = query.eq('category', currentCategorySlug);
  }

  const { data, error } = await query;

  if (error) {
    galleryContainer.innerHTML = `
      <div class="col-12 text-center py-5">
        <h3>Error loading gallery</h3>
      </div>
    `;
    console.error(error);
    return;
  }

  currentData = data;

  await loadSubcategories();

  applyFilters();

  if (selectedStyle) {
    setTimeout(() => {
      openStyle(selectedStyle);
    }, 300);
  }
}

// ======================================
// APPLY FILTERS (subcategory + search) — instant, no refetch
// ======================================

function applyFilters() {
    const keyword = searchInput ? searchInput.value.toLowerCase() : '';

    let filtered = currentData;

    if (activeSubcategoryId) {
        filtered = filtered.filter(item => item.subcategory_id === activeSubcategoryId);
    }

    if (keyword) {
        filtered = filtered.filter(item =>
            item.title.toLowerCase().includes(keyword) ||
            (item.description || '').toLowerCase().includes(keyword) ||
            (item.style_code || '').toLowerCase().includes(keyword)
        );
    }

    renderGallery(filtered);
}

// ======================================
// RENDER
// ======================================

function renderGallery(data){

galleryContainer.innerHTML="";

if(data.length===0){

galleryContainer.innerHTML=`
<div class="col-12 text-center py-5">
<i class="bi bi-inbox" style="font-size:3rem; color:#555;"></i>
<h3 class="mt-3">No Style Found</h3>
<p class="text-secondary">Cuba kategori lain atau kata kunci carian berbeza.</p>
<button class="btn btn-outline-warning mt-2" onclick="resetFilters()">Reset Filters</button>
</div>
`;

return;

}

data.forEach(item=>{

galleryContainer.innerHTML+=`

<div class="col-xl-3 col-lg-4 col-md-6">

<div class="style-card" onclick="openStyle('${item.id}')" style="cursor:pointer;">

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

<button

class="btn btn-warning w-100 mt-3"

onclick="event.stopPropagation(); openStyle('${item.id}')">

View Style

</button>

</div>

</div>

</div>

`;

});

}

function resetFilters() {
    if (searchInput) searchInput.value = '';
    selectSubcategory(null);
}

// ======================================
// SEARCH (client-side, instant, combined with subcategory filter)
// ======================================

if(searchInput){

searchInput.addEventListener("keyup", applyFilters);

}

// ======================================
// POPUP
// ======================================

function openStyle(id){

const item=currentData.find(x=>x.id===id || x.style_code===id);

if(!item) return;

document.getElementById("modalImage").src=item.preview_url;

document.getElementById("modalCode").innerHTML=item.style_code || '';

document.getElementById("modalTitle").innerHTML=item.title;

const tagBox=document.getElementById("modalTags");

tagBox.innerHTML = `
  <span class="badge bg-secondary me-2 mb-2">${currentCategoryRecord && !currentCategoryRecord.isSystem ? currentCategoryRecord.name : item.category}</span>
  <h4 class="text-warning mt-2 mb-2">RM${item.price}</h4>
  ${item.description ? `<p class="text-secondary mb-0">${item.description}</p>` : ''}
`;

const phone="60164250790";

const message=
`Hi DEAPS 👋

Saya berminat dengan:

${item.style_code || ''} - ${item.title}
RM${item.price}`;

document.getElementById("bookBtn").onclick=function(){

window.open(

`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,

"_blank"

);

};

// ---- FAVORITE BUTTON ----
document.getElementById("favoriteBtn").onclick = async function(){
  const msgBox = document.getElementById("actionMsg");
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!user) {
    msgBox.innerHTML = `<span class="text-danger">Sila login dulu di homepage untuk favorite.</span>`;
    return;
  }

  const { error } = await supabaseClient.from('favorites').insert({
    user_id: user.id,
    image_id: item.id
  });

  if (error) {
    if (error.code === '23505') {
      msgBox.innerHTML = `<span class="text-warning">Dah ada dalam favorite anda.</span>`;
    } else {
      msgBox.innerHTML = `<span class="text-danger">${error.message}</span>`;
    }
    return;
  }

  msgBox.innerHTML = `<span class="text-success">Ditambah ke favorite! ❤️</span>`;
};

// ---- ADD TO CART BUTTON ----
document.getElementById("cartBtn").onclick = async function(){
  const msgBox = document.getElementById("actionMsg");
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!user) {
    msgBox.innerHTML = `<span class="text-danger">Sila login dulu di homepage untuk add to cart.</span>`;
    return;
  }

  const { error } = await supabaseClient.from('cart_items').insert({
    user_id: user.id,
    image_id: item.id,
    quantity: 1
  });

  if (error) {
    msgBox.innerHTML = `<span class="text-danger">${error.message}</span>`;
    return;
  }

  msgBox.innerHTML = `<span class="text-success">Ditambah ke cart! 🛒</span>`;
};

const modal=new bootstrap.Modal(

document.getElementById("styleModal")

);

modal.show();

}

// ======================================
// AUTH STATUS (navbar)
// ======================================

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
    authArea.innerHTML = `
      <a href="index.html" class="btn btn-outline-warning btn-sm">Login</a>
    `;
  }
}

updateAuthArea();

// ======================================
// INIT
// ======================================

loadGallery();

console.log("Gallery Loaded Successfully (Supabase, system + dynamic category/subcategory)");