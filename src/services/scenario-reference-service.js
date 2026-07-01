'use strict';

const { FBR_URLS } = require('../constants');
const { getScenarioPreset, SCENARIO_PRESETS } = require('../constants/scenario-presets');
const { getProvinceCode, normalizeProvinceForFbr } = require('../constants/provinces');

const FBR_RATE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatFbrRateDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}-${FBR_RATE_MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

function unwrapList(data) {
  if (Array.isArray(data)) return data;
  if (data?.value && Array.isArray(data.value)) return data.value;
  return [];
}

function normalizeTransTypeDesc(desc) {
  return String(desc || '').trim().toLowerCase();
}

async function fetchTransTypes(fbrGet) {
  return unwrapList(await fbrGet(FBR_URLS.TRANS_TYPES));
}

async function resolveTransType(transTypes, saleType) {
  const target = normalizeTransTypeDesc(saleType);
  return transTypes.find(t => normalizeTransTypeDesc(t.transactioN_DESC) === target) ?? null;
}

function filterServiceHsCodes(itemcodes) {
  return itemcodes
    .filter(row => String(row.hS_CODE || '').startsWith('98'))
    .map(row => ({
      hsCode:      row.hS_CODE,
      description: row.description || '',
    }));
}

async function fetchRates(fbrGet, { transTypeId, provinceCode, invoiceDate }) {
  if (!transTypeId || !provinceCode) return [];
  const raw = await fbrGet(FBR_URLS.SALE_TYPE_TO_RATE, {
    date:                formatFbrRateDate(invoiceDate ? new Date(invoiceDate) : new Date()),
    transTypeId,
    originationSupplier: provinceCode,
  });
  return unwrapList(raw).map(r => ({
    rateId:    r.ratE_ID,
    rateDesc:  r.ratE_DESC,
    rateValue: r.ratE_VALUE,
  }));
}

async function fetchUomList(fbrGet) {
  return unwrapList(await fbrGet(FBR_URLS.UOM)).map(u => ({
    uomId:       u.uoM_ID,
    description: u.description,
  }));
}

async function fetchServiceHsCodes(fbrGet) {
  const raw = await fbrGet(FBR_URLS.ITEM_CODES);
  return filterServiceHsCodes(unwrapList(raw));
}

async function fetchHsUom(fbrGet, hsCode, annexureIds = [1, 2, 3, 4, 5, 6]) {
  for (const annexureId of annexureIds) {
    const raw = await fbrGet(FBR_URLS.HS_UOM, { hs_code: hsCode, annexure_id: annexureId });
    const list = unwrapList(raw);
    if (list.length > 0) {
      return {
        hsCode,
        annexureId,
        uom: list.map(u => ({
          uomId:       u.uoM_ID,
          description: u.description,
        })),
      };
    }
  }
  return { hsCode, annexureId: null, uom: [] };
}

async function getScenarioReferenceData(fbrGet, scenarioId, { sellerProvince, invoiceDate } = {}) {
  const preset = getScenarioPreset(scenarioId);
  if (!preset) {
    throw new Error(`Unknown scenario: ${scenarioId}`);
  }

  const saleType = preset.itemDefaults?.saleType;
  if (!saleType) {
    throw new Error(`Scenario ${scenarioId} has no saleType in preset`);
  }

  const transTypes = await fetchTransTypes(fbrGet);
  const transType  = await resolveTransType(transTypes, saleType);
  const province   = normalizeProvinceForFbr(sellerProvince);
  const provinceCode = getProvinceCode(province);

  const [rates, serviceHsCodes, uomList] = await Promise.all([
    fetchRates(fbrGet, {
      transTypeId: transType?.transactioN_TYPE_ID,
      provinceCode,
      invoiceDate,
    }),
    fetchServiceHsCodes(fbrGet),
    fetchUomList(fbrGet),
  ]);

  return {
    scenarioId,
    description:    preset.description || null,
    saleType,
    fedInStMode:    Boolean(preset.fedInStMode),
    transType: transType
      ? {
          id:          transType.transactioN_TYPE_ID,
          description: String(transType.transactioN_DESC || '').trim(),
        }
      : null,
    sellerProvince: province,
    provinceCode,
    rateQueryDate:  formatFbrRateDate(invoiceDate ? new Date(invoiceDate) : new Date()),
    rates,
    serviceHsCodes,
    uomList,
    referenceApis: {
      transTypes:  FBR_URLS.TRANS_TYPES,
      itemCodes:   FBR_URLS.ITEM_CODES,
      rates:       FBR_URLS.SALE_TYPE_TO_RATE,
      uom:         FBR_URLS.UOM,
      hsUom:       FBR_URLS.HS_UOM,
    },
  };
}

function listPlanetiveScenarioPresets() {
  return Object.values(SCENARIO_PRESETS).filter(p => p.scenarioId === 'SN018' || p.scenarioId === 'SN019');
}

module.exports = {
  formatFbrRateDate,
  getScenarioReferenceData,
  fetchHsUom,
  listPlanetiveScenarioPresets,
  filterServiceHsCodes,
};
