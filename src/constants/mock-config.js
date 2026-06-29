'use strict';

const MOCK_SCENARIOS = Object.freeze([
  {
    id:          'valid',
    label:       'Valid',
    description: 'Default success — all line items Valid, IRN returned.',
  },
  {
    id:          'invalid',
    label:       'Invalid',
    description: 'Validation rejection (error 0031) — tests failed validate/submit UI.',
  },
  {
    id:          'edited',
    label:       'Edited',
    description: 'All items marked Edited — FBR lifecycle status display.',
  },
  {
    id:          'cancelled',
    label:       'Cancelled',
    description: 'All items Cancelled.',
  },
  {
    id:          'partial_edit',
    label:       'Partially Edited',
    description: 'Item 1 Valid, remaining items Edited.',
  },
  {
    id:          'partial_cancel',
    label:       'Partially Cancelled',
    description: 'Item 1 Valid, remaining items Cancelled.',
  },
  {
    id:          'partial_both',
    label:       'Partially Edited & Cancelled',
    description: 'Mixed Valid / Edited / Cancelled across lines.',
  },
  {
    id:          'http_500',
    label:       'HTTP 500',
    description: 'Simulates FBR server error — triggers auto-retry (transient).',
  },
]);

function envFlag(name) {
  return (process.env[name] || '').trim().toLowerCase() === 'true';
}

function envInt(name, fallback = 0) {
  const n = parseInt((process.env[name] || '').trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeMockScenario(raw) {
  return (raw || 'valid').trim().toLowerCase().replace(/-/g, '_');
}

function getMockConfig() {
  return {
    enabled:        envFlag('FBR_MOCK_MODE'),
    fail:           envFlag('FBR_MOCK_FAIL'),
    delayMs:        Math.max(0, envInt('FBR_MOCK_DELAY_MS', 0)),
    scenario:       normalizeMockScenario(process.env.FBR_MOCK_SCENARIO),
    failUntilRetry: Math.max(0, envInt('FBR_MOCK_FAIL_UNTIL_RETRY', 0)),
    workerPollMs:   Math.max(1000, envInt('WORKER_POLL_MS', 3000)),
  };
}

function isMockEnabled() {
  return getMockConfig().enabled;
}

module.exports = {
  MOCK_SCENARIOS,
  normalizeMockScenario,
  getMockConfig,
  isMockEnabled,
};
