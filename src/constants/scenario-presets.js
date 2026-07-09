'use strict';

/**
 * Scenario presets — fields confirmed by FBR DI API v1.12 scenario table (§9)
 * and FBR reference / sandbox validation.
 */
const SCENARIO_PRESETS = {
  SN019: {
    scenarioId: 'SN019',
    description: 'Services rendered or provided',
    buyerDefaults: {
      buyerNTNCNIC:          '1234567',
      buyerBusinessName:     'Sample Client Ltd.',
      buyerProvince:         'PUNJAB',
      buyerAddress:          'Lahore',
      buyerRegistrationType: 'Unregistered',
    },
    itemDefaults: {
      saleType: 'Services',
      hsCode:   '9805.9200',
      rate:     '18.5%',
      uoM:      'Numbers, pieces, units',
    },
    fedInStMode: false,
  },
  SN018: {
    scenarioId: 'SN018',
    description: 'Services Rendered or Provided Where FED is Charged in ST Mode',
    buyerDefaults: {
      buyerNTNCNIC:          '1234567',
      buyerBusinessName:     'Sample Client Ltd.',
      buyerProvince:         'PUNJAB',
      buyerAddress:          'Lahore',
      buyerRegistrationType: 'Unregistered',
    },
    itemDefaults: {
      saleType: 'Services (FED in ST Mode)',
    },
    fedInStMode: true,
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

const PLANETIVE_SCENARIO_IDS = Object.freeze(['SN019', 'SN018']);

const PLANETIVE_DEFAULT_SCENARIO = 'SN019';

function isPlanetiveScenario(scenarioId) {
  return PLANETIVE_SCENARIO_IDS.includes(scenarioId);
}

function getScenarioPreset(scenarioId) {
  return SCENARIO_PRESETS[scenarioId] ?? null;
}

function getDefaultScenarioId() {
  return PLANETIVE_DEFAULT_SCENARIO;
}

function getPlanetiveScenarioPresets() {
  return PLANETIVE_SCENARIO_IDS
    .map(id => SCENARIO_PRESETS[id])
    .filter(Boolean);
}

module.exports = {
  SCENARIO_PRESETS,
  PLANETIVE_SCENARIO_IDS,
  PLANETIVE_DEFAULT_SCENARIO,
  getScenarioPreset,
  getDefaultScenarioId,
  isPlanetiveScenario,
  getPlanetiveScenarioPresets,
};
