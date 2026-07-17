// assets/js/admin.js

let allCategoriesCache = [];

// ---- LOAD CATEGORIES INTO DROPDOWN ----
async function loadCategoryDropdown() {
  const { data, error } = await supabaseClient
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  const select = document.getElementById('imgCategory');

  if (error || !data) {
    select.innerHTML = `<option value="">Error loading categories</option>`;
    return;
  }

  allCategoriesCache = data;

  select.innerHTML = data.map(cat =>
    `<option value="${cat.slug}" data-id="${cat.id}" data-prefix="${cat.code_prefix || ''}">${cat.name}</option>`
  ).join('');

  await loadSubcategoryDropdown();
}

// ---- LOAD SUBCATEGORIES FOR SELECTED CATEGORY ----
async function loadSubcategoryDropdown() {
  const catSelect = document.getElementById('imgCategory');
  const selectedOption = catSelect.options[catSelect.selectedIndex];
  const categoryId = selectedOption ? selectedOption.dataset.id : null;
  const wrap = document.getElementById('subcategoryWrap');
  const subSelect = document.getElementById('imgSubcategory');

  if (!categoryId) {
    wrap.style.display = 'none';
    return;
  }

  const { data, error } = await supabaseClient
    .from('subcategories')
    .select('*')
    .eq('category_id', categoryId)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error || !data || !data.length) {
    wrap.style.display = 'none';
    subSelect.innerHTML = `<option value="">— None —</option>`;
    return;
  }

  subSelect.innerHTML = `<option value="">— None —</option>` +
    data.map(sub => `<option value="${sub.id}">${sub.name}</option>`).join('');
  wrap.style.display = 'block';
}

document.getElementById('imgCategory').addEventListener('change', loadSubcategoryDropdown);

// ---- GENERATE STYLE CODE (uses code_prefix from categories table) ----
async function generateStyleCode(category) {
  const catRow = allCategoriesCache.find(c => c.slug === category);
  const prefix = (catRow && catRow.code_prefix) ? catRow.code_prefix : 'XX';

  const { data, error } = await supabaseClient
    .from('images')
    .select('style_code')
    .eq('category', category)
    .order('style_code', { ascending: false })
    .limit(1);

  let nextNumber = 1;

  if (!error && data && data.length > 0 && data[0].style_code) {
    const match = data[0].style_code.match(/(\d+)$/);
    if (match) nextNumber = parseInt(match[1], 10) + 1;
  }

  return prefix + String(nextNumber).padStart(4, '0');
}

// ---- WATERMARK: creates a watermarked copy of the uploaded image ----
function createWatermarkedBlob(file, text) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target.result;
    };
    reader.onerror = reject;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      ctx.drawImage(img, 0, 0);

      const fontSize = Math.max(24, Math.floor(canvas.width / 15));
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 6);

      const stepX = fontSize * 6;
      const stepY = fontSize * 4;

      for (let y = -canvas.height; y < canvas.height; y += stepY) {
        for (let x = -canvas.width; x < canvas.width; x += stepX) {
          ctx.fillText(text, x, y);
        }
      }

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Gagal proses watermark.'));
      }, file.type || 'image/jpeg', 0.9);
    };

    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---- TOAST NOTIFICATIONS ----
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const icon = type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill';
  const bg = type === 'success' ? 'text-bg-success' : 'text-bg-danger';

  const toastEl = document.createElement('div');
  toastEl.className = `toast align-items-center ${bg} border-0`;
  toastEl.setAttribute('role', 'alert');
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        <i class="bi ${icon} me-2"></i>${message}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;

  container.appendChild(toastEl);
  const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
  toast.show();
  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

const loginCard = document.getElementById('loginCard');
const deniedCard = document.getElementById('deniedCard');
const dashboard = document.getElementById('dashboard');
const authArea = document.getElementById('authArea');

// ---- CHECK LOGIN + ADMIN ROLE ON LOAD ----
async function checkAdminAccess() {
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!user) {
    loginCard.style.display = 'block';
    deniedCard.style.display = 'none';
    dashboard.style.display = 'none';
    authArea.innerHTML = '';
    return;
  }

  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error || !profile || profile.role !== 'admin') {
    loginCard.style.display = 'none';
    deniedCard.style.display = 'block';
    dashboard.style.display = 'none';
    authArea.innerHTML = `<button class="btn btn-outline-light btn-sm" id="logoutBtn">Logout</button>`;
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      checkAdminAccess();
    });
    return;
  }

  // Admin confirmed
  loginCard.style.display = 'none';
  deniedCard.style.display = 'none';
  dashboard.style.display = 'block';
  authArea.innerHTML = `
    <span class="text-white small me-2">${user.email}</span>
    <button class="btn btn-outline-light btn-sm" id="logoutBtn">Logout</button>
  `;
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    checkAdminAccess();
  });

  loadCategoryDropdown();
  loadCatalog();
}

