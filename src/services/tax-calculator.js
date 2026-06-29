'use strict';

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

function enrichItemTax(item) {
  const valueExcl = parseFloat(item.valueSalesExcludingST) || 0;
  const salesTax  = calculateSalesTax(valueExcl, item.rate);
  return {
    ...item,
    salesTaxApplicable: salesTax,
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
  parseTaxRate,
  calculateSalesTax,
  enrichItemTax,
  enrichPayloadTax,
};
