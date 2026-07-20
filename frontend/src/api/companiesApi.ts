// src/api/companiesApi.ts
import { supabase } from '../lib/supabaseClient';
import type { CompanyDetail } from '../types/api';

export async function getCompany(id: string): Promise<CompanyDetail | null> {
  const { data, error } = await supabase.from('companies').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to fetch company ${id}: ${error.message}`);
  return data ?? null;
}