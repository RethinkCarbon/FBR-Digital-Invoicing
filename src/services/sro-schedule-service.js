'use strict';

const { FBR_URLS } = require('../constants');
const { findScheduleCodeByDescription } = require('../constants/sro-schedule-codes');

const FBR_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function unwrapList(data) {
  if (Array.isArray(data)) return data;
  if (data?.value && Array.isArray(data.value)) return data.value;
  return [];
}

function toFbrDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  if (/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(raw)) return raw;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[3]}-${FBR_MONTHS[Number(iso[2]) - 1]}-${iso[1]}`;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return `${String(d.getDate()).padStart(2, '0')}-${FBR_MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/** Invoice payload must use S1000xxx codes (not numeric srO_ID). */
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
    ?? ''
  ).trim();
}

function scheduleCodeFromRow(row) {
  if (!row || typeof row !== 'object') return '';

  for (const val of Object.values(row)) {
    const s = String(val ?? '').trim();
    if (/^S1000\d+$/i.test(s)) return s.toUpperCase();
  }

  const description = scheduleDescription(row);
  const mapped = findScheduleCodeByDescription(description);
  if (mapped) return mapped;

  return '';
}

async function resolveSroSchedules(fbrGet, { rate_id, date, origination_supplier_csv }, environment) {
  const schedulesRaw = await fbrGet(FBR_URLS.SRO_SCHEDULE, {
    rate_id,
    date: toFbrDate(date),
    origination_supplier_csv,
  }, environment);

  const schedules = unwrapList(schedulesRaw);

  return schedules.map(row => {
    const sroId = row.srO_ID ?? row.sroId ?? row.sro_id ?? null;
    const description = scheduleDescription(row);
    const scheduleNo = scheduleCodeFromRow(row);
    const scheduleDesc = description || '';
    return {
      sroId,
      scheduleNo,
      scheduleDesc,
      description,
      label: scheduleNo
        ? `${scheduleNo} — ${description || 'SRO schedule'}`
        : (description || String(sroId || '')),
    };
  }).filter(entry => entry.scheduleDesc || entry.scheduleNo);
}

module.exports = {
  resolveSroSchedules,
  normalizeScheduleCode,
  scheduleCodeFromRow,
  scheduleDescription,
};
