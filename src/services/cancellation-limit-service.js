'use strict';

const supabase = require('../supabase');
const { WORKFLOW_STATUS } = require('../constants/invoice-status');

const CANCELLATION_LIMIT_RATE = 0.10;

function monthUtcRange(year, monthIndex) {
  const start = new Date(Date.UTC(year, monthIndex, 1)).toISOString();
  const end   = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999)).toISOString();
  const label = new Date(Date.UTC(year, monthIndex, 1)).toLocaleString('en-US', {
    month: 'long',
    year:  'numeric',
    timeZone: 'UTC',
  });
  return { start, end, label };
}

function sumAmounts(rows, field) {
  return (rows ?? []).reduce((acc, row) => acc + (parseFloat(row[field]) || 0), 0);
}

async function getCancellationLimit({ environment } = {}) {
  const now = new Date();
  const curYear  = now.getUTCFullYear();
  const curMonth = now.getUTCMonth();

  const priorMonthIndex = curMonth === 0 ? 11 : curMonth - 1;
  const priorYear       = curMonth === 0 ? curYear - 1 : curYear;

  const salesPeriod = monthUtcRange(priorYear, priorMonthIndex);
  const cancelPeriod = monthUtcRange(curYear, curMonth);

  let salesQuery = supabase
    .from('invoices')
    .select('total_amount')
    .eq('workflow_status', WORKFLOW_STATUS.SUBMITTED)
    .gte('submitted_at', salesPeriod.start)
    .lte('submitted_at', salesPeriod.end);

  let cancelQuery = supabase
    .from('invoices')
    .select('cancellation_amount')
    .in('fbr_cancellation_status', ['requested', 'pending_fbr', 'approved_local'])
    .gte('cancellation_requested_at', cancelPeriod.start)
    .lte('cancellation_requested_at', cancelPeriod.end);

  if (environment) {
    salesQuery  = salesQuery.eq('environment', environment);
    cancelQuery = cancelQuery.eq('environment', environment);
  }

  const [{ data: salesRows, error: salesErr }, { data: cancelRows, error: cancelErr }] =
    await Promise.all([salesQuery, cancelQuery]);

  if (salesErr) throw new Error(salesErr.message);
  if (cancelErr) throw new Error(cancelErr.message);

  const lastMonthSales     = sumAmounts(salesRows, 'total_amount');
  const cancellationLimit  = lastMonthSales * CANCELLATION_LIMIT_RATE;
  const cancellationValue  = sumAmounts(cancelRows, 'cancellation_amount');
  const remainingLimit     = Math.max(0, cancellationLimit - cancellationValue);
  const usedPercent        = cancellationLimit > 0
    ? Math.min(100, (cancellationValue / cancellationLimit) * 100)
    : 0;

  return {
    limitPercent:        CANCELLATION_LIMIT_RATE * 100,
    lastMonthSales,
    lastMonthLabel:      salesPeriod.label,
    cancellationLimit,
    cancellationValue,
    remainingLimit,
    usedPercent:       Math.round(usedPercent * 10) / 10,
    currentMonthLabel: cancelPeriod.label,
    environment:       environment ?? null,
  };
}

module.exports = { CANCELLATION_LIMIT_RATE, getCancellationLimit };
