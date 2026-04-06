"use client"

import { useRouter } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { Combobox } from "~/components/ui/combobox"
import {
  DEFAULT_WORKSPACE_ID,
  RECENT_PIPELINE_STORAGE_KEY,
  RECENT_WORKSPACE_STORAGE_KEY,
} from "~/lib/app-builder"

type WorkspaceOption = {
  workspaceId: string
  name: string
}

type PipelineOption = {
  profileId: string
  displayName: string
}

export function WorkspaceSelectBar({
  workspaces,
  currentWorkspaceId = DEFAULT_WORKSPACE_ID,
  onWorkspaceChange,
}: {
  workspaces: WorkspaceOption[]
  currentWorkspaceId?: string
  onWorkspaceChange?: (workspaceId: string) => void
}) {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(currentWorkspaceId)

  useEffect(() => {
    setSelectedWorkspaceId(currentWorkspaceId)
  }, [currentWorkspaceId])

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(RECENT_WORKSPACE_STORAGE_KEY, selectedWorkspaceId)
    }
  }, [selectedWorkspaceId])

  return (
    <Combobox
      label="Workspace"
      value={selectedWorkspaceId}
      options={workspaces.map((workspace) => ({
        value: workspace.workspaceId,
        label: workspace.name,
        description: workspace.workspaceId,
      }))}
      onValueChange={(nextWorkspaceId) => {
        setSelectedWorkspaceId(nextWorkspaceId)
        onWorkspaceChange?.(nextWorkspaceId)
      }}
      className="sm:max-w-sm"
      searchPlaceholder="Search workspace..."
      emptyMessage="No workspace found."
    />
  )
}

export function PipelineSelectBar({
  workspaces,
  pipelines,
  currentWorkspaceId = DEFAULT_WORKSPACE_ID,
  currentPipelineId,
  navigateOnPipelineChange = true,
  onWorkspaceChange,
  onPipelineChange,
}: {
  workspaces: WorkspaceOption[]
  pipelines: PipelineOption[]
  currentWorkspaceId?: string
  currentPipelineId?: string
  navigateOnPipelineChange?: boolean
  onWorkspaceChange?: (workspaceId: string) => void
  onPipelineChange?: (pipelineId: string) => void
}) {
  const router = useRouter()
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(currentWorkspaceId)
  const [selectedPipelineId, setSelectedPipelineId] = useState(
    currentPipelineId ?? pipelines[0]?.profileId ?? ""
  )

  const pipelineMap = useMemo(
    () => new Map(pipelines.map((pipeline) => [pipeline.profileId, pipeline])),
    [pipelines]
  )

  useEffect(() => {
    const storedWorkspace =
      typeof window !== "undefined"
        ? window.localStorage.getItem(RECENT_WORKSPACE_STORAGE_KEY)
        : null
    const storedPipeline =
      typeof window !== "undefined"
        ? window.localStorage.getItem(RECENT_PIPELINE_STORAGE_KEY)
        : null

    if (currentWorkspaceId) {
      setSelectedWorkspaceId(currentWorkspaceId)
    } else if (
      storedWorkspace &&
      workspaces.some((workspace) => workspace.workspaceId === storedWorkspace)
    ) {
      setSelectedWorkspaceId(storedWorkspace)
    }

    if (currentPipelineId) {
      setSelectedPipelineId(currentPipelineId)
    } else if (storedPipeline && pipelineMap.has(storedPipeline)) {
      setSelectedPipelineId(storedPipeline)
    } else if (pipelines[0]) {
      setSelectedPipelineId(pipelines[0].profileId)
    }
  }, [currentPipelineId, currentWorkspaceId, pipelineMap, pipelines, workspaces])

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(RECENT_WORKSPACE_STORAGE_KEY, selectedWorkspaceId)
    }
  }, [selectedWorkspaceId])

  useEffect(() => {
    if (selectedPipelineId && typeof window !== "undefined") {
      window.localStorage.setItem(RECENT_PIPELINE_STORAGE_KEY, selectedPipelineId)
    }
  }, [selectedPipelineId])

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end">
      <Combobox
        label="Workspace"
        value={selectedWorkspaceId}
        options={workspaces.map((workspace) => ({
          value: workspace.workspaceId,
          label: workspace.name,
          description: workspace.workspaceId,
        }))}
        onValueChange={(nextWorkspaceId) => {
          setSelectedWorkspaceId(nextWorkspaceId)
          onWorkspaceChange?.(nextWorkspaceId)
        }}
        className="sm:max-w-sm"
        searchPlaceholder="Search workspace..."
        emptyMessage="No workspace found."
      />

      <Combobox
        label="Pipeline"
        value={selectedPipelineId}
        options={pipelines.map((pipeline) => ({
          value: pipeline.profileId,
          label: pipeline.displayName,
          description: pipeline.profileId,
        }))}
        onValueChange={(nextPipelineId) => {
          setSelectedPipelineId(nextPipelineId)
          onPipelineChange?.(nextPipelineId)
          if (navigateOnPipelineChange) {
            void router.navigate({
              to: "/pipelines/$pipelineId",
              params: { pipelineId: nextPipelineId },
              search: { workspaceId: selectedWorkspaceId },
            })
          }
        }}
        className="sm:max-w-sm"
        searchPlaceholder="Search pipeline..."
        emptyMessage="No pipeline found."
      />
    </div>
  )
}
