"use client"

import { Check, ChevronsUpDown } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "~/components/ui/button"
import { cn, subtleScrollbarClass } from "~/lib/utils"

type ComboboxOption = {
  value: string
  label: string
  description?: string
}

export function Combobox({
  label,
  value,
  options,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
  emptyMessage = "No options found.",
  onValueChange,
  className,
}: {
  label: string
  value?: string
  options: ComboboxOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  onValueChange: (value: string) => void
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const selected = options.find((option) => option.value === value)

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return options
    }

    return options.filter((option) => {
      const haystack = `${option.label} ${option.description ?? ""}`.toLowerCase()
      return haystack.includes(normalized)
    })
  }, [options, query])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [])

  return (
    <div ref={containerRef} className={cn("relative flex flex-col gap-2", className)}>
      <label className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#94a3b8]">
        {label}
      </label>

      <Button
        variant="outline"
        className="h-10 justify-between rounded-md border-[#e6edf5] bg-white px-3 text-sm font-normal text-[#111827] hover:bg-[#f8fbff]"
        onClick={() => setOpen((current) => !current)}
      >
        <span className={cn("truncate", !selected && "text-[#94a3b8]")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronsUpDown className="size-4 text-[#94a3b8]" />
      </Button>

      {open ? (
        <div className="absolute top-[calc(100%+8px)] z-30 w-max min-w-full max-w-[min(92vw,40rem)] rounded-md border border-[#e6edf5] bg-white p-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full min-w-[18rem] rounded-md border border-[#e6edf5] bg-[#f8fbff] px-3 text-sm text-[#111827] outline-none transition focus:border-[#7db5ff] focus:ring-2 focus:ring-[#d9eaff]"
          />

          <div className={cn("mt-2 max-h-64 overflow-auto", subtleScrollbarClass)}>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const isSelected = option.value === value
                return (
                  <button
                    key={option.value}
                    type="button"
                    className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition hover:bg-[#eff5ff]"
                    onClick={() => {
                      onValueChange(option.value)
                      setOpen(false)
                      setQuery("")
                    }}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 items-center justify-center rounded-sm border border-[#d8e4f2] bg-white",
                        isSelected && "border-[#4f9cf9] bg-[#eef5ff] text-[#4f9cf9]"
                      )}
                    >
                      {isSelected ? <Check className="size-3" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block whitespace-normal break-words text-sm font-medium leading-6 text-[#111827]">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="mt-1 block whitespace-normal break-all text-xs leading-5 text-[#94a3b8]">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                )
              })
            ) : (
              <div className="px-3 py-6 text-sm text-[#94a3b8]">{emptyMessage}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
