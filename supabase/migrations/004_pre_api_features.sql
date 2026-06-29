-- Planetive FBR DI — pre-API features: queue fields, FBR status, item audit, cancel tracking
-- Run in Supabase SQL Editor after 002 + 003 (company/clients).
--
-- Safe to re-run: uses IF NOT EXISTS / IF EXISTS throughout.
-- Destructive step: replaces workflow_status CHECK constraint only (no rows deleted).
-- App access: Node server uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).

-- ── Extend invoices ──────────────────────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS submitted_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fbr_status                TEXT,
  ADD COLUMN IF NOT EXISTS item_statuses             JSONB,
  ADD COLUMN IF NOT EXISTS next_retry_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_retries               INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_amount       NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS fbr_cancellation_status   TEXT,
  ADD COLUMN IF NOT EXISTS note_type                 TEXT NOT NULL DEFAULT 'sale',
  ADD COLUMN IF NOT EXISTS note_reason               TEXT;

-- original_invoice_id must match invoices.id type (bigint in your schema)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'invoices'
      AND column_name  = 'original_invoice_id'
  ) THEN
    ALTER TABLE public.invoices
      ADD COLUMN original_invoice_id BIGINT REFERENCES public.invoices(id) ON DELETE SET NULL;
  END IF;
END $$;

-- FBR lifecycle status (nullable until known from FBR response)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_fbr_status_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_fbr_status_check
      CHECK (fbr_status IS NULL OR fbr_status IN (
        'Valid',
        'Edited',
        'Cancelled',
        'Partially Edited',
        'Partially Cancelled',
        'Partially Edited & Cancelled'
      ));
  END IF;
END $$;

-- Local cancellation workflow (before/after FBR API wired)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_fbr_cancellation_status_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_fbr_cancellation_status_check
      CHECK (fbr_cancellation_status IS NULL OR fbr_cancellation_status IN (
        'requested',
        'approved_local',
        'rejected',
        'pending_fbr'
      ));
  END IF;
END $$;

-- Invoice note type (sale, debit note, credit note)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_note_type_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_note_type_check
      CHECK (note_type IN ('sale', 'debit', 'credit'));
  END IF;
END $$;

-- Expand workflow statuses for submission queue (Phase 2).
-- Replaces CHECK constraint only — existing status values are unchanged.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_workflow_status_check'
  ) THEN
    ALTER TABLE public.invoices DROP CONSTRAINT invoices_workflow_status_check;
  END IF;

  ALTER TABLE public.invoices
    ADD CONSTRAINT invoices_workflow_status_check
    CHECK (workflow_status IN (
      'draft',
      'pending',
      'queued',
      'processing',
      'submitted',
      'failed',
      'retrying',
      'cancelled'
    ));
END $$;

-- ── Per-line item audit (one edit per item, edit/cancel rules) ───────────────
-- invoice_id is BIGINT to match public.invoices(id)
CREATE TABLE IF NOT EXISTS public.invoice_item_audit (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id      BIGINT NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  item_sno        TEXT NOT NULL,
  edit_count      INTEGER NOT NULL DEFAULT 0,
  edited_at       TIMESTAMPTZ,
  fbr_item_status TEXT,
  is_cancelled    BOOLEAN NOT NULL DEFAULT false,
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, item_sno)
);

CREATE INDEX IF NOT EXISTS idx_invoice_item_audit_invoice_id
  ON public.invoice_item_audit (invoice_id);

-- Row Level Security: block anon/authenticated PostgREST access.
-- Service role (used by Node server) bypasses RLS automatically.
ALTER TABLE public.invoice_item_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.invoice_item_audit FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_item_audit TO service_role;

-- Auto-update updated_at on invoice_item_audit
CREATE OR REPLACE FUNCTION public.set_invoice_item_audit_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_item_audit_updated_at ON public.invoice_item_audit;
CREATE TRIGGER trg_invoice_item_audit_updated_at
  BEFORE UPDATE ON public.invoice_item_audit
  FOR EACH ROW EXECUTE FUNCTION public.set_invoice_item_audit_updated_at();

-- ── Indexes for queue polling, search, and cancel rules ──────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_queue_poll
  ON public.invoices (workflow_status, next_retry_at)
  WHERE workflow_status IN ('queued', 'retrying');

CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date
  ON public.invoices (invoice_date);

CREATE INDEX IF NOT EXISTS idx_invoices_submitted_at
  ON public.invoices (submitted_at);

CREATE INDEX IF NOT EXISTS idx_invoices_fbr_status
  ON public.invoices (fbr_status);

CREATE INDEX IF NOT EXISTS idx_invoices_original_invoice_id
  ON public.invoices (original_invoice_id);

-- ── Backfill existing rows (updates null columns only; no deletes) ───────────

UPDATE public.invoices
SET submitted_at = COALESCE(
  submitted_at,
  NULLIF(response_payload->>'dated', '')::timestamptz,
  updated_at
)
WHERE workflow_status = 'submitted'
  AND submitted_at IS NULL;

UPDATE public.invoices
SET note_type = CASE
  WHEN request_payload->>'invoiceType' ILIKE '%debit%'  THEN 'debit'
  WHEN request_payload->>'invoiceType' ILIKE '%credit%' THEN 'credit'
  ELSE 'sale'
END
WHERE note_type = 'sale'
  AND request_payload IS NOT NULL
  AND request_payload->>'invoiceType' IS NOT NULL
  AND request_payload->>'invoiceType' <> 'Sale Invoice';

UPDATE public.invoices
SET note_reason = COALESCE(note_reason, request_payload->>'reason')
WHERE note_reason IS NULL
  AND request_payload IS NOT NULL
  AND request_payload->>'reason' IS NOT NULL;

UPDATE public.invoices
SET fbr_status = 'Valid'
WHERE workflow_status = 'submitted'
  AND fbr_status IS NULL
  AND fbr_invoice_number IS NOT NULL;

UPDATE public.invoices
SET item_statuses = response_payload->'validationResponse'->'invoiceStatuses'
WHERE item_statuses IS NULL
  AND response_payload IS NOT NULL
  AND response_payload->'validationResponse'->'invoiceStatuses' IS NOT NULL;

INSERT INTO public.invoice_item_audit (invoice_id, item_sno, fbr_item_status)
SELECT
  i.id,
  s->>'itemSNo',
  s->>'status'
FROM public.invoices i
CROSS JOIN LATERAL jsonb_array_elements(i.item_statuses) AS s
WHERE i.item_statuses IS NOT NULL
  AND s->>'itemSNo' IS NOT NULL
ON CONFLICT (invoice_id, item_sno) DO NOTHING;
