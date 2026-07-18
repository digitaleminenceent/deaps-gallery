let alData = [];
let alOffset = 0;
let alPageSize = 25;
let alNoMore = false;

async function alCheckAuth() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) { window.location.href = 'admin.html'; return; }

    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') {
        document.body.innerHTML = '<div class="container py-5 text-center"><p class="text-danger">Access Denied.</p></div>';
        return false;
    }

    const authArea = document.getElementById('authArea');
    authArea.innerHTML = `<span class="text-white small me-2">${user.email}</span><button class="btn btn-outline-light btn-sm" id="alLogoutBtn">Logout</button>`;
    document.getElementById('alLogoutBtn').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = 'admin.html';
    });
    return true;
}

const ACTION_ICON = {
    create: 'bi-plus-circle',
    update: 'bi-pencil',
    duplicate: 'bi-files',
    archive: 'bi-archive',
    restore: 'bi-arrow-counterclockwise',
    restore_from_bin: 'bi-arrow-counterclockwise',
    delete: 'bi-trash',
    permanent_delete: 'bi-trash3-fill',
    activate: 'bi-check-circle',
    deactivate: 'bi-x-circle'
};

function alIconFor(action) {
    for (const key in ACTION_ICON) {
        if (action && action.includes(key)) return ACTION_ICON[key];
    }
    return 'bi-dot';
}

function alBuildQuery() {
    let q = supabaseClient.from('audit_log').select('*').order('created_at', { ascending: false });

    const entity = document.getElementById('alEntityFilter').value;
    if (entity) q = q.eq('entity_type', entity);

    const action = document.getElementById('alActionFilter').value;
    if (action) q = q.ilike('action', `%${action}%`);

    const from = document.getElementById('alDateFrom').value;
    if (from) q = q.gte('created_at', from + 'T00:00:00');

    const to = document.getElementById('alDateTo').value;
    if (to) q = q.lte('created_at', to + 'T23:59:59');

    return q;
}

async function alResetAndFetch() {
    alOffset = 0;
    alNoMore = false;
    const { data, error } = await alBuildQuery().range(0, alPageSize - 1);
    if (error) {
        document.getElementById('alTimelineContainer').innerHTML = `<p class="text-danger">${error.message}</p>`;
        return;
    }
    alData = data || [];
    if (alData.length < alPageSize) alNoMore = true;
    alOffset = alData.length;
    document.getElementById('alResultCount').textContent = `${alData.length} entries loaded`;
    document.getElementById('alLoadMoreWrap').style.display = alNoMore ? 'none' : 'block';
    alRender();
}

async function alLoadMore() {
    if (alNoMore) return;
    const { data, error } = await alBuildQuery().range(alOffset, alOffset + alPageSize - 1);
    if (error) return;
    alData = alData.concat(data || []);
    if ((data || []).length < alPageSize) alNoMore = true;
    alOffset = alData.length;
    document.getElementById('alResultCount').textContent = `${alData.length} entries loaded`;
    document.getElementById('alLoadMoreWrap').style.display = alNoMore ? 'none' : 'block';
    alRender();
}

function alFormatAction(action) {
    return (action || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function alRender() {
    const container = document.getElementById('alTimelineContainer');

    if (!alData.length) {
        container.innerHTML = `<div class="text-center py-5 text-secondary"><i class="bi bi-clock-history" style="font-size:2.5rem;"></i><p class="mt-2">Tiada aktiviti dijumpai.</p></div>`;
        return;
    }

    container.innerHTML = alData.map(entry => `
        <div class="al-entry">
            <div class="al-dot"><i class="bi ${alIconFor(entry.action)}"></i></div>
            <div class="al-card">
                <div class="d-flex justify-content-between flex-wrap">
                    <strong>${alFormatAction(entry.action)}</strong>
                    <span class="small text-secondary">${new Date(entry.created_at).toLocaleString('en-MY')}</span>
                </div>
                <p class="small mb-1">
                    <span class="badge bg-secondary">${entry.entity_type || ''}</span>
                    ${entry.entity_name ? `<strong>${entry.entity_name}</strong>` : (entry.entity_id ? `<span class="text-secondary">${entry.entity_id}</span>` : '')}
                </p>
                <p class="small text-secondary mb-0">by ${entry.admin_email || 'system'}</p>
            </div>
        </div>
    `).join('');
}

document.getElementById('alEntityFilter').addEventListener('change', alResetAndFetch);
document.getElementById('alActionFilter').addEventListener('change', alResetAndFetch);
document.getElementById('alDateFrom').addEventListener('change', alResetAndFetch);
document.getElementById('alDateTo').addEventListener('change', alResetAndFetch);
document.getElementById('alLoadMoreBtn').addEventListener('click', alLoadMore);

(async function init() {
    const ok = await alCheckAuth();
    if (ok) await alResetAndFetch();
})();