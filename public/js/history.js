'use strict';

// ── History panel (uses apiFetch + activeEnv from app.js) ─────────────────────

function fbrStatusBadgeClass(status) {
  const map = {
    Valid:                      'fbr-valid',
    Edited:                     'fbr-edited',
    Cancelled:                  'fbr-cancelled',
    'Partially Edited':         'fbr-partial-edit',
    'Partially Cancelled':      'fbr-partial-cancel',
    'Partially Edited & Cancelled': 'fbr-partial-both',
  };
  return map[status] || 'fbr-unknown';
}

function fbrItemStatusClass(status) {
  return fbrStatusBadgeClass(status);
}

function renderFbrStatusBadge(status) {
  if (!status) return '—';
  return `<span class="fbr-badge ${fbrStatusBadgeClass(status)}">${status}</span>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderItemStatusesTable(itemStatuses, payloadItems = [], policyItems = []) {
  if (!Array.isArray(itemStatuses) || !itemStatuses.length) return '';

  const policyBySno = Object.fromEntries((policyItems || []).map(p => [p.itemSNo, p]));

  const rows = itemStatuses.map(s => {
    const idx  = Math.max(0, parseInt(s.itemSNo, 10) - 1);
    const desc = payloadItems[idx]?.productDescription || '—';
    const pol  = policyBySno[s.itemSNo];
    let ruleHint = '';
    if (pol) {
      if (pol.isCancelled) ruleHint = '<span class="policy-flag policy-cancelled">Cancelled</span>';
      else if (pol.isEdited) ruleHint = '<span class="policy-flag policy-edited">Edited — no cancel</span>';
      else if (pol.editable) ruleHint = '<span class="policy-flag policy-editable">Editable once</span>';
    }
    return `<tr>
      <td>${s.itemSNo || '—'}</td>
      <td>${escapeHtml(desc)}</td>
      <td><span class="fbr-badge ${fbrItemStatusClass(s.status)}">${s.status || '—'}</span></td>
      <td>${ruleHint || '—'}</td>
      <td class="mono">${s.invoiceNo || '—'}</td>
      <td>${s.errorCode ? escapeHtml(s.errorCode) : '—'}</td>
    </tr>`;
  }).join('');

  return `
    <div class="item-statuses-wrap">
      <h4 class="item-statuses-title">Line Item FBR Status</h4>
      <table class="item-statuses-table">
        <thead>
          <tr>
            <th>Item #</th>
            <th>Description</th>
            <th>FBR Status</th>
            <th>Edit / Cancel Rules</th>
            <th>Item Invoice No.</th>
            <th>Error Code</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderNoteInfoBlock(inv, p) {
  const noteType = inv.note_type || 'sale';
  const isNote   = noteType !== 'sale' || !!p.invoiceRefNo;
  if (!isNote) return '';

  const refNo  = p.invoiceRefNo || '—';
  const reason = inv.note_reason || p.reason || '—';
  const typeLabel = { sale: 'Sale Invoice', debit: 'Debit Note', credit: 'Credit Note' }[noteType]
    || noteType;

  let originalLink = '';
  if (inv.original_invoice_id) {
    originalLink = `
      <div>
        <span class="detail-label">Linked Original</span>
        <button type="button" class="btn btn-ghost btn-sm" data-view-original="${inv.original_invoice_id}">
          <i data-lucide="link"></i> View original invoice
        </button>
      </div>`;
  }

  return `
    <div class="note-info-panel">
      <h4 class="item-statuses-title">Debit / Credit Note</h4>
      <div class="policy-grid">
        <div><span class="detail-label">Note Type</span><span class="note-type-badge note-type-${noteType}">${typeLabel}</span></div>
        <div><span class="detail-label">Reference IRN</span><span class="mono">${escapeHtml(refNo)}</span></div>
        <div><span class="detail-label">Reason</span>${escapeHtml(reason)}</div>
        ${originalLink}
      </div>
    </div>`;
}

function renderEditPolicyPanel(policy, limitInfo) {
  if (!policy || policy.workflowStatus !== 'submitted') return '';

  const deadline = policy.cancelDeadline
    ? new Date(policy.cancelDeadline).toLocaleString()
    : '—';

  let deadlineClass = 'cancel-deadline';
  if (!policy.within72h) deadlineClass += ' expired';
  else if (policy.hoursRemaining <= 12) deadlineClass += ' urgent';

  const cancelStatus = policy.alreadyCancelled
    ? 'Already cancelled on FBR'
    : policy.cancelPending
      ? 'Cancellation pending'
      : policy.cancelAllowed
        ? `Allowed — ${policy.hoursRemaining}h remaining`
        : 'Window expired (72h from submission)';

  let limitHtml = '';
  if (limitInfo) {
    const pct = limitInfo.usedPercent ?? 0;
    const barClass = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : '';
    limitHtml = `
      <div class="limit-inline">
        <div class="limit-inline-label">
          Monthly cancellation limit (${limitInfo.currentMonthLabel})
          — ${formatMoney(limitInfo.cancellationValue)} used of ${formatMoney(limitInfo.cancellationLimit)}
          (${limitInfo.limitPercent}% of ${limitInfo.lastMonthLabel} sales)
        </div>
        <div class="limit-bar limit-bar-sm">
          <div class="limit-bar-fill ${barClass}" style="width:${Math.min(100, pct)}%"></div>
        </div>
        <div class="limit-inline-remaining">Remaining: <strong>${formatMoney(limitInfo.remainingLimit)}</strong></div>
      </div>`;
  }

  return `
    <div class="edit-policy-panel">
      <h4 class="item-statuses-title">FBR Edit &amp; Cancel Rules</h4>
      <div class="policy-grid">
        <div><span class="detail-label">72h Cancel Window</span><span class="${deadlineClass}">${cancelStatus}</span></div>
        <div><span class="detail-label">Cancel Deadline</span><span class="${deadlineClass}">${deadline}</span></div>
        <div><span class="detail-label">Header Fields</span>${policy.headerLocked ? 'Locked after submission' : 'Editable'}</div>
        <div><span class="detail-label">Item Edits</span>${policy.canEditItems ? `${policy.editableItemSnos.length} item(s) editable (once each)` : 'None available'}</div>
      </div>
      ${limitHtml}
      <p class="policy-note">Edited line items cannot be cancelled. Each line item may only be edited once.</p>
    </div>`;
}

function statusBadgeClass(status) {
  const map = {
    draft:      'wf-draft',
    pending:    'wf-pending',
    queued:     'wf-queued',
    processing: 'wf-processing',
    submitted:  'wf-submitted',
    failed:     'wf-failed',
    retrying:   'wf-retrying',
    cancelled:  'wf-cancelled',
  };
  return map[status] || 'wf-pending';
}

function formatRetryInfo(inv) {
  if (!['queued', 'retrying', 'failed'].includes(inv.workflow_status)) return '';
  const parts = [];
  if (inv.retry_count > 0) parts.push(`retry ${inv.retry_count}`);
  if (inv.next_retry_at && ['queued', 'retrying'].includes(inv.workflow_status)) {
    parts.push(`next ${new Date(inv.next_retry_at).toLocaleTimeString()}`);
  }
  return parts.length ? `<div class="retry-hint">${parts.join(' · ')}</div>` : '';
}

function formatMoney(n) {
  const v = parseFloat(n);
  return Number.isFinite(v) ? v.toFixed(2) : '—';
}

function formatDate(d) {
  if (!d) return '—';
  return String(d).slice(0, 10);
}

function historyEmptyMessage(hasFilters) {
  const msg = hasFilters
    ? '<span class="empty-with-icon"><i data-lucide="search"></i> No invoices match your search.</span>'
    : '<span class="empty-with-icon"><i data-lucide="file-text"></i> No invoices yet. Submit your first invoice to get started.</span>';
  return `<tr><td colspan="9" class="history-empty">${msg}</td></tr>`;
}

function getHistoryFilterParams() {
  const q         = document.getElementById('history-search')?.value.trim() || '';
  const status    = document.getElementById('history-status-filter')?.value || '';
  const dateFrom  = document.getElementById('history-date-from')?.value || '';
  const dateTo    = document.getElementById('history-date-to')?.value || '';
  const fbrStatus = document.getElementById('history-fbr-status-filter')?.value || '';

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  if (fbrStatus) params.set('fbrStatus', fbrStatus);
  if (typeof activeEnv !== 'undefined' && activeEnv) {
    params.set('environment', activeEnv);
  }

  return {
    params,
    hasFilters: !!(q || status || dateFrom || dateTo || fbrStatus),
  };
}

let historySearchDebounce = null;

function updateHistorySearchClearVisibility() {
  const input = document.getElementById('history-search');
  const clearBtn = document.getElementById('history-search-clear');
  if (!input || !clearBtn) return;
  clearBtn.style.display = input.value.trim() ? '' : 'none';
}

async function loadHistory() {
  const { params, hasFilters } = getHistoryFilterParams();
  const dateFrom = document.getElementById('history-date-from')?.value || '';
  const dateTo   = document.getElementById('history-date-to')?.value || '';
  const body   = document.getElementById('history-body');
  const count  = document.getElementById('history-count');

  if (dateFrom && dateTo && dateFrom > dateTo) {
    body.innerHTML = '<tr><td colspan="9" class="history-empty" style="color:var(--red)">From date must be on or before To date.</td></tr>';
    count.textContent = '';
    return;
  }

    body.innerHTML = '<tr><td colspan="9" class="history-empty">Loading…</td></tr>';

  try {
    const data = await apiFetch(`/api/invoices?${params.toString()}`);
    const items = data.items || [];

    if (!items.length) {
      body.innerHTML = historyEmptyMessage(hasFilters);
      count.textContent = '0 invoices';
      return;
    }

    body.innerHTML = items.map(inv => `
      <tr>
        <td class="mono">${inv.internal_invoice_no || '—'}</td>
        <td class="mono">${inv.fbr_invoice_number || '—'}</td>
        <td><span class="wf-badge ${statusBadgeClass(inv.workflow_status)}">${inv.workflow_status}</span>${formatRetryInfo(inv)}</td>
        <td>${renderFbrStatusBadge(inv.fbr_status)}</td>
        <td>${inv.buyer_name || '—'}</td>
        <td>${formatDate(inv.invoice_date)}</td>
        <td class="num">${formatMoney(inv.total_amount)}</td>
        <td>${inv.environment || '—'}</td>
        <td class="history-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-view="${inv.id}">View</button>
          ${createExportDropdownHtml(inv.id)}
        </td>
      </tr>
    `).join('');

    count.textContent = `${data.total ?? items.length} invoice(s)`;

    body.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => viewInvoiceDetail(btn.dataset.view));
    });

    body.querySelectorAll('.export-dropdown').forEach(el => bindExportDropdown(el));
    if (typeof refreshLucideIcons === 'function') refreshLucideIcons(body);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="9" class="history-empty" style="color:var(--red)">${err.message}</td></tr>`;
    count.textContent = '';
  }
}

async function viewInvoiceDetail(id) {
  const panel   = document.getElementById('history-detail');
  const content = document.getElementById('history-detail-content');
  const actions = document.getElementById('history-detail-actions');

  panel.style.display = 'block';
  content.innerHTML = '<p>Loading…</p>';
  actions.innerHTML = '';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const envParam = typeof activeEnv !== 'undefined' && activeEnv
      ? `?environment=${encodeURIComponent(activeEnv)}`
      : '';

    const [inv, policy, limitInfo] = await Promise.all([
      apiFetch(`/api/invoices/${id}`),
      apiFetch(`/api/invoices/${id}/edit-policy`).catch(() => null),
      apiFetch(`/api/invoices/cancellation-limit${envParam}`).catch(() => null),
    ]);
    const p   = inv.request_payload || {};

    const itemStatuses = inv.item_statuses
      || inv.response_payload?.validationResponse?.invoiceStatuses
      || [];

    content.innerHTML = `
      <div class="detail-grid">
        <div><span class="detail-label">Internal No.</span><strong>${inv.internal_invoice_no || '—'}</strong></div>
        <div><span class="detail-label">FBR IRN</span><strong class="mono">${inv.fbr_invoice_number || '—'}</strong></div>
        <div><span class="detail-label">Workflow</span><span class="wf-badge ${statusBadgeClass(inv.workflow_status)}">${inv.workflow_status}</span>${formatRetryInfo(inv)}</div>
        <div><span class="detail-label">FBR Status</span>${renderFbrStatusBadge(inv.fbr_status)}</div>
        ${inv.submitted_at ? `<div><span class="detail-label">Submitted At</span>${new Date(inv.submitted_at).toLocaleString()}</div>` : ''}
        ${inv.fbr_cancellation_status ? `<div><span class="detail-label">FBR Cancellation</span>${escapeHtml(inv.fbr_cancellation_status)}</div>` : ''}
        ${inv.retry_count > 0 ? `<div><span class="detail-label">Retry Count</span>${inv.retry_count}</div>` : ''}
        ${inv.next_retry_at ? `<div><span class="detail-label">Next Retry</span>${new Date(inv.next_retry_at).toLocaleString()}</div>` : ''}
        <div><span class="detail-label">Environment</span>${inv.environment || '—'}</div>
        <div><span class="detail-label">Invoice Date</span>${formatDate(inv.invoice_date || p.invoiceDate)}</div>
        <div><span class="detail-label">Scenario</span>${inv.scenario_id || p.scenarioId || '—'}</div>
        <div><span class="detail-label">Client</span>${p.buyerBusinessName || inv.buyer_name || '—'}</div>
        <div><span class="detail-label">Buyer NTN</span>${p.buyerNTNCNIC || inv.buyer_ntn || '—'}</div>
        <div><span class="detail-label">Subtotal</span>${formatMoney(inv.subtotal)}</div>
        <div><span class="detail-label">Sales Tax</span>${formatMoney(inv.sales_tax)}</div>
        <div><span class="detail-label">Total</span><strong>${formatMoney(inv.total_amount)}</strong></div>
        <div><span class="detail-label">Created</span>${inv.created_at ? new Date(inv.created_at).toLocaleString() : '—'}</div>
      </div>
      ${renderNoteInfoBlock(inv, p)}
      ${renderEditPolicyPanel(policy, limitInfo)}
      ${renderItemStatusesTable(itemStatuses, p.items || [], policy?.items || [])}
      ${inv.error_message ? `<div class="alert alert-warning" style="margin-top:14px">${escapeHtml(inv.error_message)}</div>` : ''}
      <details style="margin-top:14px">
        <summary style="cursor:pointer;font-size:12px;color:var(--gray-600)">Request payload</summary>
        <pre class="raw-json">${JSON.stringify(p, null, 2)}</pre>
      </details>
    `;

    let actionHtml = createExportDropdownHtml(id);

    if (inv.workflow_status === 'draft') {
      actionHtml += `<button type="button" class="btn btn-ghost btn-sm" data-edit-draft="${id}"><i data-lucide="pencil"></i> Edit in form</button>`;
    }
    if (inv.workflow_status === 'failed' || inv.workflow_status === 'cancelled') {
      actionHtml += `<button type="button" class="btn btn-success btn-sm" data-retry="${id}"><i data-lucide="refresh-cw"></i> Retry</button>`;
    }
    if (policy?.canEditItems) {
      actionHtml += `<button type="button" class="btn btn-primary btn-sm" data-edit-items="${id}"><i data-lucide="pencil-line"></i> Edit items</button>`;
    }
    if (inv.workflow_status === 'submitted' && (inv.note_type || 'sale') === 'sale' && inv.fbr_invoice_number) {
      actionHtml += `<button type="button" class="btn btn-outline btn-sm" data-note-debit="${id}"><i data-lucide="file-plus"></i> Debit note</button>`;
      actionHtml += `<button type="button" class="btn btn-outline btn-sm" data-note-credit="${id}"><i data-lucide="file-minus"></i> Credit note</button>`;
    }
    if (policy?.cancelAllowed) {
      actionHtml += `<button type="button" class="btn btn-warning btn-sm" data-cancel-fbr="${id}"><i data-lucide="ban"></i> Cancel on FBR</button>`;
    }
    if (!['submitted', 'processing'].includes(inv.workflow_status)) {
      actionHtml += `<button type="button" class="btn btn-ghost btn-sm" data-cancel="${id}"><i data-lucide="x"></i> Cancel</button>`;
    }

    actions.innerHTML = actionHtml;
    bindExportDropdown(actions.querySelector('.export-dropdown'));
    if (typeof refreshLucideIcons === 'function') refreshLucideIcons(actions);

    const editBtn = actions.querySelector('[data-edit-draft]');
    if (editBtn) editBtn.addEventListener('click', () => loadInvoiceIntoForm(inv));

    const editItemsBtn = actions.querySelector('[data-edit-items]');
    if (editItemsBtn) editItemsBtn.addEventListener('click', () => startItemEdit(inv, policy));

    actions.querySelector('[data-note-debit]')?.addEventListener('click', () => {
      if (typeof loadInvoiceForStandaloneNote === 'function') loadInvoiceForStandaloneNote(inv, 'debit');
    });
    actions.querySelector('[data-note-credit]')?.addEventListener('click', () => {
      if (typeof loadInvoiceForStandaloneNote === 'function') loadInvoiceForStandaloneNote(inv, 'credit');
    });

    content.querySelector('[data-view-original]')?.addEventListener('click', e => {
      viewInvoiceDetail(e.currentTarget.dataset.viewOriginal);
    });

    const cancelFbrBtn = actions.querySelector('[data-cancel-fbr]');
    if (cancelFbrBtn) cancelFbrBtn.addEventListener('click', () => cancelFbrInvoice(id, limitInfo));

    const retryBtn = actions.querySelector('[data-retry]');
    if (retryBtn) retryBtn.addEventListener('click', () => retryInvoice(id));

    const cancelBtn = actions.querySelector('[data-cancel]');
    if (cancelBtn) cancelBtn.addEventListener('click', () => cancelInvoice(id));
  } catch (err) {
    content.innerHTML = `<p style="color:var(--red)">${err.message}</p>`;
  }
}

async function retryInvoice(id) {
  if (!confirm('Retry FBR submission for this invoice?')) return;
  try {
    const result = await apiFetch(`/api/invoices/${id}/retry`, { method: 'POST' });
    await loadHistory();
    if (result.queued) {
      alert('Invoice re-queued. Worker will retry shortly.');
    }
    await viewInvoiceDetail(id);
  } catch (err) {
    alert(err.message);
  }
}

async function cancelInvoice(id) {
  if (!confirm('Cancel this invoice?')) return;
  try {
    await apiFetch(`/api/invoices/${id}/cancel`, { method: 'POST' });
    await loadHistory();
    await viewInvoiceDetail(id);
  } catch (err) {
    alert(err.message);
  }
}

function startItemEdit(inv, policy) {
  if (typeof loadInvoiceForItemEdit !== 'function') {
    alert('Edit mode is unavailable — reload the page and try again.');
    return;
  }
  loadInvoiceForItemEdit(inv, policy);
}

async function cancelFbrInvoice(id, limitInfo) {
  let msg = 'Cancel this invoice on FBR?\n\nMust be within 72 hours of submission. Edited items cannot be cancelled.';
  if (limitInfo) {
    msg += `\n\nRemaining monthly limit: ${formatMoney(limitInfo.remainingLimit)} of ${formatMoney(limitInfo.cancellationLimit)} (${limitInfo.limitPercent}% of prior month sales).`;
  }
  if (!confirm(msg)) return;

  try {
    const result = await apiFetch(`/api/invoices/${id}/cancel-fbr`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const note = result.mockApproved
      ? 'Cancellation approved (mock mode).'
      : 'Cancellation requested — pending FBR confirmation.';
    alert(`${note}\nAmount: ${formatMoney(result.cancelAmount)}`);
    await loadHistory();
    await viewInvoiceDetail(id);
    if (typeof loadDashboard === 'function') loadDashboard();
  } catch (err) {
    alert(err.message);
  }
}

function setupHistorySearchControls() {
  const input = document.getElementById('history-search');
  if (!input) return;

  if (!document.getElementById('history-search-clear')) {
    const wrap = document.createElement('div');
    wrap.className = 'history-search-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.id = 'history-search-clear';
    clearBtn.className = 'history-search-clear';
    clearBtn.title = 'Clear search';
    clearBtn.setAttribute('aria-label', 'Clear search');
    clearBtn.textContent = '×';
    clearBtn.style.display = 'none';
    wrap.appendChild(clearBtn);

    clearBtn.addEventListener('click', () => {
      input.value = '';
      updateHistorySearchClearVisibility();
      loadHistory();
    });
  }

  input.addEventListener('input', () => {
    updateHistorySearchClearVisibility();
    clearTimeout(historySearchDebounce);
    historySearchDebounce = setTimeout(loadHistory, 400);
  });

  updateHistorySearchClearVisibility();
}

function setupHistoryPanel() {
  setupHistorySearchControls();
  document.getElementById('history-search-btn').addEventListener('click', loadHistory);
  document.getElementById('history-search').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      clearTimeout(historySearchDebounce);
      loadHistory();
    }
  });
  document.getElementById('history-status-filter').addEventListener('change', loadHistory);
  document.getElementById('history-fbr-status-filter')?.addEventListener('change', loadHistory);
  document.getElementById('history-date-from')?.addEventListener('change', loadHistory);
  document.getElementById('history-date-to')?.addEventListener('change', loadHistory);

  document.getElementById('history-clear-filters')?.addEventListener('click', () => {
    document.getElementById('history-search').value = '';
    document.getElementById('history-status-filter').value = '';
    document.getElementById('history-date-from').value = '';
    document.getElementById('history-date-to').value = '';
    document.getElementById('history-fbr-status-filter').value = '';
    updateHistorySearchClearVisibility();
    loadHistory();
  });

  document.getElementById('history-export-btn').addEventListener('click', e => {
    const { params } = getHistoryFilterParams();
    e.currentTarget.href = `/api/invoices/export/excel?${params.toString()}`;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof setupHistoryPanel === 'function') setupHistoryPanel();
});
