import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SiteLayout } from '@/components/site-layout'
import { BookingPage } from '@/pages/booking-page'
import { BookingsPage } from '@/pages/bookings-page'
import { HomePage } from '@/pages/home-page'
import { MeetingTypeFormPage } from '@/pages/meeting-type-form-page'
import { OwnerPage } from '@/pages/owner-page'
import { SessionProvider } from '@/lib/session'

function AppRoutes() {
  return (
    <SessionProvider>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/booking" element={<BookingPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/owner" element={<OwnerPage />} />
          <Route path="/owner/types/new" element={<MeetingTypeFormPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SessionProvider>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export { AppRoutes }
export default App
