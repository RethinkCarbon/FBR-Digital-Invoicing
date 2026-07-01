'use strict';

const supabase = require('../supabase');
const { WORKFLOW_STATUS, workflowToLegacy } = require('../constants/invoice-status');
const {
  extractFbrStatus,
  extractItemStatuses,
  normalizeFbrStatusForStorage,
} = require('../constants/fbr-status');
const { allocateInternalInvoiceNumber } = require('./invoice-number');
const { getSalesDashboard } = require('./sales-dashboard-service');

const RETRY_DELAYS_SEC = [30, 120, 600, 3600, 3600];

function computeNextRetryAt(retryCount) {
  const delaySec = RETRY_DELAYS_SEC[Math.min(retryCount, RETRY_DELAYS_SEC.length - 1)];
  return new Date(Date.now() + delaySec * 1000).toISOString();
}

function noteTypeFromPayload(payload = {}) {
  const t = (payload.invoiceType || '').toLowerCase();
  if (t.includes('debit')) return 'debit';
  if (t.includes('credit')) return 'credit';
  return 'sale';
}

function extractMetaFromPayload(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  let subtotal = 0;
  let salesTax = 0;
  let furtherTax = 0;

  for (const item of items) {
    subtotal   += parseFloat(item.valueSalesExcludingST) || 0;
    salesTax   += parseFloat(item.salesTaxApplicable) || 0;
    furtherTax += parseFloat(item.furtherTax) || 0;
  }

  return {
    scenario_id:   payload.scenarioId ?? null,
    invoice_date:  payload.invoiceDate ?? null,
    buyer_name:    payload.buyerBusinessName ?? null,
    buyer_ntn:     payload.buyerNTNCNIC ?? null,
    subtotal,
    sales_tax:     salesTax,
    total_amount:  subtotal + salesTax + furtherTax,
    note_type:     noteTypeFromPayload(payload),
    note_reason:   payload.reason ?? null,
  };
}

function buildInvoiceRecord(fields) {
  const workflow = fields.workflow_status;
  const meta     = extractMetaFromPayload(fields.request_payload);

  return {
    environment:          fields.environment,
    workflow_status:      workflow,
    status:               fields.status ?? workflowToLegacy(workflow),
    action:               fields.action ?? null,
    internal_invoice_no:  fields.internal_invoice_no ?? null,
    client_id:            fields.client_id ?? null,
    request_payload:      fields.request_payload ?? null,
    fbr_invoice_number:   fields.fbr_invoice_number ?? null,
    response_payload:     fields.response_payload ?? null,
    error_message:        fields.error_message ?? null,
    qr_code:              fields.qr_code ?? null,
    retry_count:          fields.retry_count ?? 0,
    next_retry_at:        fields.next_retry_at ?? null,
    last_attempt_at:      fields.last_attempt_at ?? null,
    max_retries:          fields.max_retries ?? 5,
    original_invoice_id:  fields.original_invoice_id ?? null,
    ...meta,
    note_type:            fields.note_type ?? meta.note_type,
    note_reason:          fields.note_reason ?? meta.note_reason,
  };
}

async function syncItemAudit(invoiceId, itemStatuses) {
  if (!Array.isArray(itemStatuses) || !itemStatuses.length) return;

  for (const item of itemStatuses) {
    const itemSno = item.itemSNo || item.itemSno;
    if (!itemSno) continue;

    const { error } = await supabase
      .from('invoice_item_audit')
      .upsert({
        invoice_id:      invoiceId,
        item_sno:        String(itemSno),
        fbr_item_status: item.status ?? null,
      }, { onConflict: 'invoice_id,item_sno' });

    if (error) console.error(`item audit sync failed for invoice ${invoiceId}:`, error.message);
  }
}

