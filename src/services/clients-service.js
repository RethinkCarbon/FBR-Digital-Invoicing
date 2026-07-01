'use strict';

const supabase = require('../supabase');
const { normalizeProvinceForFbr } = require('../constants/provinces');

async function listClients(q) {
  let query = supabase
    .from('clients')
    .select('*')
    .order('name', { ascending: true });

  if (q?.trim()) {
    const term = `%${q.trim()}%`;
    query = query.or(`name.ilike.${term},ntn.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function getClientById(id) {
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).single();
  if (error || !data) throw new Error('Client not found');
  return data;
}

async function createClient(input) {
  const { data, error } = await supabase
    .from('clients')
    .insert({
      name:              input.name,
      ntn:               input.ntn ?? null,
      registration_type: input.registration_type || 'Registered',
      address:           input.address,
      province:          normalizeProvinceForFbr(input.province),
      email:             input.email ?? null,
      phone:             input.phone ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function updateClient(id, input) {
  const { data, error } = await supabase
    .from('clients')
    .update({
      name:              input.name,
      ntn:               input.ntn ?? null,
      registration_type: input.registration_type || 'Registered',
      address:           input.address,
      province:          normalizeProvinceForFbr(input.province),
      email:             input.email ?? null,
      phone:             input.phone ?? null,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function deleteClient(id) {
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

module.exports = {
  listClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
};
