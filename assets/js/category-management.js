// assets/js/category-management.js

let allCategories = [];
let categoryModal, subcategoryModal;

// ---- TOAST ----
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const icon = type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill';
  const bg = type === 'success' ? 'text-bg-success' : 'text-bg-danger';

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

// ---- LOAD CATEGORIES ----
async function loadCategories() {
  document.getElementById('loadingIndicator').style.display = 'block';

  const { data, error } = await supabaseClient
    .from('categories')
    .select('*')
    .order('display_order', { ascending: true });

  document.getElementById('loadingIndicator').style.display = 'none';

  if (error) {
    showToast(error.message, 'danger');
    return;
  }

  // Get item counts per category
  for (const cat of data) {
    const { count } = await supabaseClient
      .from('images')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', cat.id);
    cat._itemCount = count || 0;
  }

  allCategories = data;
  renderCategories();
}

// ---- RENDER CATEGORY LIST ----
function renderCategories() {
  const search = document.getElementById('catSearch').value.toLowerCase();
  const filter = document.getElementById('catFilter').value;

  let list = allCategories.filter(c => c.name.toLowerCase().includes(search));

  if (filter === 'active') list = list.filter(c => c.is_active);
  if (filter === 'inactive') list = list.filter(c => !c.is_active);

  const container = document.getElementById('categoryList');

  if (!list.length) {
    container.innerHTML = `<p class="text-secondary">Tiada kategori dijumpai.</p>`;
    return;
  }

  container.innerHTML = list.map(cat => `
    <div class="card bg-secondary bg-opacity-10 border-secondary" draggable="true" data-id="${cat.id}" ondragstart="onDragStart(event)" ondragover="onDragOver(event)" ondrop="onDrop(event)">
      <div class="card-body d-flex align-items-center gap-3 flex-wrap">

        <span class="text-secondary" style="cursor:grab; font-size:1.2rem;"><i class="bi bi-grip-vertical"></i></span>

        ${cat.banner_url
          ? `<img src="${cat.banner_url}" style="width:60px; height:60px; object-fit:cover; border-radius:10px;">`
          : `<div style="width:60px; height:60px; border-radius:10px; background:${cat.color || '#D4AF37'}22; display:flex; align-items:center; justify-content:center;">
               <i class="bi ${cat.icon || 'bi-folder'}" style="font-size:1.6rem; color:${cat.color || '#D4AF37'};"></i>
             </div>`
        }

        <div style="flex:1; min-width:180px;">
          <h6 class="mb-1">${cat.name} <span class="badge bg-dark border border-secondary text-secondary small">${cat.slug}</span></h6>
          <p class="small text-secondary mb-0">${cat._itemCount} items &middot; Prefix: ${cat.code_prefix || '—'}</p>
        </div>

        <span class="badge ${cat.is_active ? 'bg-success' : 'bg-danger'}">${cat.is_active ? 'Active' : 'Inactive'}</span>
        <span class="badge ${cat.show_on_home ? 'bg-warning text-dark' : 'bg-secondary'}">${cat.show_on_home ? 'On Home' : 'Hidden'}</span>

        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-sm btn-outline-light" onclick="manageSubcategories('${cat.id}')"><i class="bi bi-diagram-3"></i> Subcategories</button>
          <button class="btn btn-sm btn-outline-info" onclick="editCategory('${cat.id}')"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-secondary" onclick="duplicateCategory('${cat.id}')"><i class="bi bi-files"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteCategory('${cat.id}')"><i class="bi bi-trash"></i></button>
        </div>

      </div>
    </div>
  `).join('');
}

document.getElementById('catSearch').addEventListener('input', renderCategories);
document.getElementById('catFilter').addEventListener('change', renderCategories);

// ---- DRAG & DROP REORDER ----
let dragSrcId = null;

function onDragStart(e) {
  dragSrcId = e.currentTarget.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
}

function onDragOver(e) {
  e.preventDefault();
}

