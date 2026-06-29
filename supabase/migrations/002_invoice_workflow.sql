-- Planetive FBR DI — invoice numbering, workflow status, searchable columns
-- Run in Supabase SQL Editor (Dashboard → SQL → New query)

-- ── Sequence table for PLT-YYYY-0001 ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_sequences (
  year        INTEGER PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0,
  prefix      TEXT    NOT NULL DEFAULT 'PLT',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Extend invoices (audit + business fields) ───────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS internal_invoice_no TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS action TEXT,
  ADD COLUMN IF NOT EXISTS scenario_id TEXT,
  ADD COLUMN IF NOT EXISTS invoice_date DATE,
  ADD COLUMN IF NOT EXISTS buyer_name TEXT,
  ADD COLUMN IF NOT EXISTS buyer_ntn TEXT,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS sales_tax NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Workflow status constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_workflow_status_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_workflow_status_check
      CHECK (workflow_status IN (
        'draft', 'pending', 'submitted', 'failed', 'retrying', 'cancelled'
      ));
  END IF;
END $$;

-- Migrate legacy status → workflow_status
UPDATE public.invoices
SET workflow_status = CASE
  WHEN status = 'success' THEN 'submitted'
  WHEN status = 'failed'  THEN 'failed'
  ELSE COALESCE(workflow_status, 'pending')
END
WHERE workflow_status IS NULL OR workflow_status = 'pending';

-- Backfill searchable columns from request_payload where possible
UPDATE public.invoices
SET
  buyer_name    = COALESCE(buyer_name, request_payload->>'buyerBusinessName'),
  buyer_ntn     = COALESCE(buyer_ntn, request_payload->>'buyerNTNCNIC'),
  invoice_date  = COALESCE(invoice_date, (request_payload->>'invoiceDate')::date),
  scenario_id   = COALESCE(scenario_id, request_payload->>'scenarioId')
WHERE request_payload IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_internal_no ON public.invoices (internal_invoice_no);
CREATE INDEX IF NOT EXISTS idx_invoices_workflow_status ON public.invoices (workflow_status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_buyer_name ON public.invoices (buyer_name);

-- ── Atomic internal invoice number: PLT-YYYY-0001 ────────────────────────────
CREATE OR REPLACE FUNCTION public.next_internal_invoice_number(p_year INTEGER DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_year INTEGER := COALESCE(p_year, EXTRACT(YEAR FROM now())::INTEGER);
  v_next INTEGER;
  v_prefix TEXT := 'PLT';
BEGIN
  INSERT INTO public.invoice_sequences (year, last_number)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE
    SET last_number = public.invoice_sequences.last_number + 1,
        updated_at    = now()
  RETURNING last_number INTO v_next;

  RETURN v_prefix || '-' || v_year::TEXT || '-' || LPAD(v_next::TEXT, 4, '0');
END;
$$;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_invoices_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_invoices_updated_at();
