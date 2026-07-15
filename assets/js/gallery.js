// ======================================
// DEAPS GALLERY.JS v2.0
// ======================================

const params = new URLSearchParams(window.location.search);

const currentCategory = params.get("category");

const selectedStyle = params.get("style");

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

const currentData =
catalog.filter(item=>item.category===currentCategory);

renderGallery(currentData);

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
src="${item.image}"
class="img-fluid"
loading="lazy">

<div class="p-3">

<h6 class="text-warning">

${item.id}

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
// SEARCH
// ======================================

if(searchInput){

searchInput.addEventListener("keyup",()=>{

const keyword=searchInput.value.toLowerCase();

const filtered=currentData.filter(item=>

item.id.toLowerCase().includes(keyword)

||

item.title.toLowerCase().includes(keyword)

||

item.tags.join(" ").toLowerCase().includes(keyword)

);

renderGallery(filtered);

});

}

// ======================================
// POPUP
// ======================================

function openStyle(id){

const item=catalog.find(x=>x.id===id);

if(!item) return;

document.getElementById("modalImage").src=item.image;

document.getElementById("modalCode").innerHTML=item.id;

document.getElementById("modalTitle").innerHTML=item.title;

const tagBox=document.getElementById("modalTags");

tagBox.innerHTML="";

item.tags.forEach(tag=>{

tagBox.innerHTML+=`
<span class="badge bg-warning text-dark me-2 mb-2">
${tag}
</span>
`;

});

const phone="60164250790";

const message=
`Hi DEAPS 👋

Saya berminat dengan Style Code:

${item.id}

${item.title}`;

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
// AUTO OPEN
// ======================================

if(selectedStyle){

setTimeout(()=>{

openStyle(selectedStyle);

},300);

}

console.log("Gallery Loaded Successfully");