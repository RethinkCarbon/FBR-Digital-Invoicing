'use strict';

const express = require('express');
const {
  listClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
} = require('../services/clients-service');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const clients = await listClients(req.query.q);
    res.json(clients);
  } catch (err) {
    if (String(err.message).includes('Could not find the table')) {
      return res.json([]);
    }
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const client = await getClientById(req.params.id);
    res.json(client);
  } catch (err) {
    res.status(404).json({ error: true, message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, address, province } = req.body;
    if (!name || !address || !province) {
      return res.status(400).json({ error: true, message: 'name, address, and province are required' });
    }
    const client = await createClient(req.body);
    res.status(201).json(client);
  } catch (err) {
    res.status(400).json({ error: true, message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const client = await updateClient(req.params.id, req.body);
    res.json(client);
  } catch (err) {
    res.status(400).json({ error: true, message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteClient(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: true, message: err.message });
  }
});

module.exports = router;
