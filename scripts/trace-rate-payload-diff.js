'use strict';

/**
 * Demonstrates validate vs submit rate divergence (SN018).
 * Run: node scripts/trace-rate-payload-diff.js
 */

const SN018_RATES = ['8%', '16%', '17%', '19.5%', '200/bill'];

function oldBuildRateSelectOptions(rates, selected) {
  const opts = rates.map(val => {
    const sel = val === selected ? ' selected' : '';
    return `<option value="${val}"${sel}>${val}</option>`;
  });
  return '<option value="">— Select rate —</option>' + opts.join('');
}

function oldResolveSelectValue(rates, selected) {
  const html = oldBuildRateSelectOptions(rates, selected);
  const hasOption = rates.includes(selected);
  return hasOption ? selected : '';
}

function resolveRateFromReference(rates, preferred) {
  if (!rates.length) return preferred || '';
  if (preferred && rates.includes(preferred)) return preferred;
  return rates[0];
}

const uiRateBeforeReference = '18.5%'; // SN019 default still in text input

const validatePayload = {
  scenarioId: 'SN018',
  items: [{ rate: uiRateBeforeReference, saleType: 'Services (FED in ST Mode)' }],
};

const submitRateFromDom = oldResolveSelectValue(SN018_RATES, uiRateBeforeReference);
const submitPayload = {
  scenarioId: 'SN018',
  items: [{ rate: submitRateFromDom, saleType: 'Services (FED in ST Mode)' }],
};

const fixedRate = resolveRateFromReference(SN018_RATES, uiRateBeforeReference);

console.log('=== Validate payload (text input, before select replacement) ===');
console.log(JSON.stringify(validatePayload, null, 2));
console.log('\n=== Submit payload (select after reference apply — OLD behaviour) ===');
console.log(JSON.stringify(submitPayload, null, 2));
console.log('\n=== Diff ===');
console.log('validate items[0].rate:', JSON.stringify(validatePayload.items[0].rate));
console.log('submit   items[0].rate:', JSON.stringify(submitPayload.items[0].rate));
console.log('FBR error 0020 when submit rate is empty:', submitPayload.items[0].rate === '');
console.log('\n=== Fixed client rate resolution ===', fixedRate);
console.log('=== Fixed server: submit uses DB request_payload when workflow_status=pending ===');
