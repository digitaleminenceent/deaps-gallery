// assets/js/category-management.js

let allCategories = [];
let allSubcategoriesFlat = []; // cache of all subcategories across categories, for counts
let categoryModal, subcategoryModal, iconPickerModal;
let selectedCategoryIds = new Set();
let iconPickerTargetInput = null;
let iconPickerTargetPreview = null;
let currentUser = null;

const ICON_LIBRARY = [
  'bi-camera','bi-camera-fill','bi-camera2','bi-person','bi-person-fill','bi-person-dress',
  'bi-people','bi-people-fill','bi-heart','bi-heart-fill','bi-star','bi-star-fill','bi-stars',
  'bi-bag','bi-bag-fill','bi-basket','bi-basket-fill','bi-gem','bi-gift','bi-gift-fill',
  'bi-trophy','bi-trophy-fill','bi-airplane','bi-airplane-fill','bi-globe','bi-globe2',
  'bi-magic','bi-stars','bi-moon','bi-moon-stars','bi-sun','bi-sun-fill','bi-box','bi-box-seam',
  'bi-car-front','bi-car-front-fill','bi-truck','bi-bicycle','bi-cup-hot','bi-cup-hot-fill',
  'bi-egg-fried','bi-house','bi-house-fill','bi-house-door','bi-building','bi-shop',
  'bi-megaphone','bi-megaphone-fill','bi-broadcast','bi-tag','bi-tag-fill','bi-tags',
  'bi-tags-fill','bi-brush','bi-palette','bi-palette-fill','bi-image','bi-image-fill',
  'bi-images','bi-film','bi-flower1','bi-flower2','bi-flower3','bi-tree','bi-umbrella',
  'bi-water','bi-cloud-sun','bi-lightning','bi-lightning-fill','bi-fire','bi-snow',
  'bi-emoji-smile','bi-emoji-heart-eyes','bi-mask','bi-hand-thumbs-up','bi-award','bi-award-fill',
  'bi-diamond','bi-diamond-fill','bi-crown','bi-brightness-high','bi-flag','bi-flag-fill',
  'bi-compass','bi-map','bi-pin-map','bi-geo-alt','bi-shield','bi-shield-check','bi-briefcase',
  'bi-mortarboard','bi-book','bi-music-note','bi-music-note-beamed','bi-controller',
  'bi-dribbble','bi-bicycle','bi-basket2','bi-cart','bi-cart-fill','bi-wallet2',
  'bi-cash-coin','bi-credit-card','bi-gem','bi-scissors','bi-brush','bi-paint-bucket',
  'bi-droplet','bi-droplet-fill','bi-feather','bi-balloon','bi-balloon-fill','bi-cake',
  'bi-cake2','bi-heart-pulse','bi-activity','bi-bullseye','bi-target','bi-rocket',
  'bi-rocket-fill','bi-lightbulb','bi-lightbulb-fill','bi-key','bi-key-fill'
];

// ---- TOAST ----
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const icon = type === 'success' ? 'bi-check-circle-fill' : (type === 'danger' ? 'bi-exclamation-triangle-fill' : 'bi-info-circle-fill');
  const bg = type === 'success' ? 'text-bg-success' : (type === 'danger' ? 'text-bg-danger' : 'text-bg-secondary');

  const toastEl = document.createElement('div');
  toastEl.className = `toast align-items-center ${bg} border-0`;
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body"><i class="bi ${icon} me-2"></i>${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;
  container.appendChild(toastEl);
  const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
  toast.show();
  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ---- AUDIT LOG ----
async function logAudit(action, entityType, entityId, entityName) {
  try {
    await supabaseClient.from('audit_log').insert({
      admin_id: currentUser ? currentUser.id : null,
      admin_email: currentUser ? currentUser.email : null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName
    });
  } catch (e) {
    console.warn('Audit log failed', e);
  }
}

// ---- ICON PICKER ----
function openIconPicker(targetInputId, targetPreviewId) {
  iconPickerTargetInput = targetInputId;
  iconPickerTargetPreview = targetPreviewId;
  document.getElementById('iconSearchInput').value = '';
  renderIconGrid(ICON_LIBRARY);
  iconPickerModal.show();
}

