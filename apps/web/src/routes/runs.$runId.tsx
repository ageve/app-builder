import { Link, createFileRoute, notFound, useRouter } from "@tanstack/react-router"
import { ArrowLeft, ChevronRight, RotateCcw, SkipForward, Terminal } from "lucide-react"
import { startTransition } from "react"
import { toast } from "sonner"
import { StatusPill } from "~/components/dashboard/status-pill"
import { Button, buttonVariants } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { Progress } from "~/components/ui/progress"
import { formatDate } from "~/lib/dashboard"
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
      <nav className="flex flex-wrap items-center gap-2 text-sm text-[#8a7368]">
        <Link
          to="/pipelines/$pipelineId"
          params={{ pipelineId: detail.run.profileId }}
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-[#71594c] transition hover:bg-[#fff1e6] hover:text-[#241913]"
        >
          <ArrowLeft className="size-4" />
          Back to pipeline
        </Link>
        <ChevronRight className="size-4 text-[#d0b4a1]" />
        <Link to="/" className="hover:text-[#241913]">
          Dashboard
        </Link>
        <ChevronRight className="size-4 text-[#d0b4a1]" />
        <Link to="/pipelines" className="hover:text-[#241913]">
          Pipelines
        </Link>
        <ChevronRight className="size-4 text-[#d0b4a1]" />
        <Link
          to="/pipelines/$pipelineId"
          params={{ pipelineId: detail.run.profileId }}
          className="hover:text-[#241913]"
        >
          {detail.run.profileId}
        </Link>
        <ChevronRight className="size-4 text-[#d0b4a1]" />
        <span className="font-medium text-[#241913]">{detail.run.runId}</span>
      </nav>

      <section className="flex flex-col gap-4 border-b border-[#f0e0d2] pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b6907d]">
            Run history
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#241913]">
            {detail.run.profileId}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#7a6257]">
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
              Resume failed step
            </Button>
          ) : null}
          {canRetryFromStart && firstStepId ? (
            <Button onClick={() => void retryRun(firstStepId, "Retry from start")}>
              <RotateCcw className="size-4" />
              Retry from start
            </Button>
          ) : null}
        </div>
      </section>

      <Card className="border-[#f1dfcf] bg-white shadow-none">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-[#241913]">
                Run progress
              </CardTitle>
              <CardDescription>
                The main view combines a compact progress indicator with a step-by-step timeline.
              </CardDescription>
            </div>
            <div className="grid gap-1 text-sm text-[#7a6257]">
              <span>Started {formatDate(detail.run.startedAt)}</span>
              <span>Finished {formatDate(detail.run.endedAt)}</span>
              <span>Current step {detail.run.currentStepId ?? "waiting_for_worker"}</span>
            </div>
          </div>

          <div className="rounded-md bg-[#fff8f1] px-4 py-4">
            <div className="flex items-center justify-between text-sm text-[#71594c]">
              <span>Completed steps</span>
              <span>
                {completedCount}/{detail.steps.length} · {progress}%
              </span>
            </div>
            <Progress value={progress} className="mt-3 h-2 rounded-full bg-[#f4dfcf]" />
          </div>
        </CardHeader>

        <CardContent className="space-y-0">
          {detail.steps.map((step, index) => {
            const isLast = index === detail.steps.length - 1
            return (
              <div key={step.stepId} className="relative pl-12">
                {!isLast ? (
                  <div className="absolute left-[17px] top-8 bottom-[-18px] w-px bg-[#ead6c5]" />
                ) : null}
                <div
                  className={timelineDotClass(step.status)}
                  style={{ left: "10px", top: "18px" }}
                />

                <div className="border-b border-[#f7ebdf] py-4 last:border-b-0">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[#241913]">
                          {step.displayName}
                        </p>
                        <StatusPill status={step.status} />
                      </div>
                      <p className="mt-1 text-xs text-[#9a7f72]">{step.stepId}</p>
                      {step.error?.message ? (
                        <p className="mt-3 rounded-md bg-[#fff3ea] px-3 py-2 text-sm text-[#9c4f2f]">
                          {step.error.message}
                        </p>
                      ) : null}
                    </div>

                    <div className="grid gap-1 text-xs text-[#8a7368] lg:text-right">
                      <span>Started {formatDate(step.startedAt)}</span>
                      <span>Ended {formatDate(step.endedAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Card className="border-[#f1dfcf] bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-[#241913]">Artifacts</CardTitle>
            <CardDescription>Outputs captured for this run.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.artifacts.length > 0 ? (
              detail.artifacts.map((artifact) => (
                <div
                  key={artifact.path}
                  className="rounded-md border border-[#f3e3d5] bg-[#fffaf4] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#241913]">{artifact.label}</p>
                      <p className="mt-1 break-all text-xs text-[#8a7368]">{artifact.path}</p>
                    </div>
                    <StatusPill status={artifact.kind} />
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-[#ead6c5] bg-[#fffaf4] p-8 text-center text-sm text-[#b6907d]">
                No artifacts recorded yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-[#f1dfcf] bg-white shadow-none">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg font-semibold text-[#241913]">Run logs</CardTitle>
                <CardDescription>{log.logFile || "No log file yet"}</CardDescription>
              </div>
              <Terminal className="size-5 text-[#b6907d]" />
            </div>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[560px] overflow-auto rounded-md bg-[#2a1f1a] p-5 text-xs leading-6 text-[#fff5ec]">
              {log.content || "No log output yet."}
            </pre>
          </CardContent>
        </Card>
      </div>
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
    return `${base} bg-[#f08f54]`
  }
  return `${base} bg-[#d8c2b4]`
}
