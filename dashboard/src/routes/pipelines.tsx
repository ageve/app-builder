import { Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { z } from "zod"
import { DEFAULT_WORKSPACE_ID } from "~/lib/app-builder"
import { getWorkspacePipelinesServerFn, listWorkspacesServerFn } from "~/server/builds"

const searchSchema = z.object({
  workspaceId: z.string().optional(),
})

type WorkspaceSummary = {
  workspaceId: string
}

export const Route = createFileRoute("/pipelines")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    workspaceId: search.workspaceId,
  }),
  loader: async ({ deps }) => {
    const workspaces = await listWorkspacesServerFn()
    const activeWorkspaceId =
      deps.workspaceId &&
      workspaces.some((workspace: WorkspaceSummary) => workspace.workspaceId === deps.workspaceId)
        ? deps.workspaceId
        : workspaces.find((workspace: WorkspaceSummary) => workspace.workspaceId === DEFAULT_WORKSPACE_ID)
            ?.workspaceId ?? workspaces[0]?.workspaceId ?? DEFAULT_WORKSPACE_ID
    const pipelines = await getWorkspacePipelinesServerFn({
      data: { workspaceId: activeWorkspaceId },
    })

    return { pipelines, workspaceId: activeWorkspaceId }
  },
  component: PipelinesLayout,
})

function PipelinesLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { pipelines, workspaceId } = Route.useLoaderData()

  useEffect(() => {
    if (location.pathname !== "/pipelines") {
      return
    }

    const firstPipelineId = pipelines[0]?.profileId
    if (!firstPipelineId) {
      return
    }

    void navigate({
      to: "/pipelines/$pipelineId",
      params: { pipelineId: firstPipelineId },
      search: { workspaceId },
      replace: true,
    })
  }, [location.pathname, navigate, pipelines, workspaceId])

  return <Outlet />
}
