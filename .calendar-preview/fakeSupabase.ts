// In-memory stand-in for the Supabase client, for a visual preview only.
const TZ_OFFSET = '+08:00'
const todayManila = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
const add = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const staff = [
  { id: 's1', business_id: 'b', name: 'Ana Reyes', position: 'Senior Stylist', is_active: true, email: null, phone: null, avatar_url: null },
  { id: 's2', business_id: 'b', name: 'Ben Cruz', position: 'Barber', is_active: true, email: null, phone: null, avatar_url: null },
  { id: 's3', business_id: 'b', name: 'Carla Santos', position: 'Colorist', is_active: true, email: null, phone: null, avatar_url: null },
]
const services = {
  cut: { name: 'Haircut & Style', duration_minutes: 60, price: 450 },
  trim: { name: 'Beard Trim', duration_minutes: 30, price: 200 },
  color: { name: 'Full Color', duration_minutes: 120, price: 2200 },
  wash: { name: 'Wash & Blow-dry', duration_minutes: 45, price: 350 },
}
const names = ['Maria Lopez', 'Jose Garcia', 'Liza Tan', 'Paolo Ramos', 'Grace Lim', 'Mark Dela Cruz', 'Joy Villanueva', 'Ramon Aquino', 'Bea Torres', 'Nico Mendoza']
type S = keyof typeof services
const plan: [number, string, string, S, string, number?][] = [
  [0, 's1', '09:00', 'cut', 'completed'], [0, 's1', '10:30', 'color', 'confirmed', 15], [0, 's1', '14:00', 'wash', 'pending'],
  [0, 's2', '09:30', 'trim', 'completed'], [0, 's2', '10:00', 'cut', 'confirmed'], [0, 's2', '13:30', 'trim', 'pending'], [0, 's2', '15:00', 'cut', 'confirmed'],
  [0, 's3', '11:00', 'color', 'confirmed', 15], [0, 's3', '16:00', 'wash', 'cancelled'],
  [-1, 's1', '10:00', 'cut', 'completed'], [-1, 's2', '11:00', 'trim', 'no_show'], [-1, 's3', '13:00', 'color', 'completed'],
  [-2, 's2', '09:00', 'cut', 'completed'], [-2, 's1', '15:00', 'wash', 'completed'],
  [1, 's1', '09:00', 'cut', 'confirmed'], [1, 's2', '09:00', 'cut', 'pending'], [1, 's3', '10:00', 'color', 'confirmed', 15],
  [2, 's1', '13:00', 'wash', 'pending'], [2, 's2', '16:30', 'trim', 'confirmed'],
  [3, 's1', '10:00', 'cut', 'confirmed'], [3, 's3', '14:00', 'color', 'pending'],
  [5, 's2', '11:00', 'cut', 'confirmed'], [8, 's1', '09:30', 'cut', 'confirmed'], [12, 's3', '15:00', 'color', 'confirmed'],
]
const bookings = plan.map(([dd, sid, t, sk, status, buf = 0], i) => {
  const d = add(todayManila, dd)
  const svc = services[sk]
  const start = new Date(`${d}T${t}:00${TZ_OFFSET}`)
  return {
    id: `bk${i}`, business_id: 'b', service_id: sk, staff_id: sid, customer_id: `c${i}`,
    start_at: start.toISOString(), end_at: new Date(start.getTime() + (svc.duration_minutes + buf) * 60000).toISOString(),
    status, notes: i === 1 ? 'First time coloring — prefers ash brown.' : null,
    public_token: `a1b2c3d4-0000-0000-0000-00000000000${i % 10}`, created_at: start.toISOString(),
    services: svc, staff: { name: staff.find((s) => s.id === sid)!.name, position: staff.find((s) => s.id === sid)!.position },
    customers: { name: names[i % names.length], email: `${names[i % names.length].split(' ')[0].toLowerCase()}@mail.com`, phone: '0917 555 01' + String(i).padStart(2, '0') },
  }
})
const tables: Record<string, unknown[]> = {
  staff,
  bookings,
  business_settings: [{
    working_hours: { mon: [{ start: '09:00', end: '18:00' }], tue: [{ start: '09:00', end: '18:00' }], wed: [{ start: '09:00', end: '18:00' }], thu: [{ start: '09:00', end: '18:00' }], fri: [{ start: '09:00', end: '18:00' }], sat: [{ start: '09:00', end: '17:00' }] },
    blocked_dates: [add(todayManila, 4)],
  }],
  staff_days_off: [{ id: 'o1', staff_id: 's3', date: add(todayManila, 2), reason: 'Training' }],
}
function builder(table: string) {
  let single = false
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'lt', 'order', 'limit', 'in', 'update']) b[m] = () => b
  b.single = () => { single = true; return b }
  b.then = (res: (v: unknown) => void) => {
    const rows = tables[table] ?? []
    setTimeout(() => res({ data: single ? rows[0] : rows, error: null }), 150)
  }
  return b
}
export const supabase = { from: builder, rpc: () => builder('none'), auth: {}, channel: () => ({}) }
