"use client"

import { cn, subtleScrollbarClass } from "~/lib/utils"

export function JsonCodeView({
  value,
  height = 280,
  className,
}: {
  value: string
  height?: number
  className?: string
}) {
  return (
    <pre
      className={cn(
        "overflow-auto rounded-md border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-900",
        subtleScrollbarClass,
        className
      )}
      style={{ minHeight: `${height}px`, maxHeight: `${height}px` }}
    >
      {value}
    </pre>
  )
}
