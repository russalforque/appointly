import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AuthProvider from './auth/AuthProvider'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import ConfirmEmail from './pages/ConfirmEmail'
import Pricing from './pages/Pricing'
import PaymentSuccess from './pages/payment/PaymentSuccess'
import PaymentCancelled from './pages/payment/PaymentCancelled'
import DashboardLayout from './pages/dashboard/DashboardLayout'
import ProfilePage from './pages/dashboard/ProfilePage'
import BookingPage from './pages/public/BookingPage'
import BookingConfirmation from './pages/public/BookingConfirmation'
import BookingsPage from './pages/dashboard/BookingsPage'
import CustomersPage from './pages/dashboard/CustomersPage'
import HoursPage from './pages/dashboard/HoursPage'
import BookingSettingsPage from './pages/dashboard/BookingSettingsPage'
import BillingPage from './pages/dashboard/BillingPage'
import ServicesPage from './pages/dashboard/ServicesPage'
import StaffPage from './pages/dashboard/StaffPage'
import StaffDetailPage from './pages/dashboard/StaffDetailPage'
import PayPlanPage from './pages/dashboard/PayPlanPage'
import Terms from './pages/legal/Terms'
import Privacy from './pages/legal/Privacy'
import HomeRedirect from './components/HomeRedirect'
import { Loading } from './components/Status'

// Split out of the main bundle: recharts (DashboardHome) and react-big-calendar (CalendarPage)
// are each larger than the rest of the app put together, and the admin area is only ever opened
// by Appointly staff. None of it belongs in the download a customer waits for on a booking page.
const DashboardHome = lazy(() => import('./pages/dashboard/DashboardHome'))
const CalendarPage = lazy(() => import('./pages/dashboard/CalendarPage'))
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminPaymentsPage = lazy(() => import('./pages/admin/AdminPaymentsPage'))
const AdminBusinessesPage = lazy(() => import('./pages/admin/AdminBusinessesPage'))
const AdminPaymentSettingsPage = lazy(() => import('./pages/admin/AdminPaymentSettingsPage'))
const AdminAdminsPage = lazy(() => import('./pages/admin/AdminAdminsPage'))

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/confirm-email" element={<ConfirmEmail />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
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
            <Route path="billing/pay/:planId" element={<PayPlanPage />} />
            <Route path="services" element={<ServicesPage />} />
            <Route path="staff" element={<StaffPage />} />
            <Route path="staff/:id" element={<StaffDetailPage />} />
          </Route>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/payments" replace />} />
            <Route path="payments" element={<AdminPaymentsPage />} />
            <Route path="businesses" element={<AdminBusinessesPage />} />
            <Route path="admins" element={<AdminAdminsPage />} />
            <Route path="payment-settings" element={<AdminPaymentSettingsPage />} />
          </Route>
          {/* Staff have no dashboard, so "somewhere else" resolves per account. */}
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  )
}