async function onDrop(e) {
  e.preventDefault();
  const targetId = e.currentTarget.dataset.id;
  if (!dragSrcId || dragSrcId === targetId) return;

  const srcIndex = allCategories.findIndex(c => c.id === dragSrcId);
  const targetIndex = allCategories.findIndex(c => c.id === targetId);
  if (srcIndex === -1 || targetIndex === -1) return;

  const [moved] = allCategories.splice(srcIndex, 1);
  allCategories.splice(targetIndex, 0, moved);

  renderCategories();

  // Persist new order
  const updates = allCategories.map((cat, index) =>
    supabaseClient.from('categories').update({ display_order: index + 1 }).eq('id', cat.id)
  );
  await Promise.all(updates);
  showToast('Susunan kategori dikemaskini.');
}

// ---- ADD / EDIT CATEGORY MODAL ----
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

async function duplicateCategory(id) {
  const cat = allCategories.find(c => c.id === id);
  if (!cat) return;

  let newSlug = cat.slug + '-copy';
  let counter = 1;
  while (allCategories.some(c => c.slug === newSlug)) {
    counter++;
    newSlug = `${cat.slug}-copy${counter}`;
  }

  const { error } = await supabaseClient.from('categories').insert({
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
  });

  if (error) {
    showToast(error.message, 'danger');
    return;
  }

  showToast('Category duplicated!');
  loadCategories();
}

async function deleteCategory(id) {
  const cat = allCategories.find(c => c.id === id);
  if (!cat) return;

  if (cat._itemCount > 0) {
    if (!confirm(`Kategori "${cat.name}" ada ${cat._itemCount} gallery item(s). Padam kategori ni juga akan unlink item tersebut (item tak dipadam). Teruskan?`)) return;
  } else {
    if (!confirm(`Padam kategori "${cat.name}"?`)) return;
  }

  const { error } = await supabaseClient.from('categories').delete().eq('id', id);

  if (error) {
    showToast(error.message, 'danger');
    return;
  }

  showToast('Category dipadam.');
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

  // Validate duplicate slug
  const duplicateSlug = allCategories.find(c => c.slug === slug && c.id !== id);
  if (duplicateSlug) {
    errorBox.textContent = 'Slug sudah wujud. Sila guna slug lain.';
    return;
  }

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
      showToast('Category dikemaskini!');
    } else {
      const { error } = await supabaseClient.from('categories').insert(payload);
      if (error) throw error;
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
// SUBCATEGORY MANAGEMENT
// ================================

let currentSubcatCategory = null;

async function manageSubcategories(categoryId) {
  const cat = allCategories.find(c => c.id === categoryId);
  if (!cat) return;

  currentSubcatCategory = cat;
  document.getElementById('subcatCategoryName').textContent = cat.name;
  document.getElementById('subcatCategoryId').value = cat.id;
  resetSubcatForm();

  await loadSubcategories(cat.id);
  subcategoryModal.show();
}

async function loadSubcategories(categoryId) {
  const { data, error } = await supabaseClient
    .from('subcategories')
    .select('*')
    .eq('category_id', categoryId)
    .order('display_order', { ascending: true });

  const container = document.getElementById('subcategoryList');

  if (error) {
    container.innerHTML = `<p class="text-danger">${error.message}</p>`;
    return;
  }

  for (const sub of data) {
    const { count } = await supabaseClient
      .from('images')
      .select('id', { count: 'exact', head: true })
      .eq('subcategory_id', sub.id);
    sub._itemCount = count || 0;
  }

  window._currentSubcats = data;

  if (!data.length) {
    container.innerHTML = `<p class="text-secondary">Tiada subcategory lagi.</p>`;
    return;
  }

  container.innerHTML = data.map((sub, index) => `
    <div class="d-flex align-items-center gap-2 border border-secondary rounded p-2">
      <div class="d-flex flex-column">
        <button class="btn btn-sm btn-outline-light py-0 px-1" onclick="moveSubcategory('${sub.id}', -1)" ${index === 0 ? 'disabled' : ''}><i class="bi bi-caret-up"></i></button>
        <button class="btn btn-sm btn-outline-light py-0 px-1" onclick="moveSubcategory('${sub.id}', 1)" ${index === data.length - 1 ? 'disabled' : ''}><i class="bi bi-caret-down"></i></button>
      </div>
      <div style="flex:1;">
        <strong>${sub.name}</strong> <span class="badge bg-dark border border-secondary text-secondary small">${sub.slug}</span>
        <span class="small text-secondary ms-2">${sub._itemCount} items</span>
      </div>
      <span class="badge ${sub.is_active ? 'bg-success' : 'bg-danger'}">${sub.is_active ? 'Active' : 'Inactive'}</span>
      <button class="btn btn-sm btn-outline-info" onclick="editSubcategory('${sub.id}')"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-sm btn-outline-secondary" onclick="duplicateSubcategory('${sub.id}')"><i class="bi bi-files"></i></button>
      <button class="btn btn-sm btn-outline-danger" onclick="deleteSubcategory('${sub.id}')"><i class="bi bi-trash"></i></button>
    </div>
  `).join('');
}

function resetSubcatForm() {
  document.getElementById('subcategoryForm').reset();
  document.getElementById('subcatId').value = '';
  document.getElementById('saveSubcatBtn').textContent = 'Add';
  document.getElementById('subcatFormError').textContent = '';
}

function editSubcategory(id) {
  const sub = (window._currentSubcats || []).find(s => s.id === id);
  if (!sub) return;

  document.getElementById('subcatId').value = sub.id;
  document.getElementById('subcatName').value = sub.name;
  document.getElementById('subcatSlug').value = sub.slug;
  document.getElementById('subcatIcon').value = sub.icon || '';
  document.getElementById('saveSubcatBtn').textContent = 'Save Changes';
}

async function duplicateSubcategory(id) {
  const sub = (window._currentSubcats || []).find(s => s.id === id);
  if (!sub) return;

  let newSlug = sub.slug + '-copy';
  let counter = 1;
  while ((window._currentSubcats || []).some(s => s.slug === newSlug)) {
    counter++;
    newSlug = `${sub.slug}-copy${counter}`;
  }

  const { error } = await supabaseClient.from('subcategories').insert({
    category_id: sub.category_id,
    name: sub.name + ' (Copy)',
    slug: newSlug,
    icon: sub.icon,
    display_order: (window._currentSubcats || []).length + 1,
    is_active: sub.is_active
  });

  if (error) {
    showToast(error.message, 'danger');
    return;
  }

  showToast('Subcategory duplicated!');
  loadSubcategories(currentSubcatCategory.id);
}

async function deleteSubcategory(id) {
  if (!confirm('Padam subcategory ni?')) return;

  const { error } = await supabaseClient.from('subcategories').delete().eq('id', id);

  if (error) {
    showToast(error.message, 'danger');
    return;
  }

  showToast('Subcategory dipadam.');
  loadSubcategories(currentSubcatCategory.id);
}

async function moveSubcategory(id, direction) {
  const list = window._currentSubcats || [];
  const index = list.findIndex(s => s.id === id);
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= list.length) return;

  [list[index], list[targetIndex]] = [list[targetIndex], list[index]];

  const updates = list.map((sub, i) =>
    supabaseClient.from('subcategories').update({ display_order: i + 1 }).eq('id', sub.id)
  );
  await Promise.all(updates);

  loadSubcategories(currentSubcatCategory.id);
}

