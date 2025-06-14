"use client";

import React, { useState, useRef, useEffect } from "react"; // Import hooks
import { Link, useParams, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";

interface SidebarProps {
  userId: string;
  onNewChat: () => void;
}

const ContextMenu = ({
  x,
  y,
  onClose,
  onShare,
  onDelete,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onShare: () => void;
  onDelete: () => void;
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="absolute z-50 w-48 bg-gray-800 border border-gray-700 rounded-md shadow-lg py-1"
      style={{ top: y, left: x }}
    >
      <button
        onClick={onShare}
        className="block w-full text-left px-4 py-2 text-sm text-white/90 hover:bg-white/10"
      >
        Share Chat
      </button>
      <button
        onClick={onDelete}
        className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/20"
      >
        Delete Chat
      </button>
    </div>
  );
};

export default function Sidebar({ userId, onNewChat }: SidebarProps) {
 const { supabaseThreadId } = useParams<{ supabaseThreadId?: string }>();
  const navigate = useNavigate();

  const [contextMenu, setContextMenu] = useState<{
      x: number;
      y: number;
      threadId: string;
    } | null>(null);

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

  const handleContextMenu = (
    e: React.MouseEvent,
    threadSupabaseId: string,
  ) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, threadId: threadSupabaseId });
  };

  const handleShareThread = async () => {
    if (!contextMenu) return;
    const idToShare = contextMenu.threadId;
    setContextMenu(null); // Close menu

    try {
      // 1. Mark the thread as public on the backend
      const response = await fetch("/api/share/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supabaseThreadId: idToShare }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to make chat public.");
      }

      // 2. Copy the link to the clipboard
      const shareUrl = `${window.location.origin}/share/${idToShare}`;
      await navigator.clipboard.writeText(shareUrl);
      alert("Share link copied to clipboard!"); // Simple feedback
    } catch (error: any) {
      console.error("Failed to share thread:", error);
      alert(`Error: ${error.message}`);
    }
  };

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

  const handleDeleteFromMenu = () => {
    if (!contextMenu) return;
    handleDeleteThread(contextMenu.threadId);
    setContextMenu(null);
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
              <li key={thread.supabase_id} className="relative" onContextMenu={(e) => handleContextMenu(e, thread.supabase_id!)}>
                <div className="flex items-center justify-between group">
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
                </div>
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
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onShare={handleShareThread}
          onDelete={handleDeleteFromMenu}
        />
      )}
    </div>
  );
}
