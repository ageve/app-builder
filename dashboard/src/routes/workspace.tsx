import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { type ReactNode, startTransition, useMemo, useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { JsonMonacoEditor } from "~/components/config/json-monaco-editor"
import { PipelinesTable } from "~/components/dashboard/pipelines-table"
import { StatusPill } from "~/components/dashboard/status-pill"
import { WorkspaceSelectBar } from "~/components/navigation/select-bar"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { DEFAULT_WORKSPACE_ID } from "~/lib/app-builder"
import { getJsonErrorMessage, normalizeJson } from "~/lib/json"
import {
  createPipelineServerFn,
  createWorkspaceServerFn,
  deletePipelineServerFn,
  deleteWorkspaceServerFn,
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
      packageAlias: string
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

const searchSchema = z.object({
  workspaceId: z.string().optional(),
})

type WorkspaceSummary = {
  workspaceId: string
}

export const Route = createFileRoute("/workspace")({
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

    const [detail, config] = await Promise.all([
      getWorkspaceServerFn({ data: { workspaceId: activeWorkspaceId } }),
      getWorkspaceConfigServerFn({ data: { workspaceId: activeWorkspaceId } }),
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
  const navigate = useNavigate({ from: "/workspace" })
  const router = useRouter()
  const { detail, config, workspaces } = Route.useLoaderData() as WorkspaceLoaderData
  const [draft, setDraft] = useState(config.content)
  const [savedDraft, setSavedDraft] = useState(config.content)
  const [saving, setSaving] = useState(false)
  const [showCreateWorkspaceModal, setShowCreateWorkspaceModal] = useState(false)
  const [showDeleteWorkspaceModal, setShowDeleteWorkspaceModal] = useState(false)
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [deletingWorkspace, setDeletingWorkspace] = useState(false)
  const [creatingPipeline, setCreatingPipeline] = useState(false)
  const [deletingPipelineId, setDeletingPipelineId] = useState<string | null>(null)
  const [newWorkspaceId, setNewWorkspaceId] = useState("")
  const [newWorkspaceName, setNewWorkspaceName] = useState("")
  const [newWorkspaceGitUri, setNewWorkspaceGitUri] = useState("")
  const [newPackageAlias, setNewPackageAlias] = useState("")
  const [newPlatform, setNewPlatform] = useState<"android" | "iOS">("android")
  const [newEnv, setNewEnv] = useState<"alpha" | "production">("alpha")
  const [newBranch, setNewBranch] = useState("")
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
  const canDeleteWorkspace = workspaces.length > 1

  const nextWorkspaceFallback = useMemo(() => {
    return (
      workspaces.find((workspace) => workspace.workspaceId !== detail.workspace.workspaceId)
        ?.workspaceId ?? DEFAULT_WORKSPACE_ID
    )
  }, [detail.workspace.workspaceId, workspaces])

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

  const createWorkspace = async () => {
    if (!newWorkspaceId.trim() || !newWorkspaceName.trim() || !newWorkspaceGitUri.trim()) {
      toast.error("Workspace ID, name, and git URI are required")
      return
    }

    setCreatingWorkspace(true)
    startTransition(async () => {
      try {
        await createWorkspaceServerFn({
          data: {
            workspaceId: newWorkspaceId.trim(),
            name: newWorkspaceName.trim(),
            gitUri: newWorkspaceGitUri.trim(),
          },
        })
        setNewWorkspaceId("")
        setNewWorkspaceName("")
        setNewWorkspaceGitUri("")
        setShowCreateWorkspaceModal(false)
        await navigate({
          to: "/workspace",
          search: { workspaceId: newWorkspaceId.trim() },
        })
        await router.invalidate()
        toast.success("Workspace created")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Create workspace failed")
      } finally {
        setCreatingWorkspace(false)
      }
    })
  }

  const removeWorkspace = async () => {
    if (!canDeleteWorkspace) {
      toast.error("Keep at least one workspace")
      return
    }

    setDeletingWorkspace(true)
    startTransition(async () => {
      try {
        await deleteWorkspaceServerFn({
          data: {
            workspaceId: detail.workspace.workspaceId,
          },
        })
        setShowDeleteWorkspaceModal(false)
        await navigate({
          to: "/workspace",
          search: { workspaceId: nextWorkspaceFallback },
        })
        await router.invalidate()
        toast.success("Workspace deleted")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Delete workspace failed")
      } finally {
        setDeletingWorkspace(false)
      }
    })
  }

  const createPipeline = async () => {
    if (!newPackageAlias.trim() || !newBranch.trim()) {
      toast.error("Package alias and branch are required")
      return
    }

    setCreatingPipeline(true)
    startTransition(async () => {
      try {
        await createPipelineServerFn({
          data: {
            workspaceId: detail.workspace.workspaceId,
            packageAlias: newPackageAlias.trim(),
            platform: newPlatform,
            env: newEnv,
            branch: newBranch.trim(),
          },
        })
        setNewPackageAlias("")
        setNewPlatform("android")
        setNewEnv("alpha")
        setNewBranch("")
        await router.invalidate()
        toast.success("Pipeline created")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Create pipeline failed")
      } finally {
        setCreatingPipeline(false)
      }
    })
  }

  const removePipeline = async (profileId: string) => {
    if (!window.confirm(`Delete pipeline ${profileId}?`)) {
      return
    }

    setDeletingPipelineId(profileId)
    startTransition(async () => {
      try {
        await deletePipelineServerFn({
          data: {
            workspaceId: detail.workspace.workspaceId,
            pipelineId: profileId,
          },
        })
        await router.invalidate()
        toast.success("Pipeline deleted")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Delete pipeline failed")
      } finally {
        setDeletingPipelineId(null)
      }
    })
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 pb-5 md:flex-row md:items-end md:justify-between">
        <WorkspaceSelectBar
          workspaces={workspaces.map((workspace) => ({
            workspaceId: workspace.workspaceId,
            name: workspace.name,
          }))}
          currentWorkspaceId={detail.workspace.workspaceId}
          onWorkspaceChange={(workspaceId) =>
            void navigate({
              to: "/workspace",
              search: { workspaceId },
            })
          }
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCreateWorkspaceModal(true)}>
            New Workspace
          </Button>
          <Button
            variant="destructive"
            onClick={() => setShowDeleteWorkspaceModal(true)}
            disabled={!canDeleteWorkspace}
          >
            Delete Workspace
          </Button>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
        <div className="space-y-6">
          <Card className="border-[#e6edf5] bg-white shadow-none">
            <CardHeader>
              <CardTitle className="text-lg text-[#111827]">Pipelines</CardTitle>
            <CardDescription>
              One row per pipeline, with clear Package, Platform, Env, Branch, and Steps.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Input
                value={newPackageAlias}
                onChange={(event) => setNewPackageAlias(event.target.value)}
                placeholder="package alias"
              />
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={newPlatform}
                  onChange={(event) => setNewPlatform(event.target.value as "android" | "iOS")}
                >
                  <option value="android">android</option>
                  <option value="iOS">iOS</option>
                </select>
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={newEnv}
                  onChange={(event) => setNewEnv(event.target.value as "alpha" | "production")}
                >
                  <option value="alpha">alpha</option>
                  <option value="production">production</option>
                </select>
                <Input
                  value={newBranch}
                  onChange={(event) => setNewBranch(event.target.value)}
                  placeholder="branch"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => void createPipeline()} disabled={creatingPipeline}>
                  Add Pipeline
                </Button>
              </div>
              <PipelinesTable
                pipelines={sortedPipelines}
                workspaceId={detail.workspace.workspaceId}
                compact
                onDelete={(pipeline) => void removePipeline(pipeline.profileId)}
                deletingPipelineId={deletingPipelineId}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="border-[#e6edf5] bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg text-[#111827]">Workspace Config</CardTitle>
            <CardDescription>Editable workspace JSON. Pipeline config stays read-only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusPill status={jsonError ? "invalid_json" : "valid_json"} />
              <span className="text-[#64748b]">
                {jsonError ? jsonError : isDirty ? "Unsaved changes" : "Saved"}
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

      <WorkspaceModal
        open={showCreateWorkspaceModal}
        title="New Workspace"
        description="Create a workspace config, then switch into it immediately."
        onClose={() => {
          if (creatingWorkspace) return
          setShowCreateWorkspaceModal(false)
        }}
      >
        <div className="space-y-3">
          <Input
            value={newWorkspaceId}
            onChange={(event) => setNewWorkspaceId(event.target.value)}
            placeholder="workspace id"
          />
          <Input
            value={newWorkspaceName}
            onChange={(event) => setNewWorkspaceName(event.target.value)}
            placeholder="workspace name"
          />
          <Input
            value={newWorkspaceGitUri}
            onChange={(event) => setNewWorkspaceGitUri(event.target.value)}
            placeholder="git uri"
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setShowCreateWorkspaceModal(false)}
            disabled={creatingWorkspace}
          >
            Cancel
          </Button>
          <Button onClick={() => void createWorkspace()} disabled={creatingWorkspace}>
            Save
          </Button>
        </div>
      </WorkspaceModal>

      <WorkspaceModal
        open={showDeleteWorkspaceModal}
        title="Delete Workspace"
        description="This will delete the workspace config, its pipeline configs, and all related runs."
        onClose={() => {
          if (deletingWorkspace) return
          setShowDeleteWorkspaceModal(false)
        }}
      >
        <div className="space-y-3">
          <div className="rounded-md bg-[#fff4f3] px-4 py-3 text-sm leading-6 text-[#9f3a2f]">
            Current workspace: <span className="font-medium">{detail.workspace.workspaceId}</span>
          </div>
          <p className="text-sm leading-6 text-[#64748b]">
            This action also removes pipeline definitions, run records, and local run artifacts for
            this workspace.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setShowDeleteWorkspaceModal(false)}
            disabled={deletingWorkspace}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void removeWorkspace()}
            disabled={deletingWorkspace || !canDeleteWorkspace}
          >
            Delete
          </Button>
        </div>
      </WorkspaceModal>
    </div>
  )
}

function WorkspaceModal({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean
  title: string
  description: string
  onClose: () => void
  children: ReactNode
}) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close backdrop"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="text-sm leading-6 text-slate-500">{description}</p>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  )
}
