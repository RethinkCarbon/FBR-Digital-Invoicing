'use strict';

const express = require('express');
const { getScenarioPreset } = require('../constants/scenario-presets');
const {
  getScenarioReferenceData,
  fetchHsUom,
} = require('../services/scenario-reference-service');
const { getCompanySettings } = require('../services/company-settings-service');

function createScenariosRouter({ fbrGet }) {
  const router = express.Router();

  router.get('/:scenarioId/reference', async (req, res) => {
    try {
      const { scenarioId } = req.params;
      if (!getScenarioPreset(scenarioId)) {
        return res.status(404).json({ error: true, message: `Unknown scenario: ${scenarioId}` });
      }

      let sellerProvince = req.query.sellerProvince || null;
      if (!sellerProvince) {
        try {
          const company = await getCompanySettings();
          sellerProvince = company?.province ?? null;
        } catch {
          sellerProvince = null;
        }
      }

      const data = await getScenarioReferenceData(fbrGet, scenarioId, {
        sellerProvince,
        invoiceDate: req.query.invoiceDate || null,
      });

      res.json(data);
    } catch (err) {
      console.error(`[scenarios] reference ${req.params.scenarioId}:`, err.message);
      const status = err.response?.status || 500;
      res.status(status).json({
        error:   true,
        message: err.message,
        fbr:     err.response?.data ?? null,
      });
    }
  });

  router.get('/:scenarioId/hs-uom', async (req, res) => {
    try {
      const { hs_code: hsCode } = req.query;
      if (!hsCode) {
        return res.status(400).json({ error: true, message: 'hs_code query parameter is required' });
      }
      const annexureId = req.query.annexure_id ? Number(req.query.annexure_id) : null;
      const result = annexureId
        ? await fetchHsUom(fbrGet, hsCode, [annexureId])
        : await fetchHsUom(fbrGet, hsCode);
      res.json(result);
    } catch (err) {
      console.error('[scenarios] hs-uom:', err.message);
      const status = err.response?.status || 500;
      res.status(status).json({
        error:   true,
        message: err.message,
        fbr:     err.response?.data ?? null,
      });
    }
  });

  return router;
}

module.exports = { createScenariosRouter };
