-- Sync Planetive seller address + province (Islamabad office)
-- Run once in Supabase SQL editor if Company Settings still shows the wrong province.

UPDATE public.company_settings
SET
  address  = 'ISE Tower, 55-B, Jinnah Avenue, 9th Floor, Office 910, Islamabad 44000',
  province = 'CAPITAL TERRITORY',
  updated_at = now()
WHERE id IN (
  SELECT id FROM public.company_settings ORDER BY created_at ASC LIMIT 1
);
