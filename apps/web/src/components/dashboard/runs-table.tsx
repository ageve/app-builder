import { Link } from "@tanstack/react-router"
import { SlidersHorizontal } from "lucide-react"
import { Button, buttonVariants } from "~/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { formatDate } from "~/lib/dashboard"
import { StatusPill } from "./status-pill"

type RunRow = {
  runId: string
  profileId: string
  status: string
  currentStepId?: string
  triggerSource: string
  startedAt?: string
  endedAt?: string
  errorMessage?: string
}

export function RunsTable({
  runs,
  emptyMessage = "No runs yet.",
  onConfigureRun,
  configuringRunId,
}: {
  runs: RunRow[]
  emptyMessage?: string
  onConfigureRun?: (run: RunRow) => void
  configuringRunId?: string | null
}) {
  if (runs.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
        {emptyMessage}
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-slate-200">
          <TableHead>Run</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Step</TableHead>
          <TableHead>Started</TableHead>
          <TableHead>Trigger</TableHead>
          <TableHead>Error</TableHead>
          {onConfigureRun ? <TableHead className="text-right">Settings</TableHead> : null}
          <TableHead className="text-right">Open</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.runId} className="border-slate-100 hover:bg-slate-50">
            <TableCell>
              <div>
                <p className="font-medium text-slate-900">{run.profileId}</p>
                <p className="text-xs text-slate-500">{run.runId}</p>
              </div>
            </TableCell>
            <TableCell>
              <StatusPill status={run.status} />
            </TableCell>
            <TableCell className="text-slate-600">
              {run.currentStepId ?? "waiting_for_executor"}
            </TableCell>
            <TableCell className="text-slate-600">{formatDate(run.startedAt)}</TableCell>
            <TableCell className="text-slate-600">{run.triggerSource}</TableCell>
            <TableCell className="max-w-[260px] truncate text-slate-500">
              {run.errorMessage ?? "—"}
            </TableCell>
            {onConfigureRun ? (
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onConfigureRun(run)}
                  disabled={configuringRunId === run.runId}
                >
                  <SlidersHorizontal className="size-4" />
                  {configuringRunId === run.runId ? "Loading" : "Use"}
                </Button>
              </TableCell>
            ) : null}
            <TableCell className="text-right">
              <Link
                to="/runs/$runId"
                params={{ runId: run.runId }}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Open
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
