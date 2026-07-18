let gmCategories = [];
let gmData = [];
let gmViewMode = 'card';
let gmPageSize = 20;
let gmOffset = 0;
let gmTotalCount = 0;
let gmNoMore = false;
let currentAdmin = null;
let gmSelectedIds = new Set();

async function gmCheckAuth() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        window.location.href = 'admin.html';
        return;
    }
    currentAdmin = user;
    const authArea = document.getElementById('authArea');
    authArea.innerHTML = `<span class="text-white small me-2">${user.email}</span><button class="btn btn-outline-light btn-sm" id="gmLogoutBtn">Logout</button>`;
    document.getElementById('gmLogoutBtn').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = 'admin.html';
    });
}

async function gmLoadCategories() {
    const { data } = await supabaseClient.from('categories').select('id, name, slug').eq('is_active', true).order('display_order');
    gmCategories = data || [];
    const sel = document.getElementById('gmCategoryFilter');
    sel.innerHTML = '<option value="">All Categories</option>' + gmCategories.map(c => `<option value="${c.slug}">${c.name}</option>`).join('');
}

async function gmLoadStats() {
    const base = () => supabaseClient.from('images').select('id', { count: 'exact', head: true }).is('deleted_at', null);
    const [total, draft, published, featured, archived] = await Promise.all([
        base(),
        base().eq('status', 'draft'),
        base().eq('status', 'published'),
        base().eq('is_featured', true),
        base().eq('status', 'archived')
    ]);
    document.getElementById('statTotal').textContent = total.count ?? 0;
    document.getElementById('statDraft').textContent = draft.count ?? 0;
    document.getElementById('statPublished').textContent = published.count ?? 0;
    document.getElementById('statFeatured').textContent = featured.count ?? 0;
    document.getElementById('statArchived').textContent = archived.count ?? 0;
}

function gmBuildQuery() {
    let q = supabaseClient
        .from('images')
        .select('id, title, slug, description, category, category_id, subcategory_id, subcategories(name), preview_url, price, style_code, is_featured, status, created_at, updated_at, tags', { count: 'exact' })
        .is('deleted_at', null);

    const keyword = document.getElementById('gmSearch').value.trim();
    if (keyword) q = q.or(`title.ilike.%${keyword}%,slug.ilike.%${keyword}%,style_code.ilike.%${keyword}%`);

    const cat = document.getElementById('gmCategoryFilter').value;
    if (cat) q = q.eq('category', cat);

    const status = document.getElementById('gmStatusFilter').value;
    if (status) q = q.eq('status', status);

    const featured = document.getElementById('gmFeaturedFilter').value;
    if (featured) q = q.eq('is_featured', true);

    const sortMap = {
        latest: { col: 'created_at', asc: false },
        oldest: { col: 'created_at', asc: true },
        az: { col: 'title', asc: true },
        updated: { col: 'updated_at', asc: false },
        display_order: { col: 'display_order', asc: true }
    };
    const s = sortMap[document.getElementById('gmSort').value] || sortMap.latest;
    q = q.order(s.col, { ascending: s.asc });

    return q;
}

async function gmResetAndFetch() {
    gmOffset = 0;
    gmNoMore = false;
    const { data, error, count } = await gmBuildQuery().range(0, gmPageSize - 1);
    if (error) { console.error(error); return; }
    gmData = data || [];
    gmTotalCount = count || 0;
    if (gmData.length < gmPageSize) gmNoMore = true;
    gmOffset = gmData.length;
    document.getElementById('gmResultCount').textContent = `${gmTotalCount} galleries found`;
    document.getElementById('gmLoadMoreWrap').style.display = gmNoMore ? 'none' : 'block';
    gmRenderList();
}

async function gmLoadMore() {
    if (gmNoMore) return;
    const { data, error } = await gmBuildQuery().range(gmOffset, gmOffset + gmPageSize - 1);
    if (error) return;
    gmData = gmData.concat(data || []);
    if ((data || []).length < gmPageSize) gmNoMore = true;
    gmOffset = gmData.length;
    document.getElementById('gmLoadMoreWrap').style.display = gmNoMore ? 'none' : 'block';
    gmRenderList();
}

function gmStatusBadge(status) {
    const map = { draft: 'bg-secondary', published: 'bg-success', archived: 'bg-danger' };
    return `<span class="badge ${map[status] || 'bg-secondary'} gm-badge-status">${status || 'published'}</span>`;
}

function gmCheckbox(item) {
    const checked = gmSelectedIds.has(item.id) ? 'checked' : '';
    return `<input type="checkbox" class="form-check-input gm-item-checkbox" data-id="${item.id}" ${checked} onclick="gmToggleSelect('${item.id}', this.checked)">`;
}

