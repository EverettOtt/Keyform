import { Guitar } from 'lucide-react'
import { cn } from '@/lib/utils'

type HeaderProps = {
  step: 0 | 1 | 2
  isCalibrating: boolean
}

export function Header({ step, isCalibrating }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 w-full bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-md items-center justify-between gap-3 px-4 md:max-w-2xl lg:max-w-4xl">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Guitar className="size-5" aria-hidden="true" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Keyform</span>
        </div>
        {isCalibrating ? <ProgressDots step={step} /> : null}
      </div>
    </header>
  )
}

function ProgressDots({ step }: { step: 0 | 1 | 2 }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of 3`} role="img">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-all',
            i === step ? 'w-6 bg-primary' : 'w-1.5',
            i < step ? 'bg-primary/50' : i > step && 'bg-white/15',
          )}
        />
      ))}
    </div>
  )
}
