// assets/js/admin.js

let allCategoriesCache = [];

// ==================== SEARCHABLE COMBOBOX STATE ====================
const RECENT_CATEGORY_KEY = 'deaps_recent_categories';
const RECENT_SUBCATEGORY_KEY = 'deaps_recent_subcategories';
const RECENT_LIMIT = 5;
let categoryCombobox = null;
let subcategoryCombobox = null;

// ==================== UPLOAD VALIDATION CONFIG ====================
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB
const MIN_RESOLUTION = 800; // px, both width and height
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gagal membaca dimensi imej.'));
    };
    img.src = url;
  });
}

async function validateImageFile(file, existingKeysSet) {
  const errors = [];

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    errors.push(`Jenis fail tidak disokong (${file.type || 'unknown'}). Hanya JPG, PNG, WEBP dibenarkan.`);
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    errors.push(`Saiz fail terlalu besar (${formatBytes(file.size)}). Maksimum ${formatBytes(MAX_FILE_SIZE_BYTES)}.`);
  }

  const dupKey = `${file.name}__${file.size}`;
  if (existingKeysSet && existingKeysSet.has(dupKey)) {
    errors.push('Fail ini kelihatan seperti pendua (duplicate) dalam senarai.');
  }

  let dimensions = null;
  if (ALLOWED_MIME_TYPES.includes(file.type) && file.size <= MAX_FILE_SIZE_BYTES) {
    try {
      dimensions = await getImageDimensions(file);
      if (dimensions.width < MIN_RESOLUTION || dimensions.height < MIN_RESOLUTION) {
        errors.push(`Resolusi terlalu rendah (${dimensions.width}x${dimensions.height}px). Minimum ${MIN_RESOLUTION}x${MIN_RESOLUTION}px.`);
      }
    } catch (e) {
      errors.push('Gagal membaca resolusi imej.');
    }
  }

  return { valid: errors.length === 0, errors, dupKey, dimensions };
}

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
  populateFilterCategoryDropdown();
  populateBulkMoveCategoryDropdown();
  populateBulkMoveSubcategoryDropdown();

  if (categoryCombobox) categoryCombobox.refresh();
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
    if (subcategoryCombobox) subcategoryCombobox.refresh();
    return;
  }

  subSelect.innerHTML = `<option value="">— None —</option>` +
    data.map(sub => `<option value="${sub.id}" data-id="${sub.id}">${sub.name}</option>`).join('');
  wrap.style.display = 'block';

  if (subcategoryCombobox) subcategoryCombobox.refresh();
}

document.getElementById('imgCategory').addEventListener('change', () => {
  loadSubcategoryDropdown();
});

// ---- GENERATE STYLE CODE ----
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

// ---- SLUG GENERATION ----
function slugify(text) {
  return (text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

let slugManuallyEdited = false;
document.getElementById('imgSlug').addEventListener('input', () => { slugManuallyEdited = true; });
document.getElementById('imgTitle').addEventListener('input', () => {
  if (!slugManuallyEdited) {
    document.getElementById('imgSlug').value = slugify(document.getElementById('imgTitle').value);
  }
});

function parseTags(raw) {
  return (raw || '')
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);
}

function validatePublishReady(title, category, hasImage) {
  const missing = [];
  if (!title) missing.push('Title');
  if (!category) missing.push('Category');
  if (!hasImage) missing.push('Image');
  return missing;
}

// ---- AUTO SAVE / RECOVERY / UNSAVED CHANGES WARNING ----
const AUTOSAVE_KEY = 'deaps_admin_draft_v1';
let formIsDirty = false;
let autoSaveInterval = null;

function getFormSnapshot() {
  return {
    editingId: document.getElementById('editingId').value,
    title: document.getElementById('imgTitle').value,
    category: document.getElementById('imgCategory').value,
    subcategory: document.getElementById('imgSubcategory').value,
    description: document.getElementById('imgDescription').value,
    adminPrompt: document.getElementById('imgAdminPrompt').value,
    price: document.getElementById('imgPrice').value,
    isFeatured: document.getElementById('imgFeatured').checked,
    slug: document.getElementById('imgSlug').value,
    tags: document.getElementById('imgTags').value,
    status: document.getElementById('imgStatus').value,
    featuredPriority: document.getElementById('imgFeaturedPriority').value,
    displayOrder: document.getElementById('imgDisplayOrder').value,
    seoTitle: document.getElementById('imgSeoTitle').value,
    metaDescription: document.getElementById('imgMetaDescription').value,
    savedAt: Date.now()
  };
}

function applyFormSnapshot(snap) {
  document.getElementById('imgTitle').value = snap.title || '';
  document.getElementById('imgCategory').value = snap.category || '';
  document.getElementById('imgDescription').value = snap.description || '';
  document.getElementById('imgAdminPrompt').value = snap.adminPrompt || '';
  document.getElementById('imgPrice').value = snap.price || 0;
  document.getElementById('imgFeatured').checked = !!snap.isFeatured;
  document.getElementById('imgSlug').value = snap.slug || '';
  document.getElementById('imgTags').value = snap.tags || '';
  document.getElementById('imgStatus').value = snap.status || 'published';
  document.getElementById('imgFeaturedPriority').value = snap.featuredPriority || 0;
  document.getElementById('imgDisplayOrder').value = snap.displayOrder || 0;
  document.getElementById('imgSeoTitle').value = snap.seoTitle || '';
  document.getElementById('imgMetaDescription').value = snap.metaDescription || '';
  slugManuallyEdited = true;

  if (categoryCombobox) categoryCombobox.refresh();

  loadSubcategoryDropdown().then(() => {
    document.getElementById('imgSubcategory').value = snap.subcategory || '';
    if (subcategoryCombobox) subcategoryCombobox.refresh();
  });
}

function autoSaveDraft() {
  if (!formIsDirty) return;
  const snap = getFormSnapshot();
  localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snap));
  const statusEl = document.getElementById('autoSaveStatus');
  statusEl.style.display = 'block';
  statusEl.innerHTML = `<i class="bi bi-cloud-check"></i> Draft auto-saved at ${new Date().toLocaleTimeString()}`;
}

function clearAutoSaveDraft() {
  localStorage.removeItem(AUTOSAVE_KEY);
  formIsDirty = false;
  const statusEl = document.getElementById('autoSaveStatus');
  statusEl.style.display = 'none';
}

function markFormDirty() {
  formIsDirty = true;
}

function checkForRecoverableDraft() {
  const raw = localStorage.getItem(AUTOSAVE_KEY);
  if (!raw) return;
  try {
    const snap = JSON.parse(raw);
    if (!snap.title && !snap.description) return;
    const ageMinutes = Math.round((Date.now() - (snap.savedAt || 0)) / 60000);
    if (confirm(`Terdapat draft belum disimpan dari ${ageMinutes} minit lalu ("${snap.title || 'Tanpa tajuk'}"). Nak recover?`)) {
      applyFormSnapshot(snap);
      formIsDirty = true;
      showToast('Draft berjaya di-recover.');
    } else {
      clearAutoSaveDraft();
    }
  } catch (e) {
    localStorage.removeItem(AUTOSAVE_KEY);
  }
}

['imgTitle', 'imgCategory', 'imgSubcategory', 'imgDescription', 'imgAdminPrompt', 'imgPrice',
 'imgFeatured', 'imgSlug', 'imgTags', 'imgStatus', 'imgFeaturedPriority', 'imgDisplayOrder',
 'imgSeoTitle', 'imgMetaDescription'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', markFormDirty);
  if (el) el.addEventListener('change', markFormDirty);
});

