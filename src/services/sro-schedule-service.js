'use strict';

const { FBR_URLS } = require('../constants');

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

function normalizeScheduleCode(value) {
  const v = String(value ?? '').trim();
  return /^S1000\d+$/i.test(v) ? v.toUpperCase() : '';
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
    const code = normalizeScheduleCode(val);
    if (code) return code;
  }
  return '';
}

function matchScheduleCode(scheduleRow, itemCodeRows) {
  const direct = scheduleCodeFromRow(scheduleRow);
  if (direct) return direct;

  const desc = scheduleDescription(scheduleRow).toLowerCase();
  if (!desc) return '';

  for (const row of itemCodeRows) {
    if (scheduleDescription(row).toLowerCase() === desc) {
      const code = scheduleCodeFromRow(row);
      if (code) return code;
    }
  }

  for (const row of itemCodeRows) {
    const d = scheduleDescription(row).toLowerCase();
    if (d && (d.includes(desc) || desc.includes(d))) {
      const code = scheduleCodeFromRow(row);
      if (code) return code;
    }
  }

  return '';
}

async function resolveSroSchedules(fbrGet, { rate_id, date, origination_supplier_csv }, environment) {
  const [schedulesRaw, itemCodesRaw] = await Promise.all([
    fbrGet(FBR_URLS.SRO_SCHEDULE, {
      rate_id,
      date: toFbrDate(date),
      origination_supplier_csv,
    }, environment),
    fbrGet(FBR_URLS.SRO_ITEM_CODE, {}, environment),
  ]);

  const schedules = unwrapList(schedulesRaw);
  const itemCodes = unwrapList(itemCodesRaw);

  return schedules.map(row => {
    const sroId = row.srO_ID ?? row.sroId ?? row.sro_id ?? null;
    const scheduleNo = matchScheduleCode(row, itemCodes);
    return {
      sroId,
      scheduleNo,
      description: scheduleDescription(row),
      label: scheduleDescription(row) || scheduleNo || String(sroId ?? ''),
    };
  }).filter(entry => entry.scheduleNo);
}

module.exports = { resolveSroSchedules, normalizeScheduleCode, scheduleCodeFromRow };
