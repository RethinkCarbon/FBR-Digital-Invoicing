'use strict';

const express = require('express');
const { getCompanySettings, upsertCompanySettings } = require('../services/company-settings-service');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const settings = await getCompanySettings();
    res.json(settings);
  } catch (err) {
    if (String(err.message).includes('Could not find the table')) {
      return res.json(null);
    }
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { business_name, ntn, address, province } = req.body;
    if (!business_name || !ntn || !address || !province) {
      return res.status(400).json({ error: true, message: 'business_name, ntn, address, and province are required' });
    }
    const settings = await upsertCompanySettings(req.body);
    res.json(settings);
  } catch (err) {
    res.status(400).json({ error: true, message: err.message });
  }
});

module.exports = router;
