// =======================================
// DEAPS FIREBASE
// =======================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import {
getAuth,
GoogleAuthProvider,
signInWithPopup,
signOut,
onAuthStateChanged
}
from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
getFirestore
}
from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// =======================================

const firebaseConfig = {

apiKey: "AIzaSyDGqLxgAVz8Yc_n6nH704UTwoikTunvnCE",

authDomain: "deaps-124ee.firebaseapp.com",

projectId: "deaps-124ee",

storageBucket: "deaps-124ee.firebasestorage.app",

messagingSenderId: "316345089427",

appId: "1:316345089427:web:8b5500baada3dd3492fc66"

};

// =======================================

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app);

export const provider = new GoogleAuthProvider();

export {

signInWithPopup,

signOut,

onAuthStateChanged

};

console.log("Firebase Connected");