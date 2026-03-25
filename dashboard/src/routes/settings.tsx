import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <div className="space-y-6">
      <section className="pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          Settings
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Runtime setup
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          The dashboard runs in Docker. Builds run on the host.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg text-slate-950">Docker</CardTitle>
            <CardDescription>Runs in containers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>Web UI on port 3000.</p>
            <p>Runtime API on port 4001.</p>
            <p>DuckDB and API state.</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg text-slate-950">Host</CardTitle>
            <CardDescription>Runs on the machine.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>`bun run executor` polls the runtime API.</p>
            <p>`git`, Gradle, Android SDK, Xcode, and signing stay local.</p>
            <p>Run history and checkpoints still sync back to the runtime API.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
