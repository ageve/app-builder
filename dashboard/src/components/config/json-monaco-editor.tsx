"use client"

import { lazy, Suspense, useEffect, useState } from "react"
import { Textarea } from "~/components/ui/textarea"

const MonacoEditor = lazy(() => import("@monaco-editor/react"))

export function JsonMonacoEditor({
  value,
  onChange,
  readOnly = false,
  height = 420,
}: {
  value: string
  onChange?: (nextValue: string) => void
  readOnly?: boolean
  height?: number
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Textarea
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange?.(event.target.value)}
        className="min-h-[420px] rounded-md border-slate-200 bg-slate-50 font-mono text-xs text-slate-900"
      />
    )
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[420px] items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-500">
          Loading editor...
        </div>
      }
    >
      <div className="monaco-scrollbar-shell overflow-hidden rounded-md border border-slate-200">
        <MonacoEditor
          height={height}
          defaultLanguage="json"
          theme="vs-light"
          value={value}
          onChange={(nextValue) => onChange?.(nextValue ?? "")}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            formatOnPaste: true,
            formatOnType: true,
            scrollBeyondLastLine: false,
            scrollbar: {
              alwaysConsumeMouseWheel: false,
              horizontalScrollbarSize: 4,
              verticalScrollbarSize: 4,
            },
            wordWrap: "on",
            lineNumbersMinChars: 3,
            padding: { top: 16, bottom: 16 },
          }}
        />
      </div>
    </Suspense>
  )
}
