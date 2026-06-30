'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let appConfig  = {};
let itemCount  = 0;
let activeEnv  = 'sandbox';
let currentInvoiceId = null;
let currentInternalInvoiceNo = null;
let selectedClientId = null;
let clientsList = [];
let editMode = null; // { originalId, editableSnos }

// ── Lucide icons ──────────────────────────────────────────────────────────────
function refreshLucideIcons(root) {
  if (typeof lucide === 'undefined' || typeof lucide.createIcons !== 'function') return;
  const opts = { attrs: { 'stroke-width': 1.8 } };
  if (root) lucide.createIcons({ ...opts, root });
  else lucide.createIcons(opts);
}

window.refreshLucideIcons = refreshLucideIcons;

// ── Export Invoice dropdown ───────────────────────────────────────────────────

function closeAllExportDropdowns(except) {
  document.querySelectorAll('.export-dropdown.open').forEach(el => {
    if (except && el === except) return;
    el.classList.remove('open');
  });
}

function exportInvoicePrintPdf(invoiceId) {
  window.open(`/api/invoices/${invoiceId}/print`, '_blank', 'noopener,noreferrer');
  const a = document.createElement('a');
  a.href = `/api/invoices/${invoiceId}/pdf`;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function exportInvoiceExcel(invoiceId) {
  window.location.href = `/api/invoices/${invoiceId}/excel`;
}

function createExportDropdownHtml(invoiceId) {
  return `
    <div class="export-dropdown" data-invoice-id="${invoiceId}">
      <button type="button" class="btn btn-export btn-sm export-dropdown-toggle">
        <i data-lucide="download"></i> Export Invoice <span class="export-dropdown-arrow">▾</span>
      </button>
      <div class="export-dropdown-menu">
        <button type="button" class="export-dropdown-item" data-action="print-pdf"><i data-lucide="printer"></i> Print / PDF</button>
        <button type="button" class="export-dropdown-item" data-action="excel"><i data-lucide="table"></i> Export Excel</button>
      </div>
    </div>`;
}

function bindExportDropdown(root) {
  if (!root || root.dataset.bound === 'true') return;
  root.dataset.bound = 'true';

  const invoiceId = root.dataset.invoiceId;
  const toggle    = root.querySelector('.export-dropdown-toggle');

  toggle?.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = root.classList.contains('open');
    closeAllExportDropdowns();
    if (!isOpen) root.classList.add('open');
  });

  root.querySelectorAll('.export-dropdown-item').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      closeAllExportDropdowns();
      if (item.dataset.action === 'print-pdf') exportInvoicePrintPdf(invoiceId);
      else if (item.dataset.action === 'excel') exportInvoiceExcel(invoiceId);
    });
  });
}

function mountExportDropdown(container, invoiceId) {
  if (!container) return;
  if (!invoiceId) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  container.innerHTML = createExportDropdownHtml(invoiceId);
  container.style.display = 'block';
  bindExportDropdown(container.querySelector('.export-dropdown'));
  refreshLucideIcons(container);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.addEventListener('click', () => closeAllExportDropdowns());
  setupEnvToggle();
  await loadConfig();
  setupNav();
  setupInvoiceForm();
  setupReferencePanel();
  setupLookupPanel();
  setupErrorTables();
  addItem();
  setTodayDate();
  applyPlanetiveDefaults();
  refreshLucideIcons();
});

// ── Env Toggle ────────────────────────────────────────────────────────────────
function setupEnvToggle() {
  document.querySelectorAll('input[name="env"]').forEach(radio => {
    radio.addEventListener('change', () => {
      activeEnv = radio.value;
      applyEnvUI();
      if (document.getElementById('tab-dashboard')?.classList.contains('active') &&
          typeof loadDashboard === 'function') {
        loadDashboard();
      }
    });
  });
}

function applyEnvUI() {
  const isSandbox = activeEnv === 'sandbox';

  // Header badge
  const badge = document.getElementById('env-badge');
  badge.textContent = activeEnv.toUpperCase();
  badge.className   = 'env-badge ' + activeEnv;

  // Sidebar footer pill
  const sidebarPill = document.getElementById('sidebar-env-pill');
  if (sidebarPill) {
    sidebarPill.textContent = isSandbox ? 'Sandbox Mode' : 'Production Mode';
    sidebarPill.className = 'sidebar-env-pill ' + activeEnv;
  }

  // Sandbox-only fields
  const isPlanetive = appConfig.planetiveMode;
  document.getElementById('scenarioGroup').style.display = (isSandbox && !isPlanetive) ? '' : 'none';
  document.getElementById('scenarioPresetGroup').style.display = (isSandbox && isPlanetive) ? '' : 'none';
  document.getElementById('sandbox-info').style.display  = isSandbox ? 'flex' : 'none';

  // Production warning
  let prodWarn = document.getElementById('prod-warn');
  if (!isSandbox) {
    if (!prodWarn) {
      prodWarn = document.createElement('div');
      prodWarn.id        = 'prod-warn';
      prodWarn.className = 'alert alert-warning';
      prodWarn.innerHTML = '<i data-lucide="alert-triangle"></i> <strong>Production mode.</strong> Invoices submitted here are sent to the live FBR system.';
      document.getElementById('no-token-alert').insertAdjacentElement('afterend', prodWarn);
      refreshLucideIcons(prodWarn);
    }
    prodWarn.style.display = 'flex';
  } else if (prodWarn) {
    prodWarn.style.display = 'none';
  }
}

// ── Config from server ────────────────────────────────────────────────────────
async function loadConfig() {
  try {
    appConfig = await apiFetch('/api/config');

    // Seed toggle from server's default env
    activeEnv = appConfig.defaultEnv || 'sandbox';
    const defaultRadio = document.getElementById(`env-${activeEnv}`);
    if (defaultRadio) defaultRadio.checked = true;
    applyEnvUI();
    applyMockModeBanner();

    // Populate scenario dropdown
    const scenarioSel = document.getElementById('scenarioId');
    scenarioSel.innerHTML = '<option value="">— Select Scenario —</option>';
    (appConfig.scenarios || []).forEach(s => {
      scenarioSel.appendChild(new Option(s.label, s.id));
    });

    applyPlanetiveDefaults();
    renderSellerCard();

    // Token warning
    if (!appConfig.tokenConfigured) {
      document.getElementById('no-token-alert').style.display = 'flex';
    }

    // Populate province dropdowns (buyer, settings, clients)
    await loadProvinces();
    await refreshClientSelect();

  } catch (err) {
    console.error('Config load failed:', err);
  }
}

function applyMockModeBanner() {
  const banner  = document.getElementById('mock-mode-banner');
  const details = document.getElementById('mock-mode-details');
  if (!banner) return;

  if (!appConfig.mockMode) {
    banner.style.display = 'none';
    return;
  }

  banner.style.display = 'flex';

  if (details) {
    const c = appConfig.mockConfig || {};
    const parts = [];
    if (c.scenario && c.scenario !== 'valid') parts.push(`scenario: ${c.scenario}`);
    if (c.delayMs > 0) parts.push(`delay: ${c.delayMs}ms`);
    if (c.fail) parts.push('fail: always');
    else if (c.failUntilRetry > 0) parts.push(`fail until retry #${c.failUntilRetry}`);
    details.textContent = parts.length ? ` · ${parts.join(' · ')}` : '';
  }

  if (typeof refreshLucideIcons === 'function') refreshLucideIcons(banner);
}

function applyPlanetiveDefaults() {
  const defaultId = appConfig.defaultScenarioId || 'SN019';
  const scenarioSel = document.getElementById('scenarioId');
  if (scenarioSel) scenarioSel.value = defaultId;

  const badge = document.getElementById('scenario-preset-badge');
  if (badge && appConfig.scenarioPreset) {
    const preset = appConfig.scenarioPreset;
    badge.textContent = `${preset.scenarioId} – ${preset.itemDefaults?.saleType || 'Services'}`;
  }
}

function renderSellerCard() {
  const card = document.getElementById('seller-info-card');
  const alert = document.getElementById('no-company-alert');
  const s = appConfig.companySettings;

  if (!card) return;

  if (!s) {
    card.innerHTML = '<p class="seller-info-empty">No company settings saved. Configure under <strong>Company Settings</strong>.</p>';
    if (alert) alert.style.display = 'flex';
    return;
  }

  if (alert) alert.style.display = 'none';
  card.innerHTML = `
    <div class="seller-info-grid">
      <div><span class="detail-label">Business Name</span><strong>${escapeHtml(s.business_name)}</strong></div>
      <div><span class="detail-label">NTN</span><strong class="mono">${escapeHtml(s.ntn)}</strong></div>
      <div><span class="detail-label">Province</span>${escapeHtml(s.province)}</div>
      <div><span class="detail-label">Address</span>${escapeHtml(s.address)}</div>
      ${s.strn ? `<div><span class="detail-label">STRN</span>${escapeHtml(s.strn)}</div>` : ''}
    </div>
  `;
}

async function refreshClientSelect() {
  const sel = document.getElementById('clientSelect');
  if (!sel) return;

  try {
    clientsList = await apiFetch('/api/clients');
    const current = sel.value;
    sel.innerHTML = '<option value="">— Manual entry / select client —</option>';
    clientsList.forEach(c => {
      sel.appendChild(new Option(c.name, c.id));
    });
    if (current) sel.value = current;
  } catch (err) {
    console.warn('Clients load:', err.message);
  }
}

function fillBuyerFromClient(clientId) {
  selectedClientId = clientId || null;
  if (!clientId) return;

  const client = clientsList.find(c => String(c.id) === String(clientId));
  if (!client) return;

  const fields = {
    buyerBusinessName:     client.name || '',
    buyerNTNCNIC:          client.ntn || '',
    buyerAddress:          client.address || '',
    buyerProvince:         client.province || '',
    buyerRegistrationType: client.registration_type || 'Registered',
  };

  Object.entries(fields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  });
}

async function loadProvinces() {
  let provinces = [];
  try {
    provinces = await apiFetch('/api/provinces');
  } catch {
    provinces = ['Punjab','Sindh','KPK','Balochistan','AJK','GB','ICT'].map(p => ({
      stateProvinceDesc: p,
    }));
  }

  ['buyerProvince', 'settings-province', 'client-province'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select Province —</option>';
    provinces.forEach(p => {
      const label = p.stateProvinceDesc || p;
      sel.appendChild(new Option(label, label));
    });
  });
}

// ── Sidebar navigation ───────────────────────────────────────────────────────
function runPanelHook(panelName) {
  switch (panelName) {
    case 'dashboard':
      if (typeof loadDashboard === 'function') loadDashboard();
      break;
    case 'history':
      if (typeof loadHistory === 'function') loadHistory();
      break;
    case 'clients':
      if (typeof loadClientsList === 'function') loadClientsList();
      break;
    case 'settings':
      if (typeof loadSettingsForm === 'function') loadSettingsForm();
      break;
    case 'support':
      if (typeof loadSupport === 'function') loadSupport();
      break;
  }
}

function switchToPanel(panelName) {
  document.querySelectorAll('.sidebar-item').forEach(el => {
    el.classList.toggle('active', el.dataset.panel === panelName);
  });

  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('tab-' + panelName);
  if (panel) panel.classList.add('active');

  if (window.innerWidth <= 768) closeSidebar();

  runPanelHook(panelName);
  refreshLucideIcons(document.getElementById('tab-' + panelName));
}

function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) {
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
  }
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar?.classList.contains('open')) closeSidebar();
  else openSidebar();
}

function setupNav() {
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => switchToPanel(item.dataset.panel));
  });

  document.getElementById('sidebar-toggle')?.addEventListener('click', toggleSidebar);
  document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);

  if (document.getElementById('tab-dashboard')?.classList.contains('active')) {
    runPanelHook('dashboard');
  }
}

window.switchToPanel = switchToPanel;

// ── Invoice Form ──────────────────────────────────────────────────────────────
function isAdjustmentNoteType(type) {
  return type === 'Debit Note' || type === 'Credit Note';
}

function updateNoteFieldsVisibility() {
  const type   = document.getElementById('invoiceType')?.value || '';
  const isNote = isAdjustmentNoteType(type);
  const refGroup    = document.getElementById('invoiceRefGroup');
  const reasonGroup = document.getElementById('noteReasonGroup');
  if (refGroup) refGroup.style.display = isNote ? '' : 'none';
  if (reasonGroup) reasonGroup.style.display = isNote ? '' : 'none';
}

function validateNoteFields() {
  const type = document.getElementById('invoiceType')?.value || '';
  if (!isAdjustmentNoteType(type)) return true;

  if (!document.getElementById('invoiceRefNo')?.value?.trim()) {
    alert('Reference Invoice No. is required for debit/credit notes (FBR 0026).');
    return false;
  }
  if (!document.getElementById('noteReason')?.value?.trim()) {
    alert('Reason is required for debit/credit notes (FBR 0027).');
    return false;
  }
  return true;
}

function setupInvoiceForm() {
  document.getElementById('invoiceType').addEventListener('change', () => {
    updateNoteFieldsVisibility();
  });

  document.getElementById('exit-edit-mode-btn')?.addEventListener('click', () => {
    exitEditMode();
    switchToPanel('history');
  });

  document.getElementById('clientSelect')?.addEventListener('change', e => {
    fillBuyerFromClient(e.target.value);
  });

  document.getElementById('add-item-btn').addEventListener('click', addItem);
  document.getElementById('clear-btn').addEventListener('click', clearForm);
  document.getElementById('sample-btn').addEventListener('click', loadSample);

  document.getElementById('invoice-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (editMode) await submitItemEditFromForm();
    else await submitInvoice('post');
  });

  document.getElementById('validate-btn').addEventListener('click', async () => {
    await submitInvoice('validate');
  });

  document.getElementById('save-draft-btn').addEventListener('click', saveDraft);

  updateNoteFieldsVisibility();
}

function setTodayDate() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('invoiceDate').value = today;
}

function defaultSaleType() {
  return appConfig.scenarioPreset?.itemDefaults?.saleType || 'Services';
}

function getItemCards() {
  return document.querySelectorAll('#items-body .item-card');
}

function itemFieldLabel(text, required = false) {
  return `${text}${required ? ' <span class="req">*</span>' : ''}`;
}

function buildItemField(idx, name, label, opts = {}) {
  const span = opts.span || 1;
  const reqLabel = itemFieldLabel(label, opts.required);
  let control;

  if (opts.select) {
    control = `<select name="${name}_${idx}">${opts.select}</select>`;
  } else if (opts.type === 'number') {
    const ro = opts.readonly ? ' readonly class="tax-readonly" title="Auto-calculated from value × rate"' : '';
    control = `<input type="number" name="${name}_${idx}" placeholder="${opts.placeholder || '0'}" step="${opts.step || '0.01'}" min="0" value="${opts.value ?? '0'}"${ro} />`;
  } else {
    control = `<input type="text" name="${name}_${idx}" placeholder="${opts.placeholder || ''}" />`;
  }

  return `<div class="item-field item-field-span-${span}"><label>${reqLabel}</label>${control}</div>`;
}

function recalcRowTax(tr) {
  const idx = tr.id.replace('item-row-', '');
  const valueEl = tr.querySelector(`[name="valueSalesExcludingST_${idx}"]`);
  const rateEl  = tr.querySelector(`[name="rate_${idx}"]`);
  const taxEl   = tr.querySelector(`[name="salesTaxApplicable_${idx}"]`);
  if (!valueEl || !rateEl || !taxEl) return;
  taxEl.value = calculateSalesTax(valueEl.value, rateEl.value);
}

function attachTaxListeners(tr) {
  const idx = tr.id.replace('item-row-', '');
  ['quantity', 'valueSalesExcludingST', 'rate'].forEach(field => {
    const el = tr.querySelector(`[name="${field}_${idx}"]`);
    if (el) el.addEventListener('input', () => recalcRowTax(tr));
  });
}

// ── Item Rows ─────────────────────────────────────────────────────────────────
function addItem() {
  itemCount++;
  const idx = itemCount;
  const body = document.getElementById('items-body');

  const saleTypeOptions = (appConfig.saleTypes || [
    'Goods at Standard Rate (default)', 'Goods at Reduced Rate', 'Exempt Goods',
    'Goods at zero-rate', '3rd Schedule Goods', 'Services', 'Petroleum Products',
    'Telecommunication services', 'Electric Vehicle', 'Cotton Ginners',
  ]).map(t => `<option value="${t}">${t}</option>`).join('');

  const defaultSale = defaultSaleType();

  const card = document.createElement('div');
  card.className = 'item-card';
  card.id = `item-row-${idx}`;
  card.innerHTML = `
    <div class="item-card-header">
      <span class="item-card-num">Item #${idx}</span>
      <button type="button" class="btn btn-danger btn-sm" onclick="removeItem(${idx})" title="Remove item"><i data-lucide="x"></i></button>
    </div>
    <div class="item-fields-grid">
      ${buildItemField(idx, 'hsCode', 'HS Code', { required: true, placeholder: '0101.2100' })}
      ${buildItemField(idx, 'productDescription', 'Description', { required: true, placeholder: 'Product description', span: 3 })}
      ${buildItemField(idx, 'saleType', 'Sale Type', { required: true, select: saleTypeOptions, span: 2 })}
      ${buildItemField(idx, 'rate', 'Rate', { required: true, placeholder: '18%' })}
      ${buildItemField(idx, 'uoM', 'UOM', { required: true, placeholder: 'Numbers, pieces, units', span: 2 })}
      ${buildItemField(idx, 'quantity', 'Qty', { required: true, type: 'number', step: '0.0001', value: '1' })}
      ${buildItemField(idx, 'totalValues', 'Total Value', { type: 'number' })}
      ${buildItemField(idx, 'valueSalesExcludingST', 'Value Excl. ST', { required: true, type: 'number', placeholder: '1000.00' })}
      ${buildItemField(idx, 'fixedNotifiedValueOrRetailPrice', 'Fixed/Notified Price', { type: 'number' })}
      ${buildItemField(idx, 'salesTaxApplicable', 'ST Applicable', { required: true, type: 'number', readonly: true })}
      ${buildItemField(idx, 'salesTaxWithheldAtSource', 'ST Withheld', { type: 'number' })}
      ${buildItemField(idx, 'extraTax', 'Extra Tax', { type: 'number' })}
      ${buildItemField(idx, 'furtherTax', 'Further Tax', { type: 'number' })}
      ${buildItemField(idx, 'sroScheduleNo', 'SRO Schedule', { placeholder: 'SRO123' })}
      ${buildItemField(idx, 'fedPayable', 'FED Payable', { type: 'number' })}
      ${buildItemField(idx, 'discount', 'Discount', { type: 'number' })}
      ${buildItemField(idx, 'sroItemSerialNo', 'SRO Item S/N', { placeholder: '', span: 2 })}
    </div>
  `;
  body.appendChild(card);

  const saleSel = card.querySelector(`[name="saleType_${idx}"]`);
  if (saleSel) saleSel.value = defaultSale;

  attachTaxListeners(card);
  refreshLucideIcons(card);
}