// ---- ADMIN LOGIN FORM ----
document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('adminEmail').value;
  const password = document.getElementById('adminPassword').value;
  const errorBox = document.getElementById('adminLoginError');
  errorBox.textContent = '';

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    errorBox.textContent = error.message;
    return;
  }

  checkAdminAccess();
});

// ---- SHOW / HIDE ADMIN PASSWORD ----
const toggleAdminPasswordBtn = document.getElementById('toggleAdminPassword');
if (toggleAdminPasswordBtn) {
  toggleAdminPasswordBtn.addEventListener('click', () => {
    const passwordInput = document.getElementById('adminPassword');
    const icon = toggleAdminPasswordBtn.querySelector('i');
    const isHidden = passwordInput.type === 'password';

    passwordInput.type = isHidden ? 'text' : 'password';
    icon.classList.toggle('bi-eye', !isHidden);
    icon.classList.toggle('bi-eye-slash', isHidden);
    toggleAdminPasswordBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
  });
}

// ---- IMAGE PREVIEW BEFORE UPLOAD ----
document.getElementById('imgFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const preview = document.getElementById('imgPreview');
  const placeholder = document.getElementById('imgPlaceholder');

  if (!file) {
    preview.style.display = 'none';
    preview.src = '';
    placeholder.style.display = 'block';
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    preview.src = event.target.result;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
  };
  reader.readAsDataURL(file);
});

// ---- HELPER: upload a new file (full-res + watermarked preview) and return URLs ----
async function uploadImageFile(file, category) {
  const watermarkedBlob = await createWatermarkedBlob(file, 'DEAPS');

  const fileExt = file.name.split('.').pop();
  const baseName = `${category}-${Date.now()}`;
  const fullResFileName = `fullres-${baseName}.${fileExt}`;
  const previewFileName = `preview-${baseName}.${fileExt}`;

  const { error: fullResError } = await supabaseClient
    .storage
    .from('catalog-images')
    .upload(fullResFileName, file);

  if (fullResError) throw fullResError;

  const { error: previewError } = await supabaseClient
    .storage
    .from('catalog-images')
    .upload(previewFileName, watermarkedBlob, { contentType: file.type });

  if (previewError) throw previewError;

  const { data: previewUrlData } = supabaseClient
    .storage
    .from('catalog-images')
    .getPublicUrl(previewFileName);

  const { data: fullResUrlData } = supabaseClient
    .storage
    .from('catalog-images')
    .getPublicUrl(fullResFileName);

  return {
    preview_url: previewUrlData.publicUrl,
    full_res_url: fullResUrlData.publicUrl
  };
}

// ---- RESET FORM BACK TO "ADD NEW" MODE ----
function resetToAddMode() {
  document.getElementById('imageForm').reset();
  document.getElementById('editingId').value = '';
  document.getElementById('imgPreview').style.display = 'none';
  document.getElementById('imgPreview').src = '';
  document.getElementById('imgPlaceholder').style.display = 'block';
  document.getElementById('imgFile').required = false;
  document.getElementById('imgChangeHint').style.display = 'none';
  document.getElementById('imgFeatured').checked = false;
  document.getElementById('formHeading').textContent = 'Tambah Gambar Katalog';
  document.getElementById('uploadBtn').textContent = 'Upload & Tambah';
  document.getElementById('duplicateBtn').style.display = 'none';
  document.getElementById('cancelEditBtn').style.display = 'none';
  window._editingOriginal = null;
}