function renderIconGrid(icons) {
  const grid = document.getElementById('iconGrid');
  grid.innerHTML = icons.map(icon => `
    <button type="button" class="btn btn-outline-secondary" style="width:52px; height:52px; font-size:1.2rem;" onclick="selectIcon('${icon}')" title="${icon}">
      <i class="bi ${icon}"></i>
    </button>
  `).join('');
}

document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'iconSearchInput') {
    const keyword = e.target.value.toLowerCase();
    const filtered = ICON_LIBRARY.filter(i => i.toLowerCase().includes(keyword));
    renderIconGrid(filtered);
  }
});

function selectIcon(icon) {
  document.getElementById(iconPickerTargetInput).value = icon;
  document.getElementById(iconPickerTargetPreview).innerHTML = `<i class="bi ${icon}"></i>`;
  iconPickerModal.hide();
}

// ---- ACCESS CHECK ----
async function checkAccess() {
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!user) {
    window.location.href = 'admin.html';
    return false;
  }

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    document.getElementById('notAdmin').style.display = 'block';
    document.getElementById('catManagerContent').style.display = 'none';
    return false;
  }

  currentUser = user;

  document.getElementById('authArea').innerHTML = `
    <span class="text-white small me-2">${user.email}</span>
    <button class="btn btn-outline-light btn-sm" id="logoutBtn">Logout</button>
  `;
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'admin.html';
  });

  document.getElementById('catManagerContent').style.display = 'block';
  return true;
}

// ================================
// LOAD & RENDER CATEGORIES
// ================================

async function loadCategories() {
  document.getElementById('loadingIndicator').style.display = 'block';

  const { data, error } = await supabaseClient
    .from('categories')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) {
    document.getElementById('loadingIndicator').style.display = 'none';
    showToast(error.message, 'danger');
    return;
  }

  const { data: subData } = await supabaseClient
    .from('subcategories')
    .select('*')
    .order('display_order', { ascending: true });

  allSubcategoriesFlat = subData || [];

  // Get all image category_id/subcategory_id in ONE query, count client-side
  const { data: imageRefs } = await supabaseClient
    .from('images')
    .select('category_id, subcategory_id');

  const categoryCountMap = {};
  const subcategoryCountMap = {};
  (imageRefs || []).forEach(row => {
    if (row.category_id) categoryCountMap[row.category_id] = (categoryCountMap[row.category_id] || 0) + 1;
    if (row.subcategory_id) subcategoryCountMap[row.subcategory_id] = (subcategoryCountMap[row.subcategory_id] || 0) + 1;
  });

  data.forEach(cat => {
    cat._itemCount = categoryCountMap[cat.id] || 0;
    cat._subcats = allSubcategoriesFlat.filter(s => s.category_id === cat.id);
  });

  allSubcategoriesFlat.forEach(sub => {
    sub._itemCount = subcategoryCountMap[sub.id] || 0;
  });

  document.getElementById('loadingIndicator').style.display = 'none';
  allCategories = data;
  renderCategories();
}

