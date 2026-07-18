let rbData = [];
let rbSelectedIds = new Set();
let rbCurrentAdmin = null;

async function rbCheckAuth() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) { window.location.href = 'admin.html'; return; }
    rbCurrentAdmin = user;
    const authArea = document.getElementById('authArea');
    authArea.innerHTML = `<span class="text-white small me-2">${user.email}</span><button class="btn btn-outline-light btn-sm" id="rbLogoutBtn">Logout</button>`;
    document.getElementById('rbLogoutBtn').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = 'admin.html';
    });
}

async function rbLoadData() {
    const { data, error } = await supabaseClient
        .from('images')
        .select('id, title, category, preview_url, full_res_url, deleted_at')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

    if (error) {
        document.getElementById('rbListContainer').innerHTML = `<p class="text-danger">${error.message}</p>`;
        return;
    }

    rbData = data || [];
    document.getElementById('rbResultCount').textContent = `${rbData.length} item(s) in Recycle Bin`;
    rbRenderList();
}

function rbDaysAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function rbRenderList() {
    const container = document.getElementById('rbListContainer');

    if (!rbData.length) {
        container.innerHTML = `<div class="text-center py-5 text-secondary"><i class="bi bi-trash3" style="font-size:2.5rem;"></i><p class="mt-2">Recycle Bin kosong.</p></div>`;
        return;
    }

    container.innerHTML = `<div class="row g-3">` + rbData.map(item => {
        const days = rbDaysAgo(item.deleted_at);
        const checked = rbSelectedIds.has(item.id) ? 'checked' : '';
        return `
        <div class="col-lg-3 col-md-4 col-6">
            <div class="rb-item-card">
                <img src="${item.preview_url}" alt="${item.title}">
                <div class="p-2">
                    <div class="d-flex justify-content-between align-items-start mb-1">
                        <input type="checkbox" class="form-check-input rb-item-checkbox" data-id="${item.id}" ${checked} onclick="rbToggleSelect('${item.id}', this.checked)">
                        <span class="badge bg-secondary rb-badge-days">${days} day${days === 1 ? '' : 's'} ago</span>
                    </div>
                    <h6 class="mb-1 small">${item.title}</h6>
                    <p class="text-secondary small mb-2">${item.category || ''}</p>
                    <div class="d-flex gap-1">
                        <button class="btn btn-outline-success btn-sm flex-fill" onclick="rbRestore('${item.id}')"><i class="bi bi-arrow-counterclockwise"></i> Restore</button>
                        <button class="btn btn-outline-danger btn-sm flex-fill" onclick="rbDelete('${item.id}')"><i class="bi bi-trash3"></i></button>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('') + `</div>`;
}

function rbToggleSelect(id, checked) {
    if (checked) rbSelectedIds.add(id);
    else rbSelectedIds.delete(id);
    document.getElementById('rbSelectedCount').textContent = `${rbSelectedIds.size} selected`;
}

document.getElementById('rbSelectAll').addEventListener('change', (e) => {
    if (e.target.checked) rbData.forEach(item => rbSelectedIds.add(item.id));
    else rbSelectedIds.clear();
    document.getElementById('rbSelectedCount').textContent = `${rbSelectedIds.size} selected`;
    rbRenderList();
});

// ---- Extract storage file path from a Supabase public URL ----
function rbExtractStoragePath(publicUrl) {
    if (!publicUrl) return null;
    const marker = '/catalog-images/';
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    return publicUrl.substring(idx + marker.length);
}

async function rbDeleteStorageFiles(item) {
    const paths = [rbExtractStoragePath(item.preview_url), rbExtractStoragePath(item.full_res_url)]
        .filter(Boolean);
    if (!paths.length) return;
    try {
        await supabaseClient.storage.from('catalog-images').remove(paths);
    } catch (e) {
        console.warn('Storage cleanup failed for', item.id, e);
    }
}

async function rbLogAudit(action, imageId, name) {
    try {
        await supabaseClient.from('audit_log').insert({
            admin_id: rbCurrentAdmin ? rbCurrentAdmin.id : null,
            admin_email: rbCurrentAdmin ? rbCurrentAdmin.email : null,
            action, entity_type: 'image', entity_id: imageId, entity_name: name
        });
    } catch (e) {}
}

function rbShowToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const bg = type === 'success' ? 'text-bg-success' : 'text-bg-danger';
    const el = document.createElement('div');
    el.className = `toast align-items-center ${bg} border-0`;
    el.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
    container.appendChild(el);
    const toast = new bootstrap.Toast(el, { delay: 3000 });
    toast.show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
}

async function rbRestore(id) {
    const item = rbData.find(i => i.id === id);
    if (!item) return;

    const { error } = await supabaseClient
        .from('images')
        .update({ deleted_at: null, is_active: true, status: 'draft' })
        .eq('id', id);

    if (error) { rbShowToast(error.message, 'danger'); return; }

    await rbLogAudit('restore_from_bin', id, item.title);
    rbShowToast('Item dipulihkan sebagai Draft. Sila semak di Gallery Management.');
    rbSelectedIds.delete(id);
    rbLoadData();
}

async function rbDelete(id) {
    const item = rbData.find(i => i.id === id);
    if (!item) return;

    if (!confirm(`Padam "${item.title}" secara KEKAL? Fail gambar juga akan dipadam. Tindakan ini tidak boleh diundur.`)) return;

    await rbDeleteStorageFiles(item);

    const { error } = await supabaseClient.from('images').delete().eq('id', id);

    if (error) { rbShowToast(error.message, 'danger'); return; }

    await rbLogAudit('permanent_delete', id, item.title);
    rbShowToast('Item dipadam kekal.');
    rbSelectedIds.delete(id);
    rbLoadData();
}

async function rbBulkRestore() {
    const ids = Array.from(rbSelectedIds);
    if (!ids.length) return;
    if (!confirm(`Restore ${ids.length} item(s)?`)) return;

    for (const id of ids) {
        const item = rbData.find(i => i.id === id);
        await supabaseClient.from('images').update({ deleted_at: null, is_active: true, status: 'draft' }).eq('id', id);
        await rbLogAudit('restore_from_bin', id, item ? item.title : null);
    }

    rbShowToast(`${ids.length} item(s) dipulihkan.`);
    rbSelectedIds.clear();
    rbLoadData();
}

async function rbBulkDelete() {
    const ids = Array.from(rbSelectedIds);
    if (!ids.length) return;
    if (!confirm(`Padam ${ids.length} item(s) secara KEKAL? Fail gambar juga akan dipadam. Tindakan ini tidak boleh diundur.`)) return;

    for (const id of ids) {
        const item = rbData.find(i => i.id === id);
        if (item) await rbDeleteStorageFiles(item);
        await supabaseClient.from('images').delete().eq('id', id);
        await rbLogAudit('permanent_delete', id, item ? item.title : null);
    }

    rbShowToast(`${ids.length} item(s) dipadam kekal.`);
    rbSelectedIds.clear();
    rbLoadData();
}

(async function init() {
    await rbCheckAuth();
    await rbLoadData();
})();