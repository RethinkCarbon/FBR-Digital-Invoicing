'use strict';

const supabase = require('../supabase');
const { WORKFLOW_STATUS } = require('../constants/invoice-status');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function utcDateParts(d = new Date()) {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

function isoDateUtc(year, monthIndex, day) {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function monthBoundsUtc(year, monthIndex) {
  const start = isoDateUtc(year, monthIndex, 1);
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const end = isoDateUtc(year, monthIndex, lastDay);
  const label = new Date(Date.UTC(year, monthIndex, 1)).toLocaleString('en-US', {
    month: 'long',
    year:  'numeric',
    timeZone: 'UTC',
  });
  const shortLabel = new Date(Date.UTC(year, monthIndex, 1)).toLocaleString('en-US', {
    month: 'short',
    year:  'numeric',
    timeZone: 'UTC',
  });
  return { start, end, label, shortLabel, year, month: monthIndex, key: start.slice(0, 7) };
}

function submittedSalesQuery(environment) {
  let q = supabase
    .from('invoices')
    .select('total_amount, invoice_date')
    .eq('workflow_status', WORKFLOW_STATUS.SUBMITTED)
    .not('invoice_date', 'is', null)
    .or('note_type.eq.sale,note_type.is.null');

  if (environment) q = q.eq('environment', environment);
  return q;
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

async function getSalesDashboard({ environment } = {}) {
  const now = new Date();
  const { year, month, day } = utcDateParts(now);
  const todayStr = isoDateUtc(year, month, day);
  const curMonth = monthBoundsUtc(year, month);

  const chartStartMonthIndex = month - 5;
  const chartYear = chartStartMonthIndex < 0 ? year - 1 : year;
  const chartMonth = ((chartStartMonthIndex % 12) + 12) % 12;
  const rangeStart = monthBoundsUtc(chartYear, chartMonth).start;

  const sevenDaysAgo = isoDateUtc(year, month, day - 6);

  const { data, error } = await submittedSalesQuery(environment)
    .gte('invoice_date', rangeStart)
    .lte('invoice_date', curMonth.end);

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const byDate = Object.create(null);
  const byMonth = Object.create(null);
  const countByDate = Object.create(null);
  const countByMonth = Object.create(null);

  for (const row of rows) {
    const dateKey = row.invoice_date;
    if (!dateKey) continue;
    const amt = parseFloat(row.total_amount) || 0;
    const monthKey = dateKey.slice(0, 7);

    byDate[dateKey] = (byDate[dateKey] || 0) + amt;
    countByDate[dateKey] = (countByDate[dateKey] || 0) + 1;
    byMonth[monthKey] = (byMonth[monthKey] || 0) + amt;
    countByMonth[monthKey] = (countByMonth[monthKey] || 0) + 1;
  }

  const todayTotal = byDate[todayStr] || 0;
  const todayCount = countByDate[todayStr] || 0;
  const monthTotal = byMonth[curMonth.key] || 0;
  const monthCount = countByMonth[curMonth.key] || 0;

  const dailyChart = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(year, month, day - i));
    const p = utcDateParts(d);
    const dateKey = isoDateUtc(p.year, p.month, p.day);
    const total = byDate[dateKey] || 0;
    const count = countByDate[dateKey] || 0;
    dailyChart.push({
      date:      dateKey,
      label:     d.toLocaleString('en-US', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }),
      shortDate: d.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      total:     roundMoney(total),
      count,
      isToday:   dateKey === todayStr,
    });
  }

  const monthlyChart = [];
  for (let i = 5; i >= 0; i -= 1) {
    const mIndex = month - i;
    const mYear = mIndex < 0 ? year - 1 : year;
    const mMonth = ((mIndex % 12) + 12) % 12;
    const bounds = monthBoundsUtc(mYear, mMonth);
    const total = byMonth[bounds.key] || 0;
    const count = countByMonth[bounds.key] || 0;
    monthlyChart.push({
      month:     bounds.key,
      label:     bounds.shortLabel,
      fullLabel: bounds.label,
      total:     roundMoney(total),
      count,
      isCurrent: bounds.key === curMonth.key,
    });
  }

  const dailyMax = Math.max(...dailyChart.map(d => d.total), 1);
  const monthlyMax = Math.max(...monthlyChart.map(m => m.total), 1);

  return {
    currency:      'PKR',
    today: {
      date:    todayStr,
      label:   now.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }),
      total:   roundMoney(todayTotal),
      count:   todayCount,
    },
    month: {
      key:     curMonth.key,
      label:   curMonth.label,
      total:   roundMoney(monthTotal),
      count:   monthCount,
    },
    dailyChart:   dailyChart.map(d => ({ ...d, barPercent: Math.round((d.total / dailyMax) * 100) })),
    monthlyChart: monthlyChart.map(m => ({ ...m, barPercent: Math.round((m.total / monthlyMax) * 100) })),
    chartRange: {
      dailyFrom:  sevenDaysAgo,
      dailyTo:    todayStr,
      monthlyFrom: rangeStart,
      monthlyTo:   curMonth.end,
    },
    environment: environment ?? null,
  };
}

module.exports = { getSalesDashboard };
