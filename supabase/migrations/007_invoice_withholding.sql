-- Withholding tax on invoices (applied after sales tax)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS withholding_rate NUMERIC(8, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withholding_amount NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_payable NUMERIC(14, 2);

UPDATE public.invoices
SET net_payable = COALESCE(net_payable, total_amount)
WHERE net_payable IS NULL;
