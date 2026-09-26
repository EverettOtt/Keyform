'use client'

import { Select } from '@base-ui/react/select'
import { Check, ChevronDown } from 'lucide-react'
import { ALL_KEYS, formatKeyLabel, type SongKey } from '@/lib/music'
import { cn } from '@/lib/utils'

const KEY_ITEMS = ALL_KEYS.map((k) => ({
  value: `${k.tonic}-${k.mode}`,
  label: formatKeyLabel(k),
}))

function parseValue(value: string): SongKey | null {
  const [t, m] = value.split('-')
  if (m !== 'major' && m !== 'minor') return null
  const tonic = Number(t)
  if (!Number.isInteger(tonic) || tonic < 0 || tonic > 11) return null
  return { tonic, mode: m }
}

type KeySelectProps = {
  id?: string
  value: SongKey
  onChange: (key: SongKey) => void
  className?: string
  'aria-label'?: string
}

export function KeySelect({ id, value, onChange, className, 'aria-label': ariaLabel }: KeySelectProps) {
  const valueStr = `${value.tonic}-${value.mode}`

  return (
    <Select.Root
      value={valueStr}
      onValueChange={(next) => {
        if (typeof next !== 'string') return
        const parsed = parseValue(next)
        if (parsed) onChange(parsed)
      }}
      items={KEY_ITEMS}
    >
      <Select.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          'inline-flex box-border h-10 w-fit items-center gap-2 rounded-xl border border-white/10 bg-background/60 px-3 font-mono text-sm leading-none text-foreground outline-none transition-colors',
          'hover:border-white/20 hover:bg-background/80',
          'focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/20',
          'data-[popup-open]:border-primary/40 data-[popup-open]:bg-background/80',
          className,
        )}
      >
        <Select.Value className="truncate" />
        <Select.Icon className="flex shrink-0 text-muted-foreground">
          <ChevronDown className="size-4 opacity-80" aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner className="z-50 outline-none" sideOffset={6} alignItemWithTrigger={false}>
          <Select.Popup
            className={cn(
              'origin-[var(--transform-origin)] rounded-xl border border-white/10 bg-[#12141f] text-foreground shadow-2xl outline-none',
              'max-h-72 min-w-[12rem] overflow-y-auto overscroll-contain',
              '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20',
              'data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
              'transition-[transform,opacity] duration-150',
            )}
          >
            <Select.List className="flex flex-col gap-0.5 p-1.5">
              {KEY_ITEMS.map((item) => (
                <Select.Item
                  key={item.value}
                  value={item.value}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 font-mono text-sm outline-none select-none',
                    'data-[highlighted]:bg-white/10 data-[highlighted]:text-foreground',
                    'data-[selected]:bg-primary/15 data-[selected]:text-primary',
                  )}
                >
                  <Select.ItemText>{item.label}</Select.ItemText>
                  <Select.ItemIndicator className="text-primary">
                    <Check className="size-3.5" aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
