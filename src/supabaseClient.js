import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'process.env.REACT_APP_SUPABASE_URL';
const supabaseAnonKey = 'process.env.REACT_APP_SUPABASE_ANON_KEY'
const supabaseServiceRoleKey = 'REACT_APP_SUPABASE_SERVICE_ROLE_KEY'

// Instance pour les utilisateurs (avec anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: { 'Accept': 'application/json' },
  },
});

// Instance pour les opérations admin (avec service role key)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  global: {
    headers: { 'Accept': 'application/json' },
  },
});