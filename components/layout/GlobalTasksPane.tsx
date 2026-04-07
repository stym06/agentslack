'use client'

import { ListTodo } from 'lucide-react'
import { TaskList } from '@/components/tasks/TaskList'

export function GlobalTasksPane() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[49px] items-center gap-2 border-b px-4">
        <ListTodo className="size-5" />
        <h1 className="text-lg font-bold">Tasks</h1>
      </div>
      <TaskList />
    </div>
  )
}
