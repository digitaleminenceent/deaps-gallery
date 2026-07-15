// =======================================
// DEAPS DASHBOARD v2.0
// =======================================

import { db, auth } from "./firebase.js";

import {
collection,
getDocs,
onSnapshot
}
from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
onAuthStateChanged
}
from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

// =======================================

const totalStyles=document.getElementById("totalStyles");

const featuredStyles=document.getElementById("featuredStylesCount");

const newestStyles=document.getElementById("newestStylesCount");

const totalCategories=document.getElementById("totalCategories");

// =======================================

async function updateDashboard(){

try{

const snapshot=await getDocs(

collection(db,"styles")

);

let total=0;

let featured=0;

let newest=0;

const categories=new Set();

snapshot.forEach(doc=>{

const data=doc.data();

total++;

if(data.featured) featured++;

if(data.newest) newest++;

if(data.category){

categories.add(data.category);

}

});

totalStyles.textContent=total;

featuredStyles.textContent=featured;

newestStyles.textContent=newest;

totalCategories.textContent=categories.size;

console.log("Dashboard Updated");

}

catch(err){

console.error("Dashboard Error:",err);

}

}// =======================================
// WAIT UNTIL LOGIN
// =======================================

onAuthStateChanged(auth,(user)=>{

if(!user){

return;

}

// Load sekali selepas login

updateDashboard();

// Auto refresh bila Firestore berubah

onSnapshot(

collection(db,"styles"),

()=>{

updateDashboard();

}

);

});

// =======================================

console.log("DEAPS Dashboard Ready");