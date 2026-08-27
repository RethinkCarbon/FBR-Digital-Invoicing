'use strict';

/**
 * Local ICTO Schedule Table-1 / Table-2 labels for SRO Item S/N.
 * FBR's SROItem API only returns serial codes (e.g. "11(a)"); descriptions
 * come from Islamabad Capital Territory (Tax on Services) Ordinance, 2001.
 * Source: FBR ICTO PDF (updated to 30.06.2025).
 */

const ICTO_TABLE_I = Object.freeze([
  { serial: '1', description: 'Hotels, motels, guest houses, farmhouses, marriage halls, lawns, clubs and caterers', pct: ['98.01', '9801'] },
  { serial: '1(i)', description: 'Hotels, motels, guest houses, farmhouses, marriage halls, lawns, clubs and caterers', pct: ['98.01', '9801'] },
  { serial: '1(ii)', description: 'Restaurants, cafes, food outlets and similar ready-to-eat food services', pct: ['98.01', '9801'] },
  { serial: '2', description: 'Advertisement on television and radio', pct: ['9802.1000', '9802.2000'] },
  { serial: '3', description: 'Stevedores, customs agents and ship chandlers', pct: ['9805.2000', '9805.4000', '9805.8000'] },
  { serial: '4', description: 'Courier and cargo services by road', pct: ['9808.0000', '9804.9000'] },
  { serial: '5', description: 'Construction services', pct: ['9824.0000', '9814.2000'] },
  { serial: '6', description: 'Property developers and promoters (including allied services)', pct: ['9807.0000', '98.14'] },
  { serial: '7', description: 'Contractual works / execution of work', pct: ['9809.0000'] },
  { serial: '8', description: 'Personal care (beauty parlours, clinics, massage, cosmetic/plastic surgery)', pct: ['9810.0000', '9821.4000', '9821.5000'] },
  { serial: '9', description: 'Management consultancy services', pct: ['9815.4000'] },
  { serial: '10', description: 'Freight forwarding agents, packers and movers', pct: ['9805.3000', '9819.1400'] },
  { serial: '11', description: 'IT services and IT-enabled services', pct: ['9819.9300'] },
  { serial: '11(a)', description: 'IT services (software, system design, web, hosting, network design)', pct: ['9819.9300'] },
  { serial: '11(b)', description: 'IT-enabled services (call centres, data entry, cloud, HR, graphics, etc.)', pct: ['9819.9300'] },
  { serial: '12', description: 'Technical, scientific and engineering consultants', pct: ['9815.5000', '9815.9000'] },
  { serial: '13', description: 'Other consultants (HR, market research, credit rating, etc.)', pct: ['9815.9000', '9818.3000', '9818.2000'] },
  { serial: '14', description: 'Tour operators and travel agents (other than Hajj/Umrah)', pct: ['9805.5100', '9805.5000', '9803.9000'] },
  { serial: '15', description: 'Manpower recruitment agents including labour supplies', pct: ['9805.6000'] },
  { serial: '16', description: 'Security agencies', pct: ['9818.1000'] },
  { serial: '17', description: 'Advertising agents', pct: ['9805.7000'] },
  { serial: '18', description: 'Share transfer or depository agents', pct: ['9805.9000'] },
  { serial: '19', description: 'Business support services', pct: ['9805.9200'] },
  { serial: '20', description: 'Fashion designers (textile, leather, jewellery, etc.)', pct: ['9819.6000'] },
  { serial: '21', description: 'Architects, town planners and interior decorators', pct: ['9814.1000', '9814.9000'] },
  { serial: '22', description: 'Rent-a-car services', pct: ['9819.3000'] },
  { serial: '23', description: 'Specialized workshops / service stations', pct: ['98.20', '9820'] },
  { serial: '24', description: 'Fumigation, maintenance, cleaning, janitorial and similar services', pct: ['98.22', '9822'] },
  { serial: '25', description: 'Underwriters, indenters, commission agents, brokers (other than stock), auctioneers', pct: ['9819.1100', '9819.1200', '9819.1300', '9819.9100'] },
  { serial: '26', description: 'Laboratories (other than pathological/diagnostic for patients)', pct: ['98.17', '9817'] },
  { serial: '27', description: 'Health clubs, gyms, fitness / indoor sports / sauna centres', pct: ['9821.1000', '9821.2000', '9821.4000'] },
  { serial: '28', description: 'Laundries and dry cleaners', pct: ['9811.0000'] },
  { serial: '29', description: 'Cable TV operators', pct: ['9819.9000'] },
  { serial: '30', description: 'Technical analysis and testing services', pct: ['9819.9400'] },
  { serial: '31', description: 'TV or radio program producers / production houses', pct: [] },
  { serial: '32', description: 'Transportation through pipeline and conduit', pct: [] },
  { serial: '33', description: 'Fund and asset (including investment) management services', pct: [] },
  { serial: '34', description: 'Inland port / airport / dry port / terminal operators', pct: [] },
  { serial: '35', description: 'Technical inspection and certification services', pct: [] },
  { serial: '36', description: 'Erection, commissioning and installation services', pct: [] },
  { serial: '37', description: 'Event management services', pct: [] },
  { serial: '38', description: 'Valuation; competency and eligibility testing services', pct: [] },
  { serial: '39', description: 'Exhibition or convention services', pct: [] },
  { serial: '40', description: 'Mining of minerals, oil and gas services', pct: [] },
  { serial: '41', description: 'Property dealers and realtors', pct: [] },
  { serial: '42', description: 'Call centres', pct: [] },
  { serial: '43', description: 'Car / automobile dealers', pct: [] },
  { serial: '44', description: 'Advertisement on hoardings, signboards, websites or internet', pct: ['9802.9000'] },
  { serial: '45', description: 'Landscape designers', pct: ['9814.4000'] },
  { serial: '46', description: 'Sponsorship services', pct: ['9805.9100'] },
  { serial: '47', description: 'Legal practitioners and consultants', pct: ['9815.2000'] },
  { serial: '48', description: 'Accountants and auditors', pct: ['9815.3000'] },
  { serial: '49', description: 'Stock/future/commodity brokers, money exchangers, photographers, surveyors, etc.', pct: ['9819.1000', '9819.2000', '9819.5000', '9819.7000', '9819.8000', '9819.9100', '9819.9500', '9819.9090'] },
  { serial: '50', description: 'Race clubs: entry/admission and other services', pct: [] },
  { serial: '51', description: 'Corporate law consultants', pct: ['9815.9000'] },
  { serial: '52', description: 'Visa processing / migration consultancy', pct: [] },
  { serial: '53', description: 'Debt collection and recovery services', pct: [] },
  { serial: '54', description: 'Supply chain management or distribution services', pct: [] },
  { serial: '55', description: 'Inter-city transportation or carriage of goods', pct: [] },
  { serial: '56', description: 'Ready mix concrete services', pct: [] },
  { serial: '57', description: 'Public relations services', pct: [] },
  { serial: '58', description: 'Training or coaching services (other than education)', pct: [] },
  { serial: '59', description: 'Cleaning, janitorial, waste collection and processing', pct: ['9822.2000', '9822.3000', '9822.9000'] },
  { serial: '60', description: 'Electric power transmission services', pct: [] },
]);

