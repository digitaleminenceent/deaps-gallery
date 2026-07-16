// ======================================
// DEAPS APP.JS v3.0 (Supabase)
// ======================================

document.addEventListener("DOMContentLoaded", () => {

    initSearch();

    loadFeatured();

    loadNewest();

});

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
class="img-fluid">

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
class="img-fluid">

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

console.log("DEAPS App Loaded (Supabase)");