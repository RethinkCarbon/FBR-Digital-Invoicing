'use strict';

const { WORKFLOW_STATUS } = require('../constants/invoice-status');

const CANCEL_WINDOW_MS = 72 * 60 * 60 * 1000;
const EDITED_ITEM_STATUSES = ['Edited', 'Partially Edited'];

function getCancelDeadline(submittedAt) {
  if (!submittedAt) return null;
  return new Date(new Date(submittedAt).getTime() + CANCEL_WINDOW_MS);
}

function getEditPolicy(invoice, itemAudits = []) {
  const submitted   = invoice.workflow_status === WORKFLOW_STATUS.SUBMITTED;
  const submittedAt = invoice.submitted_at ? new Date(invoice.submitted_at) : null;
  const cancelDeadline = getCancelDeadline(invoice.submitted_at);
  const now = new Date();
  const within72h = cancelDeadline ? now <= cancelDeadline : false;
  const cancelPending = ['requested', 'pending_fbr', 'approved_local'].includes(
    invoice.fbr_cancellation_status
  );
  const alreadyCancelled = invoice.fbr_status === 'Cancelled';

  const items = (invoice.request_payload?.items || []).map((item, i) => {
    const sno   = String(i + 1);
    const audit = itemAudits.find(a => String(a.item_sno) === sno) || {};
    const editCount = audit.edit_count ?? 0;
    const fbrItemStatus = audit.fbr_item_status ?? null;
    const isEdited = editCount > 0 || EDITED_ITEM_STATUSES.includes(fbrItemStatus);
    const isCancelled = audit.is_cancelled ?? false;

    return {
      itemSNo:             sno,
      productDescription:  item.productDescription ?? '',
      editCount,
      fbrItemStatus,
      editable:            submitted && editCount === 0 && !isCancelled,
      canCancel:           submitted && !isEdited && !isCancelled,
      isCancelled,
      isEdited,
    };
  });

  return {
    invoiceId:           invoice.id,
    workflowStatus:    invoice.workflow_status,
    headerLocked:      submitted,
    fbrInvoiceNumber:  invoice.fbr_invoice_number,
    internalInvoiceNo: invoice.internal_invoice_no,
    submittedAt:       invoice.submitted_at,
    cancelDeadline:    cancelDeadline?.toISOString() ?? null,
    cancelAllowed:     submitted && within72h && !cancelPending && !alreadyCancelled,
    cancelPending,
    within72h,
    alreadyCancelled,
    hoursRemaining:    cancelDeadline && within72h
      ? Math.round((cancelDeadline - now) / 3600000 * 10) / 10
      : 0,
    items,
    canEditItems:      submitted && items.some(i => i.editable),
    editableItemSnos:  items.filter(i => i.editable).map(i => i.itemSNo),
  };
}

module.exports = {
  CANCEL_WINDOW_MS,
  getCancelDeadline,
  getEditPolicy,
};
