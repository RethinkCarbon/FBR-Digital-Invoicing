'use strict';

const express = require('express');
const { FBR_URLS } = require('../constants');
const { getCompanySettings } = require('../services/company-settings-service');

/**
 * Inventory of FBR endpoints implemented in this app (DI API v1.12).
 * There is no documented "eligible scenarios" API in the technical specification.
 */
const FBR_ENDPOINT_INVENTORY = Object.freeze([
  {
    id:              'post_invoice_sb',
    method:          'POST',
    url:             FBR_URLS.POST_INVOICE_SB,
    appProxy:        null,
    category:        'invoice',
    exposesScenarios: false,
    notes:           'Sandbox submit; scenarioId sent in request body, not returned.',
  },
  {
    id:              'post_invoice',
    method:          'POST',
    url:             FBR_URLS.POST_INVOICE,
    appProxy:        null,
    category:        'invoice',
    exposesScenarios: false,
    notes:           'Production submit.',
  },
  {
    id:              'validate_invoice_sb',
    method:          'POST',
    url:             FBR_URLS.VALIDATE_INVOICE_SB,
    appProxy:        null,
    category:        'invoice',
    exposesScenarios: false,
    notes:           'Sandbox validate; scenarioId sent in request body, not returned.',
  },
  {
    id:              'validate_invoice',
    method:          'POST',
    url:             FBR_URLS.VALIDATE_INVOICE,
    appProxy:        null,
    category:        'invoice',
    exposesScenarios: false,
    notes:           'Production validate.',
  },
  {
    id:              'provinces',
    method:          'GET',
    url:             FBR_URLS.PROVINCES,
    appProxy:        '/api/provinces',
    category:        'reference',
    exposesScenarios: false,
    probe:           true,
  },
  {
    id:              'doc_types',
    method:          'GET',
    url:             FBR_URLS.DOC_TYPES,
    appProxy:        '/api/doctypes',
    category:        'reference',
    exposesScenarios: false,
    probe:           true,
  },
  {
    id:              'item_codes',
    method:          'GET',
    url:             FBR_URLS.ITEM_CODES,
    appProxy:        '/api/itemcodes',
    category:        'reference',
    exposesScenarios: false,
    probe:           false,
    notes:           'Large dataset (~2MB); skipped in live probe unless probeHeavy=true.',
  },
  {
    id:              'sro_item_code',
    method:          'GET',
    url:             FBR_URLS.SRO_ITEM_CODE,
    appProxy:        '/api/sro-item-codes',
    category:        'reference',
    exposesScenarios: false,
    probe:           true,
  },
  {
    id:              'trans_types',
    method:          'GET',
    url:             FBR_URLS.TRANS_TYPES,
    appProxy:        '/api/trans-types',
    category:        'reference',
    exposesScenarios: false,
    probe:           true,
  },
  {
    id:              'uom',
    method:          'GET',
    url:             FBR_URLS.UOM,
    appProxy:        '/api/uom',
    category:        'reference',
    exposesScenarios: false,
    probe:           true,
  },
  {
    id:              'sro_schedule',
    method:          'GET',
    url:             FBR_URLS.SRO_SCHEDULE,
    appProxy:        '/api/sro-schedule',
    category:        'reference',
    exposesScenarios: false,
    probe:           false,
    notes:           'Requires rate_id, date, origination_supplier_csv query params.',
  },
  {
    id:              'sale_type_to_rate',
    method:          'GET',
    url:             FBR_URLS.SALE_TYPE_TO_RATE,
    appProxy:        '/api/rates',
    category:        'reference',
    exposesScenarios: false,
    probe:           false,
    notes:           'Requires date, transTypeId, originationSupplier query params.',
  },
  {
    id:              'hs_uom',
    method:          'GET',
    url:             FBR_URLS.HS_UOM,
    appProxy:        '/api/hs-uom',
    category:        'reference',
    exposesScenarios: false,
    probe:           false,
    notes:           'Requires hs_code and annexure_id query params.',
  },
  {
    id:              'sro_item',
    method:          'GET',
    url:             FBR_URLS.SRO_ITEM,
    appProxy:        '/api/sro-item',
    category:        'reference',
    exposesScenarios: false,
    probe:           false,
    notes:           'Requires date and sro_id query params.',
  },
  {
    id:              'statl',
    method:          'POST',
    url:             FBR_URLS.STATL,
    appProxy:        '/api/statl',
    category:        'registration',
    exposesScenarios: false,
    probe:           'statl',
    notes:           'Returns taxpayer active/inactive status only.',
  },
  {
    id:              'get_reg_type',
    method:          'POST',
    url:             FBR_URLS.GET_REG_TYPE,
    appProxy:        '/api/reg-type',
    category:        'registration',
    exposesScenarios: false,
    probe:           'reg_type',
    notes:           'Returns Registered/Unregistered only.',
  },
]);

const SCENARIO_KEY_RE = /scenario|eligible|eligibility|business.?activity|business.?nature|sector/i;

function findScenarioRelatedFields(value, path = '', hits = [], depth = 0) {
  if (depth > 8 || value === null || value === undefined) return hits;

  if (Array.isArray(value)) {
    value.slice(0, 3).forEach((item, i) => {
      findScenarioRelatedFields(item, `${path}[${i}].`, hits, depth + 1);
    });
    return hits;
  }

  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const nextPath = `${path}${key}`;
      if (SCENARIO_KEY_RE.test(key)) {
        hits.push({
          path:  nextPath,
          value: typeof child === 'object' ? JSON.stringify(child).slice(0, 200) : child,
        });
      }
      findScenarioRelatedFields(child, `${nextPath}.`, hits, depth + 1);
    }
  }

  return hits;
}

function summarizeBody(data) {
  if (data === null || data === undefined) return null;
  if (typeof data === 'string') return data.slice(0, 500);
  try {
    const json = JSON.stringify(data);
    return json.length > 500 ? `${json.slice(0, 500)}…` : json;
  } catch {
    return String(data);
  }
}

async function probeEndpoint(entry, { fbrGet, fbrPost, sellerNtn, probeHeavy }) {
  if (!entry.probe) {
    return {
      id:       entry.id,
      probed:   false,
      reason:   entry.notes || 'Not configured for automatic probe.',
    };
  }

  if (entry.probe === false) {
    return { id: entry.id, probed: false, reason: entry.notes };
  }

  if (entry.id === 'item_codes' && !probeHeavy) {
    return { id: entry.id, probed: false, reason: entry.notes };
  }

  try {
    let data;
    if (entry.probe === 'statl') {
      if (!sellerNtn) {
        return { id: entry.id, probed: false, reason: 'No seller NTN available for STATL probe.' };
      }
      data = await fbrPost(FBR_URLS.STATL, {
        regno: sellerNtn,
        date:  new Date().toISOString().slice(0, 10),
      });
    } else if (entry.probe === 'reg_type') {
      if (!sellerNtn) {
        return { id: entry.id, probed: false, reason: 'No seller NTN available for Get_Reg_Type probe.' };
      }
      data = await fbrPost(FBR_URLS.GET_REG_TYPE, { Registration_No: sellerNtn });
    } else {
      data = await fbrGet(entry.url);
    }

    const scenarioFields = findScenarioRelatedFields(data);
    return {
      id:              entry.id,
      url:             entry.url,
      probed:          true,
      httpStatus:      200,
      scenarioFieldsFound: scenarioFields,
      exposesEligibleScenarios: scenarioFields.length > 0,
      responsePreview: summarizeBody(data),
    };
  } catch (err) {
    const status = err.response?.status;
    return {
      id:              entry.id,
      url:             entry.url,
      probed:          true,
      error:           true,
      httpStatus:      status ?? null,
      message:         err.message,
      responsePreview: summarizeBody(err.response?.data),
      scenarioFieldsFound: findScenarioRelatedFields(err.response?.data),
      exposesEligibleScenarios: false,
    };
  }
}

async function buildEligibleScenariosReport({ fbrGet, fbrPost, probeHeavy = false }) {
  let sellerNtn = null;
  try {
    const company = await getCompanySettings();
    sellerNtn = company?.ntn ?? null;
  } catch {
    sellerNtn = null;
  }

  const probeTargets = FBR_ENDPOINT_INVENTORY.filter(e => e.probe);
  const probeResults = [];

  for (const entry of probeTargets) {
    probeResults.push(await probeEndpoint(entry, { fbrGet, fbrPost, sellerNtn, probeHeavy }));
  }

  const anyExposeScenarios = probeResults.some(r => r.exposesEligibleScenarios);

  return {
    officialEligibleScenariosApi: {
      exists:        false,
      documentedUrl: null,
      source:        'FBR Technical Specification for DI API v1.12 — no web method returns taxpayer-specific eligible scenario IDs.',
    },
    documentation: {
      scenarioMasterList: {
        section:     '§9 Scenarios for Sandbox Testing',
        description: 'Static table of all 28 scenario IDs (SN001–SN028) and sale types. Not filtered per taxpayer.',
        inApp:       'src/constants.js SCENARIOS',
      },
      applicableByBusinessActivity: {
        section:     '§10 Applicable Scenarios based on Business Activity',
        description: 'Static lookup table: Business Activity + Sector → list of scenario IDs. Does not reflect PRAL-assigned sandbox subset.',
        note:        'Requires Business Activity and Sector from IRIS Integration → Technical Details (portal only, not exposed via DI API).',
      },
      irisSandboxPortal: {
        section:     'DI User Manual v1.5 — FAQ #17',
        description: '“The eligible scenarios will be viewable in sandbox environment.”',
        url:         'https://download1.fbr.gov.pk/Docs/20257301171649798DIUserManualV1.5.pdf',
      },
      technicalSpec: {
        version: '1.12',
        url:     'https://download1.fbr.gov.pk/Docs/20257301172130815TechnicalDocumentationforDIAPIV1.12.pdf',
      },
    },
    implementedEndpoints: FBR_ENDPOINT_INVENTORY,
    liveProbe: {
      sellerNtnUsed: sellerNtn,
      probeHeavy,
      results:       probeResults,
      anyEndpointExposesEligibleScenarios: anyExposeScenarios,
    },
    conclusion: {
      canDiscoverSecondScenarioViaApi: false,
      reason: [
        'FBR DI API v1.12 defines no endpoint that returns the taxpayer-specific eligible scenario list shown in IRIS (e.g. “Eligible Scenarios: 2”).',
        '§9 lists all scenarios; §10 maps Business Activity + Sector to possible scenarios — both are static documentation, not live API responses.',
        'Reference APIs (provinces, rates, HS codes, etc.) return tax reference data only.',
        'STATL and Get_Reg_Type return registration status/type only — no scenario eligibility.',
        'The assigned sandbox scenario subset is configured in IRIS when PRAL approves integration (Technical Details / Business Nature / Sector) and is displayed only in the IRIS Sandbox Environment UI.',
        'To identify the second eligible scenario: open IRIS → Integration Mode → Sandbox Environment and read the scenario list shown there, or contact PRAL/FBR support with your registration number.',
      ].join(' '),
    },
  };
}

function createFbrDiagnosticsRouter({ fbrGet, fbrPost }) {
  const router = express.Router();

  router.get('/eligible-scenarios', async (req, res) => {
    try {
      const probeHeavy = String(req.query.probeHeavy || '').toLowerCase() === 'true';
      const report = await buildEligibleScenariosReport({ fbrGet, fbrPost, probeHeavy });
      console.log('[fbr-diagnostics] eligible-scenarios report generated; official API exists:', report.officialEligibleScenariosApi.exists);
      res.json(report);
    } catch (err) {
      console.error('[fbr-diagnostics] eligible-scenarios error:', err.message);
      const status = err.response?.status || 500;
      res.status(status).json({
        error:   true,
        message: err.message,
        data:    err.response?.data ?? null,
      });
    }
  });

  return router;
}

module.exports = {
  createFbrDiagnosticsRouter,
  buildEligibleScenariosReport,
  FBR_ENDPOINT_INVENTORY,
};
