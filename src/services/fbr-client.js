'use strict';

const axios = require('axios');
const { FBR_URLS } = require('../constants');
const { FBR_STATUS, isFbrResponseValid } = require('../constants/fbr-status');
const { getMockConfig, normalizeMockScenario } = require('../constants/mock-config');

const TOKEN = (process.env.FBR_BEARER_TOKEN || '').trim();

function authHeader() {
  return { Authorization: `Bearer ${TOKEN}` };
}

function getValidationErrorMessage(data) {
  const vr = data?.validationResponse || data;
  if (vr?.error) return typeof vr.error === 'string' ? vr.error : JSON.stringify(vr.error);
  if (vr?.errorCode) return `Error Code: ${vr.errorCode}`;
  return 'Invoice validation failed';
}

function formatMockFbrDated(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

function buildMockItem(irn, itemSNo, status) {
  return {
    itemSNo:    String(itemSNo),
    statusCode: status === FBR_STATUS.VALID ? '00' : '01',
    status,
    invoiceNo:  `${irn}-${itemSNo}`,
    errorCode:  '',
    error:      '',
  };
}

function createMockInvalidResponse() {
  return {
    validationResponse: {
      statusCode: '01',
      status:     'Invalid',
      error:      'Provide Sales Tax.',
      errorCode:  '0031',
      invoiceStatuses: [],
    },
  };
}

function createMockFbrResponse(payload = {}, scenarioOverride = null) {
  const scenario = normalizeMockScenario(scenarioOverride || process.env.FBR_MOCK_SCENARIO);

  if (scenario === 'invalid') {
    return createMockInvalidResponse();
  }

  const ts    = Date.now();
  const irn   = `7000007DI${ts}`;
  const items = Array.isArray(payload.items) ? payload.items : [{ productDescription: 'Item 1' }];

  let overallStatus = FBR_STATUS.VALID;
  let itemStatuses;

  switch (scenario) {
    case 'edited':
      overallStatus = FBR_STATUS.EDITED;
      itemStatuses = items.map((_, i) => buildMockItem(irn, i + 1, FBR_STATUS.EDITED));
      break;
    case 'cancelled':
      overallStatus = FBR_STATUS.CANCELLED;
      itemStatuses = items.map((_, i) => buildMockItem(irn, i + 1, FBR_STATUS.CANCELLED));
      break;
    case 'partial_edit':
      overallStatus = FBR_STATUS.PARTIALLY_EDITED;
      itemStatuses = items.map((_, i) => buildMockItem(
        irn, i + 1, i === 0 ? FBR_STATUS.VALID : FBR_STATUS.EDITED
      ));
      break;
    case 'partial_cancel':
      overallStatus = FBR_STATUS.PARTIALLY_CANCELLED;
      itemStatuses = items.map((_, i) => buildMockItem(
        irn, i + 1, i === 0 ? FBR_STATUS.VALID : FBR_STATUS.CANCELLED
      ));
      break;
    case 'partial_both':
      overallStatus = FBR_STATUS.PARTIALLY_EDITED_CANCELLED;
      itemStatuses = items.map((_, i) => {
        const statuses = [FBR_STATUS.VALID, FBR_STATUS.EDITED, FBR_STATUS.CANCELLED];
        return buildMockItem(irn, i + 1, statuses[i % statuses.length]);
      });
      break;
    default:
      itemStatuses = items.map((_, i) => buildMockItem(irn, i + 1, FBR_STATUS.VALID));
  }

  if (itemStatuses.length === 0) {
    itemStatuses = [buildMockItem(irn, 1, overallStatus === FBR_STATUS.VALID ? FBR_STATUS.VALID : overallStatus)];
  }

  return {
    invoiceNumber: irn,
    dated: formatMockFbrDated(),
    validationResponse: {
      statusCode: overallStatus === FBR_STATUS.VALID ? '00' : '01',
      status: overallStatus,
      error: '',
      invoiceStatuses: itemStatuses,
    },
  };
}

function throwMockTransientError(message) {
  const err = new Error(message);
  err.code = 'ECONNABORTED';
  throw err;
}

function throwMockHttpError(status, message) {
  const err = new Error(message);
  err.response = { status, data: { error: message } };
  throw err;
}

async function applyMockDelay(delayMs) {
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}

function shouldMockFail(config, retryCount = 0) {
  if (config.fail) return true;
  if (config.failUntilRetry > 0 && retryCount < config.failUntilRetry) return true;
  return false;
}

function isTransientError(err) {
  if (!err.response) return true;
  const status = err.response.status;
  return status >= 500 || status === 408 || status === 429;
}

function formatAxiosError(err) {
  if (err.response?.data) {
    const d = err.response.data;
    return typeof d === 'string' ? d : JSON.stringify(d);
  }
  return err.message || 'Unknown FBR error';
}

async function fbrPost(url, body) {
  const res = await axios.post(url, body, {
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    timeout: 15000,
  });
  return res.data;
}

async function callFbr(environment, payload, mode, options = {}) {
  const sb  = environment === 'sandbox';
  const url = mode === 'submit'
    ? (sb ? FBR_URLS.POST_INVOICE_SB : FBR_URLS.POST_INVOICE)
    : (sb ? FBR_URLS.VALIDATE_INVOICE_SB : FBR_URLS.VALIDATE_INVOICE);

  const config = getMockConfig();
  if (config.enabled) {
    await applyMockDelay(config.delayMs);

    if (config.scenario === 'http_500') {
      throwMockHttpError(500, 'Mock FBR HTTP 500 — server error');
    }

    if (shouldMockFail(config, options.retryCount ?? 0)) {
      throwMockTransientError('Mock FBR network failure');
    }

    return createMockFbrResponse(payload, config.scenario);
  }

  return fbrPost(url, payload);
}

module.exports = {
  callFbr,
  isFbrResponseValid,
  getValidationErrorMessage,
  isTransientError,
  formatAxiosError,
  createMockFbrResponse,
};
