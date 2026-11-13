import { Calendar as CalendarIcon } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'

const navItems = [
  { to: '/booking', label: 'Записаться' },
  { to: '/bookings', label: 'Предстоящие события' },
]

function SiteHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <CalendarIcon className="size-6 text-brand" aria-hidden="true" />
          <span className="text-lg font-semibold tracking-tight">Calendar</span>
        </Link>
        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-secondary font-medium text-secondary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl justify-end px-6 py-1">
          <Link
            to="/owner"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Вход владельца
          </Link>
        </div>
      </div>
    </header>
  )
}

export { SiteHeader }
