import { createRoot } from 'react-dom/client'
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom'
import '../src/index.css'
import CalendarPage from '../src/pages/dashboard/CalendarPage'
const ctx = {
  business: { id: 'b', slug: 'bloom-studio', name: 'Bloom Studio' },
  timezone: 'Asia/Manila',
  can: { notifications: true, advancedBooking: true },
  reload: () => {},
}
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Routes>
      <Route element={<main className="font-dashboard min-h-screen bg-neutral-50 p-4 sm:p-6 md:p-8"><Outlet context={ctx} /></main>}>
        <Route path="*" element={<CalendarPage />} />
      </Route>
    </Routes>
  </BrowserRouter>,
)
// Harness only: ?open=1 opens the first booking's details once the board has loaded.
if (new URLSearchParams(location.search).get('open')) {
  const t = setInterval(() => {
    const el = document.querySelector<HTMLButtonElement>('button[aria-label*=" to "]')
    if (el) { clearInterval(t); el.click() }
  }, 200)
}
// Harness only: ?measure=1 reports elements wider than the viewport.
if (new URLSearchParams(location.search).get('measure')) {
  setTimeout(() => {
    const out: string[] = [`viewport ${innerWidth} scrollWidth ${document.documentElement.scrollWidth}`]
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const r = el.getBoundingClientRect()
      const p = el.parentElement?.getBoundingClientRect()
      if (r.right > innerWidth + 1 && p && p.right <= innerWidth + 1)
        out.push(`${el.tagName} w=${Math.round(r.width)} right=${Math.round(r.right)} class="${String(el.className).slice(0, 110)}"`)
    }
    const pre = document.createElement('pre'); pre.id = 'measure'; pre.textContent = out.join('\n'); document.body.append(pre)
  }, 2500)
}
