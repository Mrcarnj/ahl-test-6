// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions run on Deno, not React Native.
    ignores: ['dist/*', 'supabase/functions/*'],
  },
]);
