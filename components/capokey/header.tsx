'use client'

import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info, Music2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type HeaderProps = {
  step: 0 | 1 | 2
  isCalibrating: boolean
}

export function Header({ step, isCalibrating }: HeaderProps) {
  const [aboutOpen, setAboutOpen] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-30 w-full bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-md items-center justify-between gap-3 px-4 md:max-w-2xl lg:max-w-4xl">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Music2 className="size-5" aria-hidden="true" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Keyform</span>
            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label="About Keyform"
            >
              <Info className="size-4" aria-hidden="true" />
            </button>
          </div>
          {isCalibrating ? <ProgressDots step={step} /> : null}
        </div>
      </header>

      {aboutOpen ? <AboutDialog onClose={() => setAboutOpen(false)} /> : null}
    </>
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

function AboutDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-6" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
        aria-label="Close about"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(92vh,40rem)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-card/95 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-200 sm:rounded-3xl sm:slide-in-from-bottom-0"
      >
        <div className="flex items-center justify-end px-4 pt-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 pb-8 pt-1 sm:px-8 sm:pb-10">
          <div className="text-center">
            <p id={titleId} className="text-2xl font-semibold tracking-[0.18em] text-foreground">
              KEYFORM
            </p>
            <p className="mt-2 text-sm font-medium text-primary">For Guitarists &amp; Singers</p>
            <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Find your ideal vocal key, get the exact semitone shift, and open the transposed tab on Ultimate
              Guitar.
            </p>
          </div>

          <div className="mt-8 space-y-5 text-left">
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Finding the song key
              </h3>
              <ol className="list-decimal space-y-2 pl-4 text-sm leading-relaxed text-foreground/90">
                <li>Search a song in Keyform. If the key is already saved, it shows automatically.</li>
                <li>
                  If it&apos;s missing, tap <span className="font-medium text-foreground">Check Key on Ultimate Guitar</span>.
                  The key is usually near the top of the chord sheet (e.g. &ldquo;Key: G&rdquo; or in the tab title).
                </li>
                <li>Enter that key in Keyform and save it so everyone else gets it next time.</li>
              </ol>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                How to transpose
              </h3>
              <ol className="list-decimal space-y-2 pl-4 text-sm leading-relaxed text-foreground/90">
                <li>Calibrate your vocal range, then pick a song and a comfortable play-in key.</li>
                <li>
                  Keyform shows the exact semitone shift (e.g. <span className="font-medium text-foreground">Set Transpose to +2</span>).
                </li>
                <li>
                  Open the chords on Ultimate Guitar and use the <span className="font-medium text-foreground">Transpose</span>{' '}
                  control at the bottom of the sheet to match that number. Or use the suggested capo fret and keep
                  playing in the original shapes.
                </li>
              </ol>
            </section>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
