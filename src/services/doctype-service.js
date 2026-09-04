'use strict';

const axios = require('axios');
const { FBR_URLS } = require('../constants');

const DEFAULT_INVOICE_TYPES = ['Sale Invoice', 'Debit Note'];
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function getToken(environment) {
  const env = environment === 'production' ? 'production' : 'sandbox';
  if (env === 'production') {
    return (process.env.FBR_PRODUCTION_TOKEN || process.env.FBR_BEARER_TOKEN || '').trim();
  }
  return (process.env.FBR_SANDBOX_TOKEN || process.env.FBR_BEARER_TOKEN || '').trim();
}

function normalizeDocTypes(data) {
  const rows = Array.isArray(data) ? data : (data?.data ?? []);
  return rows
    .map(r => String(r.docDescription ?? r.docTypeDescription ?? '').trim())
    .filter(Boolean);
}

function creditNoteAvailable(types = []) {
  return types.some(t => String(t).toLowerCase().includes('credit'));
}

async function getInvoiceTypes(environment = 'sandbox') {
  const env = environment === 'production' ? 'production' : 'sandbox';
  const cached = cache.get(env);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.types;
  }

  const token = getToken(env);
  if (!token) {
    return DEFAULT_INVOICE_TYPES;
  }

  try {
    const res = await axios.get(FBR_URLS.DOC_TYPES, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    const types = normalizeDocTypes(res.data);
    const result = types.length ? types : DEFAULT_INVOICE_TYPES;
    cache.set(env, { at: Date.now(), types: result });
    return result;
  } catch {
    return DEFAULT_INVOICE_TYPES;
  }
}

async function assertCreditNoteAllowed(environment) {
  const types = await getInvoiceTypes(environment);
  if (!creditNoteAvailable(types)) {
    throw new Error(
      'Credit Note is not enabled on your FBR registration (FBR 0071). ' +
      'Contact PRAL/FBR to enable credit notes. Debit Note is for increases only — ' +
      'it cannot reverse or reduce tax (FBR 0067).'
    );
  }
}

module.exports = {
  DEFAULT_INVOICE_TYPES,
  creditNoteAvailable,
  getInvoiceTypes,
  assertCreditNoteAllowed,
};
