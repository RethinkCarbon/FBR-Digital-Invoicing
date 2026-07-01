'use strict';

require('dotenv').config();

const express = require('express');
const axios   = require('axios');
const path    = require('path');
const { FBR_URLS, SCENARIOS, SALE_TYPES, SALES_ERROR_CODES, PURCHASE_ERROR_CODES } = require('./src/constants');
const {
  isFbrResponseValid,
  getValidationErrorMessage,
} = require('./src/services/fbr-client');
const { FBR_STATUSES } = require('./src/constants/fbr-status');
const { getMockConfig, MOCK_SCENARIOS } = require('./src/constants/mock-config');
const { generateInvoiceHTML } = require('./src/invoice-template');
const { getInvoiceById } = require('./src/services/invoice-service');
const { createInvoiceRouter } = require('./src/routes/invoices');
const { startInvoiceSubmissionWorker } = require('./src/workers/invoice-submission-worker');
const settingsRouter = require('./src/routes/settings');
const clientsRouter  = require('./src/routes/clients');
const { isPlanetiveMode, APP_MODE } = require('./src/constants/app-mode');
const { getDefaultScenarioId, getScenarioPreset } = require('./src/constants/scenario-presets');
const { normalizeProvinceForFbr } = require('./src/constants/provinces');
const {
  getCompanySettings,
  seedDefaultCompanySettings,
} = require('./src/services/company-settings-service');

const app         = express();
const PORT        = process.env.PORT || 3000;
const DEFAULT_ENV = (process.env.FBR_ENV || 'sandbox').toLowerCase();
const TOKEN       = (process.env.FBR_BEARER_TOKEN || '').trim();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveEnv(req) {
  const h = (req.headers['x-fbr-env'] || '').toLowerCase();
  return h === 'sandbox' || h === 'production' ? h : DEFAULT_ENV;
}

function authHeader() {
  return { Authorization: `Bearer ${TOKEN}` };
}

async function fbrGet(url, params = {}) {
  const res = await axios.get(url, { headers: authHeader(), params, timeout: 15000 });
  return res.data;
}

async function fbrPost(url, body) {
  const res = await axios.post(url, body, {
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    timeout: 15000,
  });
  return res.data;
}

function handleError(res, err) {
  const status  = err.response?.status || 500;
  const message = err.response?.data   || err.message;
  res.status(status).json({ error: true, message });
}

const fbrHandlers = {
  resolveEnv,
  isFbrResponseValid,
  getValidationErrorMessage,
  handleError,
};