window.addEventListener('beforeunload', (e) => {
  if (formIsDirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

autoSaveInterval = setInterval(autoSaveDraft, 15000);

// ---- GALLERY PREVIEW ----
function getPreviewUrl(record) {
  if (!record) return null;
  return `${window.location.origin}/gallery.html?category=${encodeURIComponent(record.category || '')}&style=${encodeURIComponent(record.style_code || record.id)}`;
}

document.getElementById('previewBtn').addEventListener('click', () => {
  const record = window._editingOriginal;
  const url = getPreviewUrl(record);
  if (!url) { showToast('Simpan item dahulu sebelum preview.', 'danger'); return; }
  window.open(url, '_blank');
});

document.getElementById('copyPreviewUrlBtn').addEventListener('click', async () => {
  const record = window._editingOriginal;
  const url = getPreviewUrl(record);
  if (!url) { showToast('Simpan item dahulu sebelum copy URL.', 'danger'); return; }
  try {
    await navigator.clipboard.writeText(url);
    showToast('Preview URL disalin ke clipboard!');
  } catch (err) {
    showToast('Gagal salin URL: ' + err.message, 'danger');
  }
});

// ---- WATERMARK ----
function createWatermarkedBlob(file, text) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => { img.src = e.target.result; };
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

  await loadCategoryDropdown();
  loadCatalog();
  loadDashboardSummary();
  checkForRecoverableDraft();

  if (!categoryCombobox) initCategoryComboboxes();
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

// ---- IMAGE EDITOR: rotate, crop, reset, download original ----
let imgEditState = {
  pristineDataUrl: null,
  originalDataUrl: null,
  rotation: 0,
  cropping: false,
  cropBox: null,
  editedBlob: null
};

function loadImageIntoEditor(dataUrl) {
  imgEditState.pristineDataUrl = dataUrl;
  imgEditState.originalDataUrl = dataUrl;
  imgEditState.rotation = 0;
  imgEditState.editedBlob = null;
  imgEditState.cropping = false;
  renderEditorCanvas();
}

function renderEditorCanvas() {
  if (!imgEditState.originalDataUrl) return;
  const img = new Image();
  img.onload = () => {
    const canvas = document.getElementById('imgCropCanvas');
    const preview = document.getElementById('imgPreview');
    const placeholder = document.getElementById('imgPlaceholder');
    const rot = imgEditState.rotation % 360;
    const swap = rot === 90 || rot === 270;
    canvas.width = swap ? img.height : img.width;
    canvas.height = swap ? img.width : img.height;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();

    preview.style.display = 'none';
    placeholder.style.display = 'none';
    canvas.style.display = 'block';

    canvas.toBlob((blob) => { imgEditState.editedBlob = blob; }, 'image/jpeg', 0.92);
  };
  img.src = imgEditState.originalDataUrl;
}

document.getElementById('rotateLeftBtn').addEventListener('click', () => {
  if (!imgEditState.originalDataUrl) return;
  imgEditState.rotation = (imgEditState.rotation - 90 + 360) % 360;
  renderEditorCanvas();
  markFormDirty();
});

document.getElementById('rotateRightBtn').addEventListener('click', () => {
  if (!imgEditState.originalDataUrl) return;
  imgEditState.rotation = (imgEditState.rotation + 90) % 360;
  renderEditorCanvas();
  markFormDirty();
});

document.getElementById('resetImageEditBtn').addEventListener('click', () => {
  if (!imgEditState.pristineDataUrl) return;
  imgEditState.originalDataUrl = imgEditState.pristineDataUrl;
  imgEditState.rotation = 0;
  imgEditState.cropping = false;
  cropRect = null;
  document.getElementById('applyCropBtn').style.display = 'none';
  document.getElementById('imgFileLabel').style.pointerEvents = 'auto';
  cropCanvas.style.pointerEvents = 'none';
  cropCanvas.style.cursor = 'default';
  renderEditorCanvas();
  showToast('Gambar dikembalikan ke asal.');
});

// ---- CROP MODE ----
let cropStart = null;
let cropRect = null;

const cropCanvas = document.getElementById('imgCropCanvas');

document.getElementById('cropToggleBtn').addEventListener('click', () => {
  if (!imgEditState.originalDataUrl) return;
  imgEditState.cropping = !imgEditState.cropping;
  document.getElementById('applyCropBtn').style.display = imgEditState.cropping ? 'inline-block' : 'none';
  document.getElementById('imgFileLabel').style.pointerEvents = imgEditState.cropping ? 'none' : 'auto';
  cropCanvas.style.pointerEvents = imgEditState.cropping ? 'auto' : 'none';
  cropCanvas.style.cursor = imgEditState.cropping ? 'crosshair' : 'default';
  cropRect = null;
});

cropCanvas.addEventListener('mousedown', (e) => {
  if (!imgEditState.cropping) return;
  e.preventDefault();
  const rect = cropCanvas.getBoundingClientRect();
  cropStart = {
    x: (e.clientX - rect.left) * (cropCanvas.width / rect.width),
    y: (e.clientY - rect.top) * (cropCanvas.height / rect.height)
  };
});

cropCanvas.addEventListener('mousemove', (e) => {
  if (!imgEditState.cropping || !cropStart) return;
  e.preventDefault();
  const rect = cropCanvas.getBoundingClientRect();
  const current = {
    x: (e.clientX - rect.left) * (cropCanvas.width / rect.width),
    y: (e.clientY - rect.top) * (cropCanvas.height / rect.height)
  };
  cropRect = {
    x: Math.min(cropStart.x, current.x),
    y: Math.min(cropStart.y, current.y),
    w: Math.abs(current.x - cropStart.x),
    h: Math.abs(current.y - cropStart.y)
  };
  redrawWithCropOverlay();
});

cropCanvas.addEventListener('mouseup', (e) => {
  if (imgEditState.cropping) e.preventDefault();
  cropStart = null;
});

cropCanvas.addEventListener('click', (e) => {
  if (imgEditState.cropping) {
    e.preventDefault();
    e.stopPropagation();
  }
});

function redrawWithCropOverlay() {
  renderEditorCanvasSync();
  if (!cropRect) return;
  const ctx = cropCanvas.getContext('2d');
  ctx.strokeStyle = '#ffc107';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
}

function renderEditorCanvasSync() {
  const img = new Image();
  img.onload = () => {
    const rot = imgEditState.rotation % 360;
    const swap = rot === 90 || rot === 270;
    cropCanvas.width = swap ? img.height : img.width;
    cropCanvas.height = swap ? img.width : img.height;
    const ctx = cropCanvas.getContext('2d');
    ctx.save();
    ctx.translate(cropCanvas.width / 2, cropCanvas.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
    if (cropRect) {
      ctx.strokeStyle = '#ffc107';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    }
  };
  img.src = imgEditState.originalDataUrl;
}

document.getElementById('applyCropBtn').addEventListener('click', () => {
  if (!cropRect || cropRect.w < 5 || cropRect.h < 5) {
    showToast('Sila lukis kawasan crop dahulu.', 'danger');
    return;
  }
  const source = document.createElement('canvas');
  source.width = cropCanvas.width;
  source.height = cropCanvas.height;
  const sctx = source.getContext('2d');
  sctx.drawImage(cropCanvas, 0, 0);

  const cropped = document.createElement('canvas');
  cropped.width = cropRect.w;
  cropped.height = cropRect.h;
  cropped.getContext('2d').drawImage(
    source, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, cropRect.w, cropRect.h
  );

  cropped.toBlob((blob) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      imgEditState.originalDataUrl = e.target.result;
      imgEditState.rotation = 0;
      imgEditState.cropping = false;
      cropRect = null;
      document.getElementById('applyCropBtn').style.display = 'none';
      document.getElementById('imgFileLabel').style.pointerEvents = 'auto';
      cropCanvas.style.pointerEvents = 'none';
      cropCanvas.style.cursor = 'default';
      renderEditorCanvas();
      markFormDirty();
      showToast('Crop berjaya digunakan. Klik Reset untuk kembali ke gambar asal.');
    };
    reader.readAsDataURL(blob);
  }, 'image/jpeg', 0.92);
});

async function getEditedImageFile(originalFile) {
  if (imgEditState.rotation === 0 && (!imgEditState.pristineDataUrl)) {
    return originalFile;
  }
  return new Promise((resolve) => {
    const canvas = document.getElementById('imgCropCanvas');
    canvas.toBlob((blob) => {
      const fileName = originalFile ? originalFile.name : `edited-${Date.now()}.jpg`;
      resolve(new File([blob], fileName, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  });
}

document.getElementById('downloadOriginalBtn').addEventListener('click', async () => {
  const record = window._editingOriginal;
  if (!record || !record.full_res_url) {
    showToast('Tiada gambar original untuk dimuat turun.', 'danger');
    return;
  }
  try {
    const response = await fetch(record.full_res_url);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${record.style_code || record.id}-original.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    showToast('Gagal muat turun: ' + err.message, 'danger');
  }
});

// ---- SINGLE UPLOAD CANCEL STATE ----
let singleUploadCancelled = false;

function showSingleUploadProgress(percent, label) {
  const wrap = document.getElementById('imgUploadProgressWrap');
  const bar = document.getElementById('imgUploadProgressBar');
  if (!wrap || !bar) return;
  wrap.style.display = 'block';
  bar.style.width = percent + '%';
  bar.textContent = label || (percent + '%');
}

function hideSingleUploadProgress() {
  const wrap = document.getElementById('imgUploadProgressWrap');
  if (wrap) wrap.style.display = 'none';
}

const cancelSingleUploadBtnEl = document.getElementById('cancelSingleUploadBtn');
if (cancelSingleUploadBtnEl) {
  cancelSingleUploadBtnEl.addEventListener('click', () => {
    singleUploadCancelled = true;
    showToast('Upload dibatalkan.', 'danger');
  });
}

// ---- IMAGE PREVIEW BEFORE UPLOAD (WITH VALIDATION) ----
document.getElementById('imgFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const preview = document.getElementById('imgPreview');
  const placeholder = document.getElementById('imgPlaceholder');
  const canvas = document.getElementById('imgCropCanvas');
  const validationMsg = document.getElementById('imgValidationMsg');

  validationMsg.style.display = 'none';
  validationMsg.innerHTML = '';

  if (!file) {
    preview.style.display = 'none';
    canvas.style.display = 'none';
    preview.src = '';
    placeholder.style.display = 'block';
    imgEditState.pristineDataUrl = null;
    imgEditState.originalDataUrl = null;
    return;
  }

  const result = await validateImageFile(file, null);

  if (!result.valid) {
    validationMsg.style.display = 'block';
    validationMsg.className = 'small mt-2 text-danger';
    validationMsg.innerHTML = result.errors.map(err => `<i class="bi bi-exclamation-triangle"></i> ${err}`).join('<br>');
    e.target.value = '';
    preview.style.display = 'none';
    canvas.style.display = 'none';
    placeholder.style.display = 'block';
    return;
  }

  validationMsg.style.display = 'block';
  validationMsg.className = 'small mt-2 text-success';
  validationMsg.innerHTML = `<i class="bi bi-check-circle"></i> Gambar sah (${result.dimensions.width}x${result.dimensions.height}px, ${formatBytes(file.size)})`;

  const reader = new FileReader();
  reader.onload = (event) => {
    loadImageIntoEditor(event.target.result);
    placeholder.style.display = 'none';
  };
  reader.readAsDataURL(file);
});

// ---- HELPER: upload a new file (full-res + watermarked preview) and return URLs ----
async function uploadImageFile(file, category, onProgress) {
  if (onProgress) onProgress(10, 'Membuat watermark...');
  const watermarkedBlob = await createWatermarkedBlob(file, 'DEAPS');

  if (singleUploadCancelled) throw new Error('CANCELLED');

  const fileExt = file.name.split('.').pop();
  const baseName = `${category}-${Date.now()}`;
  const fullResFileName = `fullres-${baseName}.${fileExt}`;
  const previewFileName = `preview-${baseName}.${fileExt}`;

  if (onProgress) onProgress(35, 'Upload gambar original...');
  const { error: fullResError } = await supabaseClient
    .storage
    .from('catalog-images')
    .upload(fullResFileName, file);

  if (fullResError) throw fullResError;
  if (singleUploadCancelled) throw new Error('CANCELLED');

  if (onProgress) onProgress(70, 'Upload gambar preview...');
  const { error: previewError } = await supabaseClient
    .storage
    .from('catalog-images')
    .upload(previewFileName, watermarkedBlob, { contentType: file.type });

  if (previewError) throw previewError;
  if (singleUploadCancelled) throw new Error('CANCELLED');

  if (onProgress) onProgress(90, 'Menyelesaikan...');

  const { data: previewUrlData } = supabaseClient
    .storage
    .from('catalog-images')
    .getPublicUrl(previewFileName);

  const { data: fullResUrlData } = supabaseClient
    .storage
    .from('catalog-images')
    .getPublicUrl(fullResFileName);

  if (onProgress) onProgress(100, 'Selesai!');

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
  document.getElementById('imgValidationMsg').style.display = 'none';
  document.getElementById('imgFeatured').checked = false;
  document.getElementById('imgSlug').value = '';
  document.getElementById('imgTags').value = '';
  document.getElementById('imgStatus').value = 'published';
  document.getElementById('imgFeaturedPriority').value = 0;
  document.getElementById('imgDisplayOrder').value = 0;
  document.getElementById('imgSeoTitle').value = '';
  document.getElementById('imgMetaDescription').value = '';
  document.getElementById('formHeading').textContent = 'Tambah Gambar Katalog';
  document.getElementById('uploadBtn').textContent = 'Upload & Tambah';
  document.getElementById('duplicateBtn').style.display = 'none';
  document.getElementById('previewBtn').style.display = 'none';
  document.getElementById('copyPreviewUrlBtn').style.display = 'none';
  document.getElementById('cancelEditBtn').style.display = 'none';
  document.getElementById('downloadOriginalBtn').style.display = 'none';
  document.getElementById('applyCropBtn').style.display = 'none';
  document.getElementById('imgCropCanvas').style.display = 'none';
  document.getElementById('imgFileLabel').style.pointerEvents = 'auto';
  cropCanvas.style.pointerEvents = 'none';
  cropCanvas.style.cursor = 'default';
  imgEditState = { pristineDataUrl: null, originalDataUrl: null, rotation: 0, cropping: false, cropBox: null, editedBlob: null };
  cropRect = null;
  slugManuallyEdited = false;
  singleUploadCancelled = false;
  hideSingleUploadProgress();
  window._editingOriginal = null;
  clearAutoSaveDraft();

  if (categoryCombobox) categoryCombobox.refresh();
  if (subcategoryCombobox) subcategoryCombobox.refresh();
}

// ---- LOAD AN EXISTING ITEM INTO THE FORM FOR EDITING ----
function editImage(imageId) {
  const record = window._imageData && window._imageData[imageId];
  if (!record) return;

  window._editingOriginal = record;
  slugManuallyEdited = true;

  document.getElementById('editingId').value = record.id;
  document.getElementById('imgTitle').value = record.title || '';
  document.getElementById('imgCategory').value = record.category || '';
  document.getElementById('imgDescription').value = record.description || '';
  document.getElementById('imgAdminPrompt').value = record.admin_prompt || '';
  document.getElementById('imgPrice').value = record.price || 0;
  document.getElementById('imgFeatured').checked = record.is_featured || false;
  document.getElementById('imgSlug').value = record.slug || '';
  document.getElementById('imgTags').value = (record.tags || []).join(', ');
  document.getElementById('imgStatus').value = record.status || 'published';
  document.getElementById('imgFeaturedPriority').value = record.featured_priority || 0;
  document.getElementById('imgDisplayOrder').value = record.display_order || 0;
  document.getElementById('imgSeoTitle').value = record.seo_title || '';
  document.getElementById('imgMetaDescription').value = record.meta_description || '';

  if (categoryCombobox) categoryCombobox.refresh();

  loadSubcategoryDropdown().then(() => {
    document.getElementById('imgSubcategory').value = record.subcategory_id || '';
    if (subcategoryCombobox) subcategoryCombobox.refresh();
  });

  const preview = document.getElementById('imgPreview');
  const placeholder = document.getElementById('imgPlaceholder');
  const canvas = document.getElementById('imgCropCanvas');
  canvas.style.display = 'none';
  preview.src = record.preview_url || '';
  preview.style.display = record.preview_url ? 'block' : 'none';
  placeholder.style.display = record.preview_url ? 'none' : 'block';
  imgEditState.pristineDataUrl = null;
  imgEditState.originalDataUrl = null;
  imgEditState.rotation = 0;
  document.getElementById('downloadOriginalBtn').style.display = record.full_res_url ? 'inline-block' : 'none';

  document.getElementById('imgFile').value = '';
  document.getElementById('imgFile').required = false;
  document.getElementById('imgChangeHint').style.display = 'block';
  document.getElementById('imgValidationMsg').style.display = 'none';

  document.getElementById('formHeading').textContent = `Edit Gambar Katalog — ${record.style_code || ''}`;
  document.getElementById('uploadBtn').textContent = 'Save Changes';
  document.getElementById('duplicateBtn').style.display = 'inline-block';
  document.getElementById('previewBtn').style.display = 'inline-block';
  document.getElementById('copyPreviewUrlBtn').style.display = 'inline-block';
  document.getElementById('cancelEditBtn').style.display = 'inline-block';

  document.getElementById('imageForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- CANCEL EDIT BUTTON ----
document.getElementById('cancelEditBtn').addEventListener('click', () => {
  if (formIsDirty && !confirm('Anda ada perubahan belum disimpan. Buang perubahan ini?')) return;
  resetToAddMode();
});

// ---- DUPLICATE BUTTON ----
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
  const slug = slugify(document.getElementById('imgSlug').value || title) + '-copy';
  const tags = parseTags(document.getElementById('imgTags').value);
  const featuredPriority = parseInt(document.getElementById('imgFeaturedPriority').value) || 0;
  const displayOrder = parseInt(document.getElementById('imgDisplayOrder').value) || 0;
  const seoTitle = document.getElementById('imgSeoTitle').value;
  const metaDescription = document.getElementById('imgMetaDescription').value;
  const errorBox = document.getElementById('imageFormError');
  const duplicateBtn = document.getElementById('duplicateBtn');

  errorBox.textContent = '';
  duplicateBtn.disabled = true;
  duplicateBtn.innerHTML = 'Duplicating...';

  try {
    const styleCode = await generateStyleCode(category);

    let imageUrls;
    if (file) {
      const finalFile = imgEditState.originalDataUrl ? await getEditedImageFile(file) : file;
      imageUrls = await uploadImageFile(finalFile, category);
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
        slug,
        tags,
        status: 'draft',
        featured_priority: featuredPriority,
        display_order: displayOrder,
        seo_title: seoTitle,
        meta_description: metaDescription,
        is_active: false
      });

    if (insertError) throw insertError;

    logAuditEvent('create', null, { title, style_code: styleCode, note: 'duplicated' });
    resetToAddMode();
    showToast(`Item berjaya diduplicate sebagai Draft! Style Code baru: ${styleCode}`);
    loadCatalog();
    loadDashboardSummary();

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
  const slug = slugify(document.getElementById('imgSlug').value || title);
  const tags = parseTags(document.getElementById('imgTags').value);
  const status = document.getElementById('imgStatus').value;
  const featuredPriority = parseInt(document.getElementById('imgFeaturedPriority').value) || 0;
  const displayOrder = parseInt(document.getElementById('imgDisplayOrder').value) || 0;
  const seoTitle = document.getElementById('imgSeoTitle').value;
  const metaDescription = document.getElementById('imgMetaDescription').value;
  const errorBox = document.getElementById('imageFormError');
  const uploadBtn = document.getElementById('uploadBtn');

  errorBox.textContent = '';
  singleUploadCancelled = false;

  if (!editingId && !file) {
    errorBox.textContent = 'Sila pilih gambar.';
    return;
  }

  const hasImage = editingId ? !!(window._editingOriginal && window._editingOriginal.preview_url) || !!file : !!file;
  if (status === 'published') {
    const missing = validatePublishReady(title, category, hasImage);
    if (missing.length) {
      errorBox.textContent = `Tidak boleh publish. Maklumat hilang: ${missing.join(', ')}.`;
      return;
    }
  }

  uploadBtn.disabled = true;
  uploadBtn.textContent = editingId ? 'Saving...' : 'Uploading...';
  if (file) showSingleUploadProgress(5, 'Bermula...');

  try {
    const catRow = allCategoriesCache.find(c => c.slug === category);
    const subcategoryId = document.getElementById('imgSubcategory').value || null;

    if (editingId) {
      const updatePayload = {
        title,
        category,
        category_id: catRow ? catRow.id : null,
        subcategory_id: subcategoryId,
        description,
        admin_prompt: adminPrompt,
        price,
        is_featured: isFeatured,
        slug,
        tags,
        status,
        featured_priority: featuredPriority,
        display_order: displayOrder,
        seo_title: seoTitle,
        meta_description: metaDescription,
        is_active: status !== 'archived'
      };

      if (file) {
        const finalFile = imgEditState.originalDataUrl ? await getEditedImageFile(file) : file;
        const imageUrls = await uploadImageFile(finalFile, category, showSingleUploadProgress);
        updatePayload.preview_url = imageUrls.preview_url;
        updatePayload.full_res_url = imageUrls.full_res_url;
      }

      const { error: updateError } = await supabaseClient
        .from('images')
        .update(updatePayload)
        .eq('id', editingId);

      if (updateError) throw updateError;

      logAuditEvent('update', window._editingOriginal, { status });
      showToast('Perubahan berjaya disimpan!');
      clearAutoSaveDraft();
      resetToAddMode();
      loadCatalog();
      loadDashboardSummary();

    } else {
      const styleCode = await generateStyleCode(category);
      const finalFile = imgEditState.originalDataUrl ? await getEditedImageFile(file) : file;
      const imageUrls = await uploadImageFile(finalFile, category, showSingleUploadProgress);

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
          slug,
          tags,
          status,
          featured_priority: featuredPriority,
          display_order: displayOrder,
          seo_title: seoTitle,
          meta_description: metaDescription,
          is_active: status !== 'archived'
        });

      if (insertError) throw insertError;

      logAuditEvent('create', null, { title, style_code: styleCode, status });
      resetToAddMode();
      showToast(`Berjaya ditambah! Style Code: ${styleCode}`);
      loadCatalog();
      loadDashboardSummary();
    }

  } catch (err) {
    if (err.message === 'CANCELLED') {
      showToast('Upload telah dibatalkan.', 'danger');
    } else {
      errorBox.textContent = err.message;
      showToast('Gagal simpan: ' + err.message, 'danger');
    }
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = editingId ? 'Save Changes' : 'Upload & Tambah';
    hideSingleUploadProgress();
  }
});

// ---- DASHBOARD SUMMARY CARDS ----
async function loadDashboardSummary() {
  const { count: totalCount } = await supabaseClient
    .from('images')
    .select('*', { count: 'exact', head: true });

  const { count: draftCount } = await supabaseClient
    .from('images')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'draft');

  const { count: publishedCount } = await supabaseClient
    .from('images')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published');

  const { count: featuredCount } = await supabaseClient
    .from('images')
    .select('*', { count: 'exact', head: true })
    .eq('is_featured', true);

  const { count: archivedCount } = await supabaseClient
    .from('images')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'archived');

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = (val ?? 0).toLocaleString();
  };

  setText('summaryTotal', totalCount);
  setText('summaryDraft', draftCount);
  setText('summaryPublished', publishedCount);
  setText('summaryFeatured', featuredCount);
  setText('summaryArchived', archivedCount);

  loadRecentActivity();
  refreshRecycleBinCount();
}

