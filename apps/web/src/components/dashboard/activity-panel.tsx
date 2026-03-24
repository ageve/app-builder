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
      <Card className="rounded-[2rem] border-white/70 bg-white/80 shadow-sm shadow-slate-200/70">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900">
            Active focus
          </CardTitle>
          <CardDescription>当前最值得盯住的一条流水。</CardDescription>
        </CardHeader>
        <CardContent>
          {activeRun ? (
            <div className="space-y-4 rounded-[1.5rem] bg-slate-50 p-4">
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
                  Current step
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
                  View detail
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
              当前没有正在执行的流水。
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[2rem] border-white/70 bg-white/80 shadow-sm shadow-slate-200/70">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900">
            Recent failures
          </CardTitle>
          <CardDescription>方便快速重试和恢复的失败列表。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentFailures.length > 0 ? (
            recentFailures.slice(0, 4).map((run) => (
              <Link
                key={run.runId}
                to="/runs/$runId"
                params={{ runId: run.runId }}
                className="block rounded-[1.5rem] border border-slate-100 bg-slate-50 px-4 py-3 transition hover:bg-slate-100"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{run.profileId}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {run.errorMessage ?? "Needs attention"}
                    </p>
                  </div>
                  <StatusPill status={run.status} />
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
              最近没有失败流水。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
