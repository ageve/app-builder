"use client"

import { Link } from "@tanstack/react-router"
import { FolderKanban, LayoutDashboard, Workflow } from "lucide-react"
import { useEffect, useState } from "react"
import {
  DEFAULT_WORKSPACE_ID,
  RECENT_PIPELINE_STORAGE_KEY,
} from "~/lib/app-builder"
import { cn } from "~/lib/utils"

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  {
    to: "/workspace",
    label: "Workspace",
    icon: FolderKanban,
  },
  {
    to: "/pipelines",
    label: "Pipeline",
    icon: Workflow,
  },
] as const

export function AppSidebar() {
  const [recentPipelineId, setRecentPipelineId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    setRecentPipelineId(window.localStorage.getItem(RECENT_PIPELINE_STORAGE_KEY))
  }, [])

  return (
    <aside className="flex h-full w-full flex-col border-r border-[#f1dfcf] bg-[#fffaf4] px-4 py-5">
      <div className="space-y-6">
        <p className="text-[15px] font-black uppercase tracking-[0.28em] text-[#dd6b38]">
          App Builder
        </p>

        <nav className="space-y-1">
          {links.map((link) => {
            const Icon = link.icon
            const isRecentPipelineLink = link.to === "/pipelines" && recentPipelineId
            return (
              <Link
                key={link.to}
                to={isRecentPipelineLink ? "/pipelines/$pipelineId" : link.to}
                params={isRecentPipelineLink ? { pipelineId: recentPipelineId } : undefined}
                activeOptions={
                  "exact" in link && !isRecentPipelineLink ? { exact: true } : undefined
                }
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-[#71594c] transition hover:bg-[#fff1e6] hover:text-[#2d2018]"
                )}
                activeProps={{
                  className:
                    "flex items-center gap-3 rounded-md bg-[#f08f54] px-3 py-2 text-sm font-medium text-white shadow-sm",
                }}
              >
                <Icon className="size-4" />
                {link.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
