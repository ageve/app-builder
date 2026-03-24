export type DashboardStatusColumn = "queued" | "running" | "failed" | "success"

export const dashboardColumns: Array<{
  id: DashboardStatusColumn
  title: string
  description: string
}> = [
  {
    id: "queued",
    title: "Queued",
    description: "Waiting for a worker or a retry window.",
  },
  {
    id: "running",
    title: "Running",
    description: "Active builds and step execution progress.",
  },
  {
    id: "failed",
    title: "Failed",
    description: "Needs a retry or resume from checkpoint.",
  },
  {
    id: "success",
    title: "Success",
    description: "Recent completed runs and outputs.",
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
  if (!value) return "未开始"
  const diffMs = Date.now() - new Date(value).getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  if (diffMinutes < 1) return "刚刚"
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} 小时前`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} 天前`
}

export function statusTone(status: string) {
  switch (status) {
    case "running":
      return "bg-amber-100 text-amber-800 border-amber-200"
    case "failed":
      return "bg-rose-100 text-rose-800 border-rose-200"
    case "success":
      return "bg-emerald-100 text-emerald-800 border-emerald-200"
    default:
      return "bg-slate-100 text-slate-700 border-slate-200"
  }
}
