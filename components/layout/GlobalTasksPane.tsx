'use client'

import { ListTodo } from 'lucide-react'
import { TaskList } from '@/components/tasks/TaskList'
import { TaskDetailPane } from '@/components/tasks/TaskDetailPane'
import { cn } from '@/lib/utils'

export function GlobalTasksPane({
  onOpenTask,
  openTaskId,
  onTaskBack,
  highlightMessageId,
}: {
  onOpenTask: (taskId: string) => void
  openTaskId?: string | null
  onTaskBack?: () => void
  highlightMessageId?: string | null
}) {
  return (
    <div className="flex h-full overflow-hidden">
      {/* Kanban board - shrinks when detail is open */}
      <div
        className={cn(
          'h-full shrink-0 overflow-hidden transition-all duration-300 ease-in-out',
          openTaskId ? 'w-[55%]' : 'w-full',
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-[49px] w-full items-center gap-2 border-b px-4">
            <ListTodo className="size-5" />
            <h1 className="text-lg font-bold">Tasks</h1>
          </div>
          <div className="flex-1 overflow-hidden">
            <TaskList onOpenTaskDetail={onOpenTask} />
          </div>
        </div>
      </div>

      {/* Task detail sidebar - slides in from right */}
      <div
        className={cn(
          'h-full overflow-hidden border-l transition-all duration-300 ease-in-out',
          openTaskId ? 'w-[45%] opacity-100' : 'w-0 border-l-0 opacity-0',
        )}
      >
        {openTaskId && (
          <TaskDetailPane
            taskId={openTaskId}
            onBack={onTaskBack ?? (() => {})}
            highlightMessageId={highlightMessageId}
          />
        )}
      </div>
    </div>
  )
}
