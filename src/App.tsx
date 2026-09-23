import { Navigate, Route, Routes } from 'react-router-dom'
import AuthProvider from './auth/AuthProvider'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Pricing from './pages/Pricing'
import PaymentSuccess from './pages/payment/PaymentSuccess'
import PaymentCancelled from './pages/payment/PaymentCancelled'
import DashboardLayout from './pages/dashboard/DashboardLayout'
import ProfilePage from './pages/dashboard/ProfilePage'
import BookingPage from './pages/public/BookingPage'
import BookingConfirmation from './pages/public/BookingConfirmation'
import DashboardHome from './pages/dashboard/DashboardHome'
import CalendarPage from './pages/dashboard/CalendarPage'
import BookingsPage from './pages/dashboard/BookingsPage'
import CustomersPage from './pages/dashboard/CustomersPage'
import HoursPage from './pages/dashboard/HoursPage'
import BookingSettingsPage from './pages/dashboard/BookingSettingsPage'
import BillingPage from './pages/dashboard/BillingPage'
import ServicesPage from './pages/dashboard/ServicesPage'
import StaffPage from './pages/dashboard/StaffPage'
import StaffDetailPage from './pages/dashboard/StaffDetailPage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/payment/success" element={<PaymentSuccess />} />
        <Route path="/payment/cancelled" element={<PaymentCancelled />} />
        <Route path="/book/:slug" element={<BookingPage />} />
        <Route path="/booking/:token" element={<BookingConfirmation />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardHome />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="bookings" element={<BookingsPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="hours" element={<HoursPage />} />
          <Route path="booking-settings" element={<BookingSettingsPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="staff/:id" element={<StaffDetailPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  )
}