function getFilteredSortedCategories() {
  const search = document.getElementById('catSearch').value.toLowerCase();
  const statusFilter = document.getElementById('catFilter').value;
  const homeFilter = document.getElementById('catHomeFilter').value;
  const subFilter = document.getElementById('catSubFilter').value;
  const sortBy = document.getElementById('catSort').value;
  const recentOnly = document.getElementById('catRecentFilter').checked;

  let list = allCategories.filter(c =>
    c.name.toLowerCase().includes(search) ||
    (c.description || '').toLowerCase().includes(search)
  );

  if (statusFilter === 'active') list = list.filter(c => c.is_active && !c.is_archived);
  if (statusFilter === 'inactive') list = list.filter(c => !c.is_active && !c.is_archived);
  if (statusFilter === 'archived') list = list.filter(c => c.is_archived);
  if (statusFilter !== 'archived') list = list.filter(c => !c.is_archived || statusFilter === 'archived');

  if (homeFilter === 'yes') list = list.filter(c => c.show_on_home);
  if (homeFilter === 'no') list = list.filter(c => !c.show_on_home);

  if (subFilter === 'yes') list = list.filter(c => c._subcats && c._subcats.length > 0);
  if (subFilter === 'no') list = list.filter(c => !c._subcats || c._subcats.length === 0);

  if (recentOnly) {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    list = list.filter(c => new Date(c.updated_at).getTime() >= sevenDaysAgo);
  }

  if (sortBy === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  if (sortBy === 'updated') list = [...list].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  if (sortBy === 'order') list = [...list].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  return list;
}

function renderCategories() {
  const list = getFilteredSortedCategories();
  const container = document.getElementById('categoryList');

  if (!list.length) {
    container.innerHTML = `<p class="text-secondary text-center py-4">Tiada kategori dijumpai.</p>`;
    updateBulkToolbar();
    return;
  }

  container.innerHTML = list.map(cat => `
    <div class="card bg-secondary bg-opacity-10 border-secondary">
      <div class="card-body">

        <div class="d-flex align-items-start gap-3 flex-wrap">

          <input type="checkbox" class="form-check-input mt-2 cat-select-checkbox" data-id="${cat.id}"
                 ${selectedCategoryIds.has(cat.id) ? 'checked' : ''}
                 onchange="onCategoryCheck('${cat.id}', this.checked)">

          ${cat.banner_url
            ? `<img src="${cat.banner_url}" style="width:64px; height:64px; object-fit:cover; border-radius:10px;">`
            : `<div style="width:64px; height:64px; border-radius:10px; background:${cat.color || '#D4AF37'}22; display:flex; align-items:center; justify-content:center;">
                 <i class="bi ${cat.icon || 'bi-folder'}" style="font-size:1.7rem; color:${cat.color || '#D4AF37'};"></i>
               </div>`
          }

          <div style="flex:1; min-width:220px;">
            <h6 class="mb-1">${cat.name} <span class="badge bg-dark border border-secondary text-secondary small">${cat.slug}</span>
            ${cat.is_archived ? '<span class="badge bg-secondary ms-1">Archived</span>' : ''}
            </h6>
            ${cat.description ? `<p class="small text-secondary mb-1">${cat.description}</p>` : ''}
            <p class="small text-secondary mb-0">
              ${cat._itemCount} items &middot; ${cat._subcats.length} subcategories &middot; Prefix: ${cat.code_prefix || '—'}
            </p>
            <p class="small text-secondary mb-0">
              Created: ${formatDate(cat.created_at)} &middot; Updated: ${formatDate(cat.updated_at)}
            </p>
          </div>

          <div class="d-flex flex-column align-items-end gap-1">
            <span class="badge ${cat.is_active ? 'bg-success' : 'bg-danger'}">${cat.is_active ? 'Active' : 'Inactive'}</span>
            <span class="badge ${cat.show_on_home ? 'bg-warning text-dark' : 'bg-secondary'}">${cat.show_on_home ? 'On Home' : 'Hidden'}</span>
          </div>

        </div>

        <div class="d-flex gap-2 flex-wrap mt-3">
          <button class="btn btn-sm btn-outline-light" onclick="toggleSubPanel('${cat.id}')"><i class="bi bi-diagram-3"></i> Subcategories (${cat._subcats.length})</button>
          <button class="btn btn-sm btn-outline-warning" onclick="openAddSubcategory('${cat.id}')"><i class="bi bi-plus"></i> Add Subcategory</button>
          <button class="btn btn-sm btn-outline-info" onclick="editCategory('${cat.id}')"><i class="bi bi-pencil"></i> Edit</button>
          <button class="btn btn-sm btn-outline-secondary" onclick="duplicateCategory('${cat.id}')"><i class="bi bi-files"></i> Duplicate</button>
          ${cat.is_archived
            ? `<button class="btn btn-sm btn-outline-success" onclick="restoreCategory('${cat.id}')"><i class="bi bi-arrow-counterclockwise"></i> Restore</button>
               <button class="btn btn-sm btn-outline-danger" onclick="deleteCategory('${cat.id}')"><i class="bi bi-trash"></i> Delete Permanently</button>`
            : `<button class="btn btn-sm btn-outline-danger" onclick="archiveCategory('${cat.id}')"><i class="bi bi-archive"></i> Archive</button>`
          }
        </div>

        <div id="subpanel-${cat.id}" style="display:none;" class="mt-3 border-top border-secondary pt-3">
          ${renderSubcategoryPanel(cat)}
        </div>

      </div>
    </div>
  `).join('');

  updateBulkToolbar();
}

function toggleSubPanel(categoryId) {
  const panel = document.getElementById(`subpanel-${categoryId}`);
  if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

document.getElementById('catSearch').addEventListener('input', renderCategories);
document.getElementById('catFilter').addEventListener('change', renderCategories);
document.getElementById('catHomeFilter').addEventListener('change', renderCategories);
document.getElementById('catSubFilter').addEventListener('change', renderCategories);
document.getElementById('catSort').addEventListener('change', renderCategories);
document.getElementById('catRecentFilter').addEventListener('change', renderCategories);

// ================================
// BULK SELECTION
// ================================

function onCategoryCheck(id, checked) {
  if (checked) selectedCategoryIds.add(id);
  else selectedCategoryIds.delete(id);
  updateBulkToolbar();
}

function toggleSelectAll(checked) {
  const visible = getFilteredSortedCategories();
  visible.forEach(c => {
    if (checked) selectedCategoryIds.add(c.id);
    else selectedCategoryIds.delete(c.id);
  });
  renderCategories();
}

function clearSelection() {
  selectedCategoryIds.clear();
  document.getElementById('selectAllCheckbox').checked = false;
  renderCategories();
}

function updateBulkToolbar() {
  const toolbar = document.getElementById('bulkToolbar');
  const count = selectedCategoryIds.size;
  document.getElementById('bulkCount').textContent = `${count} selected`;
  toolbar.style.setProperty('display', count > 0 ? 'flex' : 'none', 'important');
}

async function bulkAction(action) {
  const ids = Array.from(selectedCategoryIds);
  if (!ids.length) return;

  if (action === 'delete' && !confirm(`Padam ${ids.length} kategori secara kekal? Tindakan ini tidak boleh diundur.`)) return;
  if (action === 'archive' && !confirm(`Archive ${ids.length} kategori?`)) return;

  try {
    for (const id of ids) {
      const cat = allCategories.find(c => c.id === id);
      if (!cat) continue;

      if (action === 'activate') {
        await supabaseClient.from('categories').update({ is_active: true }).eq('id', id);
        await logAudit('activate', 'category', id, cat.name);
      } else if (action === 'deactivate') {
        await supabaseClient.from('categories').update({ is_active: false }).eq('id', id);
        await logAudit('deactivate', 'category', id, cat.name);
      } else if (action === 'archive') {
        await supabaseClient.from('categories').update({ is_archived: true }).eq('id', id);
        await logAudit('archive', 'category', id, cat.name);
      } else if (action === 'delete') {
        await supabaseClient.from('categories').delete().eq('id', id);
        await logAudit('delete', 'category', id, cat.name);
      } else if (action === 'duplicate') {
        await duplicateCategory(id, true);
      }
    }

    showToast(`Bulk ${action} berjaya untuk ${ids.length} kategori.`);
    clearSelection();
    loadCategories();

  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// ================================
// CATEGORY ADD / EDIT / DUPLICATE / ARCHIVE / DELETE
// ================================

document.getElementById('catName').addEventListener('input', (e) => {
  if (!document.getElementById('catId').value) {
    document.getElementById('catSlug').value = slugify(e.target.value);
  }
});

document.getElementById('catBanner').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const preview = document.getElementById('catBannerPreview');
  if (!file) { preview.style.display = 'none'; return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    preview.src = ev.target.result;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
});

document.getElementById('addCategoryBtn').addEventListener('click', () => {
  resetCategoryForm();
  document.getElementById('categoryModalTitle').textContent = 'Add Category';
  document.getElementById('catOrder').value = allCategories.length + 1;
  categoryModal.show();
});

function resetCategoryForm() {
  document.getElementById('categoryForm').reset();
  document.getElementById('catId').value = '';
  document.getElementById('catColor').value = '#D4AF37';
  document.getElementById('catActive').checked = true;
  document.getElementById('catShowHome').checked = true;
  document.getElementById('catBannerPreview').style.display = 'none';
  document.getElementById('catIconPreview').innerHTML = '<i class="bi bi-folder"></i>';
  document.getElementById('categoryFormError').textContent = '';
}

function editCategory(id) {
  const cat = allCategories.find(c => c.id === id);
  if (!cat) return;

  resetCategoryForm();
  document.getElementById('categoryModalTitle').textContent = 'Edit Category';
  document.getElementById('catId').value = cat.id;
  document.getElementById('catName').value = cat.name;
  document.getElementById('catSlug').value = cat.slug;
  document.getElementById('catIcon').value = cat.icon || '';
  document.getElementById('catIconPreview').innerHTML = `<i class="bi ${cat.icon || 'bi-folder'}"></i>`;
  document.getElementById('catColor').value = cat.color || '#D4AF37';
  document.getElementById('catPrefix').value = cat.code_prefix || '';
  document.getElementById('catOrder').value = cat.display_order || 0;
  document.getElementById('catDescription').value = cat.description || '';
  document.getElementById('catActive').checked = cat.is_active;
  document.getElementById('catShowHome').checked = cat.show_on_home;

  if (cat.banner_url) {
    document.getElementById('catBannerPreview').src = cat.banner_url;
    document.getElementById('catBannerPreview').style.display = 'block';
  }

  categoryModal.show();
}

async function duplicateCategory(id, silent) {
  const cat = allCategories.find(c => c.id === id);
  if (!cat) return;

  let newSlug = cat.slug + '-copy';
  let counter = 1;
  while (allCategories.some(c => c.slug === newSlug)) {
    counter++;
    newSlug = `${cat.slug}-copy${counter}`;
  }

  const { data: inserted, error } = await supabaseClient.from('categories').insert({
    name: cat.name + ' (Copy)',
    slug: newSlug,
    icon: cat.icon,
    color: cat.color,
    banner_url: cat.banner_url,
    description: cat.description,
    code_prefix: cat.code_prefix,
    display_order: allCategories.length + 1,
    is_active: cat.is_active,
    show_on_home: cat.show_on_home
  }).select().single();

  if (error) {
    showToast(error.message, 'danger');
    return;
  }

  await logAudit('duplicate', 'category', inserted.id, inserted.name);

  if (!silent) {
    showToast('Category duplicated!');
    loadCategories();
  }
}

async function archiveCategory(id) {
  const cat = allCategories.find(c => c.id === id);
  if (!cat) return;

  let msg = `Archive kategori "${cat.name}"?`;
  if (cat._itemCount > 0 || cat._subcats.length > 0) {
    msg = `Kategori "${cat.name}" ada ${cat._itemCount} gallery item(s) dan ${cat._subcats.length} subcategory. Archive akan sembunyikan kategori ni dari homepage/gallery, tapi data tidak dipadam. Teruskan?`;
  }
  if (!confirm(msg)) return;

  const { error } = await supabaseClient.from('categories').update({ is_archived: true }).eq('id', id);

  if (error) {
    showToast(error.message, 'danger');
    return;
  }

  await logAudit('archive', 'category', id, cat.name);
  showToast('Category diarchive.');
  loadCategories();
}

async function restoreCategory(id) {
  const cat = allCategories.find(c => c.id === id);
  if (!cat) return;

  const { error } = await supabaseClient.from('categories').update({ is_archived: false }).eq('id', id);

  if (error) {
    showToast(error.message, 'danger');
    return;
  }

  await logAudit('restore', 'category', id, cat.name);
  showToast('Category dipulihkan.');
  loadCategories();
}

async function deleteCategory(id) {
  const cat = allCategories.find(c => c.id === id);
  if (!cat) return;

  if (!confirm(`Padam kategori "${cat.name}" secara KEKAL? Tindakan ini tidak boleh diundur.`)) return;

  const { error } = await supabaseClient.from('categories').delete().eq('id', id);

  if (error) {
    showToast(error.message, 'danger');
    return;
  }

  await logAudit('delete', 'category', id, cat.name);
  showToast('Category dipadam kekal.');
  loadCategories();
}

// ---- SAVE CATEGORY (ADD or EDIT) ----
document.getElementById('categoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('catId').value;
  const name = document.getElementById('catName').value.trim();
  const slug = slugify(document.getElementById('catSlug').value);
  const icon = document.getElementById('catIcon').value.trim();
  const color = document.getElementById('catColor').value;
  const codePrefix = document.getElementById('catPrefix').value.trim().toUpperCase();
  const displayOrder = parseInt(document.getElementById('catOrder').value) || 0;
  const description = document.getElementById('catDescription').value.trim();
  const isActive = document.getElementById('catActive').checked;
  const showOnHome = document.getElementById('catShowHome').checked;
  const bannerFile = document.getElementById('catBanner').files[0];
  const errorBox = document.getElementById('categoryFormError');
  const saveBtn = document.getElementById('saveCategoryBtn');

  errorBox.textContent = '';

  if (!name) { errorBox.textContent = 'Nama kategori wajib diisi.'; return; }
  if (!slug) { errorBox.textContent = 'Slug wajib diisi.'; return; }

  const duplicateName = allCategories.find(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== id);
  if (duplicateName) { errorBox.textContent = 'Nama kategori sudah wujud.'; return; }

  const duplicateSlug = allCategories.find(c => c.slug === slug && c.id !== id);
  if (duplicateSlug) { errorBox.textContent = 'Slug sudah wujud. Sila guna slug lain.'; return; }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    let bannerUrl = null;
    if (id) {
      const existing = allCategories.find(c => c.id === id);
      bannerUrl = existing ? existing.banner_url : null;
    }

    if (bannerFile) {
      const fileExt = bannerFile.name.split('.').pop();
      const fileName = `category-banners/${slug}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabaseClient.storage.from('catalog-images').upload(fileName, bannerFile);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabaseClient.storage.from('catalog-images').getPublicUrl(fileName);
      bannerUrl = urlData.publicUrl;
    }

    const payload = {
      name, slug, icon, color,
      code_prefix: codePrefix,
      display_order: displayOrder,
      description,
      is_active: isActive,
      show_on_home: showOnHome,
      banner_url: bannerUrl,
      updated_at: new Date().toISOString()
    };

    if (id) {
      const { error } = await supabaseClient.from('categories').update(payload).eq('id', id);
      if (error) throw error;
      await logAudit('update', 'category', id, name);
      showToast('Category dikemaskini!');
    } else {
      const { data: inserted, error } = await supabaseClient.from('categories').insert(payload).select().single();
      if (error) throw error;
      await logAudit('create', 'category', inserted.id, name);
      showToast('Category ditambah!');
    }

    categoryModal.hide();
    loadCategories();

  } catch (err) {
    errorBox.textContent = err.message;
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Category';
  }
});

// ================================
// SUBCATEGORY MANAGEMENT (embedded in category card)
// ================================

function renderSubcategoryPanel(cat) {
  if (!cat._subcats.length) {
    return `<p class="text-secondary small">Tiada subcategory lagi untuk kategori ni.</p>`;
  }

  return `<div class="d-flex flex-column gap-2">` + cat._subcats.map(sub => `
    <div class="d-flex align-items-center gap-2 border border-secondary rounded p-2 flex-wrap">
      <span style="width:36px; height:36px; border-radius:8px; background:${sub.color || '#D4AF37'}22; display:flex; align-items:center; justify-content:center;">
        <i class="bi ${sub.icon || 'bi-tag'}" style="color:${sub.color || '#D4AF37'};"></i>
      </span>
      <div style="flex:1; min-width:160px;">
        <strong>${sub.name}</strong> <span class="badge bg-dark border border-secondary text-secondary small">${sub.slug}</span>
        ${sub.is_archived ? '<span class="badge bg-secondary ms-1">Archived</span>' : ''}
        <div class="small text-secondary">${sub._itemCount} items</div>
      </div>
      <span class="badge ${sub.is_active ? 'bg-success' : 'bg-danger'}">${sub.is_active ? 'Active' : 'Inactive'}</span>
      <span class="badge ${sub.show_on_home ? 'bg-warning text-dark' : 'bg-secondary'}">${sub.show_on_home ? 'On Home' : 'Hidden'}</span>
      <button class="btn btn-sm btn-outline-info" onclick="editSubcategory('${sub.id}')"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-sm btn-outline-secondary" onclick="duplicateSubcategory('${sub.id}')"><i class="bi bi-files"></i></button>
      ${sub.is_archived
        ? `<button class="btn btn-sm btn-outline-success" onclick="restoreSubcategory('${sub.id}')"><i class="bi bi-arrow-counterclockwise"></i></button>
           <button class="btn btn-sm btn-outline-danger" onclick="deleteSubcategory('${sub.id}')"><i class="bi bi-trash"></i></button>`
        : `<button class="btn btn-sm btn-outline-danger" onclick="archiveSubcategory('${sub.id}')"><i class="bi bi-archive"></i></button>`
      }
    </div>
  `).join('') + `</div>`;
}

function findSubcat(id) {
  return allSubcategoriesFlat.find(s => s.id === id);
}

function resetSubcatForm() {
  document.getElementById('subcategoryForm').reset();
  document.getElementById('subcatId').value = '';
  document.getElementById('subcatColor').value = '#D4AF37';
  document.getElementById('subcatActive').checked = true;
  document.getElementById('subcatShowHome').checked = true;
  document.getElementById('subcatIconPreview').innerHTML = '<i class="bi bi-tag"></i>';
  document.getElementById('subcatFormError').textContent = '';
}

function openAddSubcategory(categoryId) {
  const cat = allCategories.find(c => c.id === categoryId);
  if (!cat) return;

  resetSubcatForm();
  document.getElementById('subcategoryModalTitle').textContent = 'Add Subcategory — ' + cat.name;
  document.getElementById('subcatCategoryName').textContent = cat.name;
  document.getElementById('subcatCategoryId').value = cat.id;
  subcategoryModal.show();
}

function editSubcategory(id) {
  const sub = findSubcat(id);
  if (!sub) return;

  const cat = allCategories.find(c => c.id === sub.category_id);

  resetSubcatForm();
  document.getElementById('subcategoryModalTitle').textContent = 'Edit Subcategory — ' + (cat ? cat.name : '');
  document.getElementById('subcatCategoryName').textContent = cat ? cat.name : '';
  document.getElementById('subcatId').value = sub.id;
  document.getElementById('subcatCategoryId').value = sub.category_id;
  document.getElementById('subcatName').value = sub.name;
  document.getElementById('subcatSlug').value = sub.slug;
  document.getElementById('subcatIcon').value = sub.icon || '';
  document.getElementById('subcatIconPreview').innerHTML = `<i class="bi ${sub.icon || 'bi-tag'}"></i>`;
  document.getElementById('subcatColor').value = sub.color || '#D4AF37';
  document.getElementById('subcatDescription').value = sub.description || '';
  document.getElementById('subcatActive').checked = sub.is_active;
  document.getElementById('subcatShowHome').checked = sub.show_on_home;

  subcategoryModal.show();
}

async function duplicateSubcategory(id) {
  const sub = findSubcat(id);
  if (!sub) return;

  const siblings = allSubcategoriesFlat.filter(s => s.category_id === sub.category_id);
  let newSlug = sub.slug + '-copy';
  let counter = 1;
  while (siblings.some(s => s.slug === newSlug)) {
    counter++;
    newSlug = `${sub.slug}-copy${counter}`;
  }

  const { data: inserted, error } = await supabaseClient.from('subcategories').insert({
    category_id: sub.category_id,
    name: sub.name + ' (Copy)',
    slug: newSlug,
    icon: sub.icon,
    color: sub.color,
    description: sub.description,
    display_order: siblings.length + 1,
    is_active: sub.is_active,
    show_on_home: sub.show_on_home
  }).select().single();

  if (error) {
    showToast(error.message, 'danger');
    return;
  }

  await logAudit('duplicate', 'subcategory', inserted.id, inserted.name);
  showToast('Subcategory duplicated!');
  loadCategories();
}

async function archiveSubcategory(id) {
  const sub = findSubcat(id);
  if (!sub) return;

  let msg = `Archive subcategory "${sub.name}"?`;
  if (sub._itemCount > 0) {
    msg = `Subcategory "${sub.name}" ada ${sub._itemCount} gallery item(s). Archive akan sembunyikan dari homepage/gallery, data tidak dipadam. Teruskan?`;
  }
  if (!confirm(msg)) return;

  const { error } = await supabaseClient.from('subcategories').update({ is_archived: true }).eq('id', id);

  if (error) {
    showToast(error.message, 'danger');
    return;
  }

  await logAudit('archive', 'subcategory', id, sub.name);
  showToast('Subcategory diarchive.');
  loadCategories();
}

async function restoreSubcategory(id) {
  const sub = findSubcat(id);
  if (!sub) return;

  const { error } = await supabaseClient.from('subcategories').update({ is_archived: false }).eq('id', id);

  if (error) {
    showToast(error.message, 'danger');
    return;
  }

  await logAudit('restore', 'subcategory', id, sub.name);
  showToast('Subcategory dipulihkan.');
  loadCategories();
}

async function deleteSubcategory(id) {
  const sub = findSubcat(id);
  if (!sub) return;

  if (!confirm(`Padam subcategory "${sub.name}" secara KEKAL?`)) return;

  const { error } = await supabaseClient.from('subcategories').delete().eq('id', id);

  if (error) {
    showToast(error.message, 'danger');
    return;
  }

  await logAudit('delete', 'subcategory', id, sub.name);
  showToast('Subcategory dipadam kekal.');
  loadCategories();
}

document.getElementById('subcatName').addEventListener('input', (e) => {
  if (!document.getElementById('subcatId').value) {
    document.getElementById('subcatSlug').value = slugify(e.target.value);
  }
});

document.getElementById('subcategoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('subcatId').value;
  const categoryId = document.getElementById('subcatCategoryId').value;
  const name = document.getElementById('subcatName').value.trim();
  const slug = slugify(document.getElementById('subcatSlug').value);
  const icon = document.getElementById('subcatIcon').value.trim();
  const color = document.getElementById('subcatColor').value;
  const description = document.getElementById('subcatDescription').value.trim();
  const isActive = document.getElementById('subcatActive').checked;
  const showOnHome = document.getElementById('subcatShowHome').checked;
  const errorBox = document.getElementById('subcatFormError');
  const saveBtn = document.getElementById('saveSubcatBtn');

  errorBox.textContent = '';

  if (!name) { errorBox.textContent = 'Nama subcategory wajib diisi.'; return; }
  if (!slug) { errorBox.textContent = 'Slug wajib diisi.'; return; }

  const siblings = allSubcategoriesFlat.filter(s => s.category_id === categoryId);

  const duplicateName = siblings.find(s => s.name.toLowerCase() === name.toLowerCase() && s.id !== id);
  if (duplicateName) { errorBox.textContent = 'Nama subcategory ni sudah wujud dalam kategori ni.'; return; }

  const duplicateSlug = siblings.find(s => s.slug === slug && s.id !== id);
  if (duplicateSlug) { errorBox.textContent = 'Slug sudah wujud dalam kategori ni.'; return; }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    if (id) {
      const { error } = await supabaseClient.from('subcategories')
        .update({ name, slug, icon, color, description, is_active: isActive, show_on_home: showOnHome, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      await logAudit('update', 'subcategory', id, name);
      showToast('Subcategory dikemaskini!');
    } else {
      const { data: inserted, error } = await supabaseClient.from('subcategories').insert({
        category_id: categoryId,
        name, slug, icon, color, description,
        display_order: siblings.length + 1,
        is_active: isActive,
        show_on_home: showOnHome
      }).select().single();
      if (error) throw error;
      await logAudit('create', 'subcategory', inserted.id, name);
      showToast('Subcategory ditambah!');
    }

    subcategoryModal.hide();
    loadCategories();

  } catch (err) {
    errorBox.textContent = err.message;
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Subcategory';
  }
});

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
  categoryModal = new bootstrap.Modal(document.getElementById('categoryModal'));
  subcategoryModal = new bootstrap.Modal(document.getElementById('subcategoryModal'));
  iconPickerModal = new bootstrap.Modal(document.getElementById('iconPickerModal'));

  const ok = await checkAccess();
  if (ok) loadCategories();
});