/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mfpabfsovmrihxnnueda.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LcF9CHbus2yiACGpogKhmQ_0zJBqFyz';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