document.getElementById('subcategoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('subcatId').value;
  const categoryId = document.getElementById('subcatCategoryId').value;
  const name = document.getElementById('subcatName').value.trim();
  const slug = slugify(document.getElementById('subcatSlug').value);
  const icon = document.getElementById('subcatIcon').value.trim();
  const errorBox = document.getElementById('subcatFormError');

  errorBox.textContent = '';

  const existing = (window._currentSubcats || []).find(s => s.slug === slug && s.id !== id);
  if (existing) {
    errorBox.textContent = 'Slug subcategory sudah wujud dalam kategori ni.';
    return;
  }

  try {
    if (id) {
      const { error } = await supabaseClient.from('subcategories')
        .update({ name, slug, icon, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      showToast('Subcategory dikemaskini!');
    } else {
      const { error } = await supabaseClient.from('subcategories').insert({
        category_id: categoryId,
        name, slug, icon,
        display_order: (window._currentSubcats || []).length + 1
      });
      if (error) throw error;
      showToast('Subcategory ditambah!');
    }

    resetSubcatForm();
    loadSubcategories(categoryId);
    loadCategories();

  } catch (err) {
    errorBox.textContent = err.message;
  }
});

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
  categoryModal = new bootstrap.Modal(document.getElementById('categoryModal'));
  subcategoryModal = new bootstrap.Modal(document.getElementById('subcategoryModal'));

  const ok = await checkAccess();
  if (ok) loadCategories();
});