import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Replace these with your actual Supabase Project URL and Anon/Public Key from your Supabase Dashboard
const SUPABASE_URL = 'https://ofogxqagfkppplezurym.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_m7NTu0dx-o0-J_gS_lw_cA_Y7WnD9EY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});