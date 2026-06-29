'use strict';

const { generateInvoiceQR } = require('../qrcode');
const {
  callFbr,
  getValidationErrorMessage,
  isTransientError,
  formatAxiosError,
} = require('./fbr-client');
const { isFbrSubmissionAccepted } = require('../constants/fbr-status');
const {
  claimNextJob,
  finalizeFbrResult,
  markFailed,
} = require('./invoice-service');

async function processInvoiceJob(invoice) {
  const mode = invoice.action === 'validate' ? 'validate' : 'submit';
  const payload = invoice.request_payload;

  if (!payload) {
    return markFailed(invoice.id, 'Missing request payload');
  }

  try {
    const fbrData  = await callFbr(invoice.environment, payload, mode, {
      retryCount: invoice.retry_count ?? 0,
    });
    const accepted   = isFbrSubmissionAccepted(fbrData);
    const qrCode     = (accepted && mode === 'submit' && fbrData.invoiceNumber)
      ? await generateInvoiceQR(fbrData.invoiceNumber)
      : null;

    return finalizeFbrResult(invoice.id, {
      valid: accepted,
      action: mode === 'submit' ? 'submit' : 'validate',
      fbrData,
      qrCode,
      errorMessage: accepted ? null : getValidationErrorMessage(fbrData),
    });
  } catch (err) {
    const message = formatAxiosError(err);
    if (isTransientError(err)) {
      return markFailed(invoice.id, message, { scheduleRetry: true });
    }
    return markFailed(invoice.id, message);
  }
}

async function processNextInQueue() {
  const job = await claimNextJob();
  if (!job) return false;
  await processInvoiceJob(job);
  return true;
}

module.exports = { processInvoiceJob, processNextInQueue };