function gmToggleSelect(id, checked) {
    if (checked) gmSelectedIds.add(id);
    else gmSelectedIds.delete(id);
    gmUpdateBulkToolbar();
}

function gmUpdateBulkToolbar() {
    const toolbar = document.getElementById('gmBulkToolbar');
    const count = gmSelectedIds.size;
    document.getElementById('gmSelectedCount').textContent = `${count} selected`;
    toolbar.style.display = count > 0 ? 'flex' : 'none';
}

function gmClearSelection() {
    gmSelectedIds.clear();
    gmUpdateBulkToolbar();
    gmRenderList();
}

function gmRenderList() {
    const container = document.getElementById('gmListContainer');
    if (!gmData.length) {
        container.innerHTML = `<div class="text-center py-5 text-secondary"><i class="bi bi-inbox" style="font-size:2.5rem;"></i><p class="mt-2">No galleries found.</p></div>`;
        return;
    }

    if (gmViewMode === 'table') {
        container.innerHTML = `
        <div class="table-responsive">
        <table class="table table-dark table-hover gm-table align-middle">
        <thead><tr><th></th><th>Thumb</th><th>Title</th><th>Slug</th><th>Category</th><th>Subcategory</th><th>Status</th><th>Featured</th><th>Created</th><th>Updated</th><th>Actions</th></tr></thead>
        <tbody>
        ${gmData.map(item => `
            <tr>
                <td>${gmCheckbox(item)}</td>
                <td><img src="${item.preview_url}" alt=""></td>
                <td>${item.title}</td>
                <td class="text-secondary small">${item.slug || '—'}</td>
                <td>${item.category || ''}</td>
                <td class="text-secondary small">${item.subcategories ? item.subcategories.name : '—'}</td>
                <td>${gmStatusBadge(item.status)}</td>
                <td>${item.is_featured ? '<i class="bi bi-star-fill text-warning"></i>' : ''}</td>
                <td class="small text-secondary">${new Date(item.created_at).toLocaleDateString()}</td>
                <td class="small text-secondary">${item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '—'}</td>
                <td>${gmActionButtons(item)}</td>
            </tr>
        `).join('')}
        </tbody></table></div>`;
    } else {
        const colClass = gmViewMode === 'compact' ? 'col-lg-2 col-md-3 col-4' : 'col-lg-3 col-md-4 col-6';
        const cardClass = gmViewMode === 'compact' ? 'gm-item-card gm-item-compact' : 'gm-item-card';
        container.innerHTML = `<div class="row g-3">` + gmData.map(item => `
            <div class="${colClass}">
                <div class="${cardClass}">
                    <img src="${item.preview_url}" alt="${item.title}">
                    <div class="p-2">
                        <div class="d-flex justify-content-between align-items-start mb-1">
                            ${gmCheckbox(item)}
                            ${gmStatusBadge(item.status)}
                            ${item.is_featured ? '<i class="bi bi-star-fill text-warning"></i>' : ''}
                        </div>
                        <h6 class="mb-1 small">${item.title}</h6>
                        <p class="text-secondary small mb-2">${item.category || ''}</p>
                        <div class="d-flex flex-wrap gap-1">${gmActionButtons(item)}</div>
                    </div>
                </div>
            </div>
        `).join('') + `</div>`;
    }
}

function gmActionButtons(item) {
    return `
        <button class="btn btn-outline-info btn-sm" title="Preview" onclick="gmPreview('${item.category}','${item.style_code || item.id}')"><i class="bi bi-eye"></i></button>
        <button class="btn btn-outline-info btn-sm" title="Copy Preview URL" onclick="gmCopyPreviewUrl('${item.category}','${item.style_code || item.id}')"><i class="bi bi-link-45deg"></i></button>
        <button class="btn btn-outline-secondary btn-sm" title="Edit" onclick="gmEditItem('${item.id}')"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-outline-secondary btn-sm" title="Duplicate" onclick="gmDuplicateItem('${item.id}')"><i class="bi bi-files"></i></button>
        ${item.status !== 'archived'
            ? `<button class="btn btn-outline-warning btn-sm" title="Archive" onclick="gmArchive('${item.id}')"><i class="bi bi-archive"></i></button>`
            : `<button class="btn btn-outline-success btn-sm" title="Restore" onclick="gmRestore('${item.id}')"><i class="bi bi-arrow-counterclockwise"></i></button>`}
        <button class="btn btn-outline-danger btn-sm" title="Delete" onclick="gmDelete('${item.id}')"><i class="bi bi-trash"></i></button>
    `;
}

