import { Route, Routes } from 'react-router-dom'

function Home() {
  return (
    <main className="min-h-screen grid place-items-center">
      <h1 className="text-2xl font-semibold">Appointly</h1>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  )
}
