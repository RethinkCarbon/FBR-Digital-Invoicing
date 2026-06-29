'use strict';

const supabase = require('../supabase');

async function allocateInternalInvoiceNumber(year = new Date().getFullYear()) {
  const { data, error } = await supabase.rpc('next_internal_invoice_number', { p_year: year });

  if (!error && data) return data;

  // Fallback if RPC not deployed yet
  const { data: row, error: selErr } = await supabase
    .from('invoice_sequences')
    .select('last_number')
    .eq('year', year)
    .maybeSingle();

  if (selErr && selErr.code !== 'PGRST116') {
    if (selErr.message?.includes('invoice_sequences')) {
      throw new Error(
        'Database migration required: run supabase/migrations/002_invoice_workflow.sql ' +
        'in the Supabase SQL Editor (Dashboard → SQL → New query), then restart the server.'
      );
    }
    throw new Error(`Invoice sequence read failed: ${selErr.message}`);
  }

  const next = (row?.last_number ?? 0) + 1;

  const { error: upsertErr } = await supabase
    .from('invoice_sequences')
    .upsert({ year, last_number: next, updated_at: new Date().toISOString() }, { onConflict: 'year' });

  if (upsertErr) throw new Error(`Invoice sequence write failed: ${upsertErr.message}`);

  return `PLT-${year}-${String(next).padStart(4, '0')}`;
}

module.exports = { allocateInternalInvoiceNumber };
