import { Link, createFileRoute, notFound, useRouter } from "@tanstack/react-router"
import { ArrowLeft, ChevronRight, RotateCcw, SkipForward, Terminal } from "lucide-react"
import { startTransition } from "react"
import { toast } from "sonner"
import { StatusPill } from "~/components/dashboard/status-pill"
import { Button, buttonVariants } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { Progress } from "~/components/ui/progress"
import { formatDate } from "~/lib/dashboard"
import { cn, subtleScrollbarClass } from "~/lib/utils"
import {
  getRunDetailServerFn,
  readRunLogServerFn,
  resumeBuildServerFn,
  retryBuildServerFn,
} from "~/server/builds"

type RunDetailLoaderData = {
  detail: {
    run: {
      runId: string
      profileId: string
      status: string
      currentStepId?: string
      errorStepId?: string
      createdAt: string
      startedAt?: string
      endedAt?: string
    }
    definition: {
      pipeline: {
        platform: string
        env: string
      }
    }
    steps: Array<{
      stepId: string
      displayName: string
      status: string
      retryable: boolean
      checkpointable: boolean
      startedAt?: string
      endedAt?: string
      error?: {
        message?: string
      }
    }>
    artifacts: Array<{
      path: string
      label: string
      kind: string
    }>
  }
  log: {
    content: string
    logFile: string
  }
}

export const Route = createFileRoute("/runs/$runId")({
  loader: async ({ params }) => {
    const [detail, log] = await Promise.all([
      getRunDetailServerFn({ data: { runId: params.runId } }),
      readRunLogServerFn({ data: { runId: params.runId } }),
    ])
    if (!detail) {
      throw notFound()
    }
    return { detail, log }
  },
  component: RunDetailPage,
})