function gmPreviewUrl(category, styleParam) {
    return `${window.location.origin}/gallery.html?category=${encodeURIComponent(category)}&style=${encodeURIComponent(styleParam)}`;
}

async function gmCopyPreviewUrl(category, styleParam) {
    const url = gmPreviewUrl(category, styleParam);
    try {
        await navigator.clipboard.writeText(url);
        showToast('Preview URL disalin ke clipboard!');
    } catch (e) {
        showToast('Gagal salin URL: ' + e.message, 'error');
    }
}

function gmEditItem(id) {
    window.location.href = `admin.html?editId=${id}`;
}

function gmDuplicateItem(id) {
    window.location.href = `admin.html?editId=${id}&duplicate=1`;
}

function gmComingSoon() {
    showToast('This action is coming in a future update.', 'error');
}

function gmPreview(category, styleParam) {
    window.open(`gallery.html?category=${encodeURIComponent(category)}&style=${encodeURIComponent(styleParam)}`, '_blank');
}

async function gmLogAudit(action, imageId) {
    try {
        await supabaseClient.from('audit_log').insert({
            admin_id: currentAdmin ? currentAdmin.id : null,
            admin_email: currentAdmin ? currentAdmin.email : null,
            action, entity_type: 'image', entity_id: imageId, entity_name: null
        });
    } catch (e) {}
}

async function gmArchive(id) {
    if (!confirm('Archive this gallery item? It will be hidden from the live site.')) return;
    const { error } = await supabaseClient.from('images').update({ status: 'archived', archived_at: new Date().toISOString(), is_active: false }).eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    await gmLogAudit('archive', id);
    showToast('Gallery archived.');
    gmResetAndFetch();
    gmLoadStats();
}

async function gmRestore(id) {
    const { error } = await supabaseClient.from('images').update({ status: 'published', archived_at: null, is_active: true }).eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    await gmLogAudit('restore', id);
    showToast('Gallery restored.');
    gmResetAndFetch();
    gmLoadStats();
}

async function gmDelete(id) {
    if (!confirm('Move this item to the Recycle Bin? This does not permanently delete it yet.')) return;
    const { error } = await supabaseClient.from('images').update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    await gmLogAudit('delete', id);
    showToast('Moved to Recycle Bin.');
    gmResetAndFetch();
    gmLoadStats();
}

async function gmRunWithProgress(ids, workerFn) {
    const wrap = document.getElementById('gmProgressWrap');
    const bar = document.getElementById('gmProgressBar');
    wrap.style.display = 'block';
    let done = 0;
    for (const id of ids) {
        try { await workerFn(id); } catch (e) { console.error(e); }
        done++;
        const pct = Math.round((done / ids.length) * 100);
        bar.style.width = pct + '%';
        bar.textContent = `${pct}% (${done}/${ids.length})`;
    }
    setTimeout(() => { wrap.style.display = 'none'; bar.style.width = '0%'; }, 800);
}

async function gmBulkAction(action) {
    const ids = Array.from(gmSelectedIds);
    if (!ids.length) return;

    const confirmMsg = {
        publish: 'Publish selected items?',
        unpublish: 'Move selected items to Draft?',
        archive: 'Archive selected items?',
        restore: 'Restore selected items to Published?',
        feature: 'Mark selected items as Featured?',
        unfeature: 'Remove Featured from selected items?',
        duplicate: 'Duplicate selected items as Drafts?',
        delete: 'Move selected items to Recycle Bin? This cannot be undone from here.'
    }[action];
    if (!confirm(confirmMsg)) return;

    const updateMap = {
        publish: { status: 'published', is_active: true },
        unpublish: { status: 'draft', is_active: false },
        archive: { status: 'archived', archived_at: new Date().toISOString(), is_active: false },
        restore: { status: 'published', archived_at: null, is_active: true },
        feature: { is_featured: true },
        unfeature: { is_featured: false }
    };

    if (action === 'delete') {
        await gmRunWithProgress(ids, async (id) => {
            await supabaseClient.from('images').update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id);
            await gmLogAudit('bulk_delete', id);
        });
    } else if (action === 'duplicate') {
        await gmRunWithProgress(ids, async (id) => {
            const { data: full } = await supabaseClient.from('images').select('*').eq('id', id).single();
            if (!full) return;
            const copy = { ...full };
            delete copy.id;
            delete copy.created_at;
            delete copy.updated_at;
            copy.status = 'draft';
            copy.is_active = false;
            copy.slug = (copy.slug || '') + '-copy-' + Date.now();
            await supabaseClient.from('images').insert(copy);
            await gmLogAudit('bulk_duplicate', id);
        });
    } else {
        const payload = updateMap[action];
        await gmRunWithProgress(ids, async (id) => {
            await supabaseClient.from('images').update(payload).eq('id', id);
            await gmLogAudit(`bulk_${action}`, id);
        });
    }

    showToast(`Bulk ${action} complete for ${ids.length} item(s).`);
    gmClearSelection();
    gmResetAndFetch();
    gmLoadStats();
}

