export type DashboardStatusColumn = "queued" | "running" | "failed" | "success"

export const dashboardColumns: Array<{
  id: DashboardStatusColumn
  title: string
  description: string
}> = [
  {
    id: "queued",
    title: "Queued",
    description: "Waiting to run.",
  },
  {
    id: "running",
    title: "Running",
    description: "In progress.",
  },
  {
    id: "failed",
    title: "Failed",
    description: "Needs action.",
  },
  {
    id: "success",
    title: "Success",
    description: "Done.",
  },
]

export function toDashboardColumn(status: string): DashboardStatusColumn {
  if (status === "running") return "running"
  if (status === "failed") return "failed"
  if (status === "success") return "success"
  return "queued"
}

export function formatDate(value?: string) {
  if (!value) return "—"
  const date = new Date(value)
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function formatRelative(value?: string) {
  if (!value) return "Not started"
  const diffMs = Date.now() - new Date(value).getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  if (diffMinutes < 1) return "Just now"
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

export function statusTone(status: string) {
  switch (status) {
    case "running":
      return "bg-[#eef5ff] text-[#3b82f6]"
    case "failed":
      return "bg-[#fff1f2] text-[#e11d48]"
    case "success":
      return "bg-[#ecfdf3] text-[#16a34a]"
    default:
      return "bg-[#f5f8fc] text-[#64748b]"
  }
}
