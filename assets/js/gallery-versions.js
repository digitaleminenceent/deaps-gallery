// assets/js/gallery-versions.js
// Version History module — reusable from Gallery Management

let gvCurrentImageId = null;
let gvCurrentImageTitle = null;
let gvVersions = [];
let gvCompareSelection = [];
let gvModal = null;
let gvPreviewModalInstance = null;
let gvLoadedCount = 0;
const GV_PAGE_SIZE = 10;

const GV_FIELD_LABELS = {
  title: 'Title',
  slug: 'Slug',
  description: 'Description',
  category: 'Category',
  category_id: 'Category ID',
  subcategory_id: 'Subcategory ID',
  is_featured: 'Featured',
  status: 'Status',
  display_order: 'Display Order',
  seo_title: 'SEO Title',
  meta_description: 'Meta Description',
  tags: 'Tags',
  preview_url: 'Preview Image',
  full_res_url: 'Full Res Image'
};

function gvFormatValue(field, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'tags' && Array.isArray(value)) return value.join(', ');
  if (field === 'is_featured') return value ? 'Yes' : 'No';
  if (field === 'preview_url' || field === 'full_res_url') {
    return `<img src="${value}" style="max-height:60px; border-radius:6px;">`;
  }
  return String(value);
}

async function gvOpenHistory(imageId, imageTitle) {
  gvCurrentImageId = imageId;
  gvCurrentImageTitle = imageTitle;
  gvCompareSelection = [];
  gvVersions = [];
  gvLoadedCount = 0;

  if (!gvModal) gvModal = new bootstrap.Modal(document.getElementById('gvHistoryModal'));

  document.getElementById('gvModalTitle').textContent = `Version History — ${imageTitle}`;
  document.getElementById('gvVersionList').innerHTML = `<p class="text-secondary small">Loading...</p>`;
  document.getElementById('gvCompareArea').innerHTML = '';

  gvModal.show();
  await gvLoadMoreVersions();
}

async function gvLoadMoreVersions() {
  const { data, error } = await supabaseClient
    .from('image_versions')
    .select('*')
    .eq('image_id', gvCurrentImageId)
    .order('version_number', { ascending: false })
    .range(gvLoadedCount, gvLoadedCount + GV_PAGE_SIZE - 1);

  if (error) {
    document.getElementById('gvVersionList').innerHTML = `<p class="text-danger small">${error.message}</p>`;
    return;
  }

  gvVersions = gvVersions.concat(data || []);
  gvLoadedCount = gvVersions.length;
  gvRenderList(data ? data.length === GV_PAGE_SIZE : false);
}

function gvRenderList(mayHaveMore) {
  const container = document.getElementById('gvVersionList');

  if (!gvVersions.length) {
    container.innerHTML = `<p class="text-secondary small">Tiada version history untuk item ini lagi. Version baru akan direkod bila anda edit item ini.</p>`;
    return;
  }

  container.innerHTML = gvVersions.map(v => `
    <div class="d-flex align-items-start gap-2 border border-secondary rounded p-2 mb-2">
      <input type="checkbox" class="form-check-input mt-1" onchange="gvToggleCompare(${v.version_number}, this.checked)"
             ${gvCompareSelection.includes(v.version_number) ? 'checked' : ''}>
      <div style="flex:1;">
        <div class="d-flex justify-content-between flex-wrap">
          <strong>Version ${v.version_number}</strong>
          <span class="small text-secondary">${new Date(v.created_at).toLocaleString('en-MY')}</span>
        </div>
        <p class="small text-secondary mb-1">by ${v.admin_email || 'unknown'}</p>
        <p class="small mb-1">Changed: ${(v.changed_fields || []).map(f => GV_FIELD_LABELS[f] || f).join(', ') || '—'}</p>
        ${v.notes ? `<p class="small text-warning mb-2"><i class="bi bi-sticky"></i> ${v.notes}</p>` : ''}
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-info" onclick="gvViewVersion(${v.version_number})"><i class="bi bi-eye"></i> View</button>
          <button class="btn btn-sm btn-outline-warning" onclick="gvRestoreVersion(${v.version_number})"><i class="bi bi-arrow-counterclockwise"></i> Restore This Version</button>
        </div>
      </div>
    </div>
  `).join('') + `
    <div class="text-center mt-2 mb-2">
      <button class="btn btn-sm btn-outline-light" onclick="gvCompareSelected()" ${gvCompareSelection.length !== 2 ? 'disabled' : ''}>
        <i class="bi bi-arrow-left-right"></i> Compare Selected (${gvCompareSelection.length}/2)
      </button>
    </div>
    ${mayHaveMore ? `<div class="text-center"><button class="btn btn-sm btn-outline-secondary" onclick="gvLoadMoreVersions()">Load More Versions</button></div>` : ''}
  `;
}

function gvToggleCompare(versionNumber, checked) {
  if (checked) {
    if (gvCompareSelection.length >= 2) {
      gvCompareSelection.shift();
    }
    gvCompareSelection.push(versionNumber);
  } else {
    gvCompareSelection = gvCompareSelection.filter(v => v !== versionNumber);
  }
  gvRenderList(gvVersions.length >= GV_PAGE_SIZE);
}

function gvViewVersion(versionNumber) {
  const v = gvVersions.find(x => x.version_number === versionNumber);
  if (!v) return;

  const rows = Object.keys(GV_FIELD_LABELS).map(field => `
    <tr>
      <td class="text-secondary small">${GV_FIELD_LABELS[field]}</td>
      <td class="small">${gvFormatValue(field, v[field])}</td>
    </tr>
  `).join('');

  document.getElementById('gvCompareArea').innerHTML = `
    <h6 class="mt-3">Version ${v.version_number} — Full Details</h6>
    ${v.notes ? `<p class="small text-warning"><i class="bi bi-sticky"></i> ${v.notes}</p>` : ''}
    <table class="table table-dark table-sm">${rows}</table>
  `;
}

function gvCompareSelected() {
  if (gvCompareSelection.length !== 2) return;

  const [a, b] = gvCompareSelection.slice().sort((x, y) => x - y);
  const versionA = gvVersions.find(v => v.version_number === a);
  const versionB = gvVersions.find(v => v.version_number === b);
  if (!versionA || !versionB) return;

  const rows = Object.keys(GV_FIELD_LABELS).map(field => {
    const differs = versionValuesDifferGv(versionA[field], versionB[field]);
    const highlight = differs ? 'style="background:rgba(212,175,55,.12);"' : '';
    return `
      <tr ${highlight}>
        <td class="text-secondary small">${GV_FIELD_LABELS[field]}</td>
        <td class="small">${gvFormatValue(field, versionA[field])}</td>
        <td class="small">${gvFormatValue(field, versionB[field])}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('gvCompareArea').innerHTML = `
    <h6 class="mt-3">Comparing Version ${a} vs Version ${b}</h6>
    <p class="small text-secondary">Baris bertona emas menunjukkan field yang berbeza.</p>
    <table class="table table-dark table-sm">
      <thead><tr><th>Field</th><th>Version ${a}</th><th>Version ${b}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function versionValuesDifferGv(a, b) {
  return JSON.stringify(a === undefined ? null : a) !== JSON.stringify(b === undefined ? null : b);
}

// ---- RECOVERY PREVIEW MODAL (shared with Restore Version) ----
function gvShowPreview({ title, bodyHtml, confirmLabel, onConfirm }) {
  if (!gvPreviewModalInstance) gvPreviewModalInstance = new bootstrap.Modal(document.getElementById('gvPreviewModal'));

  document.getElementById('gvPreviewTitle').textContent = title;
  document.getElementById('gvPreviewBody').innerHTML = bodyHtml;

  const btn = document.getElementById('gvPreviewConfirmBtn');
  btn.textContent = confirmLabel;
  const freshBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(freshBtn, btn);
  freshBtn.addEventListener('click', async () => {
    const noteInput = document.getElementById('gvRestoreNote');
    const note = noteInput ? noteInput.value.trim() : '';
    gvPreviewModalInstance.hide();
    await onConfirm(note);
  });

  gvPreviewModalInstance.show();
}

async function gvRestoreVersion(versionNumber) {
  const version = gvVersions.find(v => v.version_number === versionNumber);
  if (!version) return;

  const previewRows = Object.keys(GV_FIELD_LABELS).slice(0, 6).map(field => `
    <tr><td class="text-secondary small">${GV_FIELD_LABELS[field]}</td><td class="small">${gvFormatValue(field, version[field])}</td></tr>
  `).join('');

  gvShowPreview({
    title: `Restore Version ${versionNumber}?`,
    bodyHtml: `
      <p class="small">Item <strong>${gvCurrentImageTitle}</strong> akan dipulihkan tepat kepada nilai Version ${versionNumber}:</p>
      <table class="table table-dark table-sm">${previewRows}</table>
      <p class="small text-secondary">Keadaan semasa akan disimpan dulu sebagai version baru sebelum restore berlaku (boleh diundur).</p>
      <label class="form-label small">Nota restore (optional)</label>
      <input type="text" id="gvRestoreNote" class="form-control form-control-sm" placeholder="Contoh: Restore sebab tersalah edit harga">
    `,
    confirmLabel: `Restore Version ${versionNumber}`,
    onConfirm: async (note) => {
      const { data: currentRow, error: fetchError } = await supabaseClient
        .from('images')
        .select('*')
        .eq('id', gvCurrentImageId)
        .single();

      if (fetchError || !currentRow) {
        gvShowToast('Gagal ambil data semasa: ' + (fetchError ? fetchError.message : 'unknown'), 'danger');
        return;
      }

      const trackedFields = Object.keys(GV_FIELD_LABELS);
      const changedFromCurrent = trackedFields.filter(f => versionValuesDifferGv(currentRow[f], version[f]));

      if (changedFromCurrent.length) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        const nextVersionNumber = Math.max(...gvVersions.map(v => v.version_number), 0) + 1;

        const snapshot = {};
        trackedFields.forEach(f => { snapshot[f] = currentRow[f] ?? null; });

        await supabaseClient.from('image_versions').insert({
          image_id: gvCurrentImageId,
          version_number: nextVersionNumber,
          ...snapshot,
          changed_fields: changedFromCurrent,
          admin_id: user ? user.id : null,
          admin_email: user ? user.email : 'unknown',
          notes: note || null
        });

        const restorePayload = {};
        trackedFields.forEach(f => { restorePayload[f] = version[f]; });

        const { error: updateError } = await supabaseClient
          .from('images')
          .update(restorePayload)
          .eq('id', gvCurrentImageId);

        if (updateError) {
          gvShowToast('Gagal restore: ' + updateError.message, 'danger');
          return;
        }

        await supabaseClient.from('audit_log').insert({
          admin_id: user ? user.id : null,
          admin_email: user ? user.email : 'unknown',
          action: 'version_restore',
          entity_type: 'image',
          entity_id: gvCurrentImageId,
          entity_name: currentRow.title
        });
      }

      gvShowToast(`Version ${versionNumber} berjaya di-restore!`);
      gvModal.hide();

      if (typeof gmResetAndFetch === 'function') gmResetAndFetch();
    }
  });
}

function gvShowToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) { alert(message); return; }
  const bg = type === 'success' ? 'text-bg-success' : 'text-bg-danger';
  const el = document.createElement('div');
  el.className = `toast align-items-center ${bg} border-0`;
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  container.appendChild(el);
  const toast = new bootstrap.Toast(el, { delay: 3000 });
  toast.show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}