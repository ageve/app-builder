import { createFileRoute } from "@tanstack/react-router"
import { startTransition, useState } from "react"
import { toast } from "sonner"
import { JsonMonacoEditor } from "~/components/config/json-monaco-editor"
import { PipelinesTable } from "~/components/dashboard/pipelines-table"
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
  const sortedPipelines = [...detail.pipelines].sort((left, right) => {
    return [
      left.displayName.localeCompare(right.displayName),
      left.platform.localeCompare(right.platform),
      left.env.localeCompare(right.env),
      left.branch.localeCompare(right.branch),
      left.profileId.localeCompare(right.profileId),
    ].find((value) => value !== 0) ?? 0
  })
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
        toast.success("Saved")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Save failed")
      } finally {
        setSaving(false)
      }
    })
  }

  return (
    <div className="space-y-6">
      <section className="pb-5">
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
          <Card className="border-[#e6edf5] bg-white shadow-none">
            <CardHeader>
              <CardTitle className="text-lg text-[#111827]">Pipelines</CardTitle>
              <CardDescription>
                One row per pipeline, with clear Platform, Env, Branch, and Steps metadata.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PipelinesTable pipelines={sortedPipelines} compact />
            </CardContent>
          </Card>
        </div>

        <Card className="border-[#e6edf5] bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg text-[#111827]">Config</CardTitle>
            <CardDescription>Base JSON.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusPill status={jsonError ? "invalid_json" : "valid_json"} />
              <span className="text-[#64748b]">
                {jsonError
                  ? jsonError
                  : isDirty
                    ? "Unsaved changes"
                    : "Saved"}
              </span>
            </div>
            <JsonMonacoEditor value={draft} onChange={setDraft} />
            <div className="flex gap-2">
              <Button
                onClick={() => void saveConfig()}
                disabled={saving || Boolean(jsonError) || !isDirty}
              >
                Save
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
