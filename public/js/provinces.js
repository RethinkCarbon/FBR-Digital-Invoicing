'use strict';

/**
 * FBR province names (stateProvinceDesc) — must match src/constants/provinces.js.
 */
const FBR_PROVINCES = [
  { code: 2, official: 'BALOCHISTAN' },
  { code: 4, official: 'AZAD JAMMU AND KASHMIR' },
  { code: 5, official: 'CAPITAL TERRITORY' },
  { code: 6, official: 'KHYBER PAKHTUNKHWA' },
  { code: 7, official: 'PUNJAB' },
  { code: 8, official: 'SINDH' },
  { code: 9, official: 'GILGIT BALTISTAN' },
];

const OFFICIAL_BY_UPPER = new Map(
  FBR_PROVINCES.map(p => [p.official.toUpperCase(), p.official])
);

const PROVINCE_ALIASES = {
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
};

const DISPLAY_LABELS = {
  BALOCHISTAN:              'Balochistan',
  'AZAD JAMMU AND KASHMIR': 'Azad Jammu & Kashmir',
  'CAPITAL TERRITORY':      'Islamabad (Capital Territory)',
  'KHYBER PAKHTUNKHWA':     'Khyber Pakhtunkhwa',
  PUNJAB:                   'Punjab',
  SINDH:                    'Sindh',
  'GILGIT BALTISTAN':       'Gilgit Baltistan',
};

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

function populateProvinceSelect(selectEl, selectedValue) {
  if (!selectEl) return;
  selectEl.innerHTML = '<option value="">— Select Province —</option>';
  FBR_PROVINCES.forEach(p => {
    selectEl.appendChild(new Option(provinceDisplayLabel(p.official), p.official));
  });
  if (selectedValue) {
    selectEl.value = normalizeProvinceForFbr(selectedValue);
  }
}
