import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

const features = [
  'Длительность встречи выбирает владелец: 15, 30, 45 или 60 минут; слоты с 09:00 до 18:00.',
  'Проверка конфликта при бронировании.',
  'Просмотр предстоящих событий в отдельном разделе.',
]

function HomePage() {
  return (
    <div className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(85%_75%_at_8%_-15%,#cdd9fb_0%,transparent_100%),radial-gradient(65%_70%_at_96%_5%,#fbe0c4_0%,transparent_100%)]"
      />
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 md:grid-cols-2 md:items-center md:py-24">
        <div>
          <p className="inline-flex items-center rounded-full border border-white/80 bg-white/70 px-3 py-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            Быстрая запись на звонок
          </p>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight sm:text-6xl">
            Calendar
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-muted-foreground">
            Один экран, понятные слоты, быстрая бронь. Выберите время и
            запишитесь на звонок без лишних шагов.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-8 h-11 bg-brand px-6 text-brand-foreground hover:bg-brand/90"
          >
            <Link to="/booking">
              Записаться
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <section className="rounded-xl border border-border bg-card/90 p-6 shadow-sm">
          <h2 className="text-xl font-semibold tracking-tight">
            Что доступно прямо сейчас
          </h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
            {features.map((feature) => (
              <li key={feature} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

export { HomePage }
