import { Outlet } from 'react-router-dom'
import { SiteHeader } from '@/components/site-header'

function SiteLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}

export { SiteLayout }
