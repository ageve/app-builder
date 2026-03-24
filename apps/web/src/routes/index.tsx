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
      <section className="flex flex-col gap-4 border-b border-[#f0e0d2] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b6907d]">
            Dashboard
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#241913]">
            Workspace overview
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#7a6257]">
            This dashboard stays intentionally simple: start from the workspace list, then follow recent runs.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/workspace"
            className={buttonVariants({
              variant: "outline",
              className: "border-[#ead6c5] bg-white text-[#5c473b] hover:bg-[#fff3e8]",
            })}
          >
            Open workspace
          </Link>
          <Link
            to="/pipelines"
            className={buttonVariants({
              variant: "default",
              className: "bg-[#f08f54] text-white hover:bg-[#e17d42]",
            })}
          >
            Open pipelines
          </Link>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="border-[#f1dfcf] bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg text-[#241913]">Workspace list</CardTitle>
            <CardDescription>
              The app is currently centered around one active workspace, with room to grow later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {workspaces.map((workspace) => (
              <Link
                key={workspace.workspaceId}
                to="/workspace"
                className="block rounded-md border border-[#f1dfcf] bg-[#fffaf4] px-4 py-4 transition hover:bg-[#fff2e8]"
              >
                <p className="text-sm font-semibold text-[#241913]">{workspace.name}</p>
                <p className="mt-1 text-xs text-[#8a7368]">{workspace.workspaceId}</p>
                <p className="mt-3 text-xs text-[#7a6257]">
                  {workspace.pipelineCount} pipelines in this workspace
                </p>
              </Link>
            ))}
            <div className="rounded-md bg-[#fff7f0] px-4 py-3 text-xs leading-5 text-[#8a7368]">
              Current default workspace: {workspaceDetail.workspace.workspaceId}
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#f1dfcf] bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg text-[#241913]">Recent run history</CardTitle>
            <CardDescription>
              Latest runs across the active workspace, kept in a single table for fast scanning.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RunsTable runs={recentRuns} emptyMessage="No build history yet." />
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
