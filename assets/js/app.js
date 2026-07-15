// ======================================
// DEAPS APP.JS v2.0
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

function searchStyle() {

    const input = document.querySelector(".search-box input");

    const keyword = input.value.trim().toLowerCase();

    if (keyword === "") {

        alert("Please enter Style Code.");

        return;

    }

    const result = catalog.find(item =>

        item.id.toLowerCase() === keyword ||

        item.title.toLowerCase().includes(keyword) ||

        item.tags.join(" ").toLowerCase().includes(keyword)

    );

    if (result) {

        window.location.href =
            `gallery.html?category=${result.category}&style=${result.id}`;

    }

    else {

        alert("Style not found.");

    }

}

// ======================================
// FEATURED
// ======================================

function loadFeatured() {

    const box = document.getElementById("featuredStyles");

    if (!box) return;

    const featured = catalog.filter(item => item.featured);

    featured.forEach(item => {

        box.innerHTML += `

<div class="col-lg-3 col-md-4 col-6">

<div class="style-card">

<img
src="${item.image}"
class="img-fluid">

<div class="p-3">

<h6 class="text-warning">

${item.id}

</h6>

<h5>

${item.title}

</h5>

<a

href="gallery.html?category=${item.category}&style=${item.id}"

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
// NEW ARRIVAL
// ======================================

function loadNewest() {

    const box = document.getElementById("newStyles");

    if (!box) return;

    const newest = catalog.filter(item => item.newest);

    newest.forEach(item => {

        box.innerHTML += `

<div class="col-lg-3 col-md-4 col-6">

<div class="style-card">

<img
src="${item.image}"
class="img-fluid">

<div class="p-3">

<h6 class="text-warning">

${item.id}

</h6>

<h5>

${item.title}

</h5>

<a

href="gallery.html?category=${item.category}&style=${item.id}"

class="btn btn-outline-warning w-100">

View Style

</a>

</div>

</div>

</div>

`;

    });

}

console.log("DEAPS App Loaded");