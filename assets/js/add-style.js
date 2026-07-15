// =======================================
// DEAPS ADD STYLE
// =======================================

import { db } from "./firebase.js";

import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// =======================================

const imageInput = document.getElementById("imageInput");
const previewImage = document.getElementById("previewImage");
const placeholder = document.getElementById("placeholder");
const saveBtn = document.getElementById("saveBtn");

// =======================================
// IMAGE PREVIEW
// =======================================

imageInput.addEventListener("change", () => {

  const file = imageInput.files[0];

  if (!file) return;

  previewImage.src = URL.createObjectURL(file);

  previewImage.style.display = "block";

  placeholder.style.display = "none";

});

// =======================================
// SAVE STYLE
// =======================================

saveBtn.addEventListener("click", async () => {

  try {

    const styleCode = document.getElementById("styleCode").value.trim();
    const title = document.getElementById("title").value.trim();
    const category = document.getElementById("category").value;
    const tags = document.getElementById("tags").value.trim();
    const prompt = document.getElementById("prompt").value.trim();
    const featured = document.getElementById("featured").checked;
    const newest = document.getElementById("newest").checked;

    const file = imageInput.files[0];

    if (!styleCode) {
      alert("Please enter Style Code.");
      return;
    }

    if (!title) {
      alert("Please enter Title.");
      return;
    }

    if (!file) {
      alert("Please select an image.");
      return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = "Uploading...";

    // =======================================
    // Upload Image to Cloudflare Worker
    // =======================================

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(
      "https://deaps-api.digitaleminenceent.workers.dev/",
      {
        method: "POST",
        body: formData
      }
    );

    const uploadResult = await response.json();

    if (!uploadResult.success) {
      throw new Error(uploadResult.error || "Image upload failed.");
    }

    // =======================================
    // Save to Firestore
    // =======================================

    await addDoc(collection(db, "styles"), {

      id: styleCode,

      title: title,

      category: category,

      tags: tags
        .split(",")
        .map(tag => tag.trim())
        .filter(tag => tag !== ""),

      prompt: prompt,

      image: uploadResult.image,

      featured: featured,

      newest: newest,

      createdAt: serverTimestamp()

    });

    alert("Style added successfully!");

    window.location.href = "admin.html";

  }

  catch (error) {

    console.error(error);

    alert(error.message);

  }

  finally {

    saveBtn.disabled = false;

    saveBtn.innerHTML = `
      <i class="bi bi-cloud-upload-fill"></i>
      Save Style
    `;

  }

});

console.log("DEAPS Add Style Ready");