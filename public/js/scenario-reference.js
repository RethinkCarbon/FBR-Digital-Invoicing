'use strict';

let scenarioRefCache = {};
let scenarioRefLoading = null;

function getActiveScenarioId() {
  if (typeof activeEnv !== 'undefined' && activeEnv !== 'sandbox') return null;
  const sel = document.getElementById('scenarioId');
  return sel?.value || appConfig.defaultScenarioId || 'SN019';
}

function getClientScenarioPreset(scenarioId) {
  const presets = appConfig.scenarioPresets || {};
  return presets[scenarioId] || appConfig.scenarioPreset;
}

async function fetchScenarioReference(scenarioId) {
  if (scenarioRefCache[scenarioId]) return scenarioRefCache[scenarioId];

  const invoiceDate = document.getElementById('invoiceDate')?.value || '';
  const params = new URLSearchParams();
  if (invoiceDate) params.set('invoiceDate', invoiceDate);

  const url = `/api/scenarios/${encodeURIComponent(scenarioId)}/reference?${params}`;
  const data = await apiFetch(url);
  scenarioRefCache[scenarioId] = data;
  return data;
}

async function fetchHsUomForScenario(scenarioId, hsCode) {
  const url = `/api/scenarios/${encodeURIComponent(scenarioId)}/hs-uom?hs_code=${encodeURIComponent(hsCode)}`;
  return apiFetch(url);
}

function buildRateSelectOptions(rates, selected) {
  const list = rates || [];
  if (!list.length) return '<option value="">— Select rate —</option>';

  const hasSelected = selected && list.some(r => r.rateDesc === selected);
  const opts = list.map(r => {
    const val = r.rateDesc;
    const sel = val === selected ? ' selected' : '';
    return `<option value="${val}"${sel}>${val}</option>`;
  });

  if (!hasSelected) {
    return opts.join('');
  }
  return opts.join('');
}

function resolveRateFromReference(rates, preferred) {
  const list = rates || [];
  if (!list.length) return preferred || '';
  if (preferred && list.some(r => r.rateDesc === preferred)) return preferred;
  return list[0].rateDesc;
}

function buildUomSelectOptions(uomList, selected) {
  const list = uomList || [];
  if (!list.length) return '<option value="">— Select UOM —</option>';

  const hasSelected = selected && list.some(u => u.description === selected);
  const opts = list.map(u => {
    const sel = u.description === selected ? ' selected' : '';
    return `<option value="${u.description}"${sel}>${u.description}</option>`;
  });

  if (!hasSelected) {
    return opts.join('');
  }
  return opts.join('');
}

function resolveUomFromReference(uomList, preferred) {
  const list = uomList || [];
  if (!list.length) return preferred || '';
  if (preferred && list.some(u => u.description === preferred)) return preferred;
  return list[0].description;
}

function buildHsDatalistId(scenarioId) {
  return `hs-codes-${scenarioId}`;
}

function ensureHsDatalist(scenarioId, serviceHsCodes) {
  const listId = buildHsDatalistId(scenarioId);
  let dl = document.getElementById(listId);
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = listId;
    document.body.appendChild(dl);
  }
  dl.innerHTML = (serviceHsCodes || [])
    .map(h => `<option value="${h.hsCode}">${h.description || h.hsCode}</option>`)
    .join('');
  return listId;
}

function applyReferenceToItemRow(row, ref, presetDefaults = {}) {
  if (!row || !ref) return;
  const idx = row.id.replace('item-row-', '');

  const saleEl = row.querySelector(`[name="saleType_${idx}"]`);
  if (saleEl) saleEl.value = ref.saleType;

  const hsEl = row.querySelector(`[name="hsCode_${idx}"]`);
  if (hsEl) {
    const listId = ensureHsDatalist(ref.scenarioId, ref.serviceHsCodes);
    hsEl.setAttribute('list', listId);
    if (presetDefaults.hsCode) hsEl.value = presetDefaults.hsCode;
  }

  const rateEl = row.querySelector(`[name="rate_${idx}"]`);
  if (rateEl && ref.rates?.length) {
    const parent = rateEl.parentElement;
    const chosen = resolveRateFromReference(ref.rates, presetDefaults.rate || rateEl.value);
    const select = document.createElement('select');
    select.name = `rate_${idx}`;
    select.innerHTML = buildRateSelectOptions(ref.rates, chosen);
    select.value = chosen;
    parent.replaceChild(select, rateEl);
  }

  const uomEl = row.querySelector(`[name="uoM_${idx}"]`);
  if (uomEl && ref.uomList?.length) {
    const parent = uomEl.parentElement;
    const chosen = resolveUomFromReference(ref.uomList, presetDefaults.uoM || uomEl.value);
    const select = document.createElement('select');
    select.name = `uoM_${idx}`;
    select.innerHTML = buildUomSelectOptions(ref.uomList, chosen);
    select.value = chosen;
    parent.replaceChild(select, uomEl);
  }

  const fedEl = row.querySelector(`[name="fedPayable_${idx}"]`);
  if (fedEl) {
    fedEl.value = presetDefaults.fedPayable ?? '0';
    fedEl.readOnly = !ref.fedInStMode;
  }

  recalcRowTaxFromDom(row);
  if (typeof attachTaxListeners === 'function') attachTaxListeners(row);
}

async function bindHsUomLookup(row, scenarioId) {
  const idx = row.id.replace('item-row-', '');
  const hsEl = row.querySelector(`[name="hsCode_${idx}"]`);
  const uomEl = row.querySelector(`[name="uoM_${idx}"]`);
  if (!hsEl || !uomEl) return;

  const handler = async () => {
    const hs = hsEl.value.trim();
    if (!hs || hs.length < 4) return;
    try {
      const result = await fetchHsUomForScenario(scenarioId, hs);
      if (!result.uom?.length) return;
      if (uomEl.tagName === 'SELECT') {
        const chosen = resolveUomFromReference(result.uom, uomEl.value);
        uomEl.innerHTML = buildUomSelectOptions(result.uom, chosen);
        uomEl.value = chosen;
      }
    } catch (err) {
      console.warn('HS UOM lookup:', err.message);
    }
  };

  hsEl.removeEventListener('change', hsEl._scenarioUomHandler);
  hsEl._scenarioUomHandler = handler;
  hsEl.addEventListener('change', handler);
}

async function applyPlanetiveScenarioReference(scenarioId) {
  if (!appConfig.planetiveMode || activeEnv !== 'sandbox') return null;

  scenarioRefLoading = scenarioId;
  try {
    const ref = await fetchScenarioReference(scenarioId);
    if (scenarioRefLoading !== scenarioId) return ref;

    const preset = getClientScenarioPreset(scenarioId);
    const defaults = preset?.itemDefaults || {};

    getItemCards().forEach(row => {
      applyReferenceToItemRow(row, ref, defaults);
      bindHsUomLookup(row, scenarioId);
    });

    return ref;
  } finally {
    if (scenarioRefLoading === scenarioId) scenarioRefLoading = null;
  }
}

function invalidateScenarioRefCache() {
  scenarioRefCache = {};
}

async function onPlanetiveScenarioChanged() {
  invalidateScenarioRefCache();
  const scenarioId = getActiveScenarioId();
  const preset = getClientScenarioPreset(scenarioId);

  const badge = document.getElementById('scenario-preset-badge');
  if (badge && preset) {
    badge.textContent = `${preset.scenarioId} – ${preset.description || preset.itemDefaults?.saleType || ''}`;
  }

  if (appConfig.planetiveMode && activeEnv === 'sandbox') {
    await applyPlanetiveScenarioReference(scenarioId);
  }
}
