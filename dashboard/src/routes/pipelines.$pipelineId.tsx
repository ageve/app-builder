import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { Play, SlidersHorizontal } from "lucide-react"
import { startTransition, useEffect, useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { JsonCodeView } from "~/components/config/json-code-view"
import { RunsTable } from "~/components/dashboard/runs-table"
import { StatusPill } from "~/components/dashboard/status-pill"
import { PipelineSelectBar } from "~/components/navigation/select-bar"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { DEFAULT_WORKSPACE_ID } from "~/lib/app-builder"
import { subtleScrollbarClass } from "~/lib/utils"
import {
  getPipelineConfigServerFn,
  getPipelineServerFn,
  getWorkspacePipelinesServerFn,
  inspectConfigServerFn,
  listWorkspacesServerFn,
  startBuildServerFn,
} from "~/server/builds"

type BuildArgsDraft = {
  autoVersionCode: boolean
  legacyVersioning: boolean
}

type RunFilter = "success" | "failed" | "running" | "all"

type PipelineLoaderData = {
  detail: {
    pipeline: {
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
  inspected: {
    files: {
      envFile: string
      envPropertiesFile?: string
      envConfigFile?: string
      exportOptionsAdHoc?: string
      exportOptionsAppStore?: string
      agconnectFile?: string
    }
    flags: {
      autoVersionCode: boolean
      legacyVersioning: boolean
      cleanWorkspace: boolean
    }
  }
  pipelines: Array<{
    pipelineId: string
    projectId: string
    profileId: string
    displayName: string
    packageAlias: string
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

const EMPTY_ARGS_DRAFT: BuildArgsDraft = {
  autoVersionCode: false,
  legacyVersioning: false,
}

const RUN_FILTER_OPTIONS: Array<{ value: RunFilter; label: string }> = [
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "running", label: "Running" },
  { value: "all", label: "All" },
]

const searchSchema = z.object({
  workspaceId: z.string().optional(),
})

type WorkspaceSummary = {
  workspaceId: string
}

function draftFromArgs(value?: Record<string, unknown>): BuildArgsDraft {
  return {
    autoVersionCode: value?.autoVersionCode === true,
    legacyVersioning: value?.legacyVersioning === true,
  }
}

function argsPayloadFromDraft(draft: BuildArgsDraft) {
  const args: Record<string, boolean> = {}
  if (draft.autoVersionCode) {
    args.autoVersionCode = true
  }
  if (draft.legacyVersioning) {
    args.legacyVersioning = true
  }
  return args
}

function formatConfigLabel(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toUpperCase()
}

export const Route = createFileRoute("/pipelines/$pipelineId")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    workspaceId: search.workspaceId,
  }),
  loader: async ({ params, deps }) => {
    const workspaces = await listWorkspacesServerFn()
    const activeWorkspaceId =
      deps.workspaceId &&
      workspaces.some((workspace: WorkspaceSummary) => workspace.workspaceId === deps.workspaceId)
        ? deps.workspaceId
        : workspaces.find((workspace: WorkspaceSummary) => workspace.workspaceId === DEFAULT_WORKSPACE_ID)
            ?.workspaceId ?? workspaces[0]?.workspaceId ?? DEFAULT_WORKSPACE_ID

    const [detail, config, pipelines] = await Promise.all([
      getPipelineServerFn({
        data: {
          workspaceId: activeWorkspaceId,
          pipelineId: params.pipelineId,
        },
      }),
      getPipelineConfigServerFn({
        data: {
          workspaceId: activeWorkspaceId,
          pipelineId: params.pipelineId,
        },
      }),
      getWorkspacePipelinesServerFn({ data: { workspaceId: activeWorkspaceId } }),
    ])

    const inspected = await inspectConfigServerFn({
      data: {
        projectId: detail.pipeline.projectId,
        profileId: detail.pipeline.profileId,
        args: {},
      },
    })

    return {
      detail,
      config,
      inspected,
      pipelines,
      workspaces,
    }
  },
  component: PipelineDetailPage,
})