// ---- RECENT ACTIVITY ----
async function loadRecentActivity() {
  const container = document.getElementById('recentActivityList');
  if (!container) return;

  const { data, error } = await supabaseClient
    .from('images')
    .select('id, title, style_code, status, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(5);

  if (error || !data || !data.length) {
    container.innerHTML = '<p class="mb-0">Tiada aktiviti terkini.</p>';
    return;
  }

  const statusIcon = (status) => {
    if (status === 'published') return '<i class="bi bi-check-circle text-success"></i>';
    if (status === 'archived') return '<i class="bi bi-archive text-danger"></i>';
    return '<i class="bi bi-pencil-square text-light"></i>';
  };

  const formatTimeAgo = (dateStr) => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Baru sahaja';
    if (mins < 60) return `${mins} minit lalu`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} jam lalu`;
    const days = Math.floor(hrs / 24);
    return `${days} hari lalu`;
  };

  container.innerHTML = data.map(item => `
    <div class="d-flex justify-content-between align-items-center py-1 border-bottom border-secondary border-opacity-25">
      <span>${statusIcon(item.status)} ${item.title || 'Tanpa tajuk'} <span class="text-secondary">(${item.style_code || ''})</span></span>
      <span class="text-secondary">${formatTimeAgo(item.updated_at || item.created_at)}</span>
    </div>
  `).join('');
}

// ---- CATALOG PAGINATION / SEARCH / FILTER / SORT STATE ----
const CATALOG_PAGE_SIZE = 24;
let catalogState = {
  page: 0,
  searchTerm: '',
  filterStatus: '',
  filterCategory: '',
  filterFeatured: '',
  sortBy: 'created_desc',
  totalCount: 0,
  debounceTimer: null
};

// ---- BULK ACTIONS STATE ----
let bulkSelectedIds = new Set();
let bulkActionCancelled = false;
let bulkActionInProgress = false;
const BULK_CHUNK_SIZE = 10;

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function setBulkActionButtonsDisabled(disabled) {
  document.querySelectorAll('#bulkActionButtons button, #bulkActionButtons select').forEach(el => {
    el.disabled = disabled;
  });
  const selectAllBtn = document.getElementById('bulkSelectAllBtn');
  const clearBtn = document.getElementById('bulkClearBtn');
  if (selectAllBtn) selectAllBtn.disabled = disabled;
  if (clearBtn) clearBtn.disabled = disabled;
}

function showBulkActionProgress(percent, text) {
  const wrap = document.getElementById('bulkActionProgressWrap');
  const bar = document.getElementById('bulkActionProgressBar');
  const textEl = document.getElementById('bulkActionProgressText');
  if (!wrap) return;
  wrap.style.display = 'block';
  bar.style.width = percent + '%';
  bar.textContent = percent + '%';
  if (textEl) textEl.textContent = text || '';
}

function hideBulkActionProgress() {
  const wrap = document.getElementById('bulkActionProgressWrap');
  if (wrap) wrap.style.display = 'none';
}

const cancelBulkActionBtnEl = document.getElementById('cancelBulkActionBtn');
if (cancelBulkActionBtnEl) {
  cancelBulkActionBtnEl.addEventListener('click', () => {
    bulkActionCancelled = true;
    showToast('Membatalkan bulk action selepas chunk semasa selesai...', 'danger');
  });
}

async function runBulkOperation(ids, label, chunkHandler) {
  if (bulkActionInProgress) return { processed: 0, total: ids.length, cancelled: false };
  bulkActionInProgress = true;
  bulkActionCancelled = false;
  setBulkActionButtonsDisabled(true);

  const chunks = chunkArray(ids, BULK_CHUNK_SIZE);
  const total = ids.length;
  let processed = 0;
  let cancelledAt = null;

  showBulkActionProgress(0, `${label}: 0 / ${total}`);

  for (let i = 0; i < chunks.length; i++) {
    if (bulkActionCancelled) {
      cancelledAt = processed;
      break;
    }

    const chunk = chunks[i];
    try {
      await chunkHandler(chunk);
      processed += chunk.length;
    } catch (err) {
      showToast(`Ralat semasa proses chunk: ${err.message}`, 'danger');
      cancelledAt = processed;
      break;
    }

    const pct = Math.round((processed / total) * 100);
    showBulkActionProgress(pct, `${label}: ${processed} / ${total}`);
  }

  bulkActionInProgress = false;
  setBulkActionButtonsDisabled(false);

  if (cancelledAt !== null) {
    showToast(`Dibatalkan! ${processed} / ${total} item selesai diproses.`, 'danger');
  } else {
    showToast(`${label} selesai untuk ${total} item.`);
  }

  setTimeout(() => {
    hideBulkActionProgress();
  }, 2000);

  return { processed, total, cancelled: cancelledAt !== null };
}

// ---- CATALOG VIEW MODE (card / table) ----
const VIEW_MODE_KEY = 'deaps_catalog_view_mode';
let catalogViewMode = localStorage.getItem(VIEW_MODE_KEY) || 'card';

function applyViewMode() {
  const cardBtn = document.getElementById('cardViewBtn');
  const tableBtn = document.getElementById('tableViewBtn');
  const cardWrap = document.getElementById('catalogList');
  const tableWrap = document.getElementById('catalogTableWrap');

  if (!cardBtn || !tableBtn || !cardWrap || !tableWrap) return;
  if (recycleBinMode) return;

  if (catalogViewMode === 'table') {
    cardWrap.style.display = 'none';
    tableWrap.style.display = 'block';
    cardBtn.classList.remove('active');
    tableBtn.classList.add('active');
  } else {
    cardWrap.style.display = 'flex';
    tableWrap.style.display = 'none';
    cardBtn.classList.add('active');
    tableBtn.classList.remove('active');
  }
}

const cardViewBtnEl = document.getElementById('cardViewBtn');
if (cardViewBtnEl) {
  cardViewBtnEl.addEventListener('click', () => {
    catalogViewMode = 'card';
    localStorage.setItem(VIEW_MODE_KEY, 'card');
    applyViewMode();
  });
}

const tableViewBtnEl = document.getElementById('tableViewBtn');
if (tableViewBtnEl) {
  tableViewBtnEl.addEventListener('click', () => {
    catalogViewMode = 'table';
    localStorage.setItem(VIEW_MODE_KEY, 'table');
    applyViewMode();
  });
}

function updateBulkActionsBar() {
  const bar = document.getElementById('bulkActionsBar');
  const countEl = document.getElementById('bulkSelectedCount');
  if (!bar || !countEl) return;
  countEl.textContent = bulkSelectedIds.size;
  bar.style.display = (bulkSelectedIds.size > 0 && !recycleBinMode) ? 'flex' : 'none';

  const selectAllOnPage = document.getElementById('selectAllOnPageCheckbox');
  if (selectAllOnPage) {
    const pageCheckboxes = document.querySelectorAll('.catalogItemCheckbox');
    const allChecked = pageCheckboxes.length > 0 && Array.from(pageCheckboxes).every(cb => cb.checked);
    selectAllOnPage.checked = allChecked;
  }
}

function toggleItemSelection(id, checked) {
  if (checked) bulkSelectedIds.add(id);
  else bulkSelectedIds.delete(id);
  updateBulkActionsBar();
}

function populateFilterCategoryDropdown() {
  const sel = document.getElementById('filterCategory');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">Semua Kategori</option>` +
    allCategoriesCache.map(cat => `<option value="${cat.slug}">${cat.name}</option>`).join('');
  sel.value = current;
}