const ICTO_TABLE_II = Object.freeze([
  { serial: '1', description: 'Construction services (reduced/zero-rated conditions)', pct: ['9814.2000', '9824.0000'] },
  { serial: '2', description: 'Personal care services (reduced-rate conditions)', pct: ['9810.0000', '9821.4000', '9821.5000'] },
  { serial: '3', description: 'Freight forwarding agents, packers and movers (reduced rate)', pct: ['9805.3000', '9819.1400'] },
  { serial: '4', description: 'Tour operators and travel agents (reduced rate)', pct: ['9803.9000', '9805.5000', '9805.5100'] },
  { serial: '5', description: 'Specialized workshops (reduced rate)', pct: ['98.20', '9820'] },
  { serial: '6', description: 'Health clubs, gyms, fitness centres (reduced rate)', pct: ['9821.1000', '9821.2000', '9821.4000'] },
  { serial: '7', description: 'Laundries and dry cleaners (reduced rate)', pct: ['9811.0000'] },
  { serial: '8', description: 'Property dealers and realtors (reduced/zero conditions)', pct: [] },
  { serial: '9', description: 'Car / automobile dealers (reduced rate)', pct: [] },
  { serial: '10', description: 'Marriage halls, lawns, pandal/shamiana and caterers (reduced rate)', pct: [] },
  { serial: '11', description: 'Software / IT-based system development consultants (5%)', pct: ['9815.6000'] },
  { serial: '12', description: 'Property developers — low-cost housing schemes (Naya Pakistan / Ehsaas etc.)', pct: ['9807.0000', '98.14'] },
]);

function normalizeIctoSerial(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function normalizePctCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function ictoTableFromSchedule(scheduleValue) {
  const v = String(scheduleValue || '').toUpperCase();
  if (v.includes('TABLE II') || v.includes('TABLE-2') || v.includes('TABLE 2') || v.includes('S1000431')) {
    return 'II';
  }
  if (v.includes('TABLE I') || v.includes('TABLE-1') || v.includes('TABLE 1') || v.includes('S1000452') || v.includes('ICTO')) {
    return 'I';
  }
  return null;
}

function ictoEntriesForTable(table) {
  if (table === 'II') return ICTO_TABLE_II;
  return ICTO_TABLE_I;
}

function lookupIctoItem(serial, tableHint) {
  const key = normalizeIctoSerial(serial);
  if (!key) return null;

  const tables = tableHint === 'II'
    ? [ICTO_TABLE_II, ICTO_TABLE_I]
    : tableHint === 'I'
      ? [ICTO_TABLE_I, ICTO_TABLE_II]
      : [ICTO_TABLE_I, ICTO_TABLE_II];

  for (const list of tables) {
    const exact = list.find(e => normalizeIctoSerial(e.serial) === key);
    if (exact) return { ...exact, table: list === ICTO_TABLE_II ? 'II' : 'I', match: 'exact' };
  }

  // FBR may send 1(i)(i) while we store 1(i) / 1 — longest prefix wins
  for (const list of tables) {
    let best = null;
    for (const e of list) {
      const s = normalizeIctoSerial(e.serial);
      if (!s) continue;
      if (key === s || key.startsWith(s) || s.startsWith(key)) {
        if (!best || s.length > normalizeIctoSerial(best.serial).length) best = e;
      }
    }
    if (best) return { ...best, table: list === ICTO_TABLE_II ? 'II' : 'I', match: 'prefix' };
  }

  const base = key.match(/^(\d+)/)?.[1];
  if (base) {
    for (const list of tables) {
      const hit = list.find(e => normalizeIctoSerial(e.serial) === base);
      if (hit) return { ...hit, table: list === ICTO_TABLE_II ? 'II' : 'I', match: 'base' };
    }
  }
  return null;
}

function truncateIctoLabel(text, max = 64) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function formatIctoItemLabel(serial, fbrId, tableHint) {
  const hit = typeof lookupIctoItem === 'function' ? lookupIctoItem(serial, tableHint) : null;
  const idBit = fbrId != null && fbrId !== '' ? `id ${fbrId}` : '';
  if (hit?.description) {
    const label = `${serial} — ${truncateIctoLabel(hit.description)}`;
    return {
      label,
      hint: idBit,
      title: `${serial} — ${hit.description}${idBit ? ` (${idBit})` : ''} [ICTO Table ${hit.table}]`,
      meta: hit,
    };
  }
  return {
    label: idBit ? `${serial} (${idBit})` : String(serial),
    hint: '',
    title: idBit ? `${serial} (${idBit})` : String(serial),
    meta: null,
  };
}

function pctMatchesHs(pctList, hsCode) {
  const hs = normalizePctCode(hsCode);
  if (!hs) return 0;
  const hsDigits = hs.replace(/\D/g, '');
  let best = 0;
  for (const raw of pctList || []) {
    const pct = normalizePctCode(raw);
    if (!pct) continue;
    if (pct === hs) return 100;
    const pctDigits = pct.replace(/\D/g, '');
    if (pctDigits && hsDigits && (hsDigits.startsWith(pctDigits) || pctDigits.startsWith(hsDigits))) {
      best = Math.max(best, 80);
      continue;
    }
    // Family match: 9815.0000 ↔ 9815.4000 / 9815.6000
    const hsHead = hs.match(/^(\d{4})/)?.[1];
    const pctHead = pct.match(/^(\d{4})/)?.[1];
    if (hsHead && pctHead && hsHead === pctHead) best = Math.max(best, 50);
    if (pct.endsWith(' series') || pct.includes('.')) {
      const stem = pct.replace(/\s*series$/i, '').replace(/\.$/, '');
      if (stem && hs.startsWith(stem.replace(/\./g, '').slice(0, 4))) {
        /* already handled via head */
      }
    }
  }
  return best;
}

/**
 * Pick best FBR option value for this HS code using ICTO PCT column.
 * Generic headings like 9815.0000 are not auto-picked (too broad).
 * @param {string} hsCode
 * @param {Array<{ value: string }>} options
 * @param {'I'|'II'|null} tableHint
 * @returns {{ value: string, score: number, description: string, genericHs?: boolean }|null}
 */
function suggestIctoSerialFromHs(hsCode, options, tableHint) {
  const hs = normalizePctCode(hsCode);
  if (!hs || !options?.length) return null;

  // Bare family codes (9815.0000) match too many rows — don't auto-pick.
  const genericHs = /\.0000$/.test(hs);

  let best = null;
  for (const opt of options) {
    const serial = opt.value;
    const hit = lookupIctoItem(serial, tableHint);
    if (!hit) continue;
    let score = pctMatchesHs(hit.pct, hs);
    if (!score) continue;
    if (hit.match === 'exact') score += 5;
    if (hit.match === 'prefix') score += 3;
    if (normalizeIctoSerial(serial) === '11(a)' && score >= 50) score += 2;
    if (!best || score > best.score) {
      best = { value: serial, score, description: hit.description, genericHs: false };
    }
  }

  if (!best || best.score < 50) return null;

  // Exact / strong PCT match only for auto-use; family-only matches still returned but flagged.
  if (genericHs || best.score < 80) {
    return { ...best, genericHs: true };
  }
  return best;
}
