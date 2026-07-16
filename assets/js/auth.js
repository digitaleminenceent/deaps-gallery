// assets/js/auth.js

// ---- SIGN UP ----
document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;
  const phone = document.getElementById('signupPhone').value;
  const consent = document.getElementById('marketingConsent').checked;
  const errorBox = document.getElementById('signupError');
  errorBox.textContent = '';

  const { data, error } = await supabaseClient.auth.signUp({ email, password });

  if (error) {
    errorBox.textContent = error.message;
    return;
  }

  await supabaseClient.from('profiles').insert({
    id: data.user.id,
    phone_number: phone,
    marketing_consent: consent,
    consent_timestamp: consent ? new Date().toISOString() : null
  });

  alert('Sign up berjaya! Sila check email untuk verify akaun anda.');
  bootstrap.Modal.getInstance(document.getElementById('signupModal')).hide();
});

// ---- LOGIN ----
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errorBox = document.getElementById('loginError');
  errorBox.textContent = '';

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    errorBox.textContent = error.message;
    return;
  }

  bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
  updateAuthUI();
});

// ---- CHECK LOGIN STATUS & UPDATE NAVBAR ----
async function updateAuthUI() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  const authArea = document.getElementById('authArea');

  if (user) {
    authArea.innerHTML = `
      <span class="text-white small me-2">${user.email}</span>
      <button class="btn btn-outline-light btn-sm" id="logoutBtn">Logout</button>
    `;
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      updateAuthUI();
    });
  } else {
    authArea.innerHTML = `
      <button class="btn btn-outline-warning btn-sm" data-bs-toggle="modal" data-bs-target="#loginModal">Login</button>
      <button class="btn btn-warning btn-sm" data-bs-toggle="modal" data-bs-target="#signupModal">Sign Up</button>
    `;
  }
}

// Run on page load
updateAuthUI();