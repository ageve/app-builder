import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Play, ScanSearch, SlidersHorizontal } from "lucide-react"
import { startTransition, useState } from "react"
import { toast } from "sonner"
import { JsonMonacoEditor } from "~/components/config/json-monaco-editor"
import { RunsTable } from "~/components/dashboard/runs-table"
import { StatusPill } from "~/components/dashboard/status-pill"
import { PipelineSelectBar } from "~/components/navigation/select-bar"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { DEFAULT_WORKSPACE_ID } from "~/lib/app-builder"
import { getJsonErrorMessage, normalizeJson } from "~/lib/json"
import {
  getRunDetailServerFn,
  getPipelineConfigServerFn,
  getPipelineServerFn,
  getWorkspacePipelinesServerFn,
  inspectConfigServerFn,
  listWorkspacesServerFn,
  savePipelineConfigServerFn,
  startBuildServerFn,
} from "~/server/builds"

type PipelineLoaderData = {
  detail: {
    pipeline: {
      pipelineId: string
      projectId: string
      profileId: string
      displayName: string
      platform: string
      env: string
      branch: string
      steps: string[]
    }
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
  config: {
    pipelineId: string
    content: string
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
  workspaces: Array<{
    workspaceId: string
    name: string
    pipelineCount: number
  }>
}

type RuntimeConfigRunDetail = {
  run: {
    runId: string
  }
  context: {
    request: {
      overrides?: {
        runtimeConfig?: Record<string, unknown>
      }
    }
    resolvedConfig?: Record<string, unknown>
  }
}

const EMPTY_RUNTIME_CONFIG = "{}\n"

function getRuntimeConfigErrorMessage(value: string) {
  const jsonError = getJsonErrorMessage(value)
  if (jsonError) {
    return jsonError
  }

  const parsed = JSON.parse(value)
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    return "Runtime config must be a JSON object"
  }

  return null
}

function formatRuntimeConfig(value?: Record<string, unknown>) {
  return `${JSON.stringify(value ?? {}, null, 2)}\n`
}

export const Route = createFileRoute("/pipelines/$pipelineId")({
  loader: async ({ params }) => {
    const [detail, config, pipelines, workspaces] = await Promise.all([
      getPipelineServerFn({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          pipelineId: params.pipelineId,
        },
      }),
      getPipelineConfigServerFn({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          pipelineId: params.pipelineId,
        },
      }),
      getWorkspacePipelinesServerFn({ data: { workspaceId: DEFAULT_WORKSPACE_ID } }),
      listWorkspacesServerFn(),
    ])

    return {
      detail,
      config,
      pipelines,
      workspaces,
    }
  },
  component: PipelineDetailPage,
})

