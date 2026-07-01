'use strict';

/**
 * FBR province names from Reference API GET /v1/provinces (stateProvinceDesc).
 * Payloads to FBR must use these exact values.
 */
const FBR_PROVINCES = Object.freeze([
  { code: 2, official: 'BALOCHISTAN' },
  { code: 4, official: 'AZAD JAMMU AND KASHMIR' },
  { code: 5, official: 'CAPITAL TERRITORY' },
  { code: 6, official: 'KHYBER PAKHTUNKHWA' },
  { code: 7, official: 'PUNJAB' },
  { code: 8, official: 'SINDH' },
  { code: 9, official: 'GILGIT BALTISTAN' },
]);

const OFFICIAL_BY_UPPER = new Map(
  FBR_PROVINCES.map(p => [p.official.toUpperCase(), p.official])
);

/** Common / legacy labels → official FBR stateProvinceDesc */
const PROVINCE_ALIASES = Object.freeze({
  balochistan:              'BALOCHISTAN',
  'azad jammu and kashmir': 'AZAD JAMMU AND KASHMIR',
  ajk:                      'AZAD JAMMU AND KASHMIR',
  'capital territory':      'CAPITAL TERRITORY',
  islamabad:                'CAPITAL TERRITORY',
  ict:                      'CAPITAL TERRITORY',
  'khyber pakhtunkhwa':     'KHYBER PAKHTUNKHWA',
  kpk:                      'KHYBER PAKHTUNKHWA',
  punjab:                   'PUNJAB',
  sindh:                    'SINDH',
  'gilgit baltistan':       'GILGIT BALTISTAN',
  gb:                       'GILGIT BALTISTAN',
});

const DISPLAY_LABELS = Object.freeze({
  BALOCHISTAN:              'Balochistan',
  'AZAD JAMMU AND KASHMIR': 'Azad Jammu & Kashmir',
  'CAPITAL TERRITORY':      'Islamabad (Capital Territory)',
  'KHYBER PAKHTUNKHWA':     'Khyber Pakhtunkhwa',
  PUNJAB:                   'Punjab',
  SINDH:                    'Sindh',
  'GILGIT BALTISTAN':       'Gilgit Baltistan',
});

function normalizeProvinceForFbr(value) {
  if (value === null || value === undefined) return value;
  const trimmed = String(value).trim();
  if (!trimmed) return trimmed;

  const official = OFFICIAL_BY_UPPER.get(trimmed.toUpperCase());
  if (official) return official;

  const alias = PROVINCE_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;

  return trimmed;
}

function provinceDisplayLabel(official) {
  if (!official) return official;
  const normalized = normalizeProvinceForFbr(official);
  return DISPLAY_LABELS[normalized] || normalized;
}

function listFbrProvinces() {
  return FBR_PROVINCES.map(p => ({
    code:     p.code,
    official: p.official,
    label:    provinceDisplayLabel(p.official),
  }));
}

module.exports = {
  FBR_PROVINCES,
  normalizeProvinceForFbr,
  provinceDisplayLabel,
  listFbrProvinces,
};
