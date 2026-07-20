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
  isFbrValidateDebugEnabled,
  isFbrPayloadDebugEnabled,
  logFbrValidateRejected,
} = require('../debug/fbr-validate-debug');
const {
  claimNextJob,
  finalizeFbrResult,
  markFailed,
} = require('./invoice-service');

function logFbrPayload(mode, invoiceId, payload) {
  if (!isFbrPayloadDebugEnabled()) return;
  console.log(`[fbr-debug][${mode}] invoice ${invoiceId ?? '(new)'} final payload:`);
  console.log(JSON.stringify(payload, null, 2));
}

async function processInvoiceJob(invoice) {
  const mode = invoice.action === 'validate' ? 'validate' : 'submit';
  const payload = invoice.request_payload;

  if (!payload) {
    return markFailed(invoice.id, 'Missing request payload');
  }

  logFbrPayload(mode, invoice.id, payload);

  try {
    const fbrData  = await callFbr(invoice.environment, payload, mode, {
      retryCount: invoice.retry_count ?? 0,
    });
    const accepted   = isFbrSubmissionAccepted(fbrData);
    const errorMessage = accepted ? null : getValidationErrorMessage(fbrData);

    if (mode === 'validate' && isFbrValidateDebugEnabled()) {
      console.log(`[fbr-debug][validate] invoice ${invoice.id} environment=${invoice.environment}`);
      if (!accepted) logFbrValidateRejected(fbrData, errorMessage);
    }

    const qrCode     = (accepted && mode === 'submit' && fbrData.invoiceNumber)
      ? await generateInvoiceQR({
          ...invoice,
          fbr_invoice_number: fbrData.invoiceNumber,
          invoiceNumber:      fbrData.invoiceNumber,
        })
      : null;

    return finalizeFbrResult(invoice.id, {
      valid: accepted,
      action: mode === 'submit' ? 'submit' : 'validate',
      fbrData,
      qrCode,
      errorMessage: accepted ? null : errorMessage,
    });
  } catch (err) {
    const message = formatAxiosError(err);
    if (mode === 'validate' && isFbrValidateDebugEnabled()) {
      console.error(`[fbr-debug][validate] invoice ${invoice.id} axios failure:`, message);
    }
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