// ---- LOAD AN EXISTING ITEM INTO THE FORM FOR EDITING ----
function editImage(imageId) {
  const record = window._imageData && window._imageData[imageId];
  if (!record) return;

  window._editingOriginal = record;

  document.getElementById('editingId').value = record.id;
  document.getElementById('imgTitle').value = record.title || '';
  document.getElementById('imgCategory').value = record.category || '';
  document.getElementById('imgDescription').value = record.description || '';
  document.getElementById('imgAdminPrompt').value = record.admin_prompt || '';
  document.getElementById('imgPrice').value = record.price || 0;
  document.getElementById('imgFeatured').checked = record.is_featured || false;

  loadSubcategoryDropdown().then(() => {
    document.getElementById('imgSubcategory').value = record.subcategory_id || '';
  });

  const preview = document.getElementById('imgPreview');
  const placeholder = document.getElementById('imgPlaceholder');
  preview.src = record.preview_url || '';
  preview.style.display = record.preview_url ? 'block' : 'none';
  placeholder.style.display = record.preview_url ? 'none' : 'block';

  document.getElementById('imgFile').value = '';
  document.getElementById('imgFile').required = false;
  document.getElementById('imgChangeHint').style.display = 'block';

  document.getElementById('formHeading').textContent = `Edit Gambar Katalog — ${record.style_code || ''}`;
  document.getElementById('uploadBtn').textContent = 'Save Changes';
  document.getElementById('duplicateBtn').style.display = 'inline-block';
  document.getElementById('cancelEditBtn').style.display = 'inline-block';

  document.getElementById('imageForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- CANCEL EDIT BUTTON ----
document.getElementById('cancelEditBtn').addEventListener('click', () => {
  resetToAddMode();
});

// ---- DUPLICATE BUTTON: creates a new catalog entry based on the item currently in the form ----
document.getElementById('duplicateBtn').addEventListener('click', async () => {
  const original = window._editingOriginal;
  if (!original) return;

  const title = document.getElementById('imgTitle').value;
  const category = document.getElementById('imgCategory').value;
  const description = document.getElementById('imgDescription').value;
  const adminPrompt = document.getElementById('imgAdminPrompt').value;
  const price = parseFloat(document.getElementById('imgPrice').value) || 0;
  const isFeatured = document.getElementById('imgFeatured').checked;
  const file = document.getElementById('imgFile').files[0];
  const errorBox = document.getElementById('imageFormError');
  const duplicateBtn = document.getElementById('duplicateBtn');

  errorBox.textContent = '';
  duplicateBtn.disabled = true;
  duplicateBtn.innerHTML = 'Duplicating...';

  try {
    const styleCode = await generateStyleCode(category);

    let imageUrls;
    if (file) {
      imageUrls = await uploadImageFile(file, category);
    } else {
      imageUrls = {
        preview_url: original.preview_url,
        full_res_url: original.full_res_url
      };
    }

    const catRow = allCategoriesCache.find(c => c.slug === category);
    const subcategoryId = document.getElementById('imgSubcategory').value || null;

    const { error: insertError } = await supabaseClient
      .from('images')
      .insert({
        title,
        category,
        category_id: catRow ? catRow.id : null,
        subcategory_id: subcategoryId,
        description,
        admin_prompt: adminPrompt,
        price,
        is_featured: isFeatured,
        style_code: styleCode,
        preview_url: imageUrls.preview_url,
        full_res_url: imageUrls.full_res_url,
        is_active: true
      });

    if (insertError) throw insertError;

    resetToAddMode();
    showToast(`Item berjaya diduplicate! Style Code baru: ${styleCode}`);
    loadCatalog();

  } catch (err) {
    errorBox.textContent = err.message;
    showToast('Gagal duplicate: ' + err.message, 'danger');
  } finally {
    duplicateBtn.disabled = false;
    duplicateBtn.innerHTML = '<i class="bi bi-files"></i> Duplicate';
  }
});

// ---- UPLOAD IMAGE + ADD TO CATALOG (or SAVE CHANGES when editing) ----
document.getElementById('imageForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const editingId = document.getElementById('editingId').value;
  const title = document.getElementById('imgTitle').value;
  const category = document.getElementById('imgCategory').value;
  const description = document.getElementById('imgDescription').value;
  const adminPrompt = document.getElementById('imgAdminPrompt').value;
  const price = parseFloat(document.getElementById('imgPrice').value) || 0;
  const isFeatured = document.getElementById('imgFeatured').checked;
  const file = document.getElementById('imgFile').files[0];
  const errorBox = document.getElementById('imageFormError');
  const uploadBtn = document.getElementById('uploadBtn');

  errorBox.textContent = '';

  if (!editingId && !file) {
    errorBox.textContent = 'Sila pilih gambar.';
    return;
  }

  uploadBtn.disabled = true;
  uploadBtn.textContent = editingId ? 'Saving...' : 'Uploading...';

  try {
    const catRow = allCategoriesCache.find(c => c.slug === category);
    const subcategoryId = document.getElementById('imgSubcategory').value || null;

    if (editingId) {
      // ---- SAVE CHANGES (EDIT MODE) ----
      const updatePayload = {
        title,
        category,
        category_id: catRow ? catRow.id : null,
        subcategory_id: subcategoryId,
        description,
        admin_prompt: adminPrompt,
        price,
        is_featured: isFeatured
      };

      if (file) {
        const imageUrls = await uploadImageFile(file, category);
        updatePayload.preview_url = imageUrls.preview_url;
        updatePayload.full_res_url = imageUrls.full_res_url;
      }

      const { error: updateError } = await supabaseClient
        .from('images')
        .update(updatePayload)
        .eq('id', editingId);

      if (updateError) throw updateError;

      showToast('Perubahan berjaya disimpan!');
      resetToAddMode();
      loadCatalog();

    } else {
      // ---- ADD NEW ITEM ----
      const styleCode = await generateStyleCode(category);
      const imageUrls = await uploadImageFile(file, category);

      const { error: insertError } = await supabaseClient
        .from('images')
        .insert({
          title,
          category,
          category_id: catRow ? catRow.id : null,
          subcategory_id: subcategoryId,
          description,
          admin_prompt: adminPrompt,
          price,
          is_featured: isFeatured,
          style_code: styleCode,
          preview_url: imageUrls.preview_url,
          full_res_url: imageUrls.full_res_url,
          is_active: true
        });

      if (insertError) throw insertError;

      resetToAddMode();
      showToast(`Berjaya ditambah! Style Code: ${styleCode}`);
      loadCatalog();
    }

  } catch (err) {
    errorBox.textContent = err.message;
    showToast('Gagal simpan: ' + err.message, 'danger');
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = editingId ? 'Save Changes' : 'Upload & Tambah';
  }
});

// ---- LOAD CATALOG LIST ----
async function loadCatalog() {
  const { data: images, error } = await supabaseClient
    .from('images')
    .select('*')
    .order('created_at', { ascending: false });

  const container = document.getElementById('catalogList');

  if (error) {
    container.innerHTML = `<p class="text-danger">${error.message}</p>`;
    return;
  }

  if (!images.length) {
    container.innerHTML = `<p class="text-secondary">Belum ada gambar dalam katalog.</p>`;
    return;
  }

  // Store full records + prompts keyed by id to avoid quote-escaping issues in onclick
  window._imagePrompts = {};
  window._imageData = {};
  images.forEach(img => {
    window._imagePrompts[img.id] = img.admin_prompt || '';
    window._imageData[img.id] = img;
  });

  container.innerHTML = images.map(img => `
    <div class="col-md-3 col-6">
      <div class="card bg-secondary bg-opacity-25 border-secondary h-100">
        <img src="${img.preview_url}" class="card-img-top" style="height:150px; object-fit:cover;">
        <div class="card-body">
          <h6 class="card-title text-warning mb-1">${img.style_code || ''} ${img.is_featured ? '<i class="bi bi-star-fill"></i>' : ''}</h6>
          <p class="small mb-1">${img.title}</p>
          <p class="small text-secondary mb-1">${img.category}</p>
          <p class="small mb-2">RM${img.price}</p>
          <button class="btn btn-sm btn-outline-light w-100 mb-2" onclick="editImage('${img.id}')">
            <i class="bi bi-pencil"></i> Edit
          </button>
          <button class="btn btn-sm btn-outline-warning w-100 mb-2" onclick="copyPrompt('${img.id}')">
            <i class="bi bi-clipboard"></i> Copy Prompt
          </button>
          <button class="btn btn-sm btn-outline-danger w-100" onclick="deleteImage('${img.id}')">Delete</button>
        </div>
      </div>
    </div>
  `).join('');
}

// ---- COPY PROMPT TO CLIPBOARD ----
async function copyPrompt(imageId) {
  const prompt = (window._imagePrompts && window._imagePrompts[imageId]) || '';

  if (!prompt) {
    alert('Tiada prompt untuk gambar ini.');
    return;
  }

  try {
    await navigator.clipboard.writeText(prompt);
    showToast('Prompt disalin ke clipboard!');
  } catch (err) {
    showToast('Gagal salin: ' + err.message, 'danger');
  }
}

// ---- DELETE IMAGE ----
async function deleteImage(imageId) {
  if (!confirm('Padam gambar ni?')) return;

  const { error } = await supabaseClient
    .from('images')
    .delete()
    .eq('id', imageId);

  if (error) {
    showToast('Error: ' + error.message, 'danger');
    return;
  }

  // If the item being deleted was open in the edit form, reset the form
  if (document.getElementById('editingId').value === imageId) {
    resetToAddMode();
  }

  showToast('Gambar berjaya dipadam!');
  loadCatalog();
}

// Run on page load
checkAdminAccess();