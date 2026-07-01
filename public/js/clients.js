'use strict';

let clientsCache = [];
let editingClientId = null;

async function loadClientsList() {
  const q    = document.getElementById('clients-search')?.value.trim() || '';
  const body = document.getElementById('clients-body');
  if (!body) return;

  body.innerHTML = '<tr><td colspan="6" class="history-empty">Loading…</td></tr>';

  try {
    const url = q ? `/api/clients?q=${encodeURIComponent(q)}` : '/api/clients';
    clientsCache = await apiFetch(url);

    if (!clientsCache.length) {
      body.innerHTML = '<tr><td colspan="6" class="history-empty">No clients found.</td></tr>';
      return;
    }

    body.innerHTML = clientsCache.map(c => `
      <tr>
        <td><strong>${escapeClientHtml(c.name)}</strong></td>
        <td class="mono">${c.ntn || '—'}</td>
        <td>${c.registration_type}</td>
        <td>${escapeClientHtml(typeof provinceDisplayLabel === 'function' ? provinceDisplayLabel(c.province) : c.province)}</td>
        <td>${escapeClientHtml(c.email || '—')}</td>
        <td class="history-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-edit-client="${c.id}">Edit</button>
          <button type="button" class="btn btn-danger btn-sm" data-del-client="${c.id}">Delete</button>
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('[data-edit-client]').forEach(btn => {
      btn.addEventListener('click', () => openClientForm(btn.dataset.editClient));
    });
    body.querySelectorAll('[data-del-client]').forEach(btn => {
      btn.addEventListener('click', () => deleteClientRecord(btn.dataset.delClient));
    });
    if (typeof refreshLucideIcons === 'function') refreshLucideIcons(body);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="history-empty" style="color:var(--red)">${err.message}</td></tr>`;
  }
}

function escapeClientHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function openClientForm(id) {
  editingClientId = id || null;
  const panel = document.getElementById('client-form-panel');
  const title = document.getElementById('client-form-title');
  panel.style.display = 'block';
  title.textContent = id ? 'Edit Client' : 'Add Client';

  document.getElementById('client-form').reset();

  if (id) {
    const c = clientsCache.find(x => x.id === id);
    if (c) {
      document.getElementById('client-name').value              = c.name;
      document.getElementById('client-ntn').value               = c.ntn || '';
      document.getElementById('client-registration-type').value = c.registration_type;
      document.getElementById('client-address').value           = c.address;
      document.getElementById('client-province').value          = normalizeProvinceForFbr(c.province);
      document.getElementById('client-email').value             = c.email || '';
      document.getElementById('client-phone').value             = c.phone || '';
    }
  }

  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeClientForm() {
  editingClientId = null;
  document.getElementById('client-form-panel').style.display = 'none';
}

async function saveClient(e) {
  e.preventDefault();
  const btn = document.getElementById('client-save-btn');
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  const body = {
    name:              document.getElementById('client-name').value.trim(),
    ntn:               document.getElementById('client-ntn').value.trim() || null,
    registration_type: document.getElementById('client-registration-type').value,
    address:           document.getElementById('client-address').value.trim(),
    province:          normalizeProvinceForFbr(document.getElementById('client-province').value),
    email:             document.getElementById('client-email').value.trim() || null,
    phone:             document.getElementById('client-phone').value.trim() || null,
  };

  try {
    if (editingClientId) {
      await apiFetch(`/api/clients/${editingClientId}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await apiFetch('/api/clients', { method: 'POST', body: JSON.stringify(body) });
    }
    closeClientForm();
    await loadClientsList();
    if (typeof refreshClientSelect === 'function') await refreshClientSelect();
  } catch (err) {
    alert('Save failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

async function deleteClientRecord(id) {
  if (!confirm('Delete this client?')) return;
  try {
    await apiFetch(`/api/clients/${id}`, { method: 'DELETE' });
    await loadClientsList();
    if (typeof refreshClientSelect === 'function') await refreshClientSelect();
  } catch (err) {
    alert(err.message);
  }
}

function setupClientsPanel() {
  document.getElementById('clients-search-btn')?.addEventListener('click', loadClientsList);
  document.getElementById('clients-search')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') loadClientsList();
  });
  document.getElementById('client-add-btn')?.addEventListener('click', () => openClientForm(null));
  document.getElementById('client-cancel-btn')?.addEventListener('click', closeClientForm);
  document.getElementById('client-form')?.addEventListener('submit', saveClient);
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof setupClientsPanel === 'function') setupClientsPanel();
});
