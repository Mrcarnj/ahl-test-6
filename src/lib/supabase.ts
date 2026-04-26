import { createClient } from '@supabase/supabase-js'
import { safeAsyncStorage } from './asyncStorageWrapper'

const supabaseUrl = "https://zxjzdtepjpnunjkqrsjy.supabase.co"
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4anpkdGVwanBudW5qa3Fyc2p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjk2MzI0NzEsImV4cCI6MjA0NTIwODQ3MX0.Q38eMfnthqid-0eo3yyLSFhRWMIv85yhWDmVXmxNwDw"

// Create a custom storage adapter that uses our safe wrapper
const customStorage = {
  getItem: (key: string) => safeAsyncStorage.getItem(key),
  setItem: (key: string, value: string) => safeAsyncStorage.setItem(key, value),
  removeItem: (key: string) => safeAsyncStorage.removeItem(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