function RunDetailPage() {
  const router = useRouter()
  const { detail, log } = Route.useLoaderData() as RunDetailLoaderData
  const completedCount = detail.steps.filter((step) => step.status === "success").length
  const progress = Math.round((completedCount / Math.max(detail.steps.length, 1)) * 100)
  const firstStepId = detail.steps[0]?.stepId
  const failedStep =
    detail.steps.find((step) => step.status === "failed") ??
    detail.steps.find((step) => step.stepId === detail.run.errorStepId)

  const canResumeFailedStep =
    detail.run.status === "failed" &&
    Boolean(failedStep?.stepId) &&
    failedStep?.checkpointable

  const canRetryFromStart =
    Boolean(firstStepId) &&
    (detail.run.status === "failed" || detail.run.status === "success")

  const resumeFailedStep = async () => {
    if (!failedStep?.stepId) {
      return
    }
    startTransition(async () => {
      try {
        await resumeBuildServerFn({
          data: {
            runId: detail.run.runId,
            fromStep: failedStep.stepId,
          },
        })
        toast.success(`Run ${detail.run.runId} resumed from ${failedStep.stepId}`)
        await router.invalidate()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Resume failed")
      }
    })
  }

  const retryRun = async (stepId: string, label: string) => {
    startTransition(async () => {
      try {
        const next = (await retryBuildServerFn({
          data: {
            runId: detail.run.runId,
            stepId,
          },
        })) as { run: { runId: string } }
        toast.success(`${label} queued as ${next.run.runId}`)
        await router.navigate({
          to: "/runs/$runId",
          params: { runId: next.run.runId },
        })
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Retry failed")
      }
    })
  }

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-[#94a3b8]">
        <Link
          to="/pipelines/$pipelineId"
          params={{ pipelineId: detail.run.profileId }}
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-[#5f6f84] transition hover:bg-[#eff5ff] hover:text-[#111827]"
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>
        <ChevronRight className="size-4 text-[#c4d3e4]" />
        <Link
          to="/pipelines/$pipelineId"
          params={{ pipelineId: detail.run.profileId }}
          className="hover:text-[#111827]"
        >
          {detail.run.profileId}
        </Link>
        <ChevronRight className="size-4 text-[#c4d3e4]" />
        <span className="font-medium text-[#111827]">{detail.run.runId}</span>
      </nav>

      <section className="flex flex-col gap-4 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#94a3b8]">
            Run
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#111827]">
            {detail.run.profileId}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#64748b]">
            <StatusPill status={detail.definition.pipeline.platform} />
            <StatusPill status={detail.definition.pipeline.env} />
            <StatusPill status={detail.run.status} />
            <span>Created {formatDate(detail.run.createdAt)}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canResumeFailedStep ? (
            <Button variant="outline" onClick={() => void resumeFailedStep()}>
              <SkipForward className="size-4" />
              Resume
            </Button>
          ) : null}
          {canRetryFromStart && firstStepId ? (
            <Button onClick={() => void retryRun(firstStepId, "Retry")}>
              <RotateCcw className="size-4" />
              Retry
            </Button>
          ) : null}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card className="flex h-[680px] min-h-0 flex-col border-[#e6edf5] bg-white shadow-none">
          <CardHeader className="space-y-4">
            <div>
              <CardTitle className="text-lg font-semibold text-[#111827]">
                Progress
              </CardTitle>
              <CardDescription>Step status for this run.</CardDescription>
            </div>

            <div className="rounded-md bg-[#f7fbff] px-4 py-4">
              <div className="flex items-center justify-between text-sm text-[#5f6f84]">
                <span>Completed steps</span>
                <span>{completedCount}/{detail.steps.length}</span>
              </div>
              <Progress value={progress} className="mt-3 h-2 rounded-full bg-[#dceaff]" />
            </div>
          </CardHeader>

          <CardContent className="min-h-0 flex-1 overflow-hidden">
            <div className={cn("h-full overflow-y-auto pr-2", subtleScrollbarClass)}>
              {detail.steps.map((step, index) => {
                const isLast = index === detail.steps.length - 1
                return (
                  <div key={step.stepId} className="relative pl-12">
                    {!isLast ? (
                      <div className="absolute left-[17px] top-8 bottom-[-18px] w-px bg-[#deebf7]" />
                    ) : null}
                    <div
                      className={timelineDotClass(step.status)}
                      style={{ left: "10px", top: "18px" }}
                    />

                    <div className="py-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-[#111827]">
                            {step.displayName}
                          </p>
                          <StatusPill status={step.status} />
                        </div>
                        <p className="mt-1 text-xs text-[#94a3b8]">{step.stepId}</p>
                        {step.error?.message ? (
                          <p className="mt-3 rounded-md bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c]">
                            {step.error.message}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="flex h-[680px] min-h-0 flex-col border-[#e6edf5] bg-white shadow-none">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg font-semibold text-[#111827]">Logs</CardTitle>
                <CardDescription>{log.logFile || "No log file"}</CardDescription>
              </div>
              <Terminal className="size-5 text-[#94a3b8]" />
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-hidden">
            <pre
              className={cn(
                "h-full overflow-auto rounded-md bg-[#2a1f1a] p-5 text-xs leading-6 text-[#fff5ec]",
                subtleScrollbarClass
              )}
            >
              {log.content || "No logs yet."}
            </pre>
          </CardContent>
        </Card>
      </div>

      {detail.run.status === "success" ? (
        <Card className="border-[#e6edf5] bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-[#111827]">Artifacts</CardTitle>
            <CardDescription>Files from this run.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.artifacts.length > 0 ? (
              detail.artifacts.map((artifact) => (
                <div
                  key={artifact.path}
                  className="rounded-md bg-[#f4f8ff] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#111827]">{artifact.label}</p>
                      <p className="mt-1 break-all text-xs text-[#94a3b8]">{artifact.path}</p>
                    </div>
                    <StatusPill status={artifact.kind} />
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-md bg-[#f4f8ff] p-8 text-center text-sm text-[#94a3b8]">
                No artifacts yet.
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function timelineDotClass(status: string) {
  const base =
    "absolute size-4 rounded-full border-2 border-white shadow-sm"
  if (status === "success") {
    return `${base} bg-emerald-500`
  }
  if (status === "failed") {
    return `${base} bg-rose-500`
  }
  if (status === "running") {
    return `${base} bg-[#4f9cf9]`
  }
  return `${base} bg-[#c6d6e8]`
}
