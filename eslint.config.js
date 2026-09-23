import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // supabase/functions is Deno, not browser TypeScript, and .kilo holds editor worktrees whose
  // copy of the project would otherwise be linted a second time.
  globalIgnores(['dist', '.kilo', 'supabase/functions']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      // Pinned so a nested worktree cannot make the root ambiguous.
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
])
