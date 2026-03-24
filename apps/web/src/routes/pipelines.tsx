import { Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { DEFAULT_WORKSPACE_ID } from "~/lib/app-builder"
import { getWorkspacePipelinesServerFn } from "~/server/builds"

export const Route = createFileRoute("/pipelines")({
  loader: async () => {
    const pipelines = await getWorkspacePipelinesServerFn({
      data: { workspaceId: DEFAULT_WORKSPACE_ID },
    })

    return { pipelines }
  },
  component: PipelinesLayout,
})

function PipelinesLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { pipelines } = Route.useLoaderData()

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
      replace: true,
    })
  }, [location.pathname, navigate, pipelines])

  return <Outlet />
}
