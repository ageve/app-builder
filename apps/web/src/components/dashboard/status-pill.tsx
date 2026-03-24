import { Badge } from "~/components/ui/badge"
import { cn } from "~/lib/utils"
import { statusTone } from "~/lib/dashboard"

export function StatusPill({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-md border px-2.5 py-0.5 text-xs capitalize", statusTone(status))}
    >
      {status.replaceAll("_", " ")}
    </Badge>
  )
}
