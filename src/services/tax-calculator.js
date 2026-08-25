'use strict';

const { findScheduleDescriptionByCode } = require('../constants/sro-schedule-codes');

const FED_ST_SALE_TYPE = 'Services (FED in ST Mode)';
const SERVICES_SALE_TYPE = 'Services';

function isServicesSaleType(saleType) {
  const normalized = String(saleType || '').trim().toLowerCase();
  return normalized === SERVICES_SALE_TYPE.toLowerCase()
    || normalized === FED_ST_SALE_TYPE.toLowerCase();
}

function parseTaxRate(rateStr) {
  if (rateStr === null || rateStr === undefined || rateStr === '') return 0;
  const match = String(rateStr).match(/([\d.]+)\s*%?/);
  if (!match) return 0;
  return parseFloat(match[1]) / 100;
}

/** FBR 0077 — SRO Schedule mandatory for goods when line rate is not exactly 18%. */
function rateRequiresSroSchedule(rateStr, saleType) {
  if (isServicesSaleType(saleType)) return false;
  return shouldLoadSroSchedules(rateStr);
}

/** Load SRO options from FBR whenever rate is not 18% (including Services). */
function shouldLoadSroSchedules(rateStr) {
  const match = String(rateStr || '').match(/([\d.]+)/);
  if (!match) return false;
  const pct = parseFloat(match[1]);
  return !Number.isFinite(pct) || Math.abs(pct - 18) > 0.001;
}

function sroScheduleRequiredMessage(index, rate) {
  return (
    `Item ${index + 1}: valid SRO Schedule No. (S1000xxx code) is required when rate is not 18% (FBR 0077). ` +
    'Re-select the Rate so schedules reload, then pick the schedule from the dropdown.'
  );
}

/** Legacy UI values may still be S1000xxx codes from §10.2. */
function normalizeScheduleCode(value) {
  const v = String(value ?? '').trim();
  if (!v || v.toUpperCase() === 'SRO123') return '';
  if (/^S1000\d+$/i.test(v)) return v.toUpperCase();
  return '';
}

/**
 * FBR validate/submit expects srO_DESC from SroSchedule (e.g. "ICTO TABLE I"),
 * not the S1000xxx reference code. Accept description strings; map legacy codes.
 */
function resolveSroScheduleForPayload(value) {
  let v = String(value ?? '').trim();
  if (!v || v.toUpperCase() === 'SRO123') return '';

  // Dropdown may send "ICTO TABLE I (S1000452)" — FBR wants description only.
  const combined = v.match(/^(.+?)\s*\(S1000\d+\)\s*$/i);
  if (combined) v = combined[1].trim();

  if (/^S1000\d+$/i.test(v)) {
    const mapped = findScheduleDescriptionByCode(v);
    if (mapped) return mapped.toUpperCase();
    return '';
  }

  return v;
}

function roundMoney(n) {
  return Math.round((parseFloat(n) || 0) * 100) / 100;
}

function calculateSalesTax(valueExclST, rateStr) {
  const base = parseFloat(valueExclST) || 0;
  const tax  = base * parseTaxRate(rateStr);
  return roundMoney(tax);
}

function parseWithholdingRate(rate) {
  const v = parseFloat(rate);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
}

/** WHT is applied on the amount after sales tax (gross total). */
function calculateWithholding(grossTotal, ratePercent) {
  const gross = roundMoney(grossTotal);
  const rate  = parseWithholdingRate(ratePercent);
  const amount = roundMoney(gross * (rate / 100));
  return {
    withholdingRate:   rate,
    withholdingAmount: amount,
    netPayable:        roundMoney(gross - amount),
  };
}

function isFedInStModeSaleType(saleType) {
  return String(saleType || '').trim().toLowerCase() === FED_ST_SALE_TYPE.toLowerCase();
}

/**
 * salesTaxApplicable = Sales Tax or FED-in-ST-mode amount (FBR v1.12 field description).
 * fedPayable is optional; only passed through when supplied on the item.
 */
function enrichItemTax(item) {
  const valueExcl = parseFloat(item.valueSalesExcludingST) || 0;
  const stOrFed   = calculateSalesTax(valueExcl, item.rate);

  return {
    ...item,
    salesTaxApplicable: stOrFed,
    fedPayable:         parseFloat(item.fedPayable) || 0,
  };
}

function enrichPayloadTax(payload) {
  if (!payload?.items?.length) return payload;
  return {
    ...payload,
    items: payload.items.map(enrichItemTax),
  };
}

module.exports = {
  FED_ST_SALE_TYPE,
  SERVICES_SALE_TYPE,
  isServicesSaleType,
  parseTaxRate,
  shouldLoadSroSchedules,
  rateRequiresSroSchedule,
  sroScheduleRequiredMessage,
  normalizeScheduleCode,
  resolveSroScheduleForPayload,
  roundMoney,
  calculateSalesTax,
  parseWithholdingRate,
  calculateWithholding,
  isFedInStModeSaleType,
  enrichItemTax,
  enrichPayloadTax,
};
