'use strict';

/**
 * Temporary FBR validate debugging — enable with FBR_DEBUG_VALIDATE=true on Railway.
 * Revert commit after sandbox investigation.
 */

function isFbrValidateDebugEnabled() {
  return String(process.env.FBR_DEBUG_VALIDATE || '').toLowerCase() === 'true';
}

function redactHeaders(headers = {}) {
  const copy = { ...headers };
  if (copy.Authorization) copy.Authorization = 'Bearer ***';
  if (copy.authorization) copy.authorization = 'Bearer ***';
  return copy;
}

function summarizeBody(data) {
  if (data === null || data === undefined) return '(empty response body)';
  if (typeof data === 'string') {
    return data.trim() === '' ? '(empty string response body)' : data;
  }
  if (typeof data === 'object') {
    try {
      const json = JSON.stringify(data);
      if (!json || json === '{}') return '(empty JSON object {})';
      return json;
    } catch {
      return String(data);
    }
  }
  return String(data);
}

function logFbrValidateStart(url, payload) {
  console.log('[fbr-debug][validate] ── request ──────────────────────────────');
  console.log('[fbr-debug][validate] URL:', url);
  console.log('[fbr-debug][validate] payload:', JSON.stringify(payload, null, 2));
}

function logFbrValidateSuccess(res) {
  console.log('[fbr-debug][validate] ── response ─────────────────────────────');
  console.log('[fbr-debug][validate] HTTP status:', res.status, res.statusText || '');
  console.log('[fbr-debug][validate] headers:', JSON.stringify(redactHeaders(res.headers), null, 2));
  console.log('[fbr-debug][validate] body:', summarizeBody(res.data));
}

function logFbrValidateFailure(err) {
  console.error('[fbr-debug][validate] ── axios error ──────────────────────────');
  console.error('[fbr-debug][validate] code:', err.code ?? '(none)');
  console.error('[fbr-debug][validate] message:', err.message ?? '(none)');
  if (err.stack) console.error('[fbr-debug][validate] stack:', err.stack);

  if (err.response) {
    console.error('[fbr-debug][validate] HTTP status:', err.response.status, err.response.statusText || '');
    console.error(
      '[fbr-debug][validate] response headers:',
      JSON.stringify(redactHeaders(err.response.headers), null, 2)
    );
    console.error('[fbr-debug][validate] response body:', summarizeBody(err.response.data));
  } else if (err.request) {
    console.error('[fbr-debug][validate] request was sent but no response received');
  } else {
    console.error('[fbr-debug][validate] error before request was sent');
  }
}

function logFbrValidateRejected(fbrData, errorMessage) {
  console.log('[fbr-debug][validate] ── rejected (HTTP 2xx, FBR invalid) ─────');
  console.log('[fbr-debug][validate] parsed error_message:', errorMessage);
  console.log('[fbr-debug][validate] fbrData:', summarizeBody(fbrData));
}

function formatAxiosErrorDetailed(err) {
  const parts = [];

  if (err?.code) parts.push(`code=${err.code}`);
  if (err?.message) parts.push(`message=${err.message}`);

  if (err?.response) {
    parts.push(`HTTP ${err.response.status}`);
    const headerJson = JSON.stringify(redactHeaders(err.response.headers));
    if (headerJson && headerJson !== '{}') parts.push(`headers=${headerJson}`);
    parts.push(`body=${summarizeBody(err.response.data)}`);
  } else if (err?.request) {
    parts.push('no HTTP response received');
  }

  return parts.length ? parts.join(' | ') : (err?.message || 'Unknown FBR error');
}

module.exports = {
  isFbrValidateDebugEnabled,
  logFbrValidateStart,
  logFbrValidateSuccess,
  logFbrValidateFailure,
  logFbrValidateRejected,
  formatAxiosErrorDetailed,
  summarizeBody,
};
