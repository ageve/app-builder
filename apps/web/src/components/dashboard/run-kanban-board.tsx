"use client"

import {
  closestCorners,
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Link } from "@tanstack/react-router"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { dashboardColumns, DashboardStatusColumn, formatDate, formatRelative, toDashboardColumn } from "~/lib/dashboard"
import { cn } from "~/lib/utils"
import { StatusPill } from "./status-pill"

type RunCard = {
  runId: string
  projectId: string
  profileId: string
  status: string
  currentStepId?: string
  errorMessage?: string
  startedAt?: string
  updatedAt: string
}

function SortableRunCard({ run }: { run: RunCard }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: run.runId,
    data: {
      columnId: toDashboardColumn(run.status),
    },
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "rounded-md border border-white/80 bg-white/95 p-4 shadow-sm shadow-slate-200/70 backdrop-blur transition duration-200",
        isDragging && "rotate-[1deg] shadow-xl"
      )}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">{run.profileId}</p>
          <p className="text-xs text-slate-500">{run.projectId}</p>
        </div>
        <StatusPill status={run.status} />
      </div>
      <div className="mt-4 space-y-3">
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Step</p>
          <p className="mt-1 text-sm font-medium text-slate-700">
            {run.currentStepId ?? "waiting_for_worker"}
          </p>
        </div>
        {run.errorMessage ? (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {run.errorMessage}
          </p>
        ) : null}
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>{formatRelative(run.updatedAt)}</span>
        <Link
          to="/runs/$runId"
          params={{ runId: run.runId }}
          className="font-medium text-slate-900 underline-offset-4 hover:underline"
        >
          Open
        </Link>
      </div>
    </div>
  )
}

function Column({
  id,
  title,
  description,
  runs,
}: {
  id: DashboardStatusColumn
  title: string
  description: string
  runs: RunCard[]
}) {
  return (
    <Card className="rounded-md border-white/70 bg-white/75 shadow-sm shadow-slate-200/60 backdrop-blur">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-slate-900">{title}</CardTitle>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            {runs.length}
          </div>
        </div>
        <CardDescription className="text-sm leading-6 text-slate-500">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SortableContext items={runs.map((run) => run.runId)} strategy={rectSortingStrategy}>
          <div className="space-y-3">
            {runs.length > 0 ? (
              runs.map((run) => <SortableRunCard key={run.runId} run={run} />)
            ) : (
              <div className="rounded-md bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-400">
                No runs here.
              </div>
            )}
          </div>
        </SortableContext>
      </CardContent>
    </Card>
  )
}

export function RunKanbanBoard({ runs }: { runs: RunCard[] }) {
  const sensors = useSensors(useSensor(PointerSensor))
  const grouped = dashboardColumns.reduce<Record<DashboardStatusColumn, RunCard[]>>(
    (acc, column) => {
      acc[column.id] = runs.filter((run) => toDashboardColumn(run.status) === column.id)
      return acc
    },
    {
      queued: [],
      running: [],
      failed: [],
      success: [],
    }
  )

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }

    const activeColumn = active.data.current?.columnId as DashboardStatusColumn | undefined
    const overRun = runs.find((run) => run.runId === over.id)
    const overColumn = overRun ? toDashboardColumn(overRun.status) : activeColumn
    if (!activeColumn || !overColumn || activeColumn !== overColumn) {
      return
    }
    const items = grouped[activeColumn]
    const oldIndex = items.findIndex((run) => run.runId === active.id)
    const newIndex = items.findIndex((run) => run.runId === over.id)
    grouped[activeColumn] = arrayMove(items, oldIndex, newIndex)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      <div className="grid gap-5 xl:grid-cols-4">
        {dashboardColumns.map((column) => (
          <Column
            key={column.id}
            id={column.id}
            title={column.title}
            description={column.description}
            runs={grouped[column.id]}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
        <span>Drag is local only.</span>
        <span>Last refresh: {formatDate(new Date().toISOString())}</span>
      </div>
    </DndContext>
  )
}
