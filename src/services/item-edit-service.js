'use strict';

const { isMockEnabled } = require('../constants/mock-config');
const supabase = require('../supabase');
const { WORKFLOW_STATUS } = require('../constants/invoice-status');
const { FBR_STATUS } = require('../constants/fbr-status');
const { getEditPolicy } = require('./invoice-edit-policy');
const { getCancellationLimit } = require('./cancellation-limit-service');
const { getInvoiceById, enqueueForSubmission } = require('./invoice-service');

async function getItemAudits(invoiceId) {
  const { data, error } = await supabase
    .from('invoice_item_audit')
    .select('*')
    .eq('invoice_id', invoiceId);

  if (error) throw new Error(error.message);
  return data ?? [];
}

function computeCancellationAmount(invoice, itemSnos, itemAudits) {
  const items = invoice.request_payload?.items || [];
  if (!itemSnos || !itemSnos.length) {
    return parseFloat(invoice.total_amount) || 0;
  }

  let total = 0;
  for (const sno of itemSnos.map(String)) {
    const idx = parseInt(sno, 10) - 1;
    const item = items[idx];
    if (!item) throw new Error(`Invalid item ${sno}`);
    const valueExcl = parseFloat(item.valueSalesExcludingST) || 0;
    const salesTax  = parseFloat(item.salesTaxApplicable) || 0;
    const further   = parseFloat(item.furtherTax) || 0;
    total += valueExcl + salesTax + further;
  }
  return total;
}

async function getInvoiceEditPolicy(id) {
  const invoice = await getInvoiceById(id);
  const audits  = await getItemAudits(id);
  return getEditPolicy(invoice, audits);
}

async function requestFbrCancellation(id, { itemSnos = null, reason = null } = {}) {
  const invoice = await getInvoiceById(id);
  const audits  = await getItemAudits(id);
  const policy  = getEditPolicy(invoice, audits);

  if (!policy.cancelAllowed) {
    if (policy.alreadyCancelled) throw new Error('Invoice is already cancelled on FBR');
    if (!policy.within72h) throw new Error('Cancellation window expired — must cancel within 72 hours of submission');
    if (policy.cancelPending) throw new Error('Cancellation already requested for this invoice');
    throw new Error('This invoice cannot be cancelled');
  }

  const targetSnos = itemSnos?.length ? itemSnos.map(String) : policy.items.map(i => i.itemSNo);

  for (const sno of targetSnos) {
    const itemPolicy = policy.items.find(i => i.itemSNo === sno);
    if (!itemPolicy) throw new Error(`Invalid item ${sno}`);
    if (!itemPolicy.canCancel) {
      throw new Error(`Item ${sno} cannot be cancelled — it was edited or is already cancelled`);
    }
  }

  const cancelAmount = computeCancellationAmount(invoice, targetSnos.length < policy.items.length ? targetSnos : null, audits);
  const limitInfo    = await getCancellationLimit({ environment: invoice.environment });

  if (cancelAmount > limitInfo.remainingLimit) {
    throw new Error(
      `Cancellation amount (${cancelAmount.toFixed(2)}) exceeds remaining monthly limit ` +
      `(${limitInfo.remainingLimit.toFixed(2)} of ${limitInfo.cancellationLimit.toFixed(2)})`
    );
  }

  const mockMode = isMockEnabled();
  const now      = new Date().toISOString();
  const isFullCancel = targetSnos.length === policy.items.length;

  const patch = {
    cancellation_requested_at: now,
    cancellation_amount:       cancelAmount,
    fbr_cancellation_status:   mockMode ? 'approved_local' : 'pending_fbr',
    fbr_status: mockMode
      ? (isFullCancel ? FBR_STATUS.CANCELLED : FBR_STATUS.PARTIALLY_CANCELLED)
      : invoice.fbr_status,
  };

  const { data, error } = await supabase
    .from('invoices')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  for (const sno of targetSnos) {
    const row = {
      invoice_id:   id,
      item_sno:     sno,
      is_cancelled: true,
      cancelled_at: now,
    };
    if (mockMode) row.fbr_item_status = FBR_STATUS.CANCELLED;

    await supabase
      .from('invoice_item_audit')
      .upsert(row, { onConflict: 'invoice_id,item_sno' });
  }

  return { invoice: data, mockApproved: mockMode, cancelAmount, limitInfo };
}

async function submitItemEdit(originalId, { items, noteType = 'debit', reason }, enrichPayload) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error('At least one item change is required');
  }
  if (!reason?.trim()) {
    throw new Error('Reason is required for invoice edits (debit/credit note)');
  }

  const original = await getInvoiceById(originalId);
  if (original.workflow_status !== WORKFLOW_STATUS.SUBMITTED) {
    throw new Error('Only submitted invoices can be edited');
  }

  const audits = await getItemAudits(originalId);
  const policy = getEditPolicy(original, audits);

  if (!policy.canEditItems) {
    throw new Error('No items are available for edit on this invoice');
  }

  const editableSet = new Set(policy.editableItemSnos);
  for (const edit of items) {
    const sno = String(edit.itemSNo);
    if (!editableSet.has(sno)) {
      throw new Error(`Item ${sno} cannot be edited (already edited or cancelled)`);
    }
  }

  const basePayload = { ...original.request_payload };
  const mergedItems = (basePayload.items || []).map((item, i) => {
    const sno  = String(i + 1);
    const edit = items.find(e => String(e.itemSNo) === sno);
    if (!edit) return { ...item };

    const { itemSNo, ...changes } = edit;
    return { ...item, ...changes };
  });

  const notePayload = {
    ...basePayload,
    items: mergedItems,
    invoiceType: noteType === 'credit' ? 'Credit Note' : 'Debit Note',
    invoiceRefNo: original.fbr_invoice_number,
    reason: reason.trim(),
  };

  const enriched = await enrichPayload(notePayload, {
    environment: original.environment,
    clientId:    original.client_id,
  });

  const row = await enqueueForSubmission({
    environment:     original.environment,
    request_payload: enriched,
    client_id:       original.client_id,
    action:          'submit',
    original_invoice_id: originalId,
    note_type:       noteType,
    note_reason:     reason.trim(),
  });

  const editTime = new Date().toISOString();
  for (const edit of items) {
    const sno   = String(edit.itemSNo);
    const audit = audits.find(a => String(a.item_sno) === sno);
    await supabase
      .from('invoice_item_audit')
      .upsert({
        invoice_id:      originalId,
        item_sno:        sno,
        edit_count:      (audit?.edit_count ?? 0) + 1,
        edited_at:       editTime,
        fbr_item_status: FBR_STATUS.EDITED,
      }, { onConflict: 'invoice_id,item_sno' });
  }

  if (isMockEnabled()) {
    const editedCount = audits.filter(a => (a.edit_count ?? 0) > 0).length + items.length;
    const totalItems  = (original.request_payload?.items || []).length;
    const newFbrStatus = editedCount >= totalItems
      ? FBR_STATUS.EDITED
      : FBR_STATUS.PARTIALLY_EDITED;

    await supabase
      .from('invoices')
      .update({ fbr_status: newFbrStatus })
      .eq('id', originalId);
  }

  return row;
}

module.exports = {
  getItemAudits,
  getInvoiceEditPolicy,
  requestFbrCancellation,
  submitItemEdit,
};
