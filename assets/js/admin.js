// =======================================
// DEAPS ADMIN
// =======================================

import {

auth,
provider,
signInWithPopup,
signOut,
onAuthStateChanged

} from "./firebase.js";

// =======================================

const ADMIN_EMAIL = "digitaleminenceent@gmail.com";

const loginCard = document.getElementById("loginCard");

const dashboard = document.getElementById("dashboard");

const loginBtn = document.getElementById("loginBtn");

const logoutBtn = document.getElementById("logoutBtn");

const welcomeUser = document.getElementById("welcomeUser");

// =======================================
// LOGIN
// =======================================

loginBtn.addEventListener("click", async () => {

try{

const result = await signInWithPopup(

auth,

provider

);

const user = result.user;

if(user.email !== ADMIN_EMAIL){

alert("Access Denied!");

await signOut(auth);

return;

}

showDashboard(user);

}

catch(error){

console.error(error);

alert(error.message);

}

});

// =======================================
// LOGOUT
// =======================================

logoutBtn.addEventListener("click", async ()=>{

await signOut(auth);

location.reload();

});

// =======================================
// AUTO LOGIN
// =======================================

onAuthStateChanged(auth,(user)=>{

if(!user){

loginCard.style.display="block";

dashboard.style.display="none";

return;

}

if(user.email!==ADMIN_EMAIL){

alert("Access Denied!");

signOut(auth);

return;

}

showDashboard(user);

});

// =======================================

function showDashboard(user){

loginCard.style.display="none";

dashboard.style.display="block";

welcomeUser.innerHTML=

`Welcome, ${user.displayName}`;

}

console.log("Admin Ready");