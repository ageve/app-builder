import { Link } from "@tanstack/react-router"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { formatDate } from "~/lib/dashboard"
import { StatusPill } from "./status-pill"

type RunSummary = {
  runId: string
  profileId: string
  status: string
  currentStepId?: string
  errorMessage?: string
  startedAt?: string
}

export function ActivityPanel({
  activeRun,
  recentFailures,
}: {
  activeRun?: RunSummary
  recentFailures: RunSummary[]
}) {
  return (
    <div className="space-y-5">
      <Card className="rounded-md border-white/70 bg-white/80 shadow-sm shadow-slate-200/70">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900">
            Active
          </CardTitle>
          <CardDescription>Run to watch.</CardDescription>
        </CardHeader>
        <CardContent>
          {activeRun ? (
            <div className="space-y-4 rounded-md bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {activeRun.profileId}
                  </p>
                  <p className="text-xs text-slate-500">{activeRun.runId}</p>
                </div>
                <StatusPill status={activeRun.status} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  Step
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  {activeRun.currentStepId ?? "waiting_for_worker"}
                </p>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{formatDate(activeRun.startedAt)}</span>
                <Link
                  to="/runs/$runId"
                  params={{ runId: activeRun.runId }}
                  className="font-medium text-slate-900 underline-offset-4 hover:underline"
                >
                  Open
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-md bg-slate-50 p-8 text-center text-sm text-slate-400">
              No active run.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-md border-white/70 bg-white/80 shadow-sm shadow-slate-200/70">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900">
            Recent failures
          </CardTitle>
          <CardDescription>Recent failed runs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentFailures.length > 0 ? (
            recentFailures.slice(0, 4).map((run) => (
              <Link
                key={run.runId}
                to="/runs/$runId"
                params={{ runId: run.runId }}
                className="block rounded-md bg-slate-50 px-4 py-3 transition hover:bg-slate-100"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{run.profileId}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {run.errorMessage ?? "Needs review"}
                    </p>
                  </div>
                  <StatusPill status={run.status} />
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-md bg-slate-50 p-8 text-center text-sm text-slate-400">
              No recent failures.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
