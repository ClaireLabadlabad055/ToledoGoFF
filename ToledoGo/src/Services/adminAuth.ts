import { supabase } from './supabase';

export async function isAdminUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return false;
  }

  return data.user.app_metadata?.role === 'admin';
}
