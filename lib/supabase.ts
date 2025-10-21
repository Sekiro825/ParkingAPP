import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Database } from './database.types';
import Constants from 'expo-constants';

// Prefer EXPO_PUBLIC_* env vars; fall back to app config extras
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  (Constants?.expoConfig?.extra as any)?.supabaseUrl ||
  (Constants as any)?.manifest?.extra?.supabaseUrl;

const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  (Constants?.expoConfig?.extra as any)?.supabaseAnonKey ||
  (Constants as any)?.manifest?.extra?.supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  // Provide a clear, actionable error for developers
  throw new Error(
    'Supabase URL/Anon Key missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your environment or add extra.supabaseUrl and extra.supabaseAnonKey to app.json. See SETUP.md.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
