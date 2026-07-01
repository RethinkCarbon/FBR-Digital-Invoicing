'use strict';

/**
 * Scenario presets — fields confirmed by FBR DI API v1.12 scenario table (§9)
 * and FBR reference / sandbox validation for Planetive SN019 (Services).
 */
const SCENARIO_PRESETS = {
  SN019: {
    scenarioId: 'SN019',
    itemDefaults: {
      saleType: 'Services',
      hsCode:   '9805.9200',
      rate:     '18.5%',
      uoM:      'Numbers, pieces, units',
    },
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
