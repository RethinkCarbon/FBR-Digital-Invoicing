'use strict';

async function loadSettingsForm() {
  const form = document.getElementById('settings-form');
  if (!form) return;

  try {
    const settings = await apiFetch('/api/settings');
    if (!settings) return;

    document.getElementById('settings-business-name').value = settings.business_name || '';
    document.getElementById('settings-ntn').value             = settings.ntn || '';
    document.getElementById('settings-strn').value            = settings.strn || '';
    document.getElementById('settings-address').value         = settings.address || '';
    document.getElementById('settings-email').value           = settings.email || '';
    document.getElementById('settings-phone').value           = settings.phone || '';
    document.getElementById('settings-logo-url').value        = settings.logo_url || '';

    const provSel = document.getElementById('settings-province');
    if (settings.province) provSel.value = settings.province;
  } catch (err) {
    console.warn('Settings load:', err.message);
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const btn = document.getElementById('settings-save-btn');
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  const body = {
    business_name: document.getElementById('settings-business-name').value.trim(),
    ntn:           document.getElementById('settings-ntn').value.trim(),
    strn:          document.getElementById('settings-strn').value.trim() || null,
    address:       document.getElementById('settings-address').value.trim(),
    province:      document.getElementById('settings-province').value,
    email:         document.getElementById('settings-email').value.trim() || null,
    phone:         document.getElementById('settings-phone').value.trim() || null,
    logo_url:      document.getElementById('settings-logo-url').value.trim() || null,
  };

  try {
    const saved = await apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(body) });
    appConfig.companySettings = saved;
    if (typeof renderSellerCard === 'function') renderSellerCard();
    if (typeof refreshClientSelect === 'function') refreshClientSelect();
    alert('Company settings saved.');
  } catch (err) {
    alert('Save failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

function setupSettingsPanel() {
  const form = document.getElementById('settings-form');
  if (!form) return;

  form.addEventListener('submit', saveSettings);
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof setupSettingsPanel === 'function') setupSettingsPanel();
});
