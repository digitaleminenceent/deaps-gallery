// =======================================
// DEAPS MANAGE STYLES v2.0
// =======================================

import { db } from "./firebase.js";

import {

collection,
getDocs,
deleteDoc,
doc,
query,
orderBy

}
from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// =======================================

const table=document.getElementById("styleTable");

const search=document.getElementById("search");

let styles=[];

// =======================================

async function loadStyles(){

table.innerHTML=`

<tr>

<td colspan="5" class="text-center">

Loading...

</td>

</tr>

`;

const snapshot=await getDocs(

query(

collection(db,"styles"),

orderBy("createdAt","desc")

)

);

styles=[];

snapshot.forEach(d=>{

styles.push({

docId:d.id,

...d.data()

});

});

render(styles);

}

// =======================================

function render(data){

table.innerHTML="";

if(data.length===0){

table.innerHTML=`

<tr>

<td colspan="5"

class="text-center">

No Styles

</td>

</tr>

`;

return;

}

data.forEach(item=>{

table.innerHTML+=`

<tr>

<td width="90">

<img

src="${item.image}"

style="width:70px;height:70px;object-fit:cover;border-radius:8px;">

</td>

<td>

${item.id}

</td>

<td>

${item.title}

</td>

<td>

${item.category}

</td>

<td>

<button

class="btn btn-sm btn-warning me-1"

onclick="editStyle('${item.docId}')">

Edit

</button>

<button

class="btn btn-sm btn-info me-1"

onclick="copyPrompt('${item.docId}')">

Copy

</button>

<button

class="btn btn-sm btn-danger"

onclick="deleteStyle('${item.docId}')">

Delete

</button>

</td>

</tr>

`;

});

}// =======================================
// SEARCH
// =======================================

search.addEventListener("keyup",()=>{

const keyword=search.value.toLowerCase();

const filtered=styles.filter(item=>

(item.id||"").toLowerCase().includes(keyword)

||

(item.title||"").toLowerCase().includes(keyword)

||

(item.category||"").toLowerCase().includes(keyword)

||

(item.prompt||"").toLowerCase().includes(keyword)

);

render(filtered);

});

// =======================================
// COPY PROMPT
// =======================================

window.copyPrompt=async function(docId){

const item=styles.find(x=>x.docId===docId);

if(!item) return;

try{

await navigator.clipboard.writeText(

item.prompt||""

);

alert("✅ Prompt copied to clipboard.");

}

catch(err){

console.error(err);

alert("Unable to copy prompt.");

}

};

// =======================================
// DELETE
// =======================================

window.deleteStyle=async function(docId){

const ok=confirm(

"Delete this style permanently?"

);

if(!ok) return;

try{

await deleteDoc(

doc(db,"styles",docId)

);

styles=styles.filter(

x=>x.docId!==docId

);

render(styles);

alert("✅ Style deleted.");

}

catch(err){

console.error(err);

alert(err.message);

}

};

// =======================================
// EDIT
// =======================================

window.editStyle=function(docId){

window.location.href=

`edit-style.html?id=${docId}`;

};

// =======================================

loadStyles();

console.log(

"DEAPS Manage Styles v2 Ready"

);