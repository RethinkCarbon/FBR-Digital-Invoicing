'use strict';

/** FBR error 0077 — SRO Schedule is mandatory when the line rate is not exactly 18%. */
function rateRequiresSroSchedule(rateStr) {
  const match = String(rateStr || '').match(/([\d.]+)/);
  if (!match) return false;
  const pct = parseFloat(match[1]);
  return !Number.isFinite(pct) || Math.abs(pct - 18) > 0.001;
}

function unwrapFbrList(data) {
  if (Array.isArray(data)) return data;
  if (data?.value && Array.isArray(data.value)) return data.value;
  return [];
}

function normalizeScheduleCode(value) {
  const v = String(value ?? '').trim();
  return /^S1000\d+$/i.test(v) ? v.toUpperCase() : '';
}

function scheduleCodeFromRow(row) {
  if (!row || typeof row !== 'object') return '';
  for (const val of Object.values(row)) {
    const code = normalizeScheduleCode(val);
    if (code) return code;
  }
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

function matchScheduleCode(scheduleRow, itemCodeRows) {
  const direct = scheduleCodeFromRow(scheduleRow);
  if (direct) return direct;

  const desc = scheduleDescription(scheduleRow).toLowerCase();
  if (!desc) return '';

  const rows = itemCodeRows || [];
  const exact = rows.find(r => scheduleDescription(r).toLowerCase() === desc);
  if (exact) {
    const code = scheduleCodeFromRow(exact);
    if (code) return code;
  }

  const partial = rows.find(r => {
    const d = scheduleDescription(r).toLowerCase();
    return d && (d.includes(desc) || desc.includes(d));
  });
  if (partial) {
    const code = scheduleCodeFromRow(partial);
    if (code) return code;
  }

  return '';
}

function resolveScheduleOptions(schedules, itemCodeRows) {
  return (schedules || []).map(row => {
    const sroId = row.srO_ID ?? row.sroId ?? row.sro_id ?? null;
    const scheduleNo = matchScheduleCode(row, itemCodeRows);
    const label = scheduleDescription(row) || scheduleNo || String(sroId ?? '—');
    return {
      sroId,
      scheduleNo,
      label,
      raw: row,
    };
  }).filter(opt => opt.scheduleNo || opt.sroId != null);
}