function PipelineDetailPage() {
  const navigate = useNavigate({ from: "/pipelines/$pipelineId" })
  const router = useRouter()
  const { detail, config, inspected, pipelines, workspaces } =
    Route.useLoaderData() as PipelineLoaderData
  const [liveRuns, setLiveRuns] = useState(detail.runs)
  const [argsDraft, setArgsDraft] = useState<BuildArgsDraft>(EMPTY_ARGS_DRAFT)
  const [running, setRunning] = useState(false)
  const [showArgs, setShowArgs] = useState(false)
  const [runFilter, setRunFilter] = useState<RunFilter>("success")
  const filteredRuns =
    runFilter === "all"
      ? liveRuns
      : liveRuns.filter((run) => {
          if (runFilter === "running") {
            return run.status === "running"
          }
          return run.status === runFilter
        })

  useEffect(() => {
    setLiveRuns(detail.runs)
  }, [detail.runs])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void getPipelineServerFn({
        data: {
          workspaceId: detail.pipeline.projectId,
          pipelineId: detail.pipeline.profileId,
        },
      })
        .then((nextDetail) => {
          setLiveRuns(nextDetail.runs)
        })
        .catch(() => {
          // ignore polling errors; next cycle will retry
        })
    }, 5000)

    return () => window.clearInterval(timer)
  }, [detail.pipeline.profileId, detail.pipeline.projectId])

  const startBuild = async () => {
    setRunning(true)
    startTransition(async () => {
      try {
        const result = (await startBuildServerFn({
          data: {
            projectId: detail.pipeline.projectId,
            profileId: detail.pipeline.profileId,
            args: argsPayloadFromDraft(argsDraft),
          },
        })) as { run: { runId: string; status: string } }
        if (result.run.status === "failed") {
          toast.error(`Run ${result.run.runId} failed immediately`)
        } else {
          toast.success(`Run ${result.run.runId} started`)
        }
        await router.invalidate()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Start failed")
      } finally {
        setRunning(false)
      }
    })
  }

  const resetArgsDraft = () => {
    setArgsDraft(EMPTY_ARGS_DRAFT)
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
          currentWorkspaceId={detail.pipeline.projectId}
          currentPipelineId={detail.pipeline.profileId}
          onWorkspaceChange={(workspaceId) => {
            void navigate({
              to: "/pipelines",
              search: { workspaceId },
            })
          }}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(380px,1fr)] xl:items-start">
        <Card className="border-[#e6edf5] bg-white shadow-none">
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-lg text-[#111827]">Runs</CardTitle>
              </div>
              <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                <select
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  value={runFilter}
                  onChange={(event) => setRunFilter(event.target.value as RunFilter)}
                >
                  {RUN_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Button variant="outline" onClick={() => setShowArgs((current) => !current)}>
                  <SlidersHorizontal className="size-4" />
                  {showArgs ? "Hide Args" : "Settings"}
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
                <ConfigRow label="Package" value={detail.pipeline.packageAlias} />
                <ConfigRow label="Platform" value={detail.pipeline.platform} />
                <ConfigRow label="Env" value={detail.pipeline.env} />
                <ConfigRow label="Branch" value={detail.pipeline.branch} />
              </div>
            </div>

            <div className={`max-h-[420px] overflow-y-auto pr-1 ${subtleScrollbarClass}`}>
              <RunsTable
                runs={filteredRuns}
                emptyMessage={
                  runFilter === "all" ? "No runs yet." : `No ${runFilter} runs yet.`
                }
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-[#e6edf5] bg-white shadow-none">
            <CardHeader>
              <CardTitle className="text-lg text-[#111827]">Build Config</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {showArgs ? (
                <ArgsSection
                  draft={argsDraft}
                  onChange={setArgsDraft}
                  onReset={resetArgsDraft}
                  pipelineEnv={detail.pipeline.env}
                />
              ) : null}

              <div className="space-y-3">
                <SectionHeading title="Pipeline Config" />
                <JsonCodeView
                  value={config.content}
                  height={220}
                  className="border-slate-200 bg-slate-50/80"
                />
              </div>

              <div className="space-y-3 border-t border-slate-200 pt-5">
                <SectionHeading title="Derived File Paths" />
                <div className="space-y-3">
                  <ConfigPathRow label="envFile" value={inspected.files.envFile} />
                  <ConfigPathRow
                    label="envPropertiesFile"
                    value={inspected.files.envPropertiesFile}
                  />
                  <ConfigPathRow label="envConfigFile" value={inspected.files.envConfigFile} />
                  <ConfigPathRow
                    label="exportOptionsAdHoc"
                    value={inspected.files.exportOptionsAdHoc}
                  />
                  <ConfigPathRow
                    label="exportOptionsAppStore"
                    value={inspected.files.exportOptionsAppStore}
                  />
                  <ConfigPathRow label="agconnectFile" value={inspected.files.agconnectFile} />
                </div>
              </div>

              <div className="space-y-3 border-t border-slate-200 pt-5">
                <SectionHeading title="Defaults" />
                <div className="grid gap-3 sm:grid-cols-3">
                  <ConfigRow
                    label="Auto Version Code"
                    value={inspected.flags.autoVersionCode ? "On" : "Off"}
                  />
                  <ConfigRow
                    label="Legacy Versioning"
                    value={inspected.flags.legacyVersioning ? "On" : "Off"}
                  />
                  <ConfigRow
                    label="Clean Workspace"
                    value={inspected.flags.cleanWorkspace ? "On" : "Off"}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}

function ArgsSection({
  draft,
  onChange,
  onReset,
  pipelineEnv,
}: {
  draft: BuildArgsDraft
  onChange: (next: BuildArgsDraft) => void
  onReset: () => void
  pipelineEnv: string
}) {
  return (
    <div className="space-y-4 rounded-md bg-[#f8fbff] px-4 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-900">Args</p>
          <p className="text-xs text-[#94a3b8]">Leave both off to use defaults.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onReset}>
            Clear
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <ArgsToggleRow
          label="autoVersionCode"
          description={
            pipelineEnv === "production"
              ? "Production pipelines already enable this by default."
              : "Enable automatic version code bump for the next run."
          }
          checked={draft.autoVersionCode}
          disabled={false}
          onCheckedChange={(checked) =>
            onChange({
              ...draft,
              autoVersionCode: checked,
            })
          }
        />
        <ArgsToggleRow
          label="legacyVersioning"
          description="Use the legacy versioning strategy for the next run."
          checked={draft.legacyVersioning}
          disabled={false}
          onCheckedChange={(checked) =>
            onChange({
              ...draft,
              legacyVersioning: checked,
            })
          }
        />
      </div>
    </div>
  )
}

function SectionHeading({
  title,
}: {
  title: string
}) {
  return (
    <p className="text-sm font-medium text-slate-900">{title}</p>
  )
}

function ArgsToggleRow({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-3">
      <input
        type="checkbox"
        className="mt-1 size-4 rounded border-slate-300 text-slate-900"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </label>
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

function ConfigPathRow({
  label,
  value,
}: {
  label: string
  value?: string
}) {
  return (
    <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-start sm:gap-4">
      <p className="text-[11px] font-semibold tracking-[0.22em] text-[#94a3b8]">
        {formatConfigLabel(label)}
      </p>
      <p className="break-all font-mono text-sm leading-6 text-slate-700">{value ?? "—"}</p>
    </div>
  )
}