function populateBulkMoveCategoryDropdown() {
  const sel = document.getElementById('bulkMoveCategory');
  if (!sel) return;
  sel.innerHTML = `<option value="">Move to Category...</option>` +
    allCategoriesCache.map(cat => `<option value="${cat.slug}">${cat.name}</option>`).join('');
}

async function bulkUpdateStatus(newStatus) {
  if (bulkSelectedIds.size === 0) return;
  if (!confirm(`Tukar status ${bulkSelectedIds.size} item kepada "${newStatus}"?`)) return;

  const ids = Array.from(bulkSelectedIds);

  await runBulkOperation(ids, `Update ke ${newStatus}`, async (chunk) => {
    const { error } = await supabaseClient
      .from('images')
      .update({ status: newStatus, is_active: newStatus !== 'archived' })
      .in('id', chunk);
    if (error) throw error;
  });

  logAuditEvent('bulk_action', null, { action: `set_${newStatus}`, count: ids.length, ids });
  bulkSelectedIds.clear();
  updateBulkActionsBar();
  loadCatalog();
  loadDashboardSummary();
}

async function bulkDelete() {
  if (bulkSelectedIds.size === 0) return;
  if (!confirm(`Padam ${bulkSelectedIds.size} item secara kekal? Tindakan ini tidak boleh dibatalkan.`)) return;

  const ids = Array.from(bulkSelectedIds);

  await runBulkOperation(ids, 'Memadam', async (chunk) => {
    const { error } = await supabaseClient
      .from('images')
      .delete()
      .in('id', chunk);
    if (error) throw error;
  });

  logAuditEvent('bulk_action', null, { action: 'delete', count: ids.length, ids });
  bulkSelectedIds.clear();
  updateBulkActionsBar();
  loadCatalog();
  loadDashboardSummary();
}

async function bulkMoveCategory() {
  const newCategory = document.getElementById('bulkMoveCategory').value;
  if (!newCategory) {
    showToast('Sila pilih kategori destinasi.', 'danger');
    return;
  }
  if (bulkSelectedIds.size === 0) return;
  if (!confirm(`Pindah ${bulkSelectedIds.size} item ke kategori ini?`)) return;

  const catRow = allCategoriesCache.find(c => c.slug === newCategory);
  const ids = Array.from(bulkSelectedIds);

  await runBulkOperation(ids, 'Memindah kategori', async (chunk) => {
    const { error } = await supabaseClient
      .from('images')
      .update({ category: newCategory, category_id: catRow ? catRow.id : null, subcategory_id: null })
      .in('id', chunk);
    if (error) throw error;
  });

  logAuditEvent('bulk_action', null, { action: 'move_category', category: newCategory, count: ids.length, ids });
  bulkSelectedIds.clear();
  updateBulkActionsBar();
  document.getElementById('bulkMoveCategory').value = '';
  loadCatalog();
  loadDashboardSummary();
}

const bulkPublishBtnEl = document.getElementById('bulkPublishBtn');
if (bulkPublishBtnEl) bulkPublishBtnEl.addEventListener('click', () => bulkUpdateStatus('published'));

const bulkDraftBtnEl = document.getElementById('bulkDraftBtn');
if (bulkDraftBtnEl) bulkDraftBtnEl.addEventListener('click', () => bulkUpdateStatus('draft'));

const bulkArchiveBtnEl = document.getElementById('bulkArchiveBtn');
if (bulkArchiveBtnEl) bulkArchiveBtnEl.addEventListener('click', () => bulkUpdateStatus('archived'));

const bulkDeleteBtnEl = document.getElementById('bulkDeleteBtn');
if (bulkDeleteBtnEl) bulkDeleteBtnEl.addEventListener('click', bulkDelete);

const bulkMoveBtnEl = document.getElementById('bulkMoveBtn');
if (bulkMoveBtnEl) bulkMoveBtnEl.addEventListener('click', bulkMoveCategory);

const bulkClearBtnEl = document.getElementById('bulkClearBtn');
if (bulkClearBtnEl) bulkClearBtnEl.addEventListener('click', () => {
  bulkSelectedIds.clear();
  document.querySelectorAll('.catalogItemCheckbox').forEach(cb => cb.checked = false);
  updateBulkActionsBar();
});

const bulkSelectAllBtnEl = document.getElementById('bulkSelectAllBtn');
if (bulkSelectAllBtnEl) bulkSelectAllBtnEl.addEventListener('click', () => {
  document.querySelectorAll('.catalogItemCheckbox').forEach(cb => {
    cb.checked = true;
    bulkSelectedIds.add(cb.dataset.id);
  });
  updateBulkActionsBar();
});

