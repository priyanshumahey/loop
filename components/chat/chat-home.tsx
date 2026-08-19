"use client"

import { CalAgent } from "@/components/cal/cal-agent"
import { ChatSidebar } from "@/components/chat/chat-sidebar"
import { HomeBriefing } from "@/components/chat/home-briefing"
import { useAgentConversations } from "@/hooks/use-agent-conversations"

export function ChatHome({ initialChatId }: { initialChatId?: string }) {
  const store = useAgentConversations({ syncUrl: true, initialChatId })

  return (
    <div className="flex h-svh w-full overflow-hidden bg-muted/40">
      <ChatSidebar
        conversations={store.conversations}
        activeId={store.activeId}
        favoriteIds={store.favoriteIds}
        onNewChat={store.newChat}
        onSelect={store.select}
        onDelete={store.remove}
        onRename={store.rename}
        onToggleFavorite={store.toggleFavorite}
      />
      <main className="min-w-0 flex-1 p-2 pl-0">
        <div className="flex h-full flex-col overflow-hidden rounded-window bg-surface shadow-card">
          <CalAgent
            key={store.activeId}
            conversationId={store.activeId}
            initialMessages={store.activeConversation?.messages}
            onPersist={store.persist}
            onNewChat={store.newChat}
            renderEmptyState={(onAsk) => <HomeBriefing onAsk={onAsk} />}
          />
        </div>
      </main>
    </div>
  )
}

