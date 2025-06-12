"use client";

import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db"; 

interface SidebarProps {
  userId: string;
  onNewChat: () => void;
}

export default function Sidebar({ userId, onNewChat }: SidebarProps) {
  const { threadId: currentThreadIdParam } = useParams<{ threadId?: string }>();

  const threads = useLiveQuery(
    async () => {
      if (!userId) return [];
      const userThreadsSortedAsc = await db.threads
        .where("userId")
        .equals(userId)
        .sortBy("updatedAt"); 
      return userThreadsSortedAsc.reverse(); 
    },
    [userId],
    [] 
  );

  if (!userId) {
    return (
      <div className="sidebar-glass w-72 p-4 space-y-2 flex flex-col h-full shrink-0">
        <p className="text-white/70 text-sm">Loading user...</p>
      </div>
    );
  }

  return (
    <div className="sidebar-glass w-64 md:w-72 p-4 space-y-4 flex flex-col h-full shrink-0">
      <button
        onClick={onNewChat}
        className="glass-button-sidebar w-full px-4 py-3 text-white rounded-xl font-medium hover:shadow-lg transition-all duration-300 mb-2 text-sm"
      >
        + New Chat
      </button>
      <h2 className="text-base font-semibold text-white/90 px-1">Chats</h2>
      {threads && threads.length > 0 ? (
        <nav className="flex-grow overflow-y-auto custom-scrollbar-thin pr-1">
          <ul className="space-y-1">
            {threads.map((thread) => (
              <li key={thread.id}>
                <Link
                  to={`/chat/${thread.id}`}
                  className={`block px-3 py-2 rounded-lg text-sm truncate transition-colors
                    ${currentThreadIdParam === thread.id?.toString()
                      ? "bg-white/20 text-white font-semibold"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  title={thread.title} 
                >
                  {thread.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <div className="text-white/60 text-sm flex-grow flex flex-col items-center justify-center text-center px-2">
          <p>No chats yet.</p>
          <p className="text-xs mt-1">Click "+ New Chat" to start.</p>
        </div>
      )}
    </div>
  );
}
