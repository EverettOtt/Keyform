'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { formatKeyLabel, type Mode, type SongKey } from '@/lib/music'
import { cn } from '@/lib/utils'

const TONIC_LABELS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const

/** ~4 option rows (py-2 + text-sm) visible before scrolling on desktop. */
const DESKTOP_LIST_MAX_PX = 160

type KeySelectProps = {
  id?: string
  value: SongKey
  onChange: (key: SongKey) => void
  className?: string
  'aria-label'?: string
}

type MenuPos = {
  top: number
  left: number
  width: number
  listMaxHeight: number
  /** Mobile: dock as a bottom sheet instead of anchoring to the trigger. */
  sheet: boolean
}

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
}

export function KeySelect({ id, value, onChange, className, 'aria-label': ariaLabel }: KeySelectProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<MenuPos | null>(null)
  const [mounted, setMounted] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const triggerId = id ?? listId

  useEffect(() => {
    setMounted(true)
  }, [])

  function updatePosition() {
    const el = triggerRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const gap = 8
    const pad = 12
    const sheet = isMobileViewport()

    if (sheet) {
      // Bottom sheet — keep the picker in the safe, usable part of the screen.
      setPos({
        top: 0,
        left: pad,
        width: vw - pad * 2,
        listMaxHeight: Math.min(280, Math.floor(vh * 0.45)),
        sheet: true,
      })
      return
    }

    const modeBlock = 64
    const preferredList = DESKTOP_LIST_MAX_PX
    const preferredMenu = modeBlock + preferredList + 16
    const spaceBelow = vh - rect.bottom - gap - pad
    const spaceAbove = rect.top - gap - pad
    const openUp = spaceBelow < preferredMenu && spaceAbove > spaceBelow
    const available = Math.max(140, openUp ? spaceAbove : spaceBelow)
    const listMaxHeight = Math.max(120, Math.min(preferredList, available - modeBlock))

    let top = openUp ? rect.top - gap - (modeBlock + listMaxHeight + 8) : rect.bottom + gap
    top = Math.max(pad, Math.min(top, vh - pad - 140))

    let left = rect.left
    const width = Math.min(rect.width, vw - pad * 2)
    left = Math.max(pad, Math.min(left, vw - pad - width))

    setPos({ top, left, width, listMaxHeight, sheet: false })
  }

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    // Nudge trigger into view on mobile so the sheet doesn't cover the field awkwardly.
    if (isMobileViewport()) {
      triggerRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onReposition() {
      updatePosition()
    }

    // Lock background scroll while the mobile sheet is open.
    const prevOverflow = document.body.style.overflow
    if (isMobileViewport()) document.body.style.overflow = 'hidden'

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open])

  function pickTonic(tonic: number) {
    onChange({ tonic, mode: value.mode })
    setOpen(false)
  }

  function pickMode(mode: Mode) {
    onChange({ tonic: value.tonic, mode })
  }

  const menu =
    open && mounted && pos
      ? createPortal(
          <>
            {pos.sheet && (
              <button
                type="button"
                aria-label="Close key picker"
                className="fixed inset-0 z-[99] bg-black/55 backdrop-blur-[2px]"
                onClick={() => setOpen(false)}
              />
            )}
            <div
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel ?? 'Song key'}
              style={
                pos.sheet
                  ? {
                      left: pos.left,
                      width: pos.width,
                      bottom: 'max(0.75rem, env(safe-area-inset-bottom))',
                    }
                  : { top: pos.top, left: pos.left, width: pos.width }
              }
              className={cn(
                'fixed z-[100] overflow-hidden rounded-2xl border border-white/10 bg-[#12141f] shadow-2xl outline-none',
                pos.sheet && 'max-h-[min(70dvh,28rem)]',
              )}
            >
              <div className="border-b border-white/10 p-2" role="group" aria-label="Major or minor">
                {pos.sheet && (
                  <p className="mb-2 px-1 text-center text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                    Choose key
                  </p>
                )}
                <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                  {(['major', 'minor'] as Mode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => pickMode(mode)}
                      className={cn(
                        'rounded-lg px-3 py-2.5 text-sm font-medium capitalize transition-colors',
                        value.mode === mode
                          ? 'bg-primary/20 text-primary'
                          : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <ul
                className="overflow-y-auto overscroll-contain p-1.5 [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20"
                style={{ maxHeight: pos.listMaxHeight }}
              >
                {TONIC_LABELS.map((label, tonic) => {
                  const selected = value.tonic === tonic
                  return (
                    <li key={label}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => pickTonic(tonic)}
                        className={cn(
                          'flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 font-mono text-sm outline-none select-none transition-colors',
                          selected ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-white/10',
                        )}
                      >
                        <span>
                          {label} {value.mode}
                        </span>
                        {selected ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </>,
          document.body,
        )
      : null

  return (
    <div ref={rootRef} className={cn('relative w-full min-w-0', className)}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-label={ariaLabel ?? 'Song key'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-background/60 px-3 font-mono text-sm text-foreground outline-none transition-colors',
          'hover:border-white/20 hover:bg-background/80',
          'focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/20',
          open && 'border-primary/40 bg-background/80',
        )}
      >
        <span className="truncate">{formatKeyLabel(value)}</span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {menu}
    </div>
  )
}
