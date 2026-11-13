import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SiteLayout } from '@/components/site-layout'
import { BookingConfirmationPage } from '@/pages/booking-confirmation-page'
import { BookingFormPage } from '@/pages/booking-form-page'
import { BookingPage } from '@/pages/booking-page'
import { BookingsPage } from '@/pages/bookings-page'
import { HomePage } from '@/pages/home-page'
import { MeetingTypeCalendarPage } from '@/pages/meeting-type-calendar-page'
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
          <Route
            path="/booking/:meetingTypeId"
            element={<MeetingTypeCalendarPage />}
          />
          <Route
            path="/booking/:meetingTypeId/:start"
            element={<BookingFormPage />}
          />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route
            path="/bookings/:bookingId"
            element={<BookingConfirmationPage />}
          />
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
