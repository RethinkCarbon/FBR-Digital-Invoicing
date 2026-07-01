'use strict';

const express = require('express');
const {
  WORKFLOW_STATUS,
  createDraft,
  updateDraft,
  enqueueForSubmission,
  requeueInvoice,
  cancelInvoice,
  getInvoiceById,
  listInvoices,
  getInvoiceStats,
  getQueueStats,
} = require('../services/invoice-service');
const { generateInvoiceHTML } = require('../invoice-template');
const { generateInvoicePDF }  = require('../invoice-pdf');
const { generateInvoicesExcel, generateSingleInvoiceExcel } = require('../invoice-excel');
const { buildFbrPayload, prepareFbrSubmission } = require('../services/payload-builder');
const { getCancellationLimit } = require('../services/cancellation-limit-service');
const {
  getInvoiceEditPolicy,
  requestFbrCancellation,
  submitItemEdit,
} = require('../services/item-edit-service');

function createInvoiceRouter({ fbrHandlers }) {
  const router = express.Router();
  const { resolveEnv } = fbrHandlers;

  function stripMeta(body) {
    const { invoiceId, clientId, ...payload } = body;
    return { invoiceId: invoiceId || null, clientId: clientId || null, payload };
  }

  async function enrichPayload(req, rawPayload, clientId) {
    const environment = resolveEnv(req);
    return prepareFbrSubmission(rawPayload, { environment, clientId });
  }

  function noteFieldsFromMeta(noteMeta) {
    if (!noteMeta || noteMeta.noteType === 'sale') {
      return { original_invoice_id: null, note_type: null, note_reason: null };
    }
    return {
      original_invoice_id: noteMeta.originalInvoiceId,
      note_type:           noteMeta.noteType,
      note_reason:         noteMeta.noteReason,
    };
  }

  // ── Draft ──────────────────────────────────────────────────────────────────
  router.post('/draft', async (req, res) => {
    try {
      const environment = resolveEnv(req);
      const { invoiceId, clientId, payload } = stripMeta(req.body);
      const { payload: enriched, noteMeta } = await enrichPayload(req, payload, clientId);
      const noteFields = noteFieldsFromMeta(noteMeta);

      const row = invoiceId
        ? await updateDraft(invoiceId, { request_payload: enriched, client_id: clientId, ...noteFields })
        : await createDraft({ environment, request_payload: enriched, client_id: clientId, ...noteFields });

      res.json(row);
    } catch (err) {
      res.status(400).json({ error: true, message: err.message });
    }
  });

  router.post('/enrich', async (req, res) => {
    try {
      const { clientId, ...payload } = req.body;
      const { payload: enriched } = await prepareFbrSubmission(payload, {
        environment: resolveEnv(req),
        clientId:    clientId || null,
      });
      res.json(enriched);
    } catch (err) {
      res.status(400).json({ error: true, message: err.message });
    }
  });

  // ── List / export ──────────────────────────────────────────────────────────
  router.get('/', async (req, res) => {
    try {
      const { q, status, environment, dateFrom, dateTo, fbrStatus, limit, offset } = req.query;
      const result = await listInvoices({
        q,
        status,
        environment,
        dateFrom,
        dateTo,
        fbrStatus,
        limit:  limit  ? parseInt(limit, 10)  : 50,
        offset: offset ? parseInt(offset, 10) : 0,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: true, message: err.message });
    }
  });

  router.get('/stats', async (req, res) => {
    try {
      const { environment } = req.query;
      const stats = await getInvoiceStats({ environment });
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: true, message: err.message });
    }
  });

  router.get('/queue/stats', async (req, res) => {
    try {
      const { environment } = req.query;
      const stats = await getQueueStats({ environment });
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: true, message: err.message });
    }
  });

  router.get('/cancellation-limit', async (req, res) => {
    try {
      const { environment } = req.query;
      const stats = await getCancellationLimit({ environment });
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: true, message: err.message });
    }
  });

  router.get('/export/excel', async (req, res) => {
    try {
      const { q, status, environment, dateFrom, dateTo, fbrStatus } = req.query;
      const { items } = await listInvoices({
        q, status, environment, dateFrom, dateTo, fbrStatus, limit: 5000, offset: 0,
      });
      const buffer = await generateInvoicesExcel(items);
      const fromPart = dateFrom ? dateFrom.slice(0, 10) : 'all';
      const toPart   = dateTo   ? dateTo.slice(0, 10)   : 'all';
      const filename = `planetive-invoices-${fromPart}-to-${toPart}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(Buffer.from(buffer));
    } catch (err) {
      res.status(500).json({ error: true, message: err.message });
    }
  });

  // ── FBR submit / validate (enqueue — worker sends to FBR) ─────────────────
  router.post('/post', async (req, res) => {
    try {
      const environment = resolveEnv(req);
      const { invoiceId, clientId, payload } = stripMeta(req.body);

      let rawPayload = payload;
      if (invoiceId) {
        const existing = await getInvoiceById(invoiceId);
        if (
          existing.workflow_status === WORKFLOW_STATUS.PENDING &&
          existing.request_payload &&
          Array.isArray(existing.request_payload.items)
        ) {
          // Submit the validated payload — not a fresh DOM read that may have lost rate/UOM.
          rawPayload = existing.request_payload;
        }
      }

      const { payload: enriched, noteMeta } = await enrichPayload(req, rawPayload, clientId);
      const noteFields = noteFieldsFromMeta(noteMeta);

      const row = await enqueueForSubmission({
        invoiceId,
        environment,
        request_payload: enriched,
        client_id: clientId,
        action: 'submit',
        ...noteFields,
      });

      res.status(202).json({
        queued:            true,
        id:                row.id,
        internalInvoiceNo: row.internal_invoice_no,
        workflowStatus:    row.workflow_status,
        message:           'Invoice queued for FBR submission',
      });
    } catch (err) {
      res.status(400).json({ error: true, message: err.message });
    }
  });

  router.post('/validate', async (req, res) => {
    try {
      const environment = resolveEnv(req);
      const { invoiceId, clientId, payload } = stripMeta(req.body);
      const { payload: enriched, noteMeta } = await enrichPayload(req, payload, clientId);
      const noteFields = noteFieldsFromMeta(noteMeta);

      const row = await enqueueForSubmission({
        invoiceId,
        environment,
        request_payload: enriched,
        client_id: clientId,
        action: 'validate',
        ...noteFields,
      });

      res.status(202).json({
        queued:            true,
        id:                row.id,
        internalInvoiceNo: row.internal_invoice_no,
        workflowStatus:    row.workflow_status,
        message:           'Invoice queued for FBR validation',
      });
    } catch (err) {
      res.status(400).json({ error: true, message: err.message });
    }
  });

  // ── Single invoice (specific sub-routes before /:id) ───────────────────────
  router.get('/:id/edit-policy', async (req, res) => {
    try {
      const policy = await getInvoiceEditPolicy(req.params.id);
      res.json(policy);
    } catch (err) {
      res.status(404).json({ error: true, message: err.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const row = await getInvoiceById(req.params.id);
      res.json(row);
    } catch (err) {
      res.status(404).json({ error: true, message: err.message });
    }
  });

  router.post('/:id/cancel-fbr', async (req, res) => {
    try {
      const { itemSnos, reason } = req.body || {};
      const result = await requestFbrCancellation(req.params.id, { itemSnos, reason });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: true, message: err.message });
    }
  });

  router.post('/:id/edit-items', async (req, res) => {
    try {
      const { items, noteType, reason } = req.body || {};
      const enrichFn = (payload, { environment, clientId }) =>
        buildFbrPayload(payload, { environment, clientId });

      const row = await submitItemEdit(req.params.id, { items, noteType, reason }, enrichFn);

      res.status(202).json({
        queued:            true,
        id:                row.id,
        internalInvoiceNo: row.internal_invoice_no,
        workflowStatus:    row.workflow_status,
        originalInvoiceId: req.params.id,
        message:           'Edit note queued for FBR submission',
      });
    } catch (err) {
      res.status(400).json({ error: true, message: err.message });
    }
  });

  router.post('/:id/cancel', async (req, res) => {
    try {
      const row = await cancelInvoice(req.params.id);
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: true, message: err.message });
    }
  });

  router.post('/:id/retry', async (req, res) => {
    try {
      const row = await requeueInvoice(req.params.id);
      res.status(202).json({
        queued:         true,
        id:             row.id,
        workflowStatus: row.workflow_status,
        message:        'Invoice re-queued for submission',
      });
    } catch (err) {
      res.status(400).json({ error: true, message: err.message });
    }
  });

  // ── Print / PDF ────────────────────────────────────────────────────────────
  router.get('/:id/print', async (req, res) => {
    try {
      const row = await getInvoiceById(req.params.id);
      const html = generateInvoiceHTML({
        internalInvoiceNo: row.internal_invoice_no,
        invoiceNumber:     row.fbr_invoice_number || row.response_payload?.invoiceNumber,
        requestPayload:    row.request_payload,
        responsePayload:   row.response_payload,
        qrCode:            row.qr_code,
        workflowStatus:    row.workflow_status,
      });
      res.type('html').send(html);
    } catch (err) {
      res.status(404).type('html').send(`<h1>404 — ${err.message}</h1>`);
    }
  });

  router.get('/:id/pdf', async (req, res) => {
    try {
      const row = await getInvoiceById(req.params.id);
      const pdf = await generateInvoicePDF(row);
      const name = (row.internal_invoice_no || `invoice-${row.id}`).replace(/[^\w-]/g, '_');

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`);
      res.send(pdf);
    } catch (err) {
      res.status(500).json({ error: true, message: err.message });
    }
  });

  router.get('/:id/excel', async (req, res) => {
    try {
      const row = await getInvoiceById(req.params.id);
      const buffer = await generateSingleInvoiceExcel(row);
      const invNo = (row.internal_invoice_no || `invoice-${row.id}`).replace(/[^\w-]/g, '_');
      const date  = String(row.invoice_date || row.request_payload?.invoiceDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
      const filename = `PLT-invoice-${invNo}-${date}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(Buffer.from(buffer));
    } catch (err) {
      res.status(500).json({ error: true, message: err.message });
    }
  });

  return router;
}

module.exports = { createInvoiceRouter };
