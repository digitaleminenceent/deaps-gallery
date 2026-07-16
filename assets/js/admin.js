// assets/js/admin.js

const CATEGORY_PREFIX = {
  female: 'FP',
  male: 'MP',
  fashion: 'FA',
  beauty: 'BE',
  sports: 'SP',
  travel: 'TR',
  fantasy: 'FY',
  product: 'PR',
  automotive: 'AU',
  food: 'FD',
  interior: 'IN',
  advertising: 'AD'
};

async function generateStyleCode(category) {
  const prefix = CATEGORY_PREFIX[category] || 'XX';

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

// ---- UPLOAD IMAGE + ADD TO CATALOG ----
document.getElementById('imageForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = document.getElementById('imgTitle').value;
  const category = document.getElementById('imgCategory').value;
  const description = document.getElementById('imgDescription').value;
  const adminPrompt = document.getElementById('imgAdminPrompt').value;
  const price = parseFloat(document.getElementById('imgPrice').value) || 0;
  const file = document.getElementById('imgFile').files[0];
  const errorBox = document.getElementById('imageFormError');
  const uploadBtn = document.getElementById('uploadBtn');

  errorBox.textContent = '';

  if (!file) {
    errorBox.textContent = 'Sila pilih gambar.';
    return;
  }

  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Uploading...';

  try {
    // Generate style code for this category
    const styleCode = await generateStyleCode(category);

    // Create watermarked version for public preview
    const watermarkedBlob = await createWatermarkedBlob(file, 'DEAPS');

    const fileExt = file.name.split('.').pop();
    const baseName = `${category}-${Date.now()}`;
    const fullResFileName = `fullres-${baseName}.${fileExt}`;
    const previewFileName = `preview-${baseName}.${fileExt}`;

    // Upload original (full-res, unwatermarked)
    const { error: fullResError } = await supabaseClient
      .storage
      .from('catalog-images')
      .upload(fullResFileName, file);

    if (fullResError) throw fullResError;

    // Upload watermarked version (public preview)
    const { error: previewError } = await supabaseClient
      .storage
      .from('catalog-images')
      .upload(previewFileName, watermarkedBlob, { contentType: file.type });

    if (previewError) throw previewError;

    // Get public URLs
    const { data: previewUrlData } = supabaseClient
      .storage
      .from('catalog-images')
      .getPublicUrl(previewFileName);

    const { data: fullResUrlData } = supabaseClient
      .storage
      .from('catalog-images')
      .getPublicUrl(fullResFileName);

    // Insert into images table
    const { error: insertError } = await supabaseClient
      .from('images')
      .insert({
        title,
        category,
        description,
        admin_prompt: adminPrompt,
        price,
        style_code: styleCode,
        preview_url: previewUrlData.publicUrl,
        full_res_url: fullResUrlData.publicUrl,
        is_active: true
      });

    if (insertError) throw insertError;

    document.getElementById('imageForm').reset();
    document.getElementById('imgPreview').style.display = 'none';
    document.getElementById('imgPreview').src = '';
    document.getElementById('imgPlaceholder').style.display = 'block';
    alert(`Berjaya! Style Code: ${styleCode}`);
    loadCatalog();

  } catch (err) {
    errorBox.textContent = err.message;
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Upload & Tambah';
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

  container.innerHTML = images.map(img => `
    <div class="col-md-3 col-6">
      <div class="card bg-secondary bg-opacity-25 border-secondary h-100">
        <img src="${img.preview_url}" class="card-img-top" style="height:150px; object-fit:cover;">
        <div class="card-body">
          <h6 class="card-title text-warning mb-1">${img.style_code || ''}</h6>
          <p class="small mb-1">${img.title}</p>
          <p class="small text-secondary mb-1">${img.category}</p>
          <p class="small mb-2">RM${img.price}</p>
          <button class="btn btn-sm btn-outline-danger w-100" onclick="deleteImage('${img.id}')">Delete</button>
        </div>
      </div>
    </div>
  `).join('');
}

// ---- DELETE IMAGE ----
async function deleteImage(imageId) {
  if (!confirm('Padam gambar ni?')) return;

  const { error } = await supabaseClient
    .from('images')
    .delete()
    .eq('id', imageId);

  if (error) {
    alert('Error: ' + error.message);
    return;
  }

  loadCatalog();
}

// Run on page load
checkAdminAccess();