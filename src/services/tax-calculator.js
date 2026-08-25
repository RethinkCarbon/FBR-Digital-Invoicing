'use strict';

const FED_ST_SALE_TYPE = 'Services (FED in ST Mode)';

function parseTaxRate(rateStr) {
  if (rateStr === null || rateStr === undefined || rateStr === '') return 0;
  const match = String(rateStr).match(/([\d.]+)\s*%?/);
  if (!match) return 0;
  return parseFloat(match[1]) / 100;
}

/** FBR 0077 — SRO Schedule mandatory when line rate is not exactly 18%. */
function rateRequiresSroSchedule(rateStr) {
  const match = String(rateStr || '').match(/([\d.]+)/);
  if (!match) return false;
  const pct = parseFloat(match[1]);
  return !Number.isFinite(pct) || Math.abs(pct - 18) > 0.001;
}

function normalizeScheduleCode(value) {
  const v = String(value ?? '').trim();
  return /^S1000\d+$/i.test(v) ? v.toUpperCase() : '';
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
  parseTaxRate,
  rateRequiresSroSchedule,
  normalizeScheduleCode,
  roundMoney,
  calculateSalesTax,
  parseWithholdingRate,
  calculateWithholding,
  isFedInStModeSaleType,
  enrichItemTax,
  enrichPayloadTax,
};
