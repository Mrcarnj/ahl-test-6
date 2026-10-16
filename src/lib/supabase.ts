import { createClient, processLock } from '@supabase/supabase-js'
import { safeAsyncStorage } from './asyncStorageWrapper'
import { isWeb } from './platform'

const supabaseUrl = "https://zxjzdtepjpnunjkqrsjy.supabase.co"
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4anpkdGVwanBudW5qa3Fyc2p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjk2MzI0NzEsImV4cCI6MjA0NTIwODQ3MX0.Q38eMfnthqid-0eo3yyLSFhRWMIv85yhWDmVXmxNwDw"

// Create a custom storage adapter that uses our safe wrapper
const customStorage = {
  getItem: (key: string) => safeAsyncStorage.getItem(key),
  setItem: (key: string, value: string) => safeAsyncStorage.setItem(key, value),
  removeItem: (key: string) => safeAsyncStorage.removeItem(key),
};

// Where the client keeps the session. This is supabase-js's own default
// (sb-<project ref>-auth-token), spelled out so AuthProvider can read it.
// Changing it would lose every stored session.
export const AUTH_STORAGE_KEY = 'sb-zxjzdtepjpnunjkqrsjy-auth-token'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorage,
    storageKey: AUTH_STORAGE_KEY,
    // React Native has no navigator.locks, and without a lock supabase-js
    // lets every caller at startup refresh the same expired token at once.
    // A late one sends a refresh token that was already rotated, the server
    // rejects it as reused and the session is deleted: a surprise sign-out.
    // The browser keeps supabase-js's default, a navigator.locks lock that
    // also covers other tabs.
    lock: isWeb ? undefined : processLock,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

