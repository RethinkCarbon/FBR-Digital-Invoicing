'use strict';

const FED_ST_SALE_TYPE = 'Services (FED in ST Mode)';

function parseTaxRate(rateStr) {
  if (rateStr === null || rateStr === undefined || rateStr === '') return 0;
  const match = String(rateStr).match(/([\d.]+)\s*%?/);
  if (!match) return 0;
  return parseFloat(match[1]) / 100;
}

function calculateSalesTax(valueExclST, rateStr) {
  const base = parseFloat(valueExclST) || 0;
  const tax  = base * parseTaxRate(rateStr);
  return Math.round(tax * 100) / 100;
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
  calculateSalesTax,
  isFedInStModeSaleType,
  enrichItemTax,
  enrichPayloadTax,
};
