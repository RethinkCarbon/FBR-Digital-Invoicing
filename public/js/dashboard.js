'use strict';

// ── Dashboard (uses apiFetch + activeEnv from app.js) ─────────────────────────

function dashboardStatusBadgeClass(status) {
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

function dashboardFormatMoney(n) {
  const v = parseFloat(n);
  return Number.isFinite(v) ? v.toFixed(2) : '—';
}

function dashboardFormatDate(d) {
  if (!d) return '—';
  return String(d).slice(0, 10);
}

function dashboardInvoiceNo(inv) {
  return inv.fbr_invoice_number || inv.internal_invoice_no || '—';
}

function switchToTab(panelName) {
  if (typeof switchToPanel === 'function') switchToPanel(panelName);
}

function openInvoiceInHistory(inv) {
  const searchEl = document.getElementById('history-search');
  if (searchEl) {
    searchEl.value = inv.fbr_invoice_number || inv.internal_invoice_no || '';
  }
  switchToTab('history');
}

function dashboardEmptyMessage() {
  return '<span class="empty-with-icon"><i data-lucide="file-text"></i> No invoices yet. Submit your first invoice to get started.</span>';
}

function renderStatCard(iconName, value, label) {
  return `
    <div class="stat-card">
      <div class="stat-icon"><i data-lucide="${iconName}"></i></div>
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
    </div>
  `;
}

function renderCancellationLimitCard(limit) {
  if (!limit) return '';

  const pct = limit.usedPercent ?? 0;
  const barClass = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : '';

  return `
    <div class="card cancel-limit-card">
      <div class="card-title"><span class="icon"><i data-lucide="shield-alert"></i></span> FBR Cancellation Limit (${limit.currentMonthLabel})</div>
      <p class="cancel-limit-desc">
        You may cancel up to <strong>${limit.limitPercent}%</strong> of last month's submitted sales
        (<strong>${limit.lastMonthLabel}</strong>: ${dashboardFormatMoney(limit.lastMonthSales)}).
      </p>
      <div class="limit-stats-row">
        <div class="limit-stat">
          <span class="limit-stat-value">${dashboardFormatMoney(limit.cancellationLimit)}</span>
          <span class="limit-stat-label">Monthly limit</span>
        </div>
        <div class="limit-stat">
          <span class="limit-stat-value">${dashboardFormatMoney(limit.cancellationValue)}</span>
          <span class="limit-stat-label">Used this month</span>
        </div>
        <div class="limit-stat">
          <span class="limit-stat-value">${dashboardFormatMoney(limit.remainingLimit)}</span>
          <span class="limit-stat-label">Remaining</span>
        </div>
        <div class="limit-stat">
          <span class="limit-stat-value">${pct}%</span>
          <span class="limit-stat-label">Used</span>
        </div>
      </div>
      <div class="limit-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="limit-bar-fill ${barClass}" style="width:${Math.min(100, pct)}%"></div>
      </div>
    </div>`;
}

function renderDashboard(stats, recent, limitInfo) {
  const container = document.getElementById('dashboard-content');
  if (!container) return;

  const rows = recent.length
    ? recent.map((inv, idx) => `
        <tr class="dashboard-invoice-row" data-recent-idx="${idx}">
          <td class="mono">${dashboardInvoiceNo(inv)}</td>
          <td>${dashboardFormatDate(inv.invoice_date)}</td>
          <td>${inv.buyer_name || '—'}</td>
          <td class="num">${dashboardFormatMoney(inv.total_amount)}</td>
          <td><span class="wf-badge ${dashboardStatusBadgeClass(inv.workflow_status)}">${inv.workflow_status}</span></td>
        </tr>
      `).join('')
    : `<tr><td colspan="5" class="history-empty">${dashboardEmptyMessage()}</td></tr>`;

  container.innerHTML = `
    <div class="dashboard-stats">
      ${renderStatCard('file-text', stats.total ?? 0, 'Total Invoices')}
      ${renderStatCard('check-circle', stats.submitted ?? 0, 'Submitted Successfully')}
      ${renderStatCard('x-circle', stats.failed ?? 0, 'Failed')}
      ${renderStatCard('layers', stats.inQueue ?? 0, 'In Queue')}
      ${renderStatCard('clock', stats.pending ?? 0, 'Pending / Draft')}
    </div>

    ${renderCancellationLimitCard(limitInfo)}

    <div class="card">
      <div class="card-title"><span class="icon"><i data-lucide="history"></i></span> Recent Invoices</div>
      <div class="history-table-wrap">
        <table id="dashboard-recent-table" class="data-table">
          <thead>
            <tr>
              <th>Invoice No.</th>
              <th>Date</th>
              <th>Buyer</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>

    <div class="dashboard-actions">
      <button type="button" class="btn btn-primary" id="dashboard-new-invoice"><i data-lucide="file-plus"></i> New Invoice</button>
      <button type="button" class="btn btn-outline" id="dashboard-view-all"><i data-lucide="history"></i> View All Invoices</button>
      <button type="button" class="btn btn-outline" id="dashboard-settings"><i data-lucide="settings"></i> Company Settings</button>
    </div>
  `;

  container.querySelector('#dashboard-new-invoice')?.addEventListener('click', () => switchToTab('invoice'));
  container.querySelector('#dashboard-view-all')?.addEventListener('click', () => switchToTab('history'));
  container.querySelector('#dashboard-settings')?.addEventListener('click', () => switchToTab('settings'));

  container.querySelectorAll('.dashboard-invoice-row').forEach(row => {
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => {
      const inv = recent[parseInt(row.dataset.recentIdx, 10)];
      if (inv) openInvoiceInHistory(inv);
    });
  });

  if (typeof refreshLucideIcons === 'function') refreshLucideIcons(container);
}

function renderDashboardError(message) {
  const container = document.getElementById('dashboard-content');
  if (!container) return;
  container.innerHTML = `
    <div class="card">
      <p class="seller-info-empty" style="color:var(--error)">${message}</p>
    </div>
  `;
}

async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  if (!container) return;

  container.innerHTML = '<div class="card"><p class="history-empty">Loading dashboard…</p></div>';

  try {
    const env = typeof activeEnv !== 'undefined' ? activeEnv : '';
    const statsParams = env ? `?environment=${encodeURIComponent(env)}` : '';
    const listParams = new URLSearchParams({ limit: '5', offset: '0' });
    if (env) listParams.set('environment', env);

    const [stats, listData, limitInfo] = await Promise.all([
      apiFetch(`/api/invoices/stats${statsParams}`),
      apiFetch(`/api/invoices?${listParams.toString()}`),
      apiFetch(`/api/invoices/cancellation-limit${statsParams}`).catch(() => null),
    ]);

    renderDashboard(stats, listData.items || [], limitInfo);
  } catch (err) {
    renderDashboardError(err.message || 'Failed to load dashboard.');
  }
}