const selectAllOnPageCheckboxEl = document.getElementById('selectAllOnPageCheckbox');
if (selectAllOnPageCheckboxEl) {
  selectAllOnPageCheckboxEl.addEventListener('change', (e) => {
    const checked = e.target.checked;
    document.querySelectorAll('.catalogItemCheckbox').forEach(cb => {
      cb.checked = checked;
      toggleItemSelection(cb.dataset.id, checked);
    });
  });
}

function getSortColumn() {
  switch (catalogState.sortBy) {
    case 'created_asc': return { column: 'created_at', ascending: true };
    case 'title_asc': return { column: 'title', ascending: true };
    case 'updated_desc': return { column: 'updated_at', ascending: false };
    case 'display_order_asc': return { column: 'display_order', ascending: true };
    default: return { column: 'created_at', ascending: false };
  }
}

// ---- LOAD CATALOG LIST ----
async function loadCatalog() {
  const container = document.getElementById('catalogList');
  container.innerHTML = `<div class="col-12 text-center text-secondary py-4"><i class="bi bi-hourglass-split"></i> Loading...</div>`;

  const { column, ascending } = getSortColumn();
  const from = catalogState.page * CATALOG_PAGE_SIZE;
  const to = from + CATALOG_PAGE_SIZE - 1;

  let query = supabaseClient
    .from('images')
    .select('*', { count: 'exact' })
    .order(column, { ascending })
    .range(from, to);

  if (catalogState.searchTerm) {
    const term = catalogState.searchTerm.replace(/[%,]/g, '');
    query = query.or(
      `title.ilike.%${term}%,slug.ilike.%${term}%,category.ilike.%${term}%`
    );
  }

  if (catalogState.filterStatus) {
    query = query.eq('status', catalogState.filterStatus);
  } else {
    query = query.neq('status', 'archived');
  }

  if (catalogState.filterCategory) {
    query = query.eq('category', catalogState.filterCategory);
  }

  if (catalogState.filterFeatured) {
    query = query.eq('is_featured', catalogState.filterFeatured === 'true');
  }

  const { data: images, error, count } = await query;

  if (error) {
    container.innerHTML = `<p class="text-danger">${error.message}</p>`;
    return;
  }

  catalogState.totalCount = count || 0;

  const resultCountEl = document.getElementById('catalogResultCount');
  if (resultCountEl) {
    const shown = images.length;
    const startNum = catalogState.totalCount === 0 ? 0 : from + 1;
    const endNum = from + shown;
    resultCountEl.textContent = `Menunjukkan ${startNum}-${endNum} daripada ${catalogState.totalCount} item`;
  }

  updatePaginationControls();

  const tableBody = document.getElementById('catalogTableBody');

  if (!images.length) {
    container.innerHTML = `<div class="col-12"><p class="text-secondary">Tiada gambar ditemui. Cuba ubah carian atau filter.</p></div>`;
    if (tableBody) tableBody.innerHTML = `<tr><td colspan="9" class="text-secondary">Tiada gambar ditemui.</td></tr>`;
    updateBulkActionsBar();
    applyViewMode();
    return;
  }

  window._imagePrompts = window._imagePrompts || {};
  window._imageData = window._imageData || {};
  images.forEach(img => {
    window._imagePrompts[img.id] = img.admin_prompt || '';
    window._imageData[img.id] = img;
  });

  const statusBadgeClass = (status) => {
    if (status === 'published') return 'text-bg-success';
    if (status === 'draft') return 'text-bg-secondary';
    if (status === 'archived') return 'text-bg-danger';
    return 'text-bg-secondary';
  };

  container.innerHTML = images.map(img => `
    <div class="col-md-3 col-6">
      <div class="card bg-secondary bg-opacity-25 border-secondary h-100">
        <div class="position-relative">
          <input type="checkbox" class="form-check-input catalogItemCheckbox position-absolute top-0 start-0 m-2" style="z-index:10; width:20px; height:20px;" data-id="${img.id}" ${bulkSelectedIds.has(img.id) ? 'checked' : ''}>
          <img src="${img.preview_url}" class="card-img-top" style="height:150px; object-fit:cover;" alt="${img.title || 'Catalog image'}" loading="lazy">
        </div>
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-1">
            <h6 class="card-title text-warning mb-0">${img.style_code || ''}</h6>
            <div>
              ${img.is_featured ? '<i class="bi bi-star-fill text-warning me-1"></i>' : ''}
              <span class="badge ${statusBadgeClass(img.status)}">${img.status || 'draft'}</span>
            </div>
          </div>
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

  if (tableBody) {
    tableBody.innerHTML = images.map(img => `
      <tr>
        <td><input type="checkbox" class="form-check-input catalogItemCheckbox" data-id="${img.id}" ${bulkSelectedIds.has(img.id) ? 'checked' : ''}></td>
        <td><img src="${img.preview_url}" style="width:60px; height:60px; object-fit:cover; border-radius:4px;" alt="${img.title || 'Catalog image'}" loading="lazy"></td>
        <td class="text-warning">${img.style_code || ''}</td>
        <td>${img.title}</td>
        <td>${img.category}</td>
        <td>RM${img.price}</td>
        <td><span class="badge ${statusBadgeClass(img.status)}">${img.status || 'draft'}</span></td>
        <td>${img.is_featured ? '<i class="bi bi-star-fill text-warning"></i>' : ''}</td>
        <td class="d-flex gap-1">
          <button class="btn btn-sm btn-outline-light" onclick="editImage('${img.id}')" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-warning" onclick="copyPrompt('${img.id}')" title="Copy Prompt"><i class="bi bi-clipboard"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteImage('${img.id}')" title="Delete"><i class="bi bi-trash"></i></button>
        </td>
      </tr>
    `).join('');
  }

  document.querySelectorAll('.catalogItemCheckbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      toggleItemSelection(e.target.dataset.id, e.target.checked);
    });
  });
  updateBulkActionsBar();
  applyViewMode();
}

function updatePaginationControls() {
  const totalPages = Math.max(1, Math.ceil(catalogState.totalCount / CATALOG_PAGE_SIZE));
  const pageIndicator = document.getElementById('pageIndicator');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');

  if (pageIndicator) pageIndicator.textContent = `Page ${catalogState.page + 1} / ${totalPages}`;
  if (prevBtn) prevBtn.disabled = catalogState.page <= 0;
  if (nextBtn) nextBtn.disabled = catalogState.page >= totalPages - 1;
}

const catalogSearchEl = document.getElementById('catalogSearch');
if (catalogSearchEl) {
  catalogSearchEl.addEventListener('input', (e) => {
    clearTimeout(catalogState.debounceTimer);
    catalogState.debounceTimer = setTimeout(() => {
      catalogState.searchTerm = e.target.value.trim();
      catalogState.page = 0;
      loadCatalog();
    }, 400);
  });
}

const filterStatusEl = document.getElementById('filterStatus');
if (filterStatusEl) {
  filterStatusEl.addEventListener('change', (e) => {
    catalogState.filterStatus = e.target.value;
    catalogState.page = 0;
    loadCatalog();
  });
}

const filterCategoryEl = document.getElementById('filterCategory');
if (filterCategoryEl) {
  filterCategoryEl.addEventListener('change', (e) => {
    catalogState.filterCategory = e.target.value;
    catalogState.page = 0;
    loadCatalog();
  });
}

const filterFeaturedEl = document.getElementById('filterFeatured');
if (filterFeaturedEl) {
  filterFeaturedEl.addEventListener('change', (e) => {
    catalogState.filterFeatured = e.target.value;
    catalogState.page = 0;
    loadCatalog();
  });
}

const sortByEl = document.getElementById('sortBy');
if (sortByEl) {
  sortByEl.addEventListener('change', (e) => {
    catalogState.sortBy = e.target.value;
    catalogState.page = 0;
    loadCatalog();
  });
}

const prevPageBtnEl = document.getElementById('prevPageBtn');
if (prevPageBtnEl) {
  prevPageBtnEl.addEventListener('click', () => {
    if (catalogState.page > 0) {
      catalogState.page -= 1;
      loadCatalog();
    }
  });
}

const nextPageBtnEl = document.getElementById('nextPageBtn');
if (nextPageBtnEl) {
  nextPageBtnEl.addEventListener('click', () => {
    const totalPages = Math.ceil(catalogState.totalCount / CATALOG_PAGE_SIZE);
    if (catalogState.page < totalPages - 1) {
      catalogState.page += 1;
      loadCatalog();
    }
  });
}

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

async function deleteImage(imageId) {
  if (!confirm('Padam gambar ni?')) return;

  const recordSnapshot = window._imageData ? window._imageData[imageId] : null;

  const { error } = await supabaseClient
    .from('images')
    .delete()
    .eq('id', imageId);

  if (error) {
    showToast('Error: ' + error.message, 'danger');
    return;
  }

  if (document.getElementById('editingId').value === imageId) {
    resetToAddMode();
  }

  logAuditEvent('delete', recordSnapshot);
  bulkSelectedIds.delete(imageId);
  showToast('Gambar berjaya dipadam!');
  loadCatalog();
  loadDashboardSummary();
}

// ---- RECYCLE BIN (archived items) ----
let recycleBinMode = false;

function switchToCatalogTab() {
  recycleBinMode = false;
  document.getElementById('catalogTabBtn').classList.add('active');
  document.getElementById('recycleBinTabBtn').classList.remove('active');
  document.getElementById('catalogControls').style.display = 'flex';
  document.getElementById('recycleBinView').style.display = 'none';
  applyViewMode();
  loadCatalog();
}

function switchToRecycleBinTab() {
  recycleBinMode = true;
  document.getElementById('recycleBinTabBtn').classList.add('active');
  document.getElementById('catalogTabBtn').classList.remove('active');
  document.getElementById('catalogControls').style.display = 'none';
  document.getElementById('bulkActionsBar').style.display = 'none';
  document.getElementById('catalogList').style.display = 'none';
  document.getElementById('catalogTableWrap').style.display = 'none';
  document.getElementById('recycleBinView').style.display = 'block';
  loadRecycleBin();
}

const catalogTabBtnEl = document.getElementById('catalogTabBtn');
if (catalogTabBtnEl) catalogTabBtnEl.addEventListener('click', switchToCatalogTab);

const recycleBinTabBtnEl = document.getElementById('recycleBinTabBtn');
if (recycleBinTabBtnEl) recycleBinTabBtnEl.addEventListener('click', switchToRecycleBinTab);

async function loadRecycleBin() {
  const container = document.getElementById('recycleBinList');
  container.innerHTML = `<div class="col-12 text-center text-secondary py-4"><i class="bi bi-hourglass-split"></i> Loading...</div>`;

  const { data, error, count } = await supabaseClient
    .from('images')
    .select('*', { count: 'exact' })
    .eq('status', 'archived')
    .order('updated_at', { ascending: false });

  const countBadge = document.getElementById('recycleBinCount');
  if (countBadge) countBadge.textContent = count || 0;

  if (error) {
    container.innerHTML = `<p class="text-danger">${error.message}</p>`;
    return;
  }

  if (!data || !data.length) {
    container.innerHTML = `<div class="col-12"><p class="text-secondary">Recycle Bin kosong.</p></div>`;
    return;
  }

  window._imageData = window._imageData || {};
  data.forEach(img => { window._imageData[img.id] = img; });

  container.innerHTML = data.map(img => `
    <div class="col-md-3 col-6">
      <div class="card bg-secondary bg-opacity-25 border-danger h-100">
        <img src="${img.preview_url}" class="card-img-top" style="height:150px; object-fit:cover; opacity:0.6;" alt="${img.title || 'Archived image'}" loading="lazy">
        <div class="card-body">
          <h6 class="card-title text-warning mb-1">${img.style_code || ''}</h6>
          <p class="small mb-1">${img.title}</p>
          <p class="small text-secondary mb-2">${img.category}</p>
          <button class="btn btn-sm btn-outline-success w-100 mb-2" onclick="restoreFromBin('${img.id}')">
            <i class="bi bi-arrow-counterclockwise"></i> Restore
          </button>
          <button class="btn btn-sm btn-outline-danger w-100" onclick="deletePermanent('${img.id}')">
            <i class="bi bi-trash3"></i> Delete Permanent
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

async function restoreFromBin(imageId) {
  if (!confirm('Restore item ini ke status Draft?')) return;

  const recordSnapshot = window._imageData ? window._imageData[imageId] : null;

  const { error } = await supabaseClient
    .from('images')
    .update({ status: 'draft', is_active: true })
    .eq('id', imageId);

  if (error) {
    showToast('Gagal restore: ' + error.message, 'danger');
    return;
  }

  logAuditEvent('restore', recordSnapshot);
  showToast('Item berjaya di-restore ke Draft!');
  loadRecycleBin();
  loadDashboardSummary();
}

async function deletePermanent(imageId) {
  if (!confirm('Padam item ini SECARA KEKAL? Tindakan ini tidak boleh dibatalkan dan gambar akan hilang selamanya.')) return;

  const recordSnapshot = window._imageData ? window._imageData[imageId] : null;

  const { error } = await supabaseClient
    .from('images')
    .delete()
    .eq('id', imageId);

  if (error) {
    showToast('Gagal padam: ' + error.message, 'danger');
    return;
  }

  logAuditEvent('delete_permanent', recordSnapshot);
  showToast('Item berjaya dipadam secara kekal.');
  loadRecycleBin();
  loadDashboardSummary();
}

async function refreshRecycleBinCount() {
  const { count } = await supabaseClient
    .from('images')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'archived');

  const countBadge = document.getElementById('recycleBinCount');
  if (countBadge) countBadge.textContent = count || 0;
}

// ---- AUDIT LOG ----
const AUDIT_PAGE_SIZE = 20;
let auditState = { page: 0, filterAction: '', searchTerm: '', debounceTimer: null };

async function logAuditEvent(action, record, details = {}) {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    await supabaseClient.from('audit_logs').insert({
      action,
      image_id: record ? record.id : null,
      image_title: record ? record.title : (details.title || null),
      style_code: record ? record.style_code : (details.style_code || null),
      admin_email: user ? user.email : 'unknown',
      details
    });
  } catch (err) {
    console.warn('Audit log gagal direkod:', err.message);
  }
}

