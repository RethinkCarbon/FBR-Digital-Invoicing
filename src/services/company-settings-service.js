'use strict';

const supabase = require('../supabase');

const DEMO_COMPANY_SETTINGS = Object.freeze({
  business_name: 'Planetive (Pvt) Ltd',
  ntn:           '1234567-8',
  strn:          '12-34-5678-001-87',
  address:       'ISE Tower, 55-B, Jinnah Avenue, 9th Floor, Office 910, Islamabad 44000',
  province:      'Islamabad',
  email:         'invoicing@planetive.org',
  phone:         '+92-42-35761234',
  logo_url:      '/logo.jpeg',
});

function inferProvinceFromAddress(address = '') {
  const lower = address.toLowerCase();
  if (lower.includes('islamabad')) return 'Islamabad';
  if (lower.includes('lahore')) return 'Punjab';
  if (lower.includes('karachi')) return 'Sindh';
  if (lower.includes('peshawar')) return 'KPK';
  if (lower.includes('quetta')) return 'Balochistan';
  return null;
}

async function syncCompanySettingsProvince(existing) {
  if (!existing?.id) return existing;

  const inferred = inferProvinceFromAddress(existing.address);
  if (!inferred || existing.province === inferred) return existing;

  const { data, error } = await supabase
    .from('company_settings')
    .update({ province: inferred })
    .eq('id', existing.id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  console.log(`✅ Company settings province synced to ${inferred}`);
  return data;
}

function isMissingTableError(err) {
  const msg = String(err?.message ?? err);
  return msg.includes('Could not find the table');
}

async function getCompanySettings() {
  const { data, error } = await supabase
    .from('company_settings')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

async function upsertCompanySettings(input) {
  const existing = await getCompanySettings();
  const record = {
    business_name: input.business_name,
    ntn:           input.ntn,
    strn:          input.strn ?? null,
    address:       input.address,
    province:      input.province,
    email:         input.email ?? null,
    phone:         input.phone ?? null,
    logo_url:      input.logo_url ?? null,
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from('company_settings')
      .update(record)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await supabase
    .from('company_settings')
    .insert(record)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function seedDefaultCompanySettings() {
  try {
    const existing = await getCompanySettings();
    if (existing) {
      await syncCompanySettingsProvince(existing);
      console.log('ℹ️ Company settings already exist, skipping seed');
      return { seeded: false };
    }

    const { error } = await supabase
      .from('company_settings')
      .insert(DEMO_COMPANY_SETTINGS);

    if (error) throw new Error(error.message);

    console.log('✅ Demo company settings seeded');
    return { seeded: true };
  } catch (err) {
    if (isMissingTableError(err)) {
      console.warn(
        '⚠️  company_settings table not found — run supabase/migrations/003_company_and_clients.sql ' +
        'in the Supabase SQL Editor, then restart the server.'
      );
      return { seeded: false, tableMissing: true };
    }
    throw err;
  }
}

module.exports = {
  getCompanySettings,
  upsertCompanySettings,
  seedDefaultCompanySettings,
  syncCompanySettingsProvince,
  DEMO_COMPANY_SETTINGS,
};
