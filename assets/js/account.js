// assets/js/account.js

let currentUser = null;

// ---- AUTH CHECK ----
async function initAccountPage() {
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!user) {
    document.getElementById('notLoggedIn').style.display = 'block';
    document.getElementById('accountContent').style.display = 'none';
    updateAuthArea();
    return;
  }

  currentUser = user;
  document.getElementById('notLoggedIn').style.display = 'none';
  document.getElementById('accountContent').style.display = 'block';

  updateAuthArea();
  loadFavorites();
}

// ---- NAVBAR AUTH STATUS ----
async function updateAuthArea() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  const authArea = document.getElementById('authArea');

  if (user) {
    authArea.innerHTML = `
      <span class="text-white small me-2">${user.email}</span>
      <button class="btn btn-outline-light btn-sm" id="logoutBtn">Logout</button>
    `;
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      window.location.href = 'index.html';
    });
  } else {
    authArea.innerHTML = `<a href="index.html" class="btn btn-outline-warning btn-sm">Login</a>`;
  }
}

// ---- TAB SWITCHING ----
function switchTab(tab) {
  const favTab = document.getElementById('favoritesTab');
  const cartTab = document.getElementById('cartTab');
  const favBtn = document.getElementById('tabFavoritesBtn');
  const cartBtn = document.getElementById('tabCartBtn');

  if (tab === 'favorites') {
    favTab.style.display = 'block';
    cartTab.style.display = 'none';
    favBtn.classList.add('active', 'text-warning');
    favBtn.classList.remove('text-white');
    cartBtn.classList.remove('active', 'text-warning');
    cartBtn.classList.add('text-white');
    loadFavorites();
  } else {
    favTab.style.display = 'none';
    cartTab.style.display = 'block';
    cartBtn.classList.add('active', 'text-warning');
    cartBtn.classList.remove('text-white');
    favBtn.classList.remove('active', 'text-warning');
    favBtn.classList.add('text-white');
    loadCart();
  }
}

// ---- LOAD FAVORITES ----
async function loadFavorites() {
  const container = document.getElementById('favoritesContainer');
  container.innerHTML = `<p class="text-secondary">Loading...</p>`;

  const { data, error } = await supabaseClient
    .from('favorites')
    .select('id, image_id, images(id, title, style_code, category, preview_url, price)')
    .eq('user_id', currentUser.id);

  if (error) {
    container.innerHTML = `<p class="text-danger">${error.message}</p>`;
    return;
  }

  if (!data.length) {
    container.innerHTML = `<p class="text-secondary">Tiada gambar dalam favorite anda lagi.</p>`;
    return;
  }

  container.innerHTML = data.map(fav => {
    const img = fav.images;
    if (!img) return '';
    return `
      <div class="col-md-3 col-6">
        <div class="card bg-secondary bg-opacity-25 border-secondary h-100">
          <img src="${img.preview_url}" class="card-img-top" style="height:180px; object-fit:cover;">
          <div class="card-body">
            <h6 class="text-warning mb-1">${img.style_code || ''}</h6>
            <p class="small mb-1">${img.title}</p>
            <p class="small mb-2">RM${img.price}</p>
            <button class="btn btn-sm btn-outline-danger w-100" onclick="removeFavorite('${fav.id}')">Remove</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function removeFavorite(favoriteId) {
  const { error } = await supabaseClient
    .from('favorites')
    .delete()
    .eq('id', favoriteId);

  if (error) {
    alert('Error: ' + error.message);
    return;
  }

  loadFavorites();
}

// ---- LOAD CART ----
async function loadCart() {
  const container = document.getElementById('cartContainer');
  container.innerHTML = `<p class="text-secondary">Loading...</p>`;

  const { data, error } = await supabaseClient
    .from('cart_items')
    .select('id, quantity, image_id, images(id, title, style_code, category, preview_url, price)')
    .eq('user_id', currentUser.id);

  if (error) {
    container.innerHTML = `<p class="text-danger">${error.message}</p>`;
    return;
  }

  if (!data.length) {
    container.innerHTML = `<p class="text-secondary">Cart anda kosong.</p>`;
    document.getElementById('cartTotal').textContent = '0.00';
    return;
  }

  let total = 0;

  container.innerHTML = data.map(cartItem => {
    const img = cartItem.images;
    if (!img) return '';
    const subtotal = img.price * cartItem.quantity;
    total += subtotal;
    return `
      <div class="col-md-3 col-6">
        <div class="card bg-secondary bg-opacity-25 border-secondary h-100">
          <img src="${img.preview_url}" class="card-img-top" style="height:180px; object-fit:cover;">
          <div class="card-body">
            <h6 class="text-warning mb-1">${img.style_code || ''}</h6>
            <p class="small mb-1">${img.title}</p>
            <p class="small mb-1">RM${img.price} x ${cartItem.quantity}</p>
            <p class="small mb-2">Subtotal: RM${subtotal.toFixed(2)}</p>
            <button class="btn btn-sm btn-outline-danger w-100" onclick="removeCartItem('${cartItem.id}')">Remove</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('cartTotal').textContent = total.toFixed(2);
}

async function removeCartItem(cartItemId) {
  const { error } = await supabaseClient
    .from('cart_items')
    .delete()
    .eq('id', cartItemId);

  if (error) {
    alert('Error: ' + error.message);
    return;
  }

  loadCart();
}

// Run on page load
initAccountPage();