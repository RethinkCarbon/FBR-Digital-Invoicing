'use strict';

const { getCompanySettings } = require('./company-settings-service');
const { enrichPayloadTax, rateRequiresSroSchedule, resolveSroScheduleForPayload, sroScheduleRequiredMessage } = require('./tax-calculator');
const { getScenarioPreset, getDefaultScenarioId } = require('../constants/scenario-presets');
const { isPlanetiveMode } = require('../constants/app-mode');
const { validateAndResolveNote, validateRequiredNoteFields, findOriginalByRef, validateNoteAgainstOriginal, resolveAdjustmentType } = require('./note-validation-service');
const { assertCreditNoteAllowed } = require('./doctype-service');
const { requireValidFbrProvince } = require('../constants/provinces');

// Invoices are always dated the day they are prepared — backdating is not allowed.
function todayIsoDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day   = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function sanitizeItemForFbr(item, index) {
  const cleaned = { ...item };

  const scheduleNo = resolveSroScheduleForPayload(cleaned.sroScheduleNo);
  if (!scheduleNo) {
    delete cleaned.sroScheduleNo;
  } else {
    cleaned.sroScheduleNo = scheduleNo;
  }

  if (rateRequiresSroSchedule(cleaned.rate, cleaned.saleType) && !cleaned.sroScheduleNo) {
    throw new Error(sroScheduleRequiredMessage(index + 1, cleaned.rate));
  }

  if (cleaned.sroScheduleNo && !String(cleaned.sroItemSerialNo || '').trim()) {
    throw new Error(
      `Item ${index + 1}: SRO Item S/N is required when SRO Schedule No. is set (FBR 0078).`
    );
  }

  const sroItem = String(cleaned.sroItemSerialNo ?? '').trim();
  if (!sroItem) {
    delete cleaned.sroItemSerialNo;
  } else {
    cleaned.sroItemSerialNo = sroItem;
  }

  // FBR requires this field; keep 0 when missing
  if (cleaned.fixedNotifiedValueOrRetailPrice == null || cleaned.fixedNotifiedValueOrRetailPrice === '') {
    cleaned.fixedNotifiedValueOrRetailPrice = 0;
  } else {
    cleaned.fixedNotifiedValueOrRetailPrice = parseFloat(cleaned.fixedNotifiedValueOrRetailPrice) || 0;
  }

  if (!String(cleaned.hsCode || '').trim()) {
    throw new Error(`hsCode is required on line item ${index + 1}`);
  }
  if (!String(cleaned.rate || '').trim()) {
    throw new Error(`rate is required on line item ${index + 1}`);
  }

  return cleaned;
}

async function buildFbrPayload(rawPayload, { environment, clientId, skipNoteValidation = false } = {}) {
  const dated = { ...rawPayload, invoiceDate: todayIsoDate() };

  let company;
  try {
    company = await getCompanySettings();
  } catch (err) {
    const msg = String(err.message);
    if (msg.includes('Could not find the table')) {
      throw new Error(
        'Company settings table is missing. Run supabase/migrations/003_company_and_clients.sql ' +
        'in the Supabase SQL Editor, then restart the server.'
      );
    }
    throw err;
  }

  if (!company) {
    throw new Error(
      'Company settings not found. Restart the server to seed demo settings, or save your details under Company Settings.'
    );
  }

  if (!skipNoteValidation) {
    await validateAndResolveNote(dated, { environment });
  }

  const payload = { ...dated };

  payload.sellerBusinessName = company.business_name;
  payload.sellerNTNCNIC      = company.ntn;
  payload.sellerProvince     = requireValidFbrProvince(company.province, 'Seller province');
  payload.sellerAddress      = company.address;

  if (environment === 'sandbox') {
    const scenarioId = payload.scenarioId || (isPlanetiveMode() ? getDefaultScenarioId() : null);
    if (!scenarioId) {
      throw new Error('scenarioId is required for sandbox submissions');
    }
    payload.scenarioId = scenarioId;

    const preset = getScenarioPreset(scenarioId);
    if (preset?.buyerDefaults) {
      for (const [key, value] of Object.entries(preset.buyerDefaults)) {
        if (value != null && !String(payload[key] ?? '').trim()) {
          payload[key] = value;
        }
      }
    }
    if (preset?.itemDefaults && Array.isArray(payload.items)) {
      payload.items = payload.items.map(item => ({
        ...item,
        saleType: item.saleType || preset.itemDefaults.saleType,
      }));
    }
  }

  payload.buyerProvince = requireValidFbrProvince(payload.buyerProvince, 'Buyer province');

  if (Array.isArray(payload.items)) {
    payload.items = payload.items.map((item, index) => sanitizeItemForFbr(item, index));
  }

  return enrichPayloadTax(payload);
}

async function prepareFbrSubmission(rawPayload, options = {}) {
  const required = validateRequiredNoteFields(rawPayload);

  if (required.noteType === 'credit') {
    await assertCreditNoteAllowed(options.environment);
  }

  const payload = await buildFbrPayload(rawPayload, { ...options, skipNoteValidation: true });

  payload.adjustmentType = resolveAdjustmentType(rawPayload);
  if (required.noteType === 'sale') {
    payload.invoiceType = rawPayload.invoiceType || 'Sale Invoice';
  } else if (required.noteType === 'credit') {
    payload.invoiceType = 'Credit Note';
  } else {
    payload.invoiceType = 'Debit Note';
  }

  let noteMeta = { noteType: 'sale', originalInvoiceId: null, noteReason: null };
  if (required.noteType !== 'sale') {
    const original = await findOriginalByRef(payload.invoiceRefNo, options.environment);
    validateNoteAgainstOriginal(payload, original, required.noteType);
    noteMeta = {
      noteType:          required.noteType,
      noteReason:        required.noteReason,
      originalInvoiceId: original?.id ?? null,
      originalInvoice:   original,
    };
  }

  return { payload, noteMeta };
}

module.exports = { buildFbrPayload, prepareFbrSubmission };
