'use strict';

const FED_ST_SALE_TYPE = 'Services (FED in ST Mode)';
const SERVICES_SALE_TYPE = 'Services';

function isServicesSaleType(saleType) {
  const normalized = String(saleType || '').trim().toLowerCase();
  return normalized === SERVICES_SALE_TYPE.toLowerCase()
    || normalized === FED_ST_SALE_TYPE.toLowerCase();
}

/** True when FBR may return schedules for this rate (any sale type). */
function shouldLoadSroSchedules(rateStr) {
  const match = String(rateStr || '').match(/([\d.]+)/);
  if (!match) return false;
  const pct = parseFloat(match[1]);
  return !Number.isFinite(pct) || Math.abs(pct - 18) > 0.001;
}

/** FBR 0077 — SRO Schedule mandatory for goods when the line rate is not exactly 18%. */
function rateRequiresSroSchedule(rateStr, saleType) {
  if (isServicesSaleType(saleType)) return false;
  return shouldLoadSroSchedules(rateStr);
}

function sroScheduleRequiredMessage(index, rate) {
  return (
    `Item #${index}: SRO Schedule No. (S1000xxx code) is required for rate "${rate}".\n\n` +
    'Change the Rate once to reload schedules, then pick the schedule from the dropdown.'
  );
}

function unwrapFbrList(data) {
  if (Array.isArray(data)) return data;
  if (data?.value && Array.isArray(data.value)) return data.value;
  return [];
}

/** Legacy UI values may still be S1000xxx codes from §10.2. */
function normalizeScheduleCode(value) {
  const v = String(value ?? '').trim();
  if (!v || v.toUpperCase() === 'SRO123') return '';
  if (/^S1000\d+$/i.test(v)) return v.toUpperCase();
  return '';
}

function scheduleDescription(row) {
  return String(
    row?.description
    ?? row?.srO_DESC
    ?? row?.sroDesc
    ?? row?.srO_ITEM_DESC
    ?? row?.scheduleDesc
    ?? ''
  ).trim();
}

function scheduleCodeFromRow(row) {
  if (!row || typeof row !== 'object') return '';
  for (const val of Object.values(row)) {
    const s = String(val ?? '').trim();
    if (/^S1000\d+$/i.test(s)) return s.toUpperCase();
  }
  return '';
}

/**
 * FBR expects srO_DESC from SroSchedule (e.g. "ICTO TABLE I"), not S1000xxx codes.
 * Map legacy codes when present; otherwise pass the description through.
 */
function resolveSroScheduleForPayload(value) {
  let v = String(value ?? '').trim();
  if (!v || v.toUpperCase() === 'SRO123') return '';

  const combined = v.match(/^(.+?)\s*\(S1000\d+\)\s*$/i);
  if (combined) v = combined[1].trim();

  if (/^S1000\d+$/i.test(v)) {
    const mapped = scheduleDescriptionFromCode(v);
    return mapped ? mapped.toUpperCase() : '';
  }
  return v;
}

function scheduleDescriptionFromCode(code) {
  const table = [
    ['S1000452', 'ICTO Table I'],
    ['S1000431', 'ICTO Table II'],
  ];
  const target = String(code ?? '').trim().toUpperCase();
  const hit = table.find(([c]) => c === target);
  return hit ? hit[1] : '';
}

function resolveScheduleOptions(schedules) {
  return (schedules || []).map(row => {
    const sroId = row.srO_ID ?? row.sroId ?? row.sro_id ?? row.sroId ?? null;
    const scheduleDesc = scheduleDescription(row);
    const scheduleNo = row.scheduleNo || scheduleCodeFromRow(row);
    const label = row.label
      || (scheduleNo && scheduleDesc ? `${scheduleNo} — ${scheduleDesc}` : (scheduleDesc || scheduleNo || String(sroId ?? '—')));
    return {
      sroId,
      scheduleNo,
      scheduleDesc,
      label,
      raw: row,
    };
  }).filter(opt => opt.scheduleDesc || opt.scheduleNo);
}