function actionBadge(action) {
  const map = {
    create: 'text-bg-success',
    update: 'text-bg-info',
    publish: 'text-bg-success',
    archive: 'text-bg-warning',
    restore: 'text-bg-primary',
    delete: 'text-bg-danger',
    delete_permanent: 'text-bg-danger',
    bulk_action: 'text-bg-secondary'
  };
  return map[action] || 'text-bg-secondary';
}

function formatAuditTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('ms-MY', { dateStyle: 'medium', timeStyle: 'short' });
}

async function loadAuditLog(append = false) {
  const container = document.getElementById('auditLogList');
  if (!append) {
    auditState.page = 0;
    container.innerHTML = `<p class="text-secondary">Loading...</p>`;
  }

  const from = auditState.page * AUDIT_PAGE_SIZE;
  const to = from + AUDIT_PAGE_SIZE - 1;

  let query = supabaseClient
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (auditState.filterAction) {
    query = query.eq('action', auditState.filterAction);
  }

  if (auditState.searchTerm) {
    const term = auditState.searchTerm.replace(/[%,]/g, '');
    query = query.or(`image_title.ilike.%${term}%,style_code.ilike.%${term}%`);
  }

  const { data, error } = await query;

  if (error) {
    container.innerHTML = `<p class="text-danger">${error.message}</p>`;
    return;
  }

  if (!data || !data.length) {
    if (!append) container.innerHTML = `<p class="text-secondary">Tiada rekod audit ditemui.</p>`;
    document.getElementById('auditLoadMoreBtn').style.display = 'none';
    return;
  }

  const rowsHtml = data.map(log => `
    <div class="d-flex justify-content-between align-items-start py-2 border-bottom border-secondary border-opacity-25">
      <div>
        <span class="badge ${actionBadge(log.action)} me-2">${log.action}</span>
        <span>${log.image_title || 'Tanpa tajuk'}</span>
        ${log.style_code ? `<span class="text-secondary">(${log.style_code})</span>` : ''}
        <div class="text-secondary" style="font-size:0.75rem;">oleh ${log.admin_email || 'unknown'}</div>
      </div>
      <span class="text-secondary" style="font-size:0.75rem; white-space:nowrap;">${formatAuditTime(log.created_at)}</span>
    </div>
  `).join('');

  if (append) {
    container.insertAdjacentHTML('beforeend', rowsHtml);
  } else {
    container.innerHTML = rowsHtml;
  }

  document.getElementById('auditLoadMoreBtn').style.display = data.length < AUDIT_PAGE_SIZE ? 'none' : 'inline-block';
}

const openAuditLogBtnEl = document.getElementById('openAuditLogBtn');
if (openAuditLogBtnEl) {
  openAuditLogBtnEl.addEventListener('click', () => {
    const modal = new bootstrap.Modal(document.getElementById('auditLogModal'));
    modal.show();
    loadAuditLog();
  });
}

const auditFilterActionEl = document.getElementById('auditFilterAction');
if (auditFilterActionEl) {
  auditFilterActionEl.addEventListener('change', (e) => {
    auditState.filterAction = e.target.value;
    loadAuditLog();
  });
}

const auditSearchEl = document.getElementById('auditSearch');
if (auditSearchEl) {
  auditSearchEl.addEventListener('input', (e) => {
    clearTimeout(auditState.debounceTimer);
    auditState.debounceTimer = setTimeout(() => {
      auditState.searchTerm = e.target.value.trim();
      loadAuditLog();
    }, 400);
  });
}

const auditLoadMoreBtnEl = document.getElementById('auditLoadMoreBtn');
if (auditLoadMoreBtnEl) {
  auditLoadMoreBtnEl.addEventListener('click', () => {
    auditState.page += 1;
    loadAuditLog(true);
  });
}

// ---- DRAG & DROP MULTI-UPLOAD (WITH VALIDATION + CANCEL) ----
let bulkUploadFiles = [];
let bulkUploadCancelled = false;
let bulkUploadInProgress = false;

function populateBulkUploadCategoryDropdown() {
  const sel = document.getElementById('bulkUploadCategory');
  if (!sel) return;
  sel.innerHTML = `<option value="">— Pilih kategori —</option>` +
    allCategoriesCache.map(cat => `<option value="${cat.slug}">${cat.name}</option>`).join('');
}