const invoiceRouter = createInvoiceRouter({ fbrHandlers });
app.use('/api/invoices', invoiceRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/clients', clientsRouter);

// Legacy aliases (same handlers)
app.post('/api/invoice/post',     (req, res) => { req.url = '/post';     invoiceRouter(req, res); });
app.post('/api/invoice/validate', (req, res) => { req.url = '/validate'; invoiceRouter(req, res); });

app.get('/api/invoice/print/:id', async (req, res) => {
  try {
    const row = await getInvoiceById(req.params.id);
    const html = generateInvoiceHTML({
      internalInvoiceNo: row.internal_invoice_no,
      invoiceNumber:     row.fbr_invoice_number || row.response_payload?.invoiceNumber,
      requestPayload:    row.request_payload,
      qrCode:            row.qr_code,
      workflowStatus:    row.workflow_status,
    });
    res.type('html').send(html);
  } catch (err) {
    res.status(404).type('html').send(`<h1>404 — Invoice Not Found</h1>`);
  }
});

// ── App Config ───────────────────────────────────────────────────────────────

app.get('/api/config', async (req, res) => {
  try {
    const planetive = isPlanetiveMode();
    const defaultScenarioId = getDefaultScenarioId();
    let scenarios = SCENARIOS;

    if (planetive) {
      scenarios = SCENARIOS.filter(s => s.id === defaultScenarioId);
    }

    let companySettings = null;
    try {
      companySettings = await getCompanySettings();
      if (companySettings?.province) {
        companySettings = {
          ...companySettings,
          province: normalizeProvinceForFbr(companySettings.province),
        };
      }
    } catch {
      companySettings = null;
    }

    res.json({
      appMode:              APP_MODE,
      planetiveMode:        planetive,
      defaultEnv:           DEFAULT_ENV,
      tokenConfigured:      TOKEN.length > 0,
      mockMode:             getMockConfig().enabled,
      mockConfig:           getMockConfig(),
      mockScenarios:        MOCK_SCENARIOS,
      defaultScenarioId,
      scenarioPreset:       getScenarioPreset(defaultScenarioId),
      scenarios,
      saleTypes:            SALE_TYPES,
      salesErrorCodes:      SALES_ERROR_CODES,
      purchaseErrorCodes:   PURCHASE_ERROR_CODES,
      workflowStatuses:     ['draft', 'pending', 'queued', 'processing', 'submitted', 'failed', 'retrying', 'cancelled'],
      fbrStatuses:          FBR_STATUSES,
      mockScenario:         getMockConfig().scenario,
      workerEnabled:        process.env.WORKER_ENABLED !== 'false',
      companySettings,
    });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ── Reference APIs ───────────────────────────────────────────────────────────

app.get('/api/provinces', async (req, res) => {
  try { res.json(await fbrGet(FBR_URLS.PROVINCES)); }
  catch (err) { handleError(res, err); }
});

app.get('/api/doctypes', async (req, res) => {
  try { res.json(await fbrGet(FBR_URLS.DOC_TYPES)); }
  catch (err) { handleError(res, err); }
});

app.get('/api/itemcodes', async (req, res) => {
  try { res.json(await fbrGet(FBR_URLS.ITEM_CODES)); }
  catch (err) { handleError(res, err); }
});

app.get('/api/sro-item-codes', async (req, res) => {
  try { res.json(await fbrGet(FBR_URLS.SRO_ITEM_CODE)); }
  catch (err) { handleError(res, err); }
});

app.get('/api/trans-types', async (req, res) => {
  try { res.json(await fbrGet(FBR_URLS.TRANS_TYPES)); }
  catch (err) { handleError(res, err); }
});

app.get('/api/uom', async (req, res) => {
  try { res.json(await fbrGet(FBR_URLS.UOM)); }
  catch (err) { handleError(res, err); }
});

app.get('/api/sro-schedule', async (req, res) => {
  try {
    const { rate_id, date, origination_supplier_csv } = req.query;
    res.json(await fbrGet(FBR_URLS.SRO_SCHEDULE, { rate_id, date, origination_supplier_csv }));
  } catch (err) { handleError(res, err); }
});

app.get('/api/rates', async (req, res) => {
  try {
    const { date, transTypeId, originationSupplier } = req.query;
    res.json(await fbrGet(FBR_URLS.SALE_TYPE_TO_RATE, { date, transTypeId, originationSupplier }));
  } catch (err) { handleError(res, err); }
});

app.get('/api/hs-uom', async (req, res) => {
  try {
    const { hs_code, annexure_id } = req.query;
    res.json(await fbrGet(FBR_URLS.HS_UOM, { hs_code, annexure_id }));
  } catch (err) { handleError(res, err); }
});

app.get('/api/sro-item', async (req, res) => {
  try {
    const { date, sro_id } = req.query;
    res.json(await fbrGet(FBR_URLS.SRO_ITEM, { date, sro_id }));
  } catch (err) { handleError(res, err); }
});

app.post('/api/statl', async (req, res) => {
  try { res.json(await fbrPost(FBR_URLS.STATL, req.body)); }
  catch (err) { handleError(res, err); }
});

app.post('/api/reg-type', async (req, res) => {
  try { res.json(await fbrPost(FBR_URLS.GET_REG_TYPE, req.body)); }
  catch (err) { handleError(res, err); }
});

// Temporary endpoint used to determine Railway outbound IP for FBR sandbox IP whitelisting.
// Remove after sandbox registration is complete.
app.get('/api/outbound-ip', async (req, res) => {
  try {
    const { data } = await axios.get('https://api.ipify.org?format=json', { timeout: 15000 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ── Health (no Supabase) ─────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    vercel: Boolean(process.env.VERCEL),
    supabaseConfigured: Boolean(
      (process.env.SUPABASE_URL || '').trim() &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    ),
  });
});

// ── Start ────────────────────────────────────────────────────────────────────

function logStartupBanner() {
  console.log(`Environment : ${DEFAULT_ENV.toUpperCase()} (default, switchable from UI)`);
  console.log(`App mode    : ${APP_MODE}${isPlanetiveMode() ? ' (SN019 services workflow)' : ''}`);
  console.log(`Token set   : ${TOKEN.length > 0 ? 'YES' : 'NO — set FBR_BEARER_TOKEN in .env'}`);
  if (getMockConfig().enabled) {
    const mock = getMockConfig();
    console.log('FBR mock    : ON (invoice submit/validate return fake responses)');
    if (mock.fail) {
      console.log('FBR mock    : FAIL=ON (every attempt simulates network error → retry queue)');
    }
    if (mock.failUntilRetry > 0) {
      console.log(`FBR mock    : FAIL_UNTIL_RETRY=${mock.failUntilRetry} (fail until retry count reaches this)`);
    }
    if (mock.delayMs > 0) {
      console.log(`FBR mock    : DELAY=${mock.delayMs}ms (watch queued → processing in History)`);
    }
    if (mock.scenario !== 'valid') {
      console.log(`FBR mock    : SCENARIO=${mock.scenario}`);
    }
  }
}

async function bootstrap() {
  await seedDefaultCompanySettings();

  // Background polling worker does not run reliably on Vercel serverless.
  if (process.env.VERCEL) {
    console.log('[worker] Skipped on Vercel — set WORKER_ENABLED=false or use Railway/Render for queue processing');
  } else {
    startInvoiceSubmissionWorker();
  }
}

if (process.env.VERCEL) {
  bootstrap().catch(err => console.error('Bootstrap failed:', err.message));
  module.exports = app;
} else {
  bootstrap()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`FBR DI Web App running at http://localhost:${PORT}`);
        logStartupBanner();
      });
    })
    .catch(err => {
      console.error('Failed to start server:', err.message);
      process.exit(1);
    });
}
