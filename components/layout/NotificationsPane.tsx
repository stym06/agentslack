'use client'

import { useState } from 'react'
import { Bell, MessageSquare, ListChecks, X, CheckCheck } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import type { Notification } from './DashboardLayout'

type Filter = 'unread' | 'read' | 'all'

export function NotificationsPane({
  notifications,
  onNotificationClick,
  onClearNotification,
  onMarkAllRead,
}: {
  notifications: Notification[]
  onNotificationClick: (notif: Notification) => void
  onClearNotification: (id: string) => void
  onMarkAllRead: () => void
}) {
  const [filter, setFilter] = useState<Filter>('all')

  const unreadCount = notifications.filter((n) => !n.read).length
  const filtered = filter === 'all' ? notifications
    : filter === 'unread' ? notifications.filter((n) => !n.read)
    : notifications.filter((n) => n.read)

  const filters: { key: Filter; label: string; count?: number }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread', count: unreadCount },
    { key: 'read', label: 'Read' },
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[49px] items-center gap-2 border-b px-4">
        <Bell className="size-5" />
        <h1 className="text-lg font-bold">Notifications</h1>
        {unreadCount > 0 && (
          <>
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              {unreadCount}
            </span>
            <button
              onClick={onMarkAllRead}
              className="ml-auto flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          </>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b px-4 py-2">
        {filters.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filter === key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
          >
            {label}
            {count !== undefined && count > 0 && (
              <span className="ml-1">{count}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {filter === 'unread' ? 'No unread notifications' : filter === 'read' ? 'No read notifications' : 'No notifications yet'}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filtered.map((notif) => (
            <div
              key={notif.id}
              onClick={() => onNotificationClick(notif)}
              className={cn(
                'group flex cursor-pointer items-start gap-3 border-b border-border/50 px-5 py-3 transition-colors hover:bg-muted/50',
                !notif.read && 'bg-primary/5',
              )}
            >
              <div className="mt-1 shrink-0 relative">
                {notif.type === 'agent_reply' ? (
                  <MessageSquare className={cn('size-4', notif.read ? 'text-muted-foreground' : 'text-primary')} />
                ) : (
                  <ListChecks className={cn('size-4', notif.read ? 'text-muted-foreground' : 'text-primary')} />
                )}
                {!notif.read && (
                  <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm', notif.read ? 'text-muted-foreground' : 'font-medium')}>{notif.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{notif.body}</p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  {formatDistanceToNow(notif.timestamp, { addSuffix: true })}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onClearNotification(notif.id) }}
                className="mt-1 shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
              >
                <X className="size-3.5 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