function renderBulkFileList() {
  const wrap = document.getElementById('bulkFileListWrap');
  const list = document.getElementById('bulkFileList');
  const countEl = document.getElementById('bulkFileCount');
  const startBtn = document.getElementById('bulkStartUploadBtn');
  if (!wrap) return;

  if (!bulkUploadFiles.length) {
    wrap.style.display = 'none';
    startBtn.disabled = true;
    return;
  }

  wrap.style.display = 'block';
  countEl.textContent = bulkUploadFiles.length;
  startBtn.disabled = false;

  list.innerHTML = bulkUploadFiles.map((item, idx) => `
    <div class="col-md-3 col-6">
      <div class="card bg-secondary bg-opacity-25 border-secondary h-100">
        <img src="${item.previewDataUrl}" class="card-img-top" style="height:100px; object-fit:cover;" alt="${item.file.name}">
        <div class="card-body p-2">
          <input type="text" class="form-control form-control-sm mb-1 bulkTitleInput" data-idx="${idx}" placeholder="Title" value="${item.title}">
          <div class="d-flex justify-content-between align-items-center">
            <span class="small text-secondary" style="font-size:0.7rem;">${formatBytes(item.file.size)} · ${item.dimensions ? item.dimensions.width + 'x' + item.dimensions.height : '—'}</span>
            <button type="button" class="btn btn-sm btn-outline-danger bulkRemoveBtn" data-idx="${idx}" style="padding:0 6px;">
              <i class="bi bi-x"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.bulkTitleInput').forEach(input => {
    input.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      bulkUploadFiles[idx].title = e.target.value;
    });
  });

  document.querySelectorAll('.bulkRemoveBtn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.closest('.bulkRemoveBtn').dataset.idx);
      bulkUploadFiles.splice(idx, 1);
      renderBulkFileList();
    });
  });
}

function renderBulkValidationSummary(rejectedFiles) {
  const summaryEl = document.getElementById('bulkValidationSummary');
  if (!summaryEl) return;

  if (!rejectedFiles.length) {
    summaryEl.style.display = 'none';
    summaryEl.innerHTML = '';
    return;
  }

  summaryEl.style.display = 'block';
  summaryEl.className = 'small mb-3 text-danger';
  summaryEl.innerHTML = `<strong><i class="bi bi-exclamation-triangle"></i> ${rejectedFiles.length} fail ditolak:</strong><br>` +
    rejectedFiles.map(rf => `• ${rf.name}: ${rf.errors.join(' ')}`).join('<br>');
}

async function addFilesToBulkQueue(fileList) {
  const files = Array.from(fileList);
  const existingKeys = new Set(bulkUploadFiles.map(item => `${item.file.name}__${item.file.size}`));
  const rejectedFiles = [];
  const acceptedFiles = [];

  for (const file of files) {
    const result = await validateImageFile(file, existingKeys);
    if (!result.valid) {
      rejectedFiles.push({ name: file.name, errors: result.errors });
      continue;
    }
    existingKeys.add(result.dupKey);
    acceptedFiles.push({ file, dimensions: result.dimensions });
  }

  renderBulkValidationSummary(rejectedFiles);

  if (!acceptedFiles.length) {
    if (!rejectedFiles.length) showToast('Sila pilih fail imej yang sah.', 'danger');
    return;
  }

  let pending = acceptedFiles.length;

  acceptedFiles.forEach(({ file, dimensions }) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      bulkUploadFiles.push({
        file,
        previewDataUrl: e.target.result,
        title: file.name.replace(/\.[^/.]+$/, ''),
        dimensions
      });
      pending -= 1;
      if (pending === 0) renderBulkFileList();
    };
    reader.readAsDataURL(file);
  });

  if (rejectedFiles.length) {
    showToast(`${acceptedFiles.length} fail sah ditambah, ${rejectedFiles.length} fail ditolak.`, acceptedFiles.length ? 'success' : 'danger');
  }
}

const openBulkUploadBtnEl = document.getElementById('openBulkUploadBtn');
if (openBulkUploadBtnEl) {
  openBulkUploadBtnEl.addEventListener('click', () => {
    populateBulkUploadCategoryDropdown();
    const modal = new bootstrap.Modal(document.getElementById('bulkUploadModal'));
    modal.show();
  });
}

const bulkDropZoneEl = document.getElementById('bulkDropZone');
const bulkFileInputEl = document.getElementById('bulkFileInput');

if (bulkDropZoneEl) {
  bulkDropZoneEl.addEventListener('click', () => bulkFileInputEl.click());

  bulkDropZoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    bulkDropZoneEl.classList.add('border-warning');
    bulkDropZoneEl.classList.remove('text-secondary');
  });

  bulkDropZoneEl.addEventListener('dragleave', (e) => {
    e.preventDefault();
    bulkDropZoneEl.classList.remove('border-warning');
    bulkDropZoneEl.classList.add('text-secondary');
  });

  bulkDropZoneEl.addEventListener('drop', (e) => {
    e.preventDefault();
    bulkDropZoneEl.classList.remove('border-warning');
    bulkDropZoneEl.classList.add('text-secondary');
    if (e.dataTransfer.files.length) {
      addFilesToBulkQueue(e.dataTransfer.files);
    }
  });
}

if (bulkFileInputEl) {
  bulkFileInputEl.addEventListener('change', (e) => {
    if (e.target.files.length) {
      addFilesToBulkQueue(e.target.files);
      e.target.value = '';
    }
  });
}

const bulkClearFilesBtnEl = document.getElementById('bulkClearFilesBtn');
if (bulkClearFilesBtnEl) {
  bulkClearFilesBtnEl.addEventListener('click', () => {
    bulkUploadFiles = [];
    renderBulkFileList();
    renderBulkValidationSummary([]);
  });
}

const cancelBulkUploadBtnEl = document.getElementById('cancelBulkUploadBtn');
if (cancelBulkUploadBtnEl) {
  cancelBulkUploadBtnEl.addEventListener('click', () => {
    bulkUploadCancelled = true;
    showToast('Membatalkan bulk upload selepas fail semasa selesai...', 'danger');
  });
}

const bulkStartUploadBtnEl = document.getElementById('bulkStartUploadBtn');
if (bulkStartUploadBtnEl) {
  bulkStartUploadBtnEl.addEventListener('click', async () => {
    const category = document.getElementById('bulkUploadCategory').value;
    const status = document.getElementById('bulkUploadStatus').value;

    if (!category) {
      showToast('Sila pilih kategori dahulu.', 'danger');
      return;
    }

    if (!bulkUploadFiles.length) {
      showToast('Tiada fail untuk upload.', 'danger');
      return;
    }

    const catRow = allCategoriesCache.find(c => c.slug === category);
    const progressWrap = document.getElementById('bulkUploadProgress');
    const progressBar = document.getElementById('bulkProgressBar');
    const progressText = document.getElementById('bulkProgressText');

    progressWrap.style.display = 'block';
    bulkStartUploadBtnEl.disabled = true;
    document.getElementById('bulkClearFilesBtn').disabled = true;
    bulkUploadCancelled = false;
    bulkUploadInProgress = true;

    const total = bulkUploadFiles.length;
    let successCount = 0;
    let failCount = 0;
    let cancelledAt = null;

    for (let i = 0; i < total; i++) {
      if (bulkUploadCancelled) {
        cancelledAt = i;
        break;
      }

      const item = bulkUploadFiles[i];
      progressText.textContent = `Uploading ${i + 1} / ${total}: ${item.title}`;

      try {
        const styleCode = await generateStyleCode(category);
        const imageUrls = await uploadImageFile(item.file, category);

        const { error: insertError } = await supabaseClient
          .from('images')
          .insert({
            title: item.title || item.file.name,
            category,
            category_id: catRow ? catRow.id : null,
            subcategory_id: null,
            description: '',
            admin_prompt: '',
            price: 0,
            is_featured: false,
            style_code: styleCode,
            preview_url: imageUrls.preview_url,
            full_res_url: imageUrls.full_res_url,
            slug: slugify(item.title || item.file.name),
            tags: [],
            status,
            featured_priority: 0,
            display_order: 0,
            seo_title: '',
            meta_description: '',
            is_active: status !== 'archived'
          });

        if (insertError) throw insertError;

        logAuditEvent('create', null, { title: item.title, style_code: styleCode, note: 'bulk_upload' });
        successCount += 1;
      } catch (err) {
        console.error(`Gagal upload ${item.title}:`, err.message);
        failCount += 1;
      }

      const pct = Math.round(((i + 1) / total) * 100);
      progressBar.style.width = pct + '%';
      progressBar.textContent = pct + '%';
    }

    bulkUploadInProgress = false;

    if (cancelledAt !== null) {
      const remaining = total - cancelledAt;
      progressText.textContent = `Dibatalkan! ${successCount} berjaya, ${remaining} dilangkau.`;
      showToast(`Bulk upload dibatalkan: ${successCount} berjaya, ${remaining} tidak diupload.`, 'danger');
      bulkUploadFiles = bulkUploadFiles.slice(cancelledAt);
    } else {
      progressText.textContent = `Selesai! ${successCount} berjaya, ${failCount} gagal.`;
      showToast(`Bulk upload selesai: ${successCount} berjaya${failCount ? `, ${failCount} gagal` : ''}.`, failCount ? 'danger' : 'success');
      bulkUploadFiles = [];
    }

    renderBulkFileList();
    loadCatalog();
    loadDashboardSummary();

    setTimeout(() => {
      progressWrap.style.display = 'none';
      progressBar.style.width = '0%';
      progressBar.textContent = '0%';
      bulkStartUploadBtnEl.disabled = bulkUploadFiles.length === 0;
      document.getElementById('bulkClearFilesBtn').disabled = false;
    }, 2500);
  });
}

// ==================== SEARCHABLE COMBOBOX ENGINE ====================

function getRecentIds(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; }
}

function addRecentId(key, id) {
  let list = getRecentIds(key).filter(x => x !== id);
  list.unshift(id);
  list = list.slice(0, RECENT_LIMIT);
  localStorage.setItem(key, JSON.stringify(list));
}

function createSearchableCombobox(config) {
  const {
    inputEl, listboxEl, hiddenSelectEl, recentKey,
    getOptions, addBtnEl, onAddNew
  } = config;

  let activeIndex = -1;
  let currentOptions = [];

  function optionsFromSelect() {
    return Array.from(hiddenSelectEl.options)
      .filter(opt => opt.value !== '')
      .map(opt => ({
        value: opt.value,
        label: opt.textContent,
        id: opt.dataset.id || opt.value
      }));
  }

  function renderList(filterText) {
    const allOpts = getOptions ? getOptions() : optionsFromSelect();
    const term = (filterText || '').trim().toLowerCase();
    const recentIds = getRecentIds(recentKey);

    let filtered = term
      ? allOpts.filter(o => o.label.toLowerCase().includes(term))
      : allOpts;

    let html = '';

    if (!term && recentIds.length) {
      const recentOpts = recentIds
        .map(id => allOpts.find(o => o.id === id || o.value === id))
        .filter(Boolean);
      if (recentOpts.length) {
        html += `<li class="deaps-group-label">Recently Used</li>`;
        recentOpts.forEach(o => {
          html += `<li role="option" data-value="${o.value}" data-id="${o.id}">${o.label}</li>`;
        });
        html += `<li class="deaps-group-label">Semua</li>`;
      }
    }

    if (!filtered.length) {
      html += `<li class="deaps-empty">Tiada hasil ditemui.</li>`;
    } else {
      filtered.forEach(o => {
        html += `<li role="option" data-value="${o.value}" data-id="${o.id}">${o.label}</li>`;
      });
    }

    if (addBtnEl) {
      html += `<li class="deaps-add-new" data-action="add-new"><i class="bi bi-plus-lg"></i> Tambah baru${term ? `: "${term}"` : ''}</li>`;
    }

    listboxEl.innerHTML = html;
    currentOptions = Array.from(listboxEl.querySelectorAll('li[role="option"], li[data-action="add-new"]'));
    activeIndex = -1;
  }

  function openList() {
    renderList(inputEl.value);
    listboxEl.style.display = 'block';
    inputEl.setAttribute('aria-expanded', 'true');
  }

  function closeList() {
    listboxEl.style.display = 'none';
    inputEl.setAttribute('aria-expanded', 'false');
    activeIndex = -1;
  }

  function selectOption(li) {
    if (li.dataset.action === 'add-new') {
      closeList();
      if (onAddNew) onAddNew(inputEl.value.trim());
      return;
    }
    const value = li.dataset.value;
    const id = li.dataset.id;
    const label = li.textContent;

    hiddenSelectEl.value = value;
    hiddenSelectEl.dispatchEvent(new Event('change', { bubbles: true }));
    inputEl.value = label;
    addRecentId(recentKey, id);
    closeList();
    markFormDirty();
  }

  function setActive(idx) {
    currentOptions.forEach(li => li.classList.remove('active'));
    if (idx >= 0 && idx < currentOptions.length) {
      currentOptions[idx].classList.add('active');
      currentOptions[idx].scrollIntoView({ block: 'nearest' });
    }
    activeIndex = idx;
  }

  inputEl.addEventListener('focus', openList);
  inputEl.addEventListener('input', () => { renderList(inputEl.value); openList(); });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (listboxEl.style.display === 'none') { openList(); return; }
      setActive(Math.min(activeIndex + 1, currentOptions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && currentOptions[activeIndex]) {
        selectOption(currentOptions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      closeList();
    }
  });

  listboxEl.addEventListener('click', (e) => {
    const li = e.target.closest('li[role="option"], li[data-action="add-new"]');
    if (li) selectOption(li);
  });

  document.addEventListener('click', (e) => {
    if (!inputEl.closest('.deaps-combobox').contains(e.target)) {
      closeList();
    }
  });

  if (addBtnEl) {
    addBtnEl.addEventListener('click', () => onAddNew && onAddNew(''));
  }

  function refresh() {
    const selectedOpt = hiddenSelectEl.options[hiddenSelectEl.selectedIndex];
    inputEl.value = (selectedOpt && selectedOpt.value) ? selectedOpt.textContent : '';
  }

  function selectById(id) {
    const opt = Array.from(hiddenSelectEl.options).find(o => o.dataset.id === id || o.value === id);
    if (opt) {
      hiddenSelectEl.value = opt.value;
      hiddenSelectEl.dispatchEvent(new Event('change', { bubbles: true }));
      inputEl.value = opt.textContent;
      addRecentId(recentKey, opt.dataset.id || opt.value);
    }
  }

  return { refresh, selectById, closeList };
}

function initCategoryComboboxes() {
  categoryCombobox = createSearchableCombobox({
    inputEl: document.getElementById('imgCategoryInput'),
    listboxEl: document.getElementById('imgCategoryListbox'),
    hiddenSelectEl: document.getElementById('imgCategory'),
    recentKey: RECENT_CATEGORY_KEY,
    addBtnEl: document.getElementById('addCategoryBtn'),
    onAddNew: (prefillName) => openQuickAddDrawer('category', null, prefillName)
  });

  subcategoryCombobox = createSearchableCombobox({
    inputEl: document.getElementById('imgSubcategoryInput'),
    listboxEl: document.getElementById('imgSubcategoryListbox'),
    hiddenSelectEl: document.getElementById('imgSubcategory'),
    recentKey: RECENT_SUBCATEGORY_KEY,
    addBtnEl: document.getElementById('addSubcategoryBtn'),
    onAddNew: (prefillName) => {
      const catSelect = document.getElementById('imgCategory');
      const catOpt = catSelect.options[catSelect.selectedIndex];
      const categoryId = catOpt ? catOpt.dataset.id : null;
      if (!categoryId) {
        showToast('Sila pilih kategori utama dahulu.', 'danger');
        return;
      }
      openQuickAddDrawer('subcategory', categoryId, prefillName);
    }
  });

  categoryCombobox.refresh();
  subcategoryCombobox.refresh();
}

// ---- QUICK ADD DRAWER (Category / Subcategory) ----
function openQuickAddDrawer(type, parentCategoryId, prefillName) {
  document.getElementById('quickAddType').value = type;
  document.getElementById('quickAddParentCategoryId').value = parentCategoryId || '';
  document.getElementById('quickAddName').value = prefillName || '';
  document.getElementById('quickAddError').textContent = '';
  document.getElementById('quickAddPrefixWrap').style.display = type === 'category' ? 'block' : 'none';

  const label = document.getElementById('quickAddDrawerLabel');
  label.innerHTML = type === 'category'
    ? '<i class="bi bi-tags"></i> Tambah Kategori Baru'
    : '<i class="bi bi-tags"></i> Tambah Subkategori Baru';

  const drawer = new bootstrap.Offcanvas(document.getElementById('quickAddDrawer'));
  drawer.show();
  setTimeout(() => document.getElementById('quickAddName').focus(), 300);
}

document.getElementById('quickAddForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const type = document.getElementById('quickAddType').value;
  const parentCategoryId = document.getElementById('quickAddParentCategoryId').value;
  const name = document.getElementById('quickAddName').value.trim();
  const prefix = document.getElementById('quickAddPrefix').value.trim().toUpperCase();
  const displayOrder = parseInt(document.getElementById('quickAddDisplayOrder').value) || 0;
  const errorBox = document.getElementById('quickAddError');
  const submitBtn = document.getElementById('quickAddSubmitBtn');

  errorBox.textContent = '';

  if (!name) {
    errorBox.textContent = 'Nama diperlukan.';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = 'Menyimpan...';

  try {
    const slug = slugify(name);

    if (type === 'category') {
      const { data, error } = await supabaseClient
        .from('categories')
        .insert({ name, slug, code_prefix: prefix || null, display_order: displayOrder, is_active: true })
        .select()
        .single();

      if (error) throw error;

      await loadCategoryDropdown();
      categoryCombobox.selectById(data.id);
      showToast(`Kategori "${name}" berjaya ditambah!`);

    } else {
      if (!parentCategoryId) throw new Error('Kategori utama tidak sah.');

      const { data, error } = await supabaseClient
        .from('subcategories')
        .insert({ name, category_id: parentCategoryId, display_order: displayOrder, is_active: true })
        .select()
        .single();

      if (error) throw error;

      await loadSubcategoryDropdown();
      subcategoryCombobox.selectById(data.id);
      showToast(`Subkategori "${name}" berjaya ditambah!`);
    }

    markFormDirty();
    bootstrap.Offcanvas.getInstance(document.getElementById('quickAddDrawer')).hide();
    document.getElementById('quickAddForm').reset();

  } catch (err) {
    errorBox.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="bi bi-check-lg"></i> Simpan & Guna';
  }
});

// ---- SUPPORT DEEP LINK FROM GALLERY MANAGEMENT (?editId=...&duplicate=1) ----
async function handleDeepLinkEdit() {
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('editId');
  if (!editId) return;

  const { data: record, error } = await supabaseClient
    .from('images')
    .select('*')
    .eq('id', editId)
    .single();

  if (error || !record) return;

  window._imageData =  window._imageData = window._imageData || {};
  window._imageData[record.id] = record;

  editImage(record.id);

  if (params.get('duplicate') === '1') {
    document.getElementById('editingId').value = '';
    document.getElementById('formHeading').textContent = 'Tambah Gambar Katalog (Duplicate)';
    document.getElementById('uploadBtn').textContent = 'Upload & Tambah';
    document.getElementById('duplicateBtn').style.display = 'none';
    document.getElementById('cancelEditBtn').style.display = 'inline-block';
    document.getElementById('imgSlug').value = slugify(record.title || '') + '-copy';
    document.getElementById('imgFile').required = true;
    document.getElementById('imgChangeHint').style.display = 'none';
    document.getElementById('downloadOriginalBtn').style.display = 'none';
  }
}

// ---- INITIALIZE APP ----
checkAdminAccess().then(() => {
  handleDeepLinkEdit();
});// ==================== BULK UNPUBLISH & BULK MOVE SUBCATEGORY ====================

// ---- BULK UNPUBLISH (published -> draft, label tersendiri berbeza dari Set Draft) ----
async function bulkUnpublish() {
  if (bulkSelectedIds.size === 0) return;

  const ids = Array.from(bulkSelectedIds);
  const publishedIds = ids.filter(id => {
    const record = window._imageData && window._imageData[id];
    return record && record.status === 'published';
  });

  if (publishedIds.length === 0) {
    showToast('Tiada item Published dalam pilihan anda.', 'danger');
    return;
  }

  const skippedCount = ids.length - publishedIds.length;
  const confirmMsg = skippedCount > 0
    ? `Unpublish ${publishedIds.length} item Published? (${skippedCount} item lain akan dilangkau kerana bukan Published)`
    : `Unpublish ${publishedIds.length} item?`;

  if (!confirm(confirmMsg)) return;

  await runBulkOperation(publishedIds, 'Unpublish', async (chunk) => {
    const { error } = await supabaseClient
      .from('images')
      .update({ status: 'draft' })
      .in('id', chunk);
    if (error) throw error;
  });

  logAuditEvent('bulk_action', null, { action: 'unpublish', count: publishedIds.length, ids: publishedIds });
  bulkSelectedIds.clear();
  updateBulkActionsBar();
  loadCatalog();
  loadDashboardSummary();
}

const bulkUnpublishBtnEl = document.getElementById('bulkUnpublishBtn');
if (bulkUnpublishBtnEl) bulkUnpublishBtnEl.addEventListener('click', bulkUnpublish);

// ---- POPULATE BULK MOVE SUBCATEGORY DROPDOWN (dikumpul mengikut kategori) ----
let allSubcategoriesCache = [];

async function populateBulkMoveSubcategoryDropdown() {
  const sel = document.getElementById('bulkMoveSubcategory');
  if (!sel) return;

  const { data, error } = await supabaseClient
    .from('subcategories')
    .select('*, categories(name, slug)')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error || !data) {
    sel.innerHTML = `<option value="">Move to Subcategory...</option>`;
    return;
  }

  allSubcategoriesCache = data;

  const groupedByCategory = {};
  data.forEach(sub => {
    const catName = sub.categories ? sub.categories.name : 'Lain-lain';
    if (!groupedByCategory[catName]) groupedByCategory[catName] = [];
    groupedByCategory[catName].push(sub);
  });

  sel.innerHTML = `<option value="">Move to Subcategory...</option>` +
    Object.keys(groupedByCategory).map(catName => `
      <optgroup label="${catName}">
        ${groupedByCategory[catName].map(sub => `<option value="${sub.id}">${sub.name}</option>`).join('')}
      </optgroup>
    `).join('');
}

// ---- BULK MOVE SUBCATEGORY (menyelaraskan kategori utama secara automatik) ----
async function bulkMoveSubcategory() {
  const subcategoryId = document.getElementById('bulkMoveSubcategory').value;
  if (!subcategoryId) {
    showToast('Sila pilih subkategori destinasi.', 'danger');
    return;
  }
  if (bulkSelectedIds.size === 0) return;

  const subRow = allSubcategoriesCache.find(s => s.id === subcategoryId);
  if (!subRow) {
    showToast('Subkategori tidak ditemui.', 'danger');
    return;
  }

  const parentCatRow = allCategoriesCache.find(c => c.id === subRow.category_id);
  const parentCatSlug = parentCatRow ? parentCatRow.slug : null;

  if (!confirm(`Pindah ${bulkSelectedIds.size} item ke subkategori "${subRow.name}"? Kategori utama akan diselaraskan secara automatik.`)) return;

  const ids = Array.from(bulkSelectedIds);
  await runBulkOperation(ids, 'Memindah subkategori', async (chunk) => {
    const updatePayload = { subcategory_id: subcategoryId };
    if (parentCatSlug) {
      updatePayload.category = parentCatSlug;
      updatePayload.category_id = subRow.category_id;
    }
    const { error } = await supabaseClient
      .from('images')
      .update(updatePayload)
      .in('id', chunk);
    if (error) throw error;
  });

  logAuditEvent('bulk_action', null, { action: 'move_subcategory', subcategory: subRow.name, count: ids.length, ids });
  bulkSelectedIds.clear();
  updateBulkActionsBar();
  document.getElementById('bulkMoveSubcategory').value = '';
  loadCatalog();
  loadDashboardSummary();
}

const bulkMoveSubcategoryBtnEl = document.getElementById('bulkMoveSubcategoryBtn');
if (bulkMoveSubcategoryBtnEl) bulkMoveSubcategoryBtnEl.addEventListener('click', bulkMoveSubcategory);

populateBulkMoveSubcategoryDropdown();