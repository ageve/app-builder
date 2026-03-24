import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <div className="space-y-6">
      <section className="border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          Settings
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Runtime boundaries
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Keep the dashboard and runtime state server inside Docker, and keep the actual app-builder execution on the host machine.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg text-slate-950">Docker services</CardTitle>
            <CardDescription>What stays in containers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>Web dashboard on port 3000.</p>
            <p>Runtime state and data server on port 4001.</p>
            <p>DuckDB persistence and API orchestration.</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg text-slate-950">Host executor</CardTitle>
            <CardDescription>What stays native.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>`bun run executor` polls the runtime API.</p>
            <p>`git`, Gradle, Android SDK, Xcode, and signing stay on the host machine.</p>
            <p>Run history and checkpoint state are still written back to the runtime server.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
