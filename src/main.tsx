import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'

const root = createRoot(document.getElementById('root')!)

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  // Checked before importing the app, since the Supabase client throws on missing config
  root.render(
    <main className="mx-auto max-w-lg p-8 text-sm">
      <h1 className="mb-2 text-lg font-semibold">Supabase is not configured</h1>
      <p>
        Copy <code>.env.example</code> to <code>.env</code>, set <code>VITE_SUPABASE_URL</code> and{' '}
        <code>VITE_SUPABASE_ANON_KEY</code>, then restart <code>npm run dev</code>.
      </p>
    </main>,
  )
} else {
  import('./App').then(({ default: App }) =>
    root.render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    ),
  )
}
