'use strict';

/**
 * Scenario presets — only fields confirmed by FBR DI API v1.12 scenario table (§9).
 * SN019 maps to saleType "Services". Rate, HS code, SRO fields are NOT preset
 * (they depend on service type / FBR reference APIs / sandbox test data).
 */
const SCENARIO_PRESETS = {
  SN019: {
    scenarioId: 'SN019',
    itemDefaults: { saleType: 'Services' },
  },
  SN001: {
    scenarioId: 'SN001',
    itemDefaults: { saleType: 'Goods at Standard Rate (default)' },
  },
  SN002: {
    scenarioId: 'SN002',
    itemDefaults: { saleType: 'Goods at Standard Rate (default)' },
  },
};

const PLANETIVE_DEFAULT_SCENARIO = 'SN019';

function getScenarioPreset(scenarioId) {
  return SCENARIO_PRESETS[scenarioId] ?? null;
}

function getDefaultScenarioId() {
  return PLANETIVE_DEFAULT_SCENARIO;
}

module.exports = {
  SCENARIO_PRESETS,
  PLANETIVE_DEFAULT_SCENARIO,
  getScenarioPreset,
  getDefaultScenarioId,
};
