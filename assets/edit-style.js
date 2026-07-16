// =======================================
// DEAPS EDIT STYLE
// =======================================

import { db } from "./firebase.js";

import {

doc,
getDoc,
updateDoc,
serverTimestamp

}
from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// =======================================

const params = new URLSearchParams(window.location.search);

const docId = params.get("id");

// =======================================

const preview = document.getElementById("preview");

const styleCode = document.getElementById("styleCode");

const title = document.getElementById("title");

const category = document.getElementById("category");

const tags = document.getElementById("tags");

const prompt = document.getElementById("prompt");

const featured = document.getElementById("featured");

const newest = document.getElementById("newest");

const saveBtn = document.getElementById("saveBtn");

// =======================================

async function loadStyle() {

    if (!docId) {

        alert("Invalid document.");

        window.location.href = "manage-styles.html";

        return;

    }

    try {

        const ref = doc(db, "styles", docId);

        const snap = await getDoc(ref);

        if (!snap.exists()) {

            alert("Style not found.");

            window.location.href = "manage-styles.html";

            return;

        }

        const data = snap.data();

        preview.src = data.image || "";

        styleCode.value = data.id || "";

        title.value = data.title || "";

        category.value = data.category || "";

        tags.value = (data.tags || []).join(", ");

        prompt.value = data.prompt || "";

        featured.checked = data.featured || false;

        newest.checked = data.newest || false;

    }

    catch (err) {

        console.error(err);

        alert(err.message);

    }

}

// =======================================

saveBtn.addEventListener("click", async () => {

    saveBtn.disabled = true;

    saveBtn.innerHTML = "Saving...";

    try {

        await updateDoc(

            doc(db, "styles", docId),

            {

                id: styleCode.value.trim(),

                title: title.value.trim(),

                category: category.value.trim(),

                tags: tags.value

                    .split(",")

                    .map(tag => tag.trim())

                    .filter(tag => tag !== ""),

                prompt: prompt.value.trim(),

                featured: featured.checked,

                newest: newest.checked,

                updatedAt: serverTimestamp()

            }

        );

        alert("Style updated successfully.");

        window.location.href = "manage-styles.html";

    }

    catch (err) {

        console.error(err);

        alert(err.message);

    }

    finally {

        saveBtn.disabled = false;

        saveBtn.innerHTML = "Save Changes";

    }

});

// =======================================

loadStyle();

console.log("Edit Style Ready");