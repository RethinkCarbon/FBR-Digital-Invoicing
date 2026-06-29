'use strict';

const WORKFLOW_STATUS = Object.freeze({
  DRAFT:      'draft',
  PENDING:    'pending',
  QUEUED:     'queued',
  PROCESSING: 'processing',
  SUBMITTED:  'submitted',
  FAILED:     'failed',
  RETRYING:   'retrying',
  CANCELLED:  'cancelled',
});

const LEGACY_STATUS = Object.freeze({
  SUCCESS: 'success',
  FAILED:  'failed',
  PENDING: 'pending',
});

const TERMINAL_STATUSES = Object.freeze([
  WORKFLOW_STATUS.SUBMITTED,
  WORKFLOW_STATUS.FAILED,
  WORKFLOW_STATUS.CANCELLED,
]);

const IN_FLIGHT_STATUSES = Object.freeze([
  WORKFLOW_STATUS.QUEUED,
  WORKFLOW_STATUS.PROCESSING,
  WORKFLOW_STATUS.RETRYING,
]);

function workflowToLegacy(workflow) {
  if (workflow === WORKFLOW_STATUS.SUBMITTED) return LEGACY_STATUS.SUCCESS;
  if (workflow === WORKFLOW_STATUS.FAILED || workflow === WORKFLOW_STATUS.CANCELLED) {
    return LEGACY_STATUS.FAILED;
  }
  return LEGACY_STATUS.PENDING;
}

module.exports = {
  WORKFLOW_STATUS,
  LEGACY_STATUS,
  TERMINAL_STATUSES,
  IN_FLIGHT_STATUSES,
  workflowToLegacy,
};
