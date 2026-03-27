import { Link } from "@tanstack/react-router"
import { buttonVariants } from "~/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { StatusPill } from "./status-pill"

type PipelineRow = {
  pipelineId: string
  projectId: string
  profileId: string
  displayName: string
  platform: string
  env: string
  branch: string
  steps: string[]
}

export function PipelinesTable({
  pipelines,
  compact = false,
}: {
  pipelines: PipelineRow[]
  compact?: boolean
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-slate-200">
          <TableHead>Pipeline</TableHead>
          <TableHead>Platform</TableHead>
          <TableHead>Env</TableHead>
          <TableHead>Branch</TableHead>
          <TableHead>Steps</TableHead>
          <TableHead className="text-right">Open</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pipelines.map((pipeline) => (
          <TableRow key={pipeline.pipelineId} className="border-slate-100 hover:bg-slate-50">
            <TableCell>
              <p className="font-medium text-slate-900">{pipeline.profileId}</p>
            </TableCell>
            <TableCell>
              <StatusPill status={pipeline.platform} />
            </TableCell>
            <TableCell>
              <StatusPill status={pipeline.env} />
            </TableCell>
            <TableCell className="text-slate-600">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                {pipeline.branch}
              </span>
            </TableCell>
            <TableCell className="text-slate-600">{pipeline.steps.length} steps</TableCell>
            <TableCell className="text-right">
              <Link
                to="/pipelines/$pipelineId"
                params={{ pipelineId: pipeline.profileId }}
                className={buttonVariants({
                  variant: "outline",
                  size: compact ? "xs" : "sm",
                })}
              >
                View
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
