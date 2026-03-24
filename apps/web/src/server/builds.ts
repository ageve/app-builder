"use server"

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

const runtimeUrl = process.env.APP_BUILDER_RUNTIME_URL ?? "http://127.0.0.1:4001"

async function runtimeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${runtimeUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Runtime request failed: ${response.status}`)
  }

  if (response.status === 204) {
    return null as T
  }

  return response.json() as Promise<T>
}

const startBuildInput = z.object({
  projectId: z.string(),
  profileId: z.string(),
  branch: z.string().optional(),
  autoVersionCode: z.boolean().optional(),
  legacyVersioning: z.boolean().optional(),
  runtimeConfig: z.record(z.string(), z.unknown()).optional(),
})

const inspectConfigInput = startBuildInput

const workspaceInput = z.object({
  workspaceId: z.string(),
})

const workspacePipelineInput = z.object({
  workspaceId: z.string(),
  pipelineId: z.string(),
})

const saveConfigInput = z.object({
  workspaceId: z.string(),
  content: z.string(),
})

const savePipelineConfigInput = z.object({
  workspaceId: z.string(),
  pipelineId: z.string(),
  content: z.string(),
})

const resumeBuildInput = z.object({
  runId: z.string(),
  fromStep: z.string(),
})

const retryBuildInput = z.object({
  runId: z.string(),
  stepId: z.string(),
})

const runDetailInput = z.object({
  runId: z.string(),
})

export const listPipelinesServerFn = createServerFn({ method: "GET" }).handler(
  async () => {
    return runtimeFetch<any>("/api/pipelines")
  }
)

export const listWorkspacesServerFn = createServerFn({ method: "GET" }).handler(
  async () => {
    return runtimeFetch<any>("/api/workspaces")
  }
)

export const getWorkspaceServerFn = createServerFn({ method: "GET" })
  .inputValidator(workspaceInput)
  .handler(async ({ data }) => {
    return runtimeFetch<any>(`/api/workspaces/${data.workspaceId}`)
  })

export const getWorkspaceConfigServerFn = createServerFn({ method: "GET" })
  .inputValidator(workspaceInput)
  .handler(async ({ data }) => {
    return runtimeFetch<any>(`/api/workspaces/${data.workspaceId}/config`)
  })

export const saveWorkspaceConfigServerFn = createServerFn({ method: "POST" })
  .inputValidator(saveConfigInput)
  .handler(async ({ data }) => {
    return runtimeFetch<any>(`/api/workspaces/${data.workspaceId}/config`, {
      method: "PUT",
      body: JSON.stringify({ content: data.content }),
    })
  })

export const getWorkspacePipelinesServerFn = createServerFn({ method: "GET" })
  .inputValidator(workspaceInput)
  .handler(async ({ data }) => {
    return runtimeFetch<any>(`/api/workspaces/${data.workspaceId}/pipelines`)
  })

export const getPipelineServerFn = createServerFn({ method: "GET" })
  .inputValidator(workspacePipelineInput)
  .handler(async ({ data }) => {
    return runtimeFetch<any>(
      `/api/workspaces/${data.workspaceId}/pipelines/${data.pipelineId}`
    )
  })

export const getPipelineConfigServerFn = createServerFn({ method: "GET" })
  .inputValidator(workspacePipelineInput)
  .handler(async ({ data }) => {
    return runtimeFetch<any>(
      `/api/workspaces/${data.workspaceId}/pipelines/${data.pipelineId}/config`
    )
  })

export const savePipelineConfigServerFn = createServerFn({ method: "POST" })
  .inputValidator(savePipelineConfigInput)
  .handler(async ({ data }) => {
    return runtimeFetch<any>(
      `/api/workspaces/${data.workspaceId}/pipelines/${data.pipelineId}/config`,
      {
        method: "PUT",
        body: JSON.stringify({ content: data.content }),
      }
    )
  })

export const inspectConfigServerFn = createServerFn({ method: "POST" })
  .inputValidator(inspectConfigInput)
  .handler(async ({ data }) => {
    return runtimeFetch<any>("/api/config/inspect", {
      method: "POST",
      body: JSON.stringify(data),
    })
  })

export const startBuildServerFn = createServerFn({ method: "POST" })
  .inputValidator(startBuildInput)
  .handler(async ({ data }) => {
    return runtimeFetch<any>("/api/builds/start", {
      method: "POST",
      body: JSON.stringify(data),
    })
  })

export const getDashboardServerFn = createServerFn({ method: "GET" }).handler(
  async () => {
    return runtimeFetch<any>("/api/builds")
  }
)

export const getRunDetailServerFn = createServerFn({ method: "GET" })
  .inputValidator(runDetailInput)
  .handler(async ({ data }) => {
    return runtimeFetch<any>(`/api/builds/${data.runId}`)
  })

export const resumeBuildServerFn = createServerFn({ method: "POST" })
  .inputValidator(resumeBuildInput)
  .handler(async ({ data }) => {
    return runtimeFetch<any>(`/api/builds/${data.runId}/resume`, {
      method: "POST",
      body: JSON.stringify({ fromStep: data.fromStep }),
    })
  })

export const retryBuildServerFn = createServerFn({ method: "POST" })
  .inputValidator(retryBuildInput)
  .handler(async ({ data }) => {
    return runtimeFetch<any>(`/api/builds/${data.runId}/retry`, {
      method: "POST",
      body: JSON.stringify({ stepId: data.stepId }),
    })
  })

export const readRunLogServerFn = createServerFn({ method: "GET" })
  .inputValidator(runDetailInput)
  .handler(async ({ data }) => {
    return runtimeFetch<any>(`/api/builds/${data.runId}/logs`)
  })
