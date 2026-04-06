import { Link } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { buttonVariants } from "~/components/ui/button"
import { Button } from "~/components/ui/button"
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
  packageAlias: string
  platform: string
  env: string
  branch: string
  steps: string[]
}

export function PipelinesTable({
  pipelines,
  workspaceId,
  compact = false,
  onDelete,
  deletingPipelineId,
}: {
  pipelines: PipelineRow[]
  workspaceId: string
  compact?: boolean
  onDelete?: (pipeline: PipelineRow) => void
  deletingPipelineId?: string | null
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
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pipelines.map((pipeline) => (
          <TableRow key={pipeline.pipelineId} className="border-slate-100 hover:bg-slate-50">
            <TableCell className="min-w-0">
              <p className="break-all font-medium text-slate-900">{pipeline.packageAlias}</p>
              <p className="mt-1 break-all text-xs text-slate-500">{pipeline.profileId}</p>
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
              <div className="flex justify-end gap-2">
                {onDelete ? (
                  <Button
                    variant="outline"
                    size={compact ? "xs" : "sm"}
                    onClick={() => onDelete(pipeline)}
                    disabled={deletingPipelineId === pipeline.profileId}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                ) : null}
                <Link
                  to="/pipelines/$pipelineId"
                  params={{ pipelineId: pipeline.profileId }}
                  search={{ workspaceId }}
                  className={buttonVariants({
                    variant: "outline",
                    size: compact ? "xs" : "sm",
                  })}
                >
                  View
                </Link>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
