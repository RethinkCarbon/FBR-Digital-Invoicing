'use strict';

const FBR_STATUS = Object.freeze({
  VALID:                      'Valid',
  EDITED:                     'Edited',
  CANCELLED:                  'Cancelled',
  PARTIALLY_EDITED:           'Partially Edited',
  PARTIALLY_CANCELLED:        'Partially Cancelled',
  PARTIALLY_EDITED_CANCELLED: 'Partially Edited & Cancelled',
});

const FBR_STATUSES = Object.freeze([
  FBR_STATUS.VALID,
  FBR_STATUS.EDITED,
  FBR_STATUS.CANCELLED,
  FBR_STATUS.PARTIALLY_EDITED,
  FBR_STATUS.PARTIALLY_CANCELLED,
  FBR_STATUS.PARTIALLY_EDITED_CANCELLED,
]);

/** Statuses indicating FBR recorded the invoice (not a validation rejection). */
const FBR_SUBMITTED_STATUSES = FBR_STATUSES;

function fbrStatusToCssClass(status) {
  const map = {
    [FBR_STATUS.VALID]:                      'fbr-valid',
    [FBR_STATUS.EDITED]:                     'fbr-edited',
    [FBR_STATUS.CANCELLED]:                  'fbr-cancelled',
    [FBR_STATUS.PARTIALLY_EDITED]:           'fbr-partial-edit',
    [FBR_STATUS.PARTIALLY_CANCELLED]:        'fbr-partial-cancel',
    [FBR_STATUS.PARTIALLY_EDITED_CANCELLED]: 'fbr-partial-both',
  };
  return map[status] || 'fbr-unknown';
}

function isFbrResponseValid(data) {
  const vr = data?.validationResponse || data;
  return (vr?.status || '').toLowerCase() === 'valid';
}

function isFbrSubmissionAccepted(data) {
  if (isFbrResponseValid(data)) return true;
  const vr = data?.validationResponse || data;
  const status = (vr?.status || '').trim();
  return !!(data?.invoiceNumber && FBR_SUBMITTED_STATUSES.includes(status));
}

function extractFbrStatus(data) {
  const vr = data?.validationResponse || data;
  return vr?.status || null;
}

/** Persist only FBR lifecycle statuses allowed by invoices_fbr_status_check; rejections → null. */
function normalizeFbrStatusForStorage(status) {
  if (status === null || status === undefined) return null;
  const trimmed = String(status).trim();
  if (!trimmed) return null;
  return FBR_STATUSES.includes(trimmed) ? trimmed : null;
}

function extractItemStatuses(data) {
  const vr = data?.validationResponse || data;
  return vr?.invoiceStatuses ?? null;
}

module.exports = {
  FBR_STATUS,
  FBR_STATUSES,
  FBR_SUBMITTED_STATUSES,
  fbrStatusToCssClass,
  isFbrResponseValid,
  isFbrSubmissionAccepted,
  extractFbrStatus,
  extractItemStatuses,
  normalizeFbrStatusForStorage,
};
