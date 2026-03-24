import { createFileRoute, Link } from "@tanstack/react-router"
import { RunsTable } from "~/components/dashboard/runs-table"
import { buttonVariants } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { DEFAULT_WORKSPACE_ID } from "~/lib/app-builder"
import { getDashboardServerFn, getWorkspaceServerFn, listWorkspacesServerFn } from "~/server/builds"

type DashboardLoaderData = {
  dashboard: {
    runs: Array<{
      runId: string
      profileId: string
      status: string
      currentStepId?: string
      triggerSource: string
      startedAt?: string
      endedAt?: string
      errorMessage?: string
    }>
  }
  workspaces: Array<{
    workspaceId: string
    name: string
    pipelineCount: number
  }>
  workspaceDetail: {
    workspace: {
      workspaceId: string
      name: string
      gitUri: string
    }
  }
}

export const Route = createFileRoute("/")({
  loader: async () => {
    const [dashboard, workspaces, workspaceDetail] = await Promise.all([
      getDashboardServerFn(),
      listWorkspacesServerFn(),
      getWorkspaceServerFn({ data: { workspaceId: DEFAULT_WORKSPACE_ID } }),
    ])

    return {
      dashboard,
      workspaces,
      workspaceDetail,
    }
  },
  component: DashboardPage,
})

function DashboardPage() {
  const { dashboard, workspaces, workspaceDetail } = Route.useLoaderData() as DashboardLoaderData
  const recentRuns = dashboard.runs.slice(0, 10)

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#94a3b8]">
            Dashboard
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#111827]">
            Overview
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64748b]">
            Start from the workspace, then check recent runs.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/workspace"
            className={buttonVariants({
              variant: "outline",
              className: "border-[#dbe6f2] bg-white text-[#415168] hover:bg-[#eff5ff]",
            })}
          >
            Workspace
          </Link>
          <Link
            to="/pipelines"
            className={buttonVariants({
              variant: "default",
              className: "bg-[#4f9cf9] text-white hover:bg-[#438fe8]",
            })}
          >
            Pipelines
          </Link>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="border-[#e6edf5] bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg text-[#111827]">Workspaces</CardTitle>
            <CardDescription>Available workspaces.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {workspaces.map((workspace) => (
              <Link
                key={workspace.workspaceId}
                to="/workspace"
                className="block rounded-md bg-[#f4f8ff] px-4 py-4 transition hover:bg-[#eaf3ff]"
              >
                <p className="text-sm font-semibold text-[#111827]">{workspace.name}</p>
                <p className="mt-1 text-xs text-[#94a3b8]">{workspace.workspaceId}</p>
                <p className="mt-3 text-xs text-[#64748b]">
                  {workspace.pipelineCount} pipelines
                </p>
              </Link>
            ))}
            <div className="rounded-md bg-[#f6f9fd] px-4 py-3 text-xs leading-5 text-[#64748b]">
              Default: {workspaceDetail.workspace.workspaceId}
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#e6edf5] bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg text-[#111827]">Recent runs</CardTitle>
            <CardDescription>Latest runs in the active workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <RunsTable runs={recentRuns} emptyMessage="No runs yet." />
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
