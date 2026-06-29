'use strict';

const { processNextInQueue } = require('../services/invoice-queue-service');

const POLL_MS = parseInt(process.env.WORKER_POLL_MS || '3000', 10);
const ENABLED = process.env.WORKER_ENABLED !== 'false';

let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    let processed = true;
    while (processed) {
      processed = await processNextInQueue();
    }
  } catch (err) {
    console.error('[worker] queue error:', err.message);
  } finally {
    running = false;
  }
}

function startInvoiceSubmissionWorker() {
  if (!ENABLED) {
    console.log('[worker] Invoice submission worker disabled (WORKER_ENABLED=false)');
    return;
  }

  if (timer) return;

  console.log(`[worker] Invoice submission worker started (poll every ${POLL_MS}ms)`);
  timer = setInterval(tick, POLL_MS);
  tick();
}

function stopInvoiceSubmissionWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startInvoiceSubmissionWorker, stopInvoiceSubmissionWorker };
