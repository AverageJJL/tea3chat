"use client";

import { Link, useParams, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";

interface SidebarProps {
  userId: string;
  onNewChat: () => void;
}

export default function Sidebar({ userId, onNewChat }: SidebarProps) {
 const { supabaseThreadId } = useParams<{ supabaseThreadId?: string }>();
  const navigate = useNavigate();

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

  const handleDeleteThread = async (supabaseIdToDelete: string) => {
    const confirmDelete = confirm('Delete this chat?');
    if (!confirmDelete) return;

    // Remove messages for the thread locally
    await db.messages
      .where('thread_supabase_id')
      .equals(supabaseIdToDelete)
      .delete();

    // Remove thread locally using the supabase_id index
    await db.threads
      .where('supabase_id')
      .equals(supabaseIdToDelete)
      .delete();

    // Remove from Supabase
    try {
      await fetch(`/api/sync/thread?supabase_id=${supabaseIdToDelete}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error('Failed to delete thread on Supabase:', err);
    }

    // Navigate away if the deleted thread was open
    if (supabaseThreadId === supabaseIdToDelete) {
      navigate('/chat');
    }
  };

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
              <li key={thread.supabase_id} className="flex items-center justify-between group">
                <Link
                  to={`/chat/${thread.supabase_id}`}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm truncate transition-colors
                    ${supabaseThreadId === thread.supabase_id?.toString()
                      ? "bg-white/20 text-white font-semibold"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  title={thread.title}
                >
                  {thread.title}
                </Link>
                <button
                  type="button"
                  onClick={() => handleDeleteThread(thread.supabase_id!)}
                  className="ml-2 w-6 h-6 flex items-center justify-center rounded-md bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-red-300 transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-red-400/50 opacity-0 group-hover:opacity-100"
                  title="Delete chat"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
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