function removeItem(idx) {
  const row = document.getElementById(`item-row-${idx}`);
  if (row) row.remove();
  if (getItemCards().length === 0) addItem();
}

// ── Build Invoice Payload ─────────────────────────────────────────────────────
function buildPayload() {
  const val  = id => document.getElementById(id)?.value?.trim() ?? '';
  const rows = getItemCards();

  const payload = {
    invoiceType:          val('invoiceType'),
    invoiceDate:          val('invoiceDate'),
    buyerNTNCNIC:         val('buyerNTNCNIC'),
    buyerBusinessName:    val('buyerBusinessName'),
    buyerProvince:        val('buyerProvince'),
    buyerAddress:         val('buyerAddress'),
    buyerRegistrationType: val('buyerRegistrationType'),
    invoiceRefNo:         val('invoiceRefNo'),
    reason:               val('noteReason'),
    items: [],
  };

  if (activeEnv === 'sandbox') {
    payload.scenarioId = val('scenarioId') || appConfig.defaultScenarioId || 'SN019';
  }

  rows.forEach(tr => {
    const idx = tr.id.replace('item-row-', '');
    const g   = name => tr.querySelector(`[name="${name}_${idx}"]`)?.value ?? '0';
    const n   = name => parseFloat(g(name)) || 0;

    payload.items.push({
      hsCode:                          g('hsCode'),
      productDescription:              g('productDescription'),
      saleType:                        g('saleType') || defaultSaleType(),
      rate:                            g('rate'),
      uoM:                             g('uoM'),
      quantity:                        n('quantity'),
      totalValues:                     n('totalValues'),
      valueSalesExcludingST:           n('valueSalesExcludingST'),
      fixedNotifiedValueOrRetailPrice: n('fixedNotifiedValueOrRetailPrice'),
      salesTaxApplicable:              calculateSalesTax(n('valueSalesExcludingST'), g('rate')),
      salesTaxWithheldAtSource:        n('salesTaxWithheldAtSource'),
      extraTax:                        n('extraTax'),
      furtherTax:                      n('furtherTax'),
      sroScheduleNo:                   g('sroScheduleNo'),
      fedPayable:                      n('fedPayable'),
      discount:                        n('discount'),
      sroItemSerialNo:                 g('sroItemSerialNo'),
    });
  });

  return payload;
}

function extractItemFromRow(idx) {
  const tr = document.getElementById(`item-row-${idx}`);
  if (!tr) return null;
  const g = name => tr.querySelector(`[name="${name}_${idx}"]`)?.value ?? '0';
  const n = name => parseFloat(g(name)) || 0;
  return {
    hsCode:                          g('hsCode'),
    productDescription:              g('productDescription'),
    saleType:                        g('saleType') || defaultSaleType(),
    rate:                            g('rate'),
    uoM:                             g('uoM'),
    quantity:                        n('quantity'),
    totalValues:                     n('totalValues'),
    valueSalesExcludingST:           n('valueSalesExcludingST'),
    fixedNotifiedValueOrRetailPrice: n('fixedNotifiedValueOrRetailPrice'),
    salesTaxApplicable:              calculateSalesTax(n('valueSalesExcludingST'), g('rate')),
    salesTaxWithheldAtSource:        n('salesTaxWithheldAtSource'),
    extraTax:                        n('extraTax'),
    furtherTax:                      n('furtherTax'),
    sroScheduleNo:                   g('sroScheduleNo'),
    fedPayable:                      n('fedPayable'),
    discount:                        n('discount'),
    sroItemSerialNo:                 g('sroItemSerialNo'),
  };
}

const LOCKED_FORM_IDS = [
  'invoiceType', 'invoiceDate', 'scenarioId', 'invoiceRefNo', 'noteReason',
  'clientSelect', 'buyerRegistrationType', 'buyerNTNCNIC', 'buyerBusinessName',
  'buyerProvince', 'buyerAddress',
];

function setFormLocked(locked) {
  LOCKED_FORM_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = locked;
  });
  const addBtn = document.getElementById('add-item-btn');
  if (addBtn) addBtn.disabled = locked;
}

function applyItemEditPolicy(editableSnos) {
  getItemCards().forEach(card => {
    const idx      = card.id.replace('item-row-', '');
    const editable = editableSnos.includes(String(idx));
    card.querySelectorAll('input, select').forEach(el => { el.disabled = !editable; });
    card.classList.toggle('item-row-locked', !editable);
    const removeBtn = card.querySelector('.btn-danger');
    if (removeBtn) removeBtn.disabled = true;
  });
}

function enterEditMode(originalId, editableSnos, defaultNoteType = 'debit') {
  editMode = { originalId, editableSnos: editableSnos.map(String) };
  setFormLocked(true);
  applyItemEditPolicy(editMode.editableSnos);

  const banner = document.getElementById('edit-mode-banner');
  if (banner) banner.style.display = 'flex';

  const noteTypeSel = document.getElementById('edit-note-type');
  if (noteTypeSel) {
    noteTypeSel.disabled = false;
    noteTypeSel.value = defaultNoteType;
    noteTypeSel.onchange = () => applyEditNoteType(noteTypeSel.value);
  }

  applyEditNoteType(defaultNoteType);

  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) submitBtn.innerHTML = '<i data-lucide="send"></i> Submit Edit to FBR';
  refreshLucideIcons();
}

function applyEditNoteType(noteType) {
  const invoiceType = noteType === 'credit' ? 'Credit Note' : 'Debit Note';
  document.getElementById('invoiceType').value = invoiceType;
  document.getElementById('invoiceRefGroup').style.display = '';
  document.getElementById('noteReasonGroup').style.display = '';
}

function exitEditMode() {
  editMode = null;
  setFormLocked(false);
  const banner = document.getElementById('edit-mode-banner');
  if (banner) banner.style.display = 'none';
  const noteTypeSel = document.getElementById('edit-note-type');
  if (noteTypeSel) {
    noteTypeSel.disabled = true;
    noteTypeSel.onchange = null;
  }
  getItemCards().forEach(card => {
    card.querySelectorAll('input, select').forEach(el => { el.disabled = false; });
    card.classList.remove('item-row-locked');
    const removeBtn = card.querySelector('.btn-danger');
    if (removeBtn) removeBtn.disabled = false;
  });
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) submitBtn.innerHTML = '<i data-lucide="send"></i> Submit to FBR';
  refreshLucideIcons();
}

async function submitItemEditFromForm() {
  if (!validateNoteFields()) return;

  const noteType = document.getElementById('edit-note-type')?.value || 'debit';
  const reason   = document.getElementById('noteReason')?.value?.trim();

  const items = editMode.editableSnos.map(sno => ({
    itemSNo: sno,
    ...extractItemFromRow(sno),
  }));

  const submitBtn = document.getElementById('submit-btn');
  const origHTML  = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Submitting edit…';

  try {
    const result = await apiFetch(`/api/invoices/${editMode.originalId}/edit-items`, {
      method: 'POST',
      body: JSON.stringify({ items, noteType, reason }),
    });

    if (result.queued && result.id) {
      await pollInvoiceUntilDone(result.id, 'post');
    }

    alert('Edit note submitted. Original invoice item edit counts updated.');
    exitEditMode();
    clearForm();
    switchToPanel('history');
    if (typeof loadHistory === 'function') loadHistory();
  } catch (err) {
    alert(err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = origHTML;
    refreshLucideIcons();
  }
}

function loadInvoiceForItemEdit(inv, policy) {
  loadInvoiceIntoForm(inv);
  currentInvoiceId = null;
  setDraftUI(null);

  if (inv.fbr_invoice_number) {
    document.getElementById('invoiceRefNo').value = inv.fbr_invoice_number;
  }

  enterEditMode(inv.id, policy.editableItemSnos);
  switchToPanel('invoice');
}

window.loadInvoiceIntoForm = loadInvoiceIntoForm;
window.loadInvoiceForItemEdit = loadInvoiceForItemEdit;

function buildRequestBody() {
  return {
    invoiceId: currentInvoiceId,
    clientId:  selectedClientId || document.getElementById('clientSelect')?.value || null,
    ...buildPayload(),
  };
}

function setDraftUI(row) {
  currentInvoiceId = row?.id ?? null;
  currentInternalInvoiceNo = row?.internal_invoice_no ?? null;
  const badge = document.getElementById('draft-badge');
  if (currentInternalInvoiceNo) {
    badge.style.display = 'flex';
    document.getElementById('draft-internal-no').textContent = currentInternalInvoiceNo;
  } else {
    badge.style.display = 'none';
  }
}

async function saveDraft() {
  if (!validateNoteFields()) return;
  const btn = document.getElementById('save-draft-btn');
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  try {
    const row = await apiFetch('/api/invoices/draft', {
      method: 'POST',
      body: JSON.stringify(buildRequestBody()),
    });
    setDraftUI(row);
    alert(`Draft saved: ${row.internal_invoice_no}`);
  } catch (err) {
    alert('Save failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

function loadInvoiceIntoForm(inv) {
  const p = inv.request_payload || {};
  clearForm(false);

  currentInvoiceId = inv.id;
  currentInternalInvoiceNo = inv.internal_invoice_no;
  setDraftUI(inv);

  document.getElementById('invoiceType').value = p.invoiceType || 'Sale Invoice';
  document.getElementById('invoiceDate').value = p.invoiceDate || '';
  document.getElementById('buyerNTNCNIC').value = p.buyerNTNCNIC || '';
  document.getElementById('buyerBusinessName').value = p.buyerBusinessName || '';
  document.getElementById('buyerAddress').value = p.buyerAddress || '';
  document.getElementById('buyerRegistrationType').value = p.buyerRegistrationType || 'Registered';
  document.getElementById('invoiceRefNo').value = p.invoiceRefNo || '';
  document.getElementById('noteReason').value = p.reason || inv.note_reason || '';

  updateNoteFieldsVisibility();

  if (p.scenarioId) document.getElementById('scenarioId').value = p.scenarioId;
  if (inv.client_id) {
    selectedClientId = inv.client_id;
    const clientSel = document.getElementById('clientSelect');
    if (clientSel) clientSel.value = inv.client_id;
  }

  setTimeout(() => {
    if (p.buyerProvince) document.getElementById('buyerProvince').value = p.buyerProvince;
  }, 100);

  document.getElementById('items-body').innerHTML = '';
  itemCount = 0;
  (p.items || []).forEach(item => {
    addItem();
    const idx = String(itemCount);
    const set = (n, v) => { const el = document.querySelector(`[name="${n}_${idx}"]`); if (el) el.value = v; };
    set('hsCode', item.hsCode);
    set('productDescription', item.productDescription);
    set('saleType', item.saleType);
    set('rate', item.rate);
    set('uoM', item.uoM);
    set('quantity', item.quantity);
    set('totalValues', item.totalValues);
    set('valueSalesExcludingST', item.valueSalesExcludingST);
    set('fixedNotifiedValueOrRetailPrice', item.fixedNotifiedValueOrRetailPrice);
    set('salesTaxApplicable', item.salesTaxApplicable);
    set('salesTaxWithheldAtSource', item.salesTaxWithheldAtSource);
    set('extraTax', item.extraTax);
    set('furtherTax', item.furtherTax);
    set('sroScheduleNo', item.sroScheduleNo);
    set('fedPayable', item.fedPayable);
    set('discount', item.discount);
    set('sroItemSerialNo', item.sroItemSerialNo);
    recalcRowTax(document.getElementById(`item-row-${idx}`));
  });

  if (!p.items?.length) addItem();

  switchToPanel('invoice');
}

// ── Submit / Validate ─────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildResultFromInvoice(inv) {
  const payload = inv.response_payload || {};
  const vr      = payload.validationResponse || payload;
  return {
    ...payload,
    id:                inv.id,
    internalInvoiceNo: inv.internal_invoice_no,
    workflowStatus:    inv.workflow_status,
    fbr_status:        inv.fbr_status,
    qrCode:            inv.qr_code,
    invoiceNumber:     inv.fbr_invoice_number || payload.invoiceNumber,
    validationResponse: vr,
    error_message:     inv.error_message,
  };
}

async function pollInvoiceUntilDone(id, action) {
  const terminalSubmit   = ['submitted', 'failed', 'cancelled'];
  const terminalValidate = ['pending', 'failed', 'cancelled'];
  const terminal         = action === 'post' ? terminalSubmit : terminalValidate;
  const inFlight         = ['queued', 'processing', 'retrying'];

  for (let i = 0; i < 60; i++) {
    const inv = await apiFetch(`/api/invoices/${id}`);
    if (terminal.includes(inv.workflow_status)) {
      return buildResultFromInvoice(inv);
    }
    if (!inFlight.includes(inv.workflow_status) && inv.workflow_status !== 'draft') {
      return buildResultFromInvoice(inv);
    }
    await sleep(2000);
  }
  throw new Error('Timed out waiting for FBR. Check Invoice History for status.');
}

async function submitInvoice(action) {
  if (!validateNoteFields()) return;
  const submitBtn   = document.getElementById('submit-btn');
  const validateBtn = document.getElementById('validate-btn');
  const activeBtn   = action === 'post' ? submitBtn : validateBtn;
  const origHTML    = activeBtn.innerHTML;

  activeBtn.disabled  = true;
  activeBtn.innerHTML = `<span class="spinner"></span> ${action === 'post' ? 'Submitting…' : 'Validating…'}`;

  try {
    const body     = buildRequestBody();
    const endpoint = action === 'post' ? '/api/invoices/post' : '/api/invoices/validate';
    const queued   = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });

    if (queued.id) currentInvoiceId = queued.id;
    if (queued.internalInvoiceNo) {
      currentInternalInvoiceNo = queued.internalInvoiceNo;
      setDraftUI({ id: queued.id, internal_invoice_no: queued.internalInvoiceNo });
    }

    if (queued.queued) {
      activeBtn.innerHTML = `<span class="spinner"></span> Processing…`;
      const result = await pollInvoiceUntilDone(queued.id, action);
      if (result.workflowStatus === 'failed' && result.error_message) {
        displayError(new Error(result.error_message));
      } else {
        displayResponse(result, action);
      }
    } else {
      displayResponse(queued, action);
    }
  } catch (err) {
    displayError(err);
  } finally {
    activeBtn.disabled  = false;
    activeBtn.innerHTML = origHTML;
  }
}

// ── Display Response ──────────────────────────────────────────────────────────
function lookupErrorDescription(code) {
  if (!code) return null;
  const key = String(code).trim();
  return appConfig.salesErrorCodes?.[key]
    ?? appConfig.purchaseErrorCodes?.[key]
    ?? null;
}

function formatFbrErrorText(errorCode, rawError) {
  const raw = (rawError || '').trim();
  const description = lookupErrorDescription(errorCode);

  if (description) {
    const lines = [];
    if (raw) lines.push(`FBR Error: ${raw}`);
    else lines.push('FBR Error: (no message provided)');
    lines.push(`Explanation: ${description}`);
    return lines.join('\n');
  }

  return raw || '—';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function displayResponse(data, action) {
  const panel = document.getElementById('response-panel');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const vr        = data.validationResponse || data;
  const fbrStatus = vr.status || data.fbr_status || '';
  const isValid   = fbrStatus.toLowerCase() === 'valid';
  const accepted  = isValid || !!data.invoiceNumber;

  // Overall badge — show FBR lifecycle status when available
  const badge = document.getElementById('overall-badge');
  badge.textContent = fbrStatus || (accepted ? 'Valid' : 'Invalid');
  badge.className   = 'status-badge ' + (accepted ? 'valid' : 'invalid');

  // Internal invoice number
  const internalBox = document.getElementById('internal-invoice-box');
  const internalNo  = data.internalInvoiceNo || currentInternalInvoiceNo;
  if (internalNo) {
    internalBox.style.display = 'block';
    document.getElementById('internal-invoice-val').textContent = internalNo;
  } else {
    internalBox.style.display = 'none';
  }

  // FBR Invoice number (post only)
  const numBox = document.getElementById('invoice-number-box');
  if (data.invoiceNumber) {
    numBox.style.display = 'block';
    document.getElementById('invoice-number-val').textContent = data.invoiceNumber;
  } else {
    numBox.style.display = 'none';
  }

  // Export dropdown (when invoice saved to DB)
  mountExportDropdown(document.getElementById('export-invoice-wrap'), data.id || null);

  // Top-level error
  const errBox = document.getElementById('error-box');
  if (vr.errorCode || vr.error) {
    errBox.style.display = 'block';
    document.getElementById('err-code').textContent = vr.errorCode ? `Error Code: ${vr.errorCode}` : '';
    const errMsgEl = document.getElementById('err-msg');
    errMsgEl.textContent = formatFbrErrorText(vr.errorCode, vr.error);
    errMsgEl.style.whiteSpace = 'pre-wrap';
  } else {
    errBox.style.display = 'none';
  }

  // Item statuses
  const itemsResult = document.getElementById('items-result');
  if (vr.invoiceStatuses && vr.invoiceStatuses.length) {
    let html = `<table>
      <thead><tr>
        <th>Item #</th><th>Status</th><th>Invoice No.</th><th>Error Code</th><th>Error</th>
      </tr></thead><tbody>`;
    vr.invoiceStatuses.forEach(s => {
      const ok = (s.status || '').toLowerCase() === 'valid';
      const cls = ok ? 'item-row-valid' : 'item-row-invalid';
      html += `<tr class="${cls}">
        <td>${s.itemSNo}</td>
        <td><strong>${ok ? '<i data-lucide="check-circle"></i> Valid' : '<i data-lucide="x-circle"></i> Invalid'}</strong></td>
        <td style="font-family:monospace">${s.invoiceNo || '—'}</td>
        <td>${s.errorCode || '—'}</td>
        <td style="white-space:pre-wrap">${escapeHtml(formatFbrErrorText(s.errorCode, s.error))}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    itemsResult.innerHTML = html;
    itemsResult.style.display = 'block';
    refreshLucideIcons(itemsResult);
  } else {
    itemsResult.style.display = 'none';
    itemsResult.innerHTML = '';
  }

  // Raw JSON
  document.getElementById('raw-json').textContent = JSON.stringify(data, null, 2);
  refreshLucideIcons(panel);
}

function displayError(err) {
  const panel = document.getElementById('response-panel');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth' });

  document.getElementById('overall-badge').textContent = 'Error';
  document.getElementById('overall-badge').className   = 'status-badge invalid';
  document.getElementById('invoice-number-box').style.display = 'none';
  document.getElementById('export-invoice-wrap').style.display = 'none';

  const errBox = document.getElementById('error-box');
  errBox.style.display = 'block';
  document.getElementById('err-code').textContent = 'Request Error';
  document.getElementById('err-msg').textContent  = err.message || String(err);
  document.getElementById('items-result').style.display = 'none';
  document.getElementById('raw-json').textContent = JSON.stringify(err, null, 2);
}

// ── Clear / Sample ────────────────────────────────────────────────────────────
function clearForm(resetDraft = true) {
  exitEditMode();
  document.getElementById('invoice-form').reset();
  document.getElementById('items-body').innerHTML = '';
  document.getElementById('response-panel').style.display = 'none';
  itemCount = 0;
  selectedClientId = null;
  addItem();
  setTodayDate();
  applyPlanetiveDefaults();
  if (resetDraft) {
    currentInvoiceId = null;
    currentInternalInvoiceNo = null;
    setDraftUI(null);
  }
  updateNoteFieldsVisibility();
}

function loadInvoiceForStandaloneNote(inv, noteType = 'debit') {
  loadInvoiceIntoForm(inv);
  currentInvoiceId = null;
  setDraftUI(null);

  const invoiceType = noteType === 'credit' ? 'Credit Note' : 'Debit Note';
  document.getElementById('invoiceType').value = invoiceType;
  document.getElementById('invoiceRefNo').value = inv.fbr_invoice_number || '';
  document.getElementById('noteReason').value = '';
  updateNoteFieldsVisibility();
  switchToPanel('invoice');
}

window.loadInvoiceForStandaloneNote = loadInvoiceForStandaloneNote;

function loadSample() {
  clearForm();

  document.getElementById('invoiceType').value          = 'Sale Invoice';
  document.getElementById('buyerNTNCNIC').value          = '1234567';
  document.getElementById('buyerBusinessName').value     = 'Sample Client Ltd.';
  document.getElementById('buyerAddress').value          = 'Lahore';
  document.getElementById('buyerRegistrationType').value = 'Registered';

  setTimeout(() => {
    const bp = document.getElementById('buyerProvince');
    for (let o of bp.options) if (o.text.toLowerCase().includes('punjab')) { bp.value = o.value; break; }
  }, 100);

  if (activeEnv === 'sandbox') {
    applyPlanetiveDefaults();
  }

  const idx = '1';
  const set = (n, v) => { const el = document.querySelector(`[name="${n}_${idx}"]`); if (el) el.value = v; };
  set('productDescription', 'Consulting / software services');
  set('saleType', defaultSaleType());
  set('rate', '18%');
  set('uoM', 'Numbers, pieces, units');
  set('quantity', '1');
  set('totalValues', '0');
  set('valueSalesExcludingST', '1000');
  set('fixedNotifiedValueOrRetailPrice', '0');
  set('salesTaxWithheldAtSource', '0');
  set('extraTax', '0');
  set('furtherTax', '0');
  set('fedPayable', '0');
  set('discount', '0');

  const row = document.getElementById('item-row-1');
  if (row) recalcRowTax(row);
}

// ── Reference Data Panel ──────────────────────────────────────────────────────
function setupReferencePanel() {
  document.querySelectorAll('[data-ref]').forEach(btn => {
    btn.addEventListener('click', () => loadRefData(btn.dataset.ref, btn));
  });
}

async function loadRefData(key, btn) {
  const resultEl = document.getElementById(`ref-${key}`);
  if (!resultEl) return;

  btn.disabled   = true;
  btn.textContent = 'Loading…';

  try {
    let url = `/api/${key}`;
    const params = new URLSearchParams();

    if (key === 'sro-schedule') {
      params.set('rate_id', document.getElementById('p-rate-id').value);
      params.set('date', document.getElementById('p-sro-date').value);
      params.set('origination_supplier_csv', document.getElementById('p-prov-csv').value);
    } else if (key === 'rates') {
      params.set('date', document.getElementById('p-rate-date').value);
      params.set('transTypeId', document.getElementById('p-trans-id').value);
      params.set('originationSupplier', document.getElementById('p-orig-supp').value);
    } else if (key === 'hs-uom') {
      params.set('hs_code', document.getElementById('p-hs-code').value);
      params.set('annexure_id', document.getElementById('p-annexure-id').value);
    } else if (key === 'sro-item') {
      params.set('date', document.getElementById('p-sro-item-date').value);
      params.set('sro_id', document.getElementById('p-sro-id').value);
    }

    if ([...params].length) url += '?' + params.toString();

    const data = await apiFetch(url);
    resultEl.innerHTML = renderRefTable(key, data);
    refreshLucideIcons(resultEl);

  } catch (err) {
    resultEl.innerHTML = `<p style="color:var(--red);font-size:12px;margin-top:8px">Error: ${err.message}</p>`;
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Load';
  }
}

function renderRefTable(key, data) {
  if (!Array.isArray(data) || data.length === 0) {
    return '<p style="font-size:12px;color:var(--gray-600);margin-top:8px">No data returned.</p>';
  }

  const cols = Object.keys(data[0]);
  let html = '<table style="margin-top:10px"><thead><tr>' +
    cols.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';

  data.slice(0, 200).forEach(row => {
    html += '<tr>' + cols.map(c => `<td>${row[c] ?? '—'}</td>`).join('') + '</tr>';
  });

  if (data.length > 200) html += `<tr><td colspan="${cols.length}" style="color:var(--gray-600);font-style:italic">…and ${data.length - 200} more rows</td></tr>`;

  html += '</tbody></table>';
  return html;
}

// ── STATL / Reg Lookup ────────────────────────────────────────────────────────
function setupLookupPanel() {
  document.getElementById('statl-btn').addEventListener('click', async () => {
    const regno = document.getElementById('statl-regno').value.trim();
    const date  = document.getElementById('statl-date').value;
    const el    = document.getElementById('statl-result');

    if (!regno || !date) { el.textContent = 'Enter registration number and date.'; el.style.display = 'block'; return; }

    try {
      const data = await apiFetch('/api/statl', {
        method: 'POST',
        body: JSON.stringify({ regno, date }),
      });
      const active = (data.status || '').toLowerCase() === 'active';
      el.innerHTML = `<strong>Status Code:</strong> ${data['status code'] || data.statuscode || '—'}<br>
                      <strong>Status:</strong> ${data.status || '—'}`;
      el.className = 'lookup-result ' + (active ? 'active-status' : 'inactive-status');
      el.style.display = 'block';
    } catch (err) {
      el.textContent   = 'Error: ' + err.message;
      el.style.display = 'block';
    }
  });

  document.getElementById('regtype-btn').addEventListener('click', async () => {
    const regno = document.getElementById('regtype-regno').value.trim();
    const el    = document.getElementById('regtype-result');

    if (!regno) { el.textContent = 'Enter a registration number.'; el.style.display = 'block'; return; }

    try {
      const data = await apiFetch('/api/reg-type', {
        method: 'POST',
        body: JSON.stringify({ Registration_No: regno }),
      });
      const isReg = (data.REGISTRATION_TYPE || '').toLowerCase() === 'registered';
      el.innerHTML = `<strong>Reg No:</strong> ${data.REGISTRATION_NO || regno}<br>
                      <strong>Type:</strong> ${data.REGISTRATION_TYPE || '—'}<br>
                      <strong>Status Code:</strong> ${data.statuscode || '—'}`;
      el.className = 'lookup-result ' + (isReg ? 'active-status' : 'inactive-status');
      el.style.display = 'block';
    } catch (err) {
      el.textContent   = 'Error: ' + err.message;
      el.style.display = 'block';
    }
  });
}

// ── Error Tables ──────────────────────────────────────────────────────────────
function setupErrorTables() {
  // Wait for config then populate
  const waitForConfig = setInterval(() => {
    if (appConfig.salesErrorCodes) {
      clearInterval(waitForConfig);
      populateErrorTable('sales-error-body',    appConfig.salesErrorCodes);
      populateErrorTable('purchase-error-body', appConfig.purchaseErrorCodes);
      setupErrorSearch('search-sales-errors',    'sales-error-body');
      setupErrorSearch('search-purchase-errors', 'purchase-error-body');
    }
  }, 200);
}

function populateErrorTable(tbodyId, codes) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = Object.entries(codes).map(([code, desc]) =>
    `<tr data-code="${code}" data-desc="${desc.toLowerCase()}">
      <td class="code-cell">${code}</td>
      <td>${desc}</td>
    </tr>`
  ).join('');
}

function setupErrorSearch(inputId, tbodyId) {
  document.getElementById(inputId).addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll(`#${tbodyId} tr`).forEach(tr => {
      const match = tr.dataset.code.includes(q) || tr.dataset.desc.includes(q);
      tr.style.display = match ? '' : 'none';
    });
  });
}

// ── API Helper ────────────────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const defaults = {
    headers: {
      'Content-Type': 'application/json',
      'x-fbr-env':    activeEnv,            // tells server which env to route to
    },
  };
  const merged = { ...defaults, ...options, headers: { ...defaults.headers, ...(options.headers || {}) } };

  const res = await fetch(url, merged);
  const text = await res.text();

  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { error: text }; }

  if (!res.ok) {
    const msg = parsed?.message || parsed?.error || `HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return parsed;
}