function PipelineDetailPage() {
  const router = useRouter()
  const { detail, config, pipelines, workspaces } = Route.useLoaderData() as PipelineLoaderData
  const [pipelineDraft, setPipelineDraft] = useState(config.content)
  const [savedPipelineDraft, setSavedPipelineDraft] = useState(config.content)
  const [runtimeDraft, setRuntimeDraft] = useState(EMPTY_RUNTIME_CONFIG)
  const [resolvedPreview, setResolvedPreview] = useState("")
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [showRuntimeSettings, setShowRuntimeSettings] = useState(false)
  const [runtimeSourceLabel, setRuntimeSourceLabel] = useState<string | null>(null)
  const [configuringRunId, setConfiguringRunId] = useState<string | null>(null)
  const pipelineJsonError = getJsonErrorMessage(pipelineDraft)
  const runtimeJsonError = getRuntimeConfigErrorMessage(runtimeDraft)
  const isPipelineDirty = pipelineDraft !== savedPipelineDraft

  const parseRuntimeConfig = () => {
    try {
      const parsed = JSON.parse(runtimeDraft)
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error("Runtime config must be a JSON object")
      }
      return Object.keys(parsed).length > 0
        ? (parsed as Record<string, unknown>)
        : undefined
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Invalid runtime config JSON")
    }
  }

  const updateRuntimeDraft = (nextValue: string) => {
    setRuntimeDraft(nextValue)
    setResolvedPreview("")
  }

  const resetRuntimeDraft = () => {
    setRuntimeDraft(EMPTY_RUNTIME_CONFIG)
    setResolvedPreview("")
    setRuntimeSourceLabel(null)
  }

  const openRuntimeSettings = () => {
    setShowRuntimeSettings(true)
  }

  const toggleRuntimeSettings = () => {
    setShowRuntimeSettings((current) => !current)
  }

  const savePipelineConfig = async () => {
    if (pipelineJsonError) {
      toast.error(pipelineJsonError)
      return
    }
    setSaving(true)
    startTransition(async () => {
      try {
        const normalized = normalizeJson(pipelineDraft)
        await savePipelineConfigServerFn({
          data: {
            workspaceId: DEFAULT_WORKSPACE_ID,
            pipelineId: detail.pipeline.profileId,
            content: normalized,
          },
        })
        setPipelineDraft(normalized)
        setSavedPipelineDraft(normalized)
        toast.success("Saved")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Save failed")
      } finally {
        setSaving(false)
      }
    })
  }

  const inspectResolved = async () => {
    if (runtimeJsonError) {
      openRuntimeSettings()
      toast.error(runtimeJsonError)
      return
    }
    setResolving(true)
    startTransition(async () => {
      try {
        const runtimeConfig = parseRuntimeConfig()
        const resolved = await inspectConfigServerFn({
          data: {
            projectId: detail.pipeline.projectId,
            profileId: detail.pipeline.profileId,
            runtimeConfig,
          },
        })
        setResolvedPreview(JSON.stringify(resolved, null, 2))
        toast.success("Preview updated")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Resolve failed")
      } finally {
        setResolving(false)
      }
    })
  }

  const startBuild = async () => {
    if (runtimeJsonError) {
      openRuntimeSettings()
      toast.error(runtimeJsonError)
      return
    }
    setRunning(true)
    startTransition(async () => {
      try {
        const runtimeConfig = parseRuntimeConfig()
        const result = (await startBuildServerFn({
          data: {
            projectId: detail.pipeline.projectId,
            profileId: detail.pipeline.profileId,
            runtimeConfig,
          },
        })) as { run: { runId: string } }
        toast.success(`Run ${result.run.runId} queued`)
        await router.invalidate()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Start failed")
      } finally {
        setRunning(false)
      }
    })
  }

  const loadRuntimeConfigFromRun = async (runId: string) => {
    setConfiguringRunId(runId)
    try {
      const runDetail = (await getRunDetailServerFn({
        data: { runId },
      })) as RuntimeConfigRunDetail | null

      if (!runDetail) {
        throw new Error("Run not found")
      }

      setRuntimeDraft(formatRuntimeConfig(runDetail.context.request.overrides?.runtimeConfig))
      setResolvedPreview(
        runDetail.context.resolvedConfig
          ? `${JSON.stringify(runDetail.context.resolvedConfig, null, 2)}\n`
          : ""
      )
      setRuntimeSourceLabel(`From ${runDetail.run.runId}`)
      setShowRuntimeSettings(true)
      toast.success("Loaded")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load runtime config")
    } finally {
      setConfiguringRunId(null)
    }
  }

  return (
    <div className="space-y-6">
      <section className="pb-5">
        <PipelineSelectBar
          workspaces={workspaces.map((workspace) => ({
            workspaceId: workspace.workspaceId,
            name: workspace.name,
          }))}
          pipelines={pipelines.map((pipeline) => ({
            profileId: pipeline.profileId,
            displayName: pipeline.displayName,
          }))}
          currentWorkspaceId={DEFAULT_WORKSPACE_ID}
          currentPipelineId={detail.pipeline.profileId}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,1fr)] xl:items-start">
        <Card className="border-[#e6edf5] bg-white shadow-none">
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-lg text-[#111827]">Runs</CardTitle>
                <CardDescription>
                  Start builds here. Open settings only when needed.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={toggleRuntimeSettings}>
                  <SlidersHorizontal className="size-4" />
                  {showRuntimeSettings ? "Hide" : "Settings"}
                </Button>
                <Button onClick={() => void startBuild()} disabled={running}>
                  <Play className="size-4" />
                  Start
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-md bg-[#f4f8ff] px-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <ConfigRow label="Workspace" value={DEFAULT_WORKSPACE_ID} />
                <ConfigRow label="Platform" value={detail.pipeline.platform} />
                <ConfigRow label="Env" value={detail.pipeline.env} />
                <ConfigRow label="Branch" value={detail.pipeline.branch} />
              </div>
            </div>

            {showRuntimeSettings ? (
              <div className="space-y-4 rounded-md bg-[#f8fbff] px-4 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <StatusPill status={runtimeJsonError ? "invalid_json" : "runtime_override"} />
                      <span className="text-[#64748b]">
                        {runtimeJsonError
                          ? runtimeJsonError
                          : "Optional. Only used for the next run."}
                      </span>
                    </div>
                    {runtimeSourceLabel ? (
                      <p className="text-xs text-[#94a3b8]">{runtimeSourceLabel}</p>
                    ) : (
                      <p className="text-xs text-[#94a3b8]">
                        Leave empty unless needed.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={resetRuntimeDraft}>
                      Clear
                    </Button>
                    <Button variant="outline" onClick={() => void inspectResolved()} disabled={resolving}>
                      <ScanSearch className="size-4" />
                      Preview
                    </Button>
                  </div>
                </div>

                <JsonMonacoEditor value={runtimeDraft} onChange={updateRuntimeDraft} height={280} />

                {resolvedPreview ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-[#111827]">Preview</p>
                      <p className="mt-1 text-xs text-[#94a3b8]">
                        Preview for the current draft.
                      </p>
                    </div>
                    <JsonMonacoEditor value={resolvedPreview} readOnly height={240} />
                  </div>
                ) : null}
              </div>
            ) : null}

            <RunsTable
              runs={detail.runs}
              emptyMessage="No runs yet."
              onConfigureRun={(run) => void loadRuntimeConfigFromRun(run.runId)}
              configuringRunId={configuringRunId}
            />
          </CardContent>
        </Card>

        <Card className="border-[#e6edf5] bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg text-[#111827]">Config</CardTitle>
            <CardDescription>Saved JSON.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <StatusPill status={pipelineJsonError ? "invalid_json" : "valid_json"} />
                <span className="text-[#64748b]">
                  {pipelineJsonError
                    ? pipelineJsonError
                    : isPipelineDirty
                      ? "Unsaved changes"
                      : "Saved"}
                </span>
              </div>
              <JsonMonacoEditor value={pipelineDraft} onChange={setPipelineDraft} />
              <div className="flex gap-2">
                <Button
                  onClick={() => void savePipelineConfig()}
                  disabled={saving || Boolean(pipelineJsonError) || !isPipelineDirty}
                >
                  Save
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPipelineDraft(savedPipelineDraft)}
                  disabled={saving || !isPipelineDirty}
                >
                  Reset
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function ConfigRow({
  label,
  value,
}: {
  label: string
  value: number | string
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">
        {label}
      </p>
      <p className="break-all text-sm font-medium text-[#111827]">{value}</p>
    </div>
  )
}
