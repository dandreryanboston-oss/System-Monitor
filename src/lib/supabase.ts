/// <reference types="vite/client" />
import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = 
  import.meta.env.VITE_SUPABASE_URL || 
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL || 
  'https://mfpabfsovmrihxnnueda.supabase.co';

const supabaseAnonKey = 
  import.meta.env.VITE_SUPABASE_ANON_KEY || 
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
  'sb_publishable_LcF9CHbus2yiACGpogKhmQ_0zJBqFyz';

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
