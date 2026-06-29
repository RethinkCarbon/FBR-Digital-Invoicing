'use strict';

const supabase = require('../supabase');
const { WORKFLOW_STATUS } = require('../constants/invoice-status');

const NOTE_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;

function isAdjustmentNote(payload = {}) {
  const t = (payload.invoiceType || '').toLowerCase();
  return t.includes('debit') || t.includes('credit');
}

function noteTypeFromPayload(payload = {}) {
  const t = (payload.invoiceType || '').toLowerCase();
  if (t.includes('credit')) return 'credit';
  if (t.includes('debit')) return 'debit';
  return 'sale';
}

function validateRequiredNoteFields(payload = {}) {
  if (!isAdjustmentNote(payload)) {
    return { noteType: 'sale', originalInvoiceId: null };
  }

  const noteType = noteTypeFromPayload(payload);
  if (!payload.invoiceRefNo?.trim()) {
    throw new Error('Invoice Reference No. is required for debit/credit notes (FBR 0026)');
  }
  if (!payload.reason?.trim()) {
    throw new Error('Reason is required for debit/credit notes (FBR 0027)');
  }

  return { noteType, noteReason: payload.reason.trim() };
}

async function findOriginalByRef(refNo, environment) {
  if (!refNo?.trim()) return null;

  let query = supabase
    .from('invoices')
    .select('*')
    .eq('fbr_invoice_number', refNo.trim())
    .eq('workflow_status', WORKFLOW_STATUS.SUBMITTED)
    .limit(1);

  if (environment) query = query.eq('environment', environment);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function validateNoteAgainstOriginal(payload, original, noteType) {
  if (!original) return;

  const anchor = original.submitted_at || original.invoice_date;
  if (anchor) {
    const deadline = new Date(new Date(anchor).getTime() + NOTE_WINDOW_MS);
    if (new Date() > deadline) {
      throw new Error('Debit/credit note only allowed within 180 days of original invoice (FBR 0034)');
    }
  }

  const origDate = original.invoice_date || original.request_payload?.invoiceDate;
  const noteDate = payload.invoiceDate;
  if (origDate && noteDate && String(noteDate) < String(origDate)) {
    throw new Error('Note date must be on or after original invoice date (FBR 0035)');
  }

  const origItems = original.request_payload?.items || [];
  const noteItems = payload.items || [];

  if (noteType === 'credit') {
    for (let i = 0; i < noteItems.length; i++) {
      const noteItem = noteItems[i];
      const origItem = origItems[i];
      if (!origItem) continue;

      const noteVal = parseFloat(noteItem.valueSalesExcludingST) || 0;
      const origVal = parseFloat(origItem.valueSalesExcludingST) || 0;
      if (noteVal > origVal) {
        throw new Error(
          `Credit Note: item ${i + 1} value of sales (${noteVal.toFixed(2)}) ` +
          `exceeds original (${origVal.toFixed(2)}) (FBR 0036)`
        );
      }

      const noteStwh = parseFloat(noteItem.salesTaxWithheldAtSource) || 0;
      const origStwh = parseFloat(origItem.salesTaxWithheldAtSource) || 0;
      if (noteStwh > origStwh) {
        throw new Error(
          `Credit Note: item ${i + 1} ST withheld (${noteStwh.toFixed(2)}) ` +
          `exceeds original (${origStwh.toFixed(2)}) (FBR 0037)`
        );
      }
    }
  }

  if (noteType === 'debit') {
    for (let i = 0; i < noteItems.length; i++) {
      const noteItem = noteItems[i];
      const origItem = origItems[i];
      if (!origItem) continue;

      const noteSt = parseFloat(noteItem.salesTaxApplicable) || 0;
      const origSt = parseFloat(origItem.salesTaxApplicable) || 0;
      if (noteSt <= origSt) {
        throw new Error(
          `Debit Note: item ${i + 1} sales tax (${noteSt.toFixed(2)}) must exceed ` +
          `original (${origSt.toFixed(2)}) for an upward adjustment (FBR 0067)`
        );
      }
    }
  }
}

async function validateAndResolveNote(payload, { environment } = {}) {
  const required = validateRequiredNoteFields(payload);
  if (required.noteType === 'sale') {
    return { noteType: 'sale', originalInvoiceId: null, noteReason: null };
  }

  const original = await findOriginalByRef(payload.invoiceRefNo, environment);
  validateNoteAgainstOriginal(payload, original, required.noteType);

  return {
    noteType:          required.noteType,
    noteReason:        required.noteReason,
    originalInvoiceId: original?.id ?? null,
    originalInvoice:   original,
  };
}

module.exports = {
  NOTE_WINDOW_MS,
  isAdjustmentNote,
  noteTypeFromPayload,
  validateRequiredNoteFields,
  findOriginalByRef,
  validateNoteAgainstOriginal,
  validateAndResolveNote,
};
