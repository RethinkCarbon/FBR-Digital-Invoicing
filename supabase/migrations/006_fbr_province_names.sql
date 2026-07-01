-- Normalize stored provinces to FBR official stateProvinceDesc values.

UPDATE public.company_settings
SET province = 'CAPITAL TERRITORY', updated_at = now()
WHERE lower(trim(province)) IN ('islamabad', 'ict', 'capital territory');

UPDATE public.company_settings
SET province = 'PUNJAB', updated_at = now()
WHERE lower(trim(province)) = 'punjab';

UPDATE public.company_settings
SET province = 'SINDH', updated_at = now()
WHERE lower(trim(province)) = 'sindh';

UPDATE public.company_settings
SET province = 'KHYBER PAKHTUNKHWA', updated_at = now()
WHERE lower(trim(province)) IN ('kpk', 'khyber pakhtunkhwa');

UPDATE public.company_settings
SET province = 'BALOCHISTAN', updated_at = now()
WHERE lower(trim(province)) = 'balochistan';

UPDATE public.company_settings
SET province = 'AZAD JAMMU AND KASHMIR', updated_at = now()
WHERE lower(trim(province)) IN ('ajk', 'azad jammu and kashmir');

UPDATE public.company_settings
SET province = 'GILGIT BALTISTAN', updated_at = now()
WHERE lower(trim(province)) IN ('gb', 'gilgit baltistan');

UPDATE public.clients
SET province = 'CAPITAL TERRITORY', updated_at = now()
WHERE lower(trim(province)) IN ('islamabad', 'ict', 'capital territory');

UPDATE public.clients
SET province = 'PUNJAB', updated_at = now()
WHERE lower(trim(province)) = 'punjab';

UPDATE public.clients
SET province = 'SINDH', updated_at = now()
WHERE lower(trim(province)) = 'sindh';

UPDATE public.clients
SET province = 'KHYBER PAKHTUNKHWA', updated_at = now()
WHERE lower(trim(province)) IN ('kpk', 'khyber pakhtunkhwa');

UPDATE public.clients
SET province = 'BALOCHISTAN', updated_at = now()
WHERE lower(trim(province)) = 'balochistan';

UPDATE public.clients
SET province = 'AZAD JAMMU AND KASHMIR', updated_at = now()
WHERE lower(trim(province)) IN ('ajk', 'azad jammu and kashmir');

UPDATE public.clients
SET province = 'GILGIT BALTISTAN', updated_at = now()
WHERE lower(trim(province)) IN ('gb', 'gilgit baltistan');
