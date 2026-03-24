import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Play, ScanSearch } from "lucide-react"
import { startTransition, useState } from "react"
import { toast } from "sonner"
import { JsonMonacoEditor } from "~/components/config/json-monaco-editor"
import { RunsTable } from "~/components/dashboard/runs-table"
import { StatusPill } from "~/components/dashboard/status-pill"
import { PipelineSelectBar } from "~/components/navigation/select-bar"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { DEFAULT_WORKSPACE_ID } from "~/lib/app-builder"
import { getJsonErrorMessage, normalizeJson } from "~/lib/json"
import {
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
  const [runtimeDraft, setRuntimeDraft] = useState(
    '{\n  "pipeline": {},\n  "flags": {},\n  "features": {},\n  "build": {},\n  "uploads": {}\n}'
  )
  const [resolvedPreview, setResolvedPreview] = useState("")
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [resolving, setResolving] = useState(false)
  const pipelineJsonError = getJsonErrorMessage(pipelineDraft)
  const runtimeJsonError = getJsonErrorMessage(runtimeDraft)
  const isPipelineDirty = pipelineDraft !== savedPipelineDraft

  const parseRuntimeConfig = () => {
    try {
      return JSON.parse(runtimeDraft) as Record<string, unknown>
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Invalid runtime config JSON")
    }
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
        toast.success("Pipeline config saved")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Save failed")
      } finally {
        setSaving(false)
      }
    })
  }

  const inspectResolved = async () => {
    if (runtimeJsonError) {
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
        toast.success("Resolved config refreshed")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Resolve failed")
      } finally {
        setResolving(false)
      }
    })
  }

  const startBuild = async () => {
    if (runtimeJsonError) {
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
        toast.error(error instanceof Error ? error.message : "Start build failed")
      } finally {
        setRunning(false)
      }
    })
  }

  return (
    <div className="space-y-6">
      <section className="border-b border-[#f0e0d2] pb-5">
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

      <Card className="border-[#f1dfcf] bg-white shadow-none">
        <CardHeader>
          <CardTitle className="text-lg text-[#241913]">Pipeline config</CardTitle>
          <CardDescription>
            Saved pipeline config with optional runtime override for the next run only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-md border border-[#f3e3d5] bg-[#fffaf4] px-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <ConfigRow label="Workspace" value={DEFAULT_WORKSPACE_ID} />
              <ConfigRow label="Platform" value={detail.pipeline.platform} />
              <ConfigRow label="Env" value={detail.pipeline.env} />
              <ConfigRow label="Branch" value={detail.pipeline.branch} />
            </div>
          </div>

          <Tabs defaultValue="pipeline">
            <TabsList className="bg-[#fff3e8]">
              <TabsTrigger value="pipeline">Pipeline config</TabsTrigger>
              <TabsTrigger value="runtime">Runtime config</TabsTrigger>
              <TabsTrigger value="resolved">Resolved preview</TabsTrigger>
            </TabsList>

            <TabsContent value="pipeline" className="mt-4">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <StatusPill status={pipelineJsonError ? "invalid_json" : "valid_json"} />
                  <span className="text-[#7a6257]">
                    {pipelineJsonError
                      ? pipelineJsonError
                      : isPipelineDirty
                        ? "Unsaved pipeline changes"
                        : "Pipeline config is saved"}
                  </span>
                </div>
                <JsonMonacoEditor value={pipelineDraft} onChange={setPipelineDraft} />
                <div className="flex gap-2">
                  <Button
                    onClick={() => void savePipelineConfig()}
                    disabled={saving || Boolean(pipelineJsonError) || !isPipelineDirty}
                  >
                    Save pipeline config
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
            </TabsContent>

            <TabsContent value="runtime" className="mt-4">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <StatusPill status={runtimeJsonError ? "invalid_json" : "runtime_override"} />
                  <span className="text-[#7a6257]">
                    {runtimeJsonError
                      ? runtimeJsonError
                      : "Runtime config only affects the next run and never overwrites saved config."}
                  </span>
                </div>
                <JsonMonacoEditor value={runtimeDraft} onChange={setRuntimeDraft} />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void inspectResolved()}
                    disabled={resolving || Boolean(runtimeJsonError)}
                  >
                    <ScanSearch className="size-4" />
                    Preview merged config
                  </Button>
                  <Button
                    onClick={() => void startBuild()}
                    disabled={running || Boolean(runtimeJsonError)}
                  >
                    <Play className="size-4" />
                    Start build
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="resolved" className="mt-4">
              <JsonMonacoEditor
                value={
                  resolvedPreview ||
                  '{\n  "hint": "Click Preview merged config to generate the resolved view."\n}'
                }
                readOnly
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="border-[#f1dfcf] bg-white shadow-none">
        <CardHeader>
          <CardTitle className="text-lg text-[#241913]">Run history</CardTitle>
          <CardDescription>
            Complete history for this pipeline, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RunsTable runs={detail.runs} emptyMessage="No history for this pipeline yet." />
        </CardContent>
      </Card>
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
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#b6907d]">
        {label}
      </p>
      <p className="break-all text-sm font-medium text-[#241913]">{value}</p>
    </div>
  )
}
