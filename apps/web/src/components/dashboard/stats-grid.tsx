import { Activity, CheckCircle2, Clock3, Siren } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"

const iconMap = {
  queued: Clock3,
  running: Activity,
  failed: Siren,
  success: CheckCircle2,
}

const descriptions = {
  queued: "待执行或待重试",
  running: "正在执行的流水",
  failed: "需要人工处理",
  success: "最近成功完成",
}

export function StatsGrid({
  stats,
}: {
  stats: {
    queued: number
    running: number
    failed: number
    success: number
  }
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {(Object.keys(stats) as Array<keyof typeof stats>).map((key) => {
        const Icon = iconMap[key]
        return (
          <Card
            key={key}
            className="rounded-[2rem] border-white/70 bg-white/80 shadow-sm shadow-slate-200/70 backdrop-blur"
          >
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-sm font-medium capitalize text-slate-600">
                  {key}
                </CardTitle>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                  {stats[key]}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <Icon className="size-4" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-500">{descriptions[key]}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