function gmShowMoveCategoryUI() {
    const sel = document.getElementById('gmBulkCategorySelect');
    const btn = document.getElementById('gmBulkMoveCategoryBtn');
    sel.innerHTML = gmCategories.map(c => `<option value="${c.slug}" data-id="${c.id}">${c.name}</option>`).join('');
    sel.style.display = sel.style.display === 'none' ? 'inline-block' : 'none';
    btn.style.display = btn.style.display === 'none' ? 'inline-block' : 'none';
}

async function gmBulkMoveCategory() {
    const ids = Array.from(gmSelectedIds);
    if (!ids.length) return;
    const sel = document.getElementById('gmBulkCategorySelect');
    const selectedOption = sel.options[sel.selectedIndex];
    if (!selectedOption) return;
    const categorySlug = selectedOption.value;
    const categoryId = selectedOption.dataset.id;

    if (!confirm(`Move ${ids.length} item(s) to "${selectedOption.textContent}"?`)) return;

    await gmRunWithProgress(ids, async (id) => {
        await supabaseClient.from('images').update({ category: categorySlug, category_id: categoryId, subcategory_id: null }).eq('id', id);
        await gmLogAudit('bulk_move_category', id);
    });

    showToast(`Moved ${ids.length} item(s) to ${selectedOption.textContent}.`);
    gmClearSelection();
    gmResetAndFetch();
}

function showToast(message, type = 'success') {
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

function gmSetView(mode) {
    gmViewMode = mode;
    ['gmViewCard', 'gmViewCompact', 'gmViewTable'].forEach(id => document.getElementById(id).classList.remove('active'));
    document.getElementById(mode === 'card' ? 'gmViewCard' : mode === 'compact' ? 'gmViewCompact' : 'gmViewTable').classList.add('active');
    gmRenderList();
}

document.getElementById('gmViewCard').addEventListener('click', () => gmSetView('card'));
document.getElementById('gmViewCompact').addEventListener('click', () => gmSetView('compact'));
document.getElementById('gmViewTable').addEventListener('click', () => gmSetView('table'));
document.getElementById('gmLoadMoreBtn').addEventListener('click', gmLoadMore);

document.getElementById('gmSelectAll').addEventListener('change', (e) => {
    if (e.target.checked) gmData.forEach(item => gmSelectedIds.add(item.id));
    else gmData.forEach(item => gmSelectedIds.delete(item.id));
    gmUpdateBulkToolbar();
    gmRenderList();
});

let gmSearchDebounce = null;
document.getElementById('gmSearch').addEventListener('input', () => {
    clearTimeout(gmSearchDebounce);
    gmSearchDebounce = setTimeout(gmResetAndFetch, 300);
});
document.getElementById('gmCategoryFilter').addEventListener('change', gmResetAndFetch);
document.getElementById('gmStatusFilter').addEventListener('change', gmResetAndFetch);
document.getElementById('gmFeaturedFilter').addEventListener('change', gmResetAndFetch);
document.getElementById('gmSort').addEventListener('change', gmResetAndFetch);

async function gmLoadRecentActivity() {
    const { data, error } = await supabaseClient
        .from('audit_log')
        .select('action, entity_type, entity_name, admin_email, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    const box = document.getElementById('gmRecentActivity');
    if (!box) return;

    if (error || !data || !data.length) {
        box.innerHTML = `<p class="text-secondary small mb-0">Tiada aktiviti lagi.</p>`;
        return;
    }

    box.innerHTML = data.map(entry => `
        <div class="d-flex justify-content-between small py-1 border-bottom border-secondary">
            <span>
                <strong>${(entry.action || '').replace(/_/g, ' ')}</strong>
                ${entry.entity_type ? `<span class="text-secondary">— ${entry.entity_type}</span>` : ''}
                ${entry.entity_name ? `<span class="text-secondary">"${entry.entity_name}"</span>` : ''}
            </span>
            <span class="text-secondary">${new Date(entry.created_at).toLocaleString('en-MY', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
        </div>
    `).join('');
}

(async function init() {
    await gmCheckAuth();
    await gmLoadCategories();
    await gmLoadStats();
    await gmLoadRecentActivity();
    await gmResetAndFetch();
})();