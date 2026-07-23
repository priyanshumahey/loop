'use client'

import {
  InboxIcon,
  MailIcon,
  MegaphoneIcon,
  RssIcon,
  SparkleIcon,
  StarIcon,
  UsersIcon,
} from 'lucide-react'

import { AppSidebar } from '@/components/app-sidebar'
import { cn } from '@/lib/utils'

import type { MailFolder } from './utils'

interface MailSidebarProps {
  folder: MailFolder
  onFolderChange: (folder: MailFolder) => void
  unreadCount: number
}

const FOLDERS: {
  key: MailFolder
  label: string
  icon: typeof MailIcon
}[] = [
  { key: 'all', label: 'All mail', icon: InboxIcon },
  { key: 'unread', label: 'Unread', icon: MailIcon },
  { key: 'starred', label: 'Starred', icon: StarIcon },
  { key: 'important', label: 'Important', icon: SparkleIcon },
]

const CATEGORIES: {
  key: MailFolder
  label: string
  icon: typeof MailIcon
}[] = [
  { key: 'primary', label: 'Primary', icon: InboxIcon },
  { key: 'social', label: 'Social', icon: UsersIcon },
  { key: 'promotions', label: 'Promotions', icon: MegaphoneIcon },
  { key: 'updates', label: 'Updates', icon: RssIcon },
]

function FolderRow({
  label,
  icon: Icon,
  active,
  badge,
  onClick,
}: {
  label: string
  icon: typeof MailIcon
  active: boolean
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors',
        active
          ? 'bg-muted font-medium text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge ? (
        <span className="shrink-0 rounded-full bg-brand/15 px-1.5 text-[11px] font-medium text-brand">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

export function MailSidebar({
  folder,
  onFolderChange,
  unreadCount,
}: MailSidebarProps) {
  return (
    <AppSidebar active="mail">
      {/* Folders */}
      <div className="mt-2 flex flex-col gap-0.5">
        {FOLDERS.map(({ key, label, icon }) => (
          <FolderRow
            key={key}
            label={label}
            icon={icon}
            active={folder === key}
            badge={key === 'unread' ? unreadCount : undefined}
            onClick={() => onFolderChange(key)}
          />
        ))}
      </div>

      {/* Categories */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-t border-border/60 pt-3">
        <p className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
          Categories
        </p>
        <div className="flex flex-col gap-0.5">
          {CATEGORIES.map(({ key, label, icon }) => (
            <FolderRow
              key={key}
              label={label}
              icon={icon}
              active={folder === key}
              onClick={() => onFolderChange(key)}
            />
          ))}
        </div>
      </div>
    </AppSidebar>
  )
}