async function createDraft({ environment, request_payload, client_id, original_invoice_id = null, note_type = null, note_reason = null }) {
  const internal_invoice_no = await allocateInternalInvoiceNumber();

  const record = buildInvoiceRecord({
    environment,
    workflow_status: WORKFLOW_STATUS.DRAFT,
    action:          'draft',
    internal_invoice_no,
    request_payload,
    client_id,
    original_invoice_id,
    note_type,
    note_reason,
  });

  const { data, error } = await supabase
    .from('invoices')
    .insert(record)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function updateDraft(id, { request_payload, client_id, original_invoice_id, note_type, note_reason }) {
  const { data: existing, error: findErr } = await supabase
    .from('invoices')
    .select('workflow_status')
    .eq('id', id)
    .single();

  if (findErr || !existing) throw new Error('Invoice not found');
  if (existing.workflow_status !== WORKFLOW_STATUS.DRAFT) {
    throw new Error('Only draft invoices can be updated this way');
  }

  const meta = extractMetaFromPayload(request_payload);
  const patch = {
    request_payload,
    client_id: client_id ?? null,
    ...meta,
  };

  if (original_invoice_id !== undefined) patch.original_invoice_id = original_invoice_id;
  if (note_type !== undefined) patch.note_type = note_type ?? meta.note_type;
  if (note_reason !== undefined) patch.note_reason = note_reason ?? meta.note_reason;

  const { data, error } = await supabase
    .from('invoices')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function enqueueForSubmission({
  invoiceId,
  environment,
  request_payload,
  client_id,
  action,
  original_invoice_id = null,
  note_type = null,
  note_reason = null,
}) {
  const now = new Date().toISOString();

  if (invoiceId) {
    const { data: existing, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (error || !existing) throw new Error('Invoice not found');
    if (existing.workflow_status === WORKFLOW_STATUS.SUBMITTED) {
      throw new Error('Invoice already submitted — create a new invoice');
    }
    if (existing.workflow_status === WORKFLOW_STATUS.PROCESSING) {
      throw new Error('Invoice is currently being processed — wait or retry later');
    }

    const patch = buildInvoiceRecord({
      environment,
      workflow_status: WORKFLOW_STATUS.QUEUED,
      action,
      internal_invoice_no: existing.internal_invoice_no,
      request_payload,
      client_id: client_id ?? existing.client_id,
      retry_count: existing.retry_count ?? 0,
      max_retries: existing.max_retries ?? 5,
      next_retry_at: now,
      last_attempt_at: null,
      error_message: null,
      original_invoice_id: original_invoice_id ?? existing.original_invoice_id,
      note_type:           note_type ?? existing.note_type,
      note_reason:         note_reason ?? existing.note_reason,
    });

    const { data, error: updErr } = await supabase
      .from('invoices')
      .update(patch)
      .eq('id', invoiceId)
      .select('*')
      .single();

    if (updErr) throw new Error(updErr.message);
    return data;
  }

  const internal_invoice_no = await allocateInternalInvoiceNumber();
  const record = buildInvoiceRecord({
    environment,
    workflow_status: WORKFLOW_STATUS.QUEUED,
    action,
    internal_invoice_no,
    request_payload,
    client_id,
    next_retry_at: now,
    original_invoice_id,
    note_type,
    note_reason,
  });

  const { data, error } = await supabase
    .from('invoices')
    .insert(record)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function claimNextJob() {
  const now = new Date().toISOString();

  const { data: candidates, error: findErr } = await supabase
    .from('invoices')
    .select('id')
    .in('workflow_status', [WORKFLOW_STATUS.QUEUED, WORKFLOW_STATUS.RETRYING])
    .lte('next_retry_at', now)
    .order('next_retry_at', { ascending: true })
    .limit(1);

  if (findErr) throw new Error(findErr.message);
  if (!candidates?.length) return null;

  const { data, error } = await supabase
    .from('invoices')
    .update({
      workflow_status: WORKFLOW_STATUS.PROCESSING,
      last_attempt_at: now,
      status:          workflowToLegacy(WORKFLOW_STATUS.PROCESSING),
    })
    .eq('id', candidates[0].id)
    .in('workflow_status', [WORKFLOW_STATUS.QUEUED, WORKFLOW_STATUS.RETRYING])
    .select('*')
    .single();

  if (error || !data) return null;
  return data;
}

async function finalizeFbrResult(id, {
  valid,
  action,
  fbrData,
  qrCode,
  errorMessage,
}) {
  const isSubmit = action === 'submit';
  let workflow_status = WORKFLOW_STATUS.FAILED;

  if (valid) {
    workflow_status = isSubmit ? WORKFLOW_STATUS.SUBMITTED : WORKFLOW_STATUS.PENDING;
  }

  const itemStatuses = extractItemStatuses(fbrData);
  const fbrStatus    = normalizeFbrStatusForStorage(extractFbrStatus(fbrData));

  const patch = {
    workflow_status,
    status:             workflowToLegacy(workflow_status),
    fbr_invoice_number: fbrData?.invoiceNumber ?? null,
    response_payload:   fbrData ?? null,
    error_message:      valid ? null : (errorMessage ?? null),
    qr_code:            qrCode ?? null,
    fbr_status:         fbrStatus,
    item_statuses:      itemStatuses,
    next_retry_at:      null,
  };

  if (valid && isSubmit) {
    patch.submitted_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  if (itemStatuses) {
    await syncItemAudit(id, itemStatuses);
  }

  return data;
}

async function markFailed(id, errorMessage, { scheduleRetry = false } = {}) {
  if (scheduleRetry) {
    const { data: row } = await supabase
      .from('invoices')
      .select('retry_count, max_retries')
      .eq('id', id)
      .single();

    const retryCount = (row?.retry_count ?? 0) + 1;
    const maxRetries = row?.max_retries ?? 5;

    if (retryCount <= maxRetries) {
      const { data, error } = await supabase
        .from('invoices')
        .update({
          workflow_status: WORKFLOW_STATUS.QUEUED,
          status:          workflowToLegacy(WORKFLOW_STATUS.QUEUED),
          error_message:   errorMessage,
          retry_count:     retryCount,
          next_retry_at:   computeNextRetryAt(retryCount - 1),
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return data;
    }
  }

  const { data, error } = await supabase
    .from('invoices')
    .update({
      workflow_status: WORKFLOW_STATUS.FAILED,
      status:          workflowToLegacy(WORKFLOW_STATUS.FAILED),
      error_message:   errorMessage,
      next_retry_at:   null,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function requeueInvoice(id) {
  const { data: existing, error: findErr } = await supabase
    .from('invoices')
    .select('workflow_status, retry_count, action')
    .eq('id', id)
    .single();

  if (findErr || !existing) throw new Error('Invoice not found');
  if (![WORKFLOW_STATUS.FAILED, WORKFLOW_STATUS.CANCELLED].includes(existing.workflow_status)) {
    throw new Error('Only failed or cancelled invoices can be retried');
  }

  const retryAction =
    existing.action === 'validate' || existing.action === 'submit'
      ? existing.action
      : 'submit';
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('invoices')
    .update({
      workflow_status: WORKFLOW_STATUS.RETRYING,
      status:          workflowToLegacy(WORKFLOW_STATUS.RETRYING),
      action:          retryAction,
      retry_count:     (existing.retry_count ?? 0) + 1,
      next_retry_at:   now,
      error_message:   null,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function cancelInvoice(id) {
  const { data: existing } = await supabase
    .from('invoices')
    .select('workflow_status')
    .eq('id', id)
    .single();

  if (!existing) throw new Error('Invoice not found');
  if (existing.workflow_status === WORKFLOW_STATUS.SUBMITTED) {
    throw new Error('Submitted invoices cannot be cancelled');
  }
  if (existing.workflow_status === WORKFLOW_STATUS.PROCESSING) {
    throw new Error('Invoice is being processed — try again shortly');
  }

  const { data, error } = await supabase
    .from('invoices')
    .update({
      workflow_status: WORKFLOW_STATUS.CANCELLED,
      status:          workflowToLegacy(WORKFLOW_STATUS.CANCELLED),
      next_retry_at:   null,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function getInvoiceById(id) {
  const { data, error } = await supabase.from('invoices').select('*').eq('id', id).single();
  if (error || !data) throw new Error('Invoice not found');
  return data;
}

async function listInvoices({
  q,
  status,
  environment,
  dateFrom,
  dateTo,
  fbrStatus,
  limit = 50,
  offset = 0,
}) {
  let query = supabase
    .from('invoices')
    .select(
      'id, internal_invoice_no, workflow_status, environment, action, fbr_invoice_number, ' +
      'buyer_name, buyer_ntn, invoice_date, scenario_id, subtotal, sales_tax, total_amount, ' +
      'error_message, retry_count, next_retry_at, last_attempt_at, fbr_status, item_statuses, created_at, updated_at',
      { count: 'exact' }
    )
    .order('invoice_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('workflow_status', status);
  if (environment) query = query.eq('environment', environment);
  if (fbrStatus) query = query.eq('fbr_status', fbrStatus);

  if (dateFrom) query = query.gte('invoice_date', dateFrom);
  if (dateTo) query = query.lte('invoice_date', dateTo);

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    query = query.or(
      `internal_invoice_no.ilike.${term},fbr_invoice_number.ilike.${term},buyer_name.ilike.${term},buyer_ntn.ilike.${term}`
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { items: data ?? [], total: count ?? 0 };
}

async function countInvoices({ environment, workflow_status } = {}) {
  let query = supabase.from('invoices').select('*', { count: 'exact', head: true });

  if (environment) query = query.eq('environment', environment);

  if (workflow_status) {
    if (Array.isArray(workflow_status)) {
      query = query.in('workflow_status', workflow_status);
    } else {
      query = query.eq('workflow_status', workflow_status);
    }
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function getInvoiceStats({ environment } = {}) {
  const base = environment ? { environment } : {};

  const [total, submitted, failed, pending, inQueue, sales] = await Promise.all([
    countInvoices(base),
    countInvoices({ ...base, workflow_status: WORKFLOW_STATUS.SUBMITTED }),
    countInvoices({ ...base, workflow_status: WORKFLOW_STATUS.FAILED }),
    countInvoices({ ...base, workflow_status: [WORKFLOW_STATUS.DRAFT, WORKFLOW_STATUS.PENDING] }),
    countInvoices({
      ...base,
      workflow_status: [WORKFLOW_STATUS.QUEUED, WORKFLOW_STATUS.PROCESSING, WORKFLOW_STATUS.RETRYING],
    }),
    getSalesDashboard({ environment }),
  ]);

  return { total, submitted, failed, pending, inQueue, sales };
}

async function getQueueStats({ environment } = {}) {
  const base = environment ? { environment } : {};

  const [queued, processing, retrying, failedRetryable] = await Promise.all([
    countInvoices({ ...base, workflow_status: WORKFLOW_STATUS.QUEUED }),
    countInvoices({ ...base, workflow_status: WORKFLOW_STATUS.PROCESSING }),
    countInvoices({ ...base, workflow_status: WORKFLOW_STATUS.RETRYING }),
    countInvoices({ ...base, workflow_status: WORKFLOW_STATUS.FAILED }),
  ]);

  return { queued, processing, retrying, failed: failedRetryable, total: queued + processing + retrying };
}

module.exports = {
  WORKFLOW_STATUS,
  computeNextRetryAt,
  createDraft,
  updateDraft,
  enqueueForSubmission,
  claimNextJob,
  finalizeFbrResult,
  markFailed,
  requeueInvoice,
  cancelInvoice,
  getInvoiceById,
  listInvoices,
  getInvoiceStats,
  getQueueStats,
};
