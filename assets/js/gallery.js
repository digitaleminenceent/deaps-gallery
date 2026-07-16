// ======================================
// DEAPS GALLERY.JS v3.0 (Supabase)
// ======================================

const params = new URLSearchParams(window.location.search);

const currentCategory = params.get("category");

const selectedStyle = params.get("style"); // now a Supabase image id (uuid)

const galleryContainer = document.getElementById("galleryContainer");

const categoryTitle = document.getElementById("categoryTitle");

const searchInput = document.getElementById("gallerySearch");

const categoryName = {

female:"Female Portrait",
male:"Male Portrait",
fashion:"Fashion",
beauty:"Beauty",
sports:"Sports",
travel:"Travel",
fantasy:"Fantasy",
product:"Product",
automotive:"Automotive",
food:"Food",
interior:"Interior",
advertising:"Advertising"

};

categoryTitle.innerHTML =
categoryName[currentCategory] || "Gallery";

let currentData = [];

// ======================================
// LOAD FROM SUPABASE
// ======================================

async function loadGallery() {

  let query = supabaseClient
    .from('images')
    .select('id, title, description, category, preview_url, price, style_code')
    .eq('is_active', true);

  if (currentCategory) {
    query = query.eq('category', currentCategory);
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

  renderGallery(currentData);

  if (selectedStyle) {
    setTimeout(() => {
      openStyle(selectedStyle);
    }, 300);
  }
}

// ======================================
// RENDER
// ======================================

function renderGallery(data){

galleryContainer.innerHTML="";

if(data.length===0){

galleryContainer.innerHTML=`
<div class="col-12 text-center py-5">
<h3>No Style Found</h3>
</div>
`;

return;

}

data.forEach(item=>{

galleryContainer.innerHTML+=`

<div class="col-xl-3 col-lg-4 col-md-6">

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

<button

class="btn btn-warning w-100 mt-3"

onclick="openStyle('${item.id}')">

View Style

</button>

</div>

</div>

</div>

`;

});

}

// ======================================
// SEARCH (client-side over loaded category data)
// ======================================

if(searchInput){

searchInput.addEventListener("keyup",()=>{

const keyword=searchInput.value.toLowerCase();

const filtered=currentData.filter(item=>

item.title.toLowerCase().includes(keyword)

||

(item.description || '').toLowerCase().includes(keyword)

||

(item.style_code || '').toLowerCase().includes(keyword)

);

renderGallery(filtered);

});

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
  <span class="badge bg-secondary me-2 mb-2">${categoryName[item.category] || item.category || ''}</span>
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

const modal=new bootstrap.Modal(

document.getElementById("styleModal")

);

modal.show();

}

// ======================================
// INIT
// ======================================

loadGallery();

console.log("Gallery Loaded Successfully (Supabase)");