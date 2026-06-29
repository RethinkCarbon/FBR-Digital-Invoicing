'use strict';

const { getCompanySettings } = require('./company-settings-service');
const { enrichPayloadTax } = require('./tax-calculator');
const { getScenarioPreset, getDefaultScenarioId } = require('../constants/scenario-presets');
const { isPlanetiveMode } = require('../constants/app-mode');
const { validateAndResolveNote } = require('./note-validation-service');

async function buildFbrPayload(rawPayload, { environment, clientId, skipNoteValidation = false } = {}) {
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
    await validateAndResolveNote(rawPayload, { environment });
  }

  const payload = { ...rawPayload };

  payload.sellerBusinessName = company.business_name;
  payload.sellerNTNCNIC      = company.ntn;
  payload.sellerProvince     = company.province;
  payload.sellerAddress      = company.address;

  if (environment === 'sandbox') {
    const scenarioId = payload.scenarioId || (isPlanetiveMode() ? getDefaultScenarioId() : null);
    if (!scenarioId) {
      throw new Error('scenarioId is required for sandbox submissions');
    }
    payload.scenarioId = scenarioId;

    const preset = getScenarioPreset(scenarioId);
    if (preset?.itemDefaults && Array.isArray(payload.items)) {
      payload.items = payload.items.map(item => ({
        ...item,
        saleType: item.saleType || preset.itemDefaults.saleType,
      }));
    }
  }

  return enrichPayloadTax(payload);
}

async function prepareFbrSubmission(rawPayload, options = {}) {
  const noteMeta = await validateAndResolveNote(rawPayload, { environment: options.environment });
  const payload  = await buildFbrPayload(rawPayload, { ...options, skipNoteValidation: true });
  return { payload, noteMeta };
}

module.exports = { buildFbrPayload, prepareFbrSubmission };
