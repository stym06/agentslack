'use client'

import { FolderGit2 } from 'lucide-react'
import { ProjectList } from '@/components/projects/ProjectList'

export function GlobalProjectsPane() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[49px] items-center gap-2 border-b px-4">
        <FolderGit2 className="size-5" />
        <h1 className="text-lg font-bold">Projects</h1>
      </div>
      <ProjectList />
    </div>
  )
}
