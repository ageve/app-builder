import { createFileRoute, Link } from "@tanstack/react-router"
import { startTransition, useState } from "react"
import { toast } from "sonner"
import { JsonMonacoEditor } from "~/components/config/json-monaco-editor"
import { StatusPill } from "~/components/dashboard/status-pill"
import { WorkspaceSelectBar } from "~/components/navigation/select-bar"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { DEFAULT_WORKSPACE_ID } from "~/lib/app-builder"
import { getJsonErrorMessage, normalizeJson } from "~/lib/json"
import {
  getWorkspaceConfigServerFn,
  getWorkspaceServerFn,
  listWorkspacesServerFn,
  saveWorkspaceConfigServerFn,
} from "~/server/builds"

type WorkspaceLoaderData = {
  detail: {
    workspace: {
      workspaceId: string
      name: string
      gitUri: string
    }
    pipelines: Array<{
      pipelineId: string
      projectId: string
      profileId: string
      displayName: string
      platform: string
      env: string
      branch: string
      steps: string[]
    }>
  }
  config: {
    workspaceId: string
    name: string
    content: string
  }
  workspaces: Array<{
    workspaceId: string
    name: string
    pipelineCount: number
  }>
}

export const Route = createFileRoute("/workspace")({
  loader: async () => {
    const [detail, config, workspaces] = await Promise.all([
      getWorkspaceServerFn({ data: { workspaceId: DEFAULT_WORKSPACE_ID } }),
      getWorkspaceConfigServerFn({ data: { workspaceId: DEFAULT_WORKSPACE_ID } }),
      listWorkspacesServerFn(),
    ])

    return {
      detail,
      config,
      workspaces,
    }
  },
  component: WorkspacePage,
})

function WorkspacePage() {
  const { detail, config, workspaces } = Route.useLoaderData() as WorkspaceLoaderData
  const [draft, setDraft] = useState(config.content)
  const [savedDraft, setSavedDraft] = useState(config.content)
  const [saving, setSaving] = useState(false)
  const jsonError = getJsonErrorMessage(draft)
  const isDirty = draft !== savedDraft

  const saveConfig = async () => {
    if (jsonError) {
      toast.error(jsonError)
      return
    }

    setSaving(true)
    startTransition(async () => {
      try {
        const normalized = normalizeJson(draft)
        await saveWorkspaceConfigServerFn({
          data: {
            workspaceId: detail.workspace.workspaceId,
            content: normalized,
          },
        })
        setDraft(normalized)
        setSavedDraft(normalized)
        toast.success("Workspace config saved")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Save failed")
      } finally {
        setSaving(false)
      }
    })
  }

  return (
    <div className="space-y-6">
      <section className="border-b border-[#f0e0d2] pb-5">
        <WorkspaceSelectBar
          workspaces={workspaces.map((workspace) => ({
            workspaceId: workspace.workspaceId,
            name: workspace.name,
          }))}
          currentWorkspaceId={detail.workspace.workspaceId}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
        <div className="space-y-6">
          <Card className="border-[#f1dfcf] bg-white shadow-none">
            <CardHeader>
              <CardTitle className="text-lg text-[#241913]">Workspace pipelines</CardTitle>
              <CardDescription>
                Every pipeline that belongs to this workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {detail.pipelines.map((pipeline) => (
                <Link
                  key={pipeline.pipelineId}
                  to="/pipelines/$pipelineId"
                  params={{ pipelineId: pipeline.profileId }}
                  className="rounded-md border border-[#f3e3d5] bg-[#fffaf4] px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#241913]">
                        {pipeline.displayName}
                      </p>
                      <p className="mt-1 text-xs text-[#8a7368] break-all">
                        {pipeline.profileId}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs font-medium uppercase tracking-[0.18em] text-[#c07b58]">
                      Open
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <StatusPill status={pipeline.platform} />
                    <StatusPill status={pipeline.env} />
                    <span className="rounded-md bg-white px-2.5 py-1 text-xs text-[#7a6257] ring-1 ring-[#efdac8]">
                      {pipeline.branch}
                    </span>
                    <span className="rounded-md bg-white px-2.5 py-1 text-xs text-[#7a6257] ring-1 ring-[#efdac8]">
                      {pipeline.steps.length} steps
                    </span>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="border-[#f1dfcf] bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg text-[#241913]">Workspace config</CardTitle>
            <CardDescription>
              Shared JSON config applied before any pipeline-level or runtime overrides.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusPill status={jsonError ? "invalid_json" : "valid_json"} />
              <span className="text-[#7a6257]">
                {jsonError
                  ? jsonError
                  : isDirty
                    ? "Unsaved workspace changes"
                    : "Workspace config is saved"}
              </span>
            </div>
            <JsonMonacoEditor value={draft} onChange={setDraft} />
            <div className="flex gap-2">
              <Button
                onClick={() => void saveConfig()}
                disabled={saving || Boolean(jsonError) || !isDirty}
              >
                Save workspace config
              </Button>
              <Button
                variant="outline"
                onClick={() => setDraft(savedDraft)}
                disabled={saving || !isDirty}
              >
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
