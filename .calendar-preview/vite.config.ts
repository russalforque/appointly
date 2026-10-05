import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import path from 'node:path'
const fake = path.resolve(import.meta.dirname, 'fakeSupabase.ts')
export default defineConfig({
  root: path.resolve(import.meta.dirname, '..'),
  plugins: [
    {
      name: 'fake-supabase',
      enforce: 'pre',
      async resolveId(source, importer) {
        if (!/supabase$/.test(source) || !importer) return null
        const r = await this.resolve(source, importer, { skipSelf: true })
        return r && /[/]src[/]lib[/]supabase.ts$/.test(r.id) ? fake : null
      },
    },
    react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss(),
  ],
  server: { port: 5277, strictPort: true, fs: { allow: [path.resolve(import.meta.dirname, '..')] } },
})
