"use client";

import React, { useState, useRef, useEffect } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { createPortal } from "react-dom";

// Add this helper function at the top level
const getRelativeTimeGroup = (date: Date): string => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffDays = Math.round((todayStart.getTime() - dateOnly.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "Today"; // For future-dated items if any
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "Last 7 days";
  if (diffDays <= 30) return "Last 30 days";
  return "Older";
};

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
  onRename,
  onPin,
  isPinned,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onShare: () => void;
  onDelete: () => void;
  onRename: () => void;
  onPin: () => void;
  isPinned: boolean;
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

  const menu = (
    <div
      ref={menuRef}
      className="fixed z-50 w-44 bg-gray-800/95 backdrop-blur-xl border border-gray-700/50 rounded-lg shadow-xl py-1"
      style={{ top: y, left: x }}
    >
      <button
        onClick={onShare}
        className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-white/90 hover:bg-white/10 hover:text-white transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
          <polyline points="16,6 12,2 8,6"/>
          <line x1="12" y1="2" x2="12" y2="15"/>
        </svg>
        <span>Share Chat</span>
      </button>
      
      <button
        onClick={onRename}
        className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-white/90 hover:bg-white/10 hover:text-white transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
          <path d="m15 5 4 4"/>
        </svg>
        <span>Rename</span>
      </button>
      
      <button
        onClick={onPin}
        className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-white/90 hover:bg-white/10 hover:text-white transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="17" x2="12" y2="22"></line>
          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"></path>
        </svg>
        <span>{isPinned ? "Unpin Chat" : "Pin Chat"}</span>
      </button>
      
      <div className="my-1 h-px bg-gray-600/40"></div>
      
      <button
        onClick={onDelete}
        className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c0-1 1-2 2-2v2"/>
          <line x1="10" y1="11" x2="10" y2="17"/>
          <line x1="14" y1="11" x2="14" y2="17"/>
        </svg>
        <span>Delete Chat</span>
      </button>
    </div>
  );

  // Render to body to avoid clipping by ancestor stacking contexts
  if (typeof window !== "undefined") {
    return createPortal(menu, document.body);
  }
  return null;
};

const DeleteConfirmationModal = ({
  threadTitle,
  onConfirm,
  onCancel,
}: {
  threadTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel]);
  
  const modalContent = (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] animate-in fade-in-0 duration-300"
      onMouseDown={onCancel} // Close on clicking overlay
    >
      <div
        className="bg-gray-800/90 border border-gray-700/50 rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4 animate-in fade-in-0 zoom-in-95 duration-200"
        onMouseDown={(e) => e.stopPropagation()} // Prevent closing when clicking inside modal
      >
        <h2 className="text-lg font-bold text-white">Delete Chat</h2>
        <p className="text-white/70 mt-2 text-sm">
          Are you sure you want to delete "
          <span className="font-medium text-white/90">{threadTitle}</span>"?
          This action cannot be undone.
        </p>
        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white/80 hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof window !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return null;
};

export default function Sidebar({ userId, onNewChat }: SidebarProps) {
  const { supabaseThreadId } = useParams<{ supabaseThreadId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // Sidebar collapsed / expanded state
  // Default to collapsed on mobile viewports (< 768px)
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [deletingThread, setDeletingThread] = useState<(typeof threads[number]) | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Detect viewport changes so the sidebar behaves responsively.
  // It collapses automatically on small screens and expands on larger ones
  // while still allowing the user to toggle it manually.
  useEffect(() => {
    const mobileBreakpoint = 768; // Tailwind's `md` breakpoint

    const evaluateCollapse = () => {
      if (typeof window === "undefined") return; // SSR guard
      const shouldCollapse = window.innerWidth < mobileBreakpoint;
      setIsCollapsed((prev) => {
        // Only update if state actually needs to change to avoid extra renders
        if (prev !== shouldCollapse) {
          return shouldCollapse;
        }
        return prev;
      });
    };

    // Set initial state based on current viewport
    evaluateCollapse();

    // Update on resize
    window.addEventListener("resize", evaluateCollapse);
    return () => window.removeEventListener("resize", evaluateCollapse);
  }, []);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    threadId: string;
    isPinned: boolean;
  } | null>(null);

  const threads = useLiveQuery(
    async () => {
      if (!userId) return [];
      const userThreads = await db.threads
        .where("userId")
        .equals(userId)
        .toArray();
      
      const pinnedThreads = userThreads.filter(t => t.is_pinned);
      const unpinnedThreads = userThreads.filter(t => !t.is_pinned);

      // Sort pinned threads by pinned_at DESC (most recent first)
      pinnedThreads.sort((a, b) => (b.pinned_at?.getTime() || 0) - (a.pinned_at?.getTime() || 0));
      // Sort unpinned threads by updatedAt DESC
      unpinnedThreads.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

      return [...pinnedThreads, ...unpinnedThreads];
    },
    [userId],
    [],
  );

  const handleContextMenu = (
    e: React.MouseEvent,
    thread: typeof threads[number]
  ) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      threadId: thread.supabase_id!,
      isPinned: !!thread.is_pinned,
    });
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
    const confirmDelete = confirm("Delete this chat?");
    if (!confirmDelete) return;

    // Remove messages for the thread locally
    await db.messages
      .where("thread_supabase_id")
      .equals(supabaseIdToDelete)
      .delete();

    // Remove thread locally using the supabase_id index
    await db.threads.where("supabase_id").equals(supabaseIdToDelete).delete();

    // Remove from Supabase
    try {
      await fetch(`/api/sync/thread?supabase_id=${supabaseIdToDelete}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Failed to delete thread on Supabase:", err);
    }

    // Navigate away if the deleted thread was open
    if (supabaseThreadId === supabaseIdToDelete) {
      navigate("/chat");
    }
  };

  const handleRenameThread = async () => {
    if (!contextMenu) return;
    const { threadId } = contextMenu;
    const thread = threads.find((t) => t.supabase_id === threadId);
    if (!thread) return;

    const newTitle = prompt("Enter new chat title:", thread.title);
    if (newTitle && newTitle.trim() && newTitle.trim() !== thread.title) {
      const updatedTitle = newTitle.trim();
      const updatedAt = new Date();

      await db.threads.update(thread.id!, { title: updatedTitle, updatedAt });

      // Sync with supabase
      try {
        const threadForSync = await db.threads.get(thread.id!);
        await fetch(`/api/sync/thread`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(threadForSync),
        });
      } catch (err) {
        console.error("Failed to sync thread rename on Supabase:", err);
      }
    }
    setContextMenu(null);
  };

  const handlePinThread = async () => {
    if (!contextMenu) return;
    const { threadId, isPinned } = contextMenu;
    const thread = threads.find((t) => t.supabase_id === threadId);

    if (thread && thread.id) {
      if (!isPinned) {
        // Pinning the thread
        await db.threads.update(thread.id, {
          is_pinned: true,
          pinned_at: new Date(),
        });
      } else {
        // Unpinning the thread
        await db.threads.update(thread.id, {
          is_pinned: false,
          pinned_at: null,
        });
      }
    }
    setContextMenu(null);
  };

  const toggleSidebar = React.useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl+B on Windows/Linux or Cmd+B on macOS
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [toggleSidebar]);

  const handleSettingsClick = () => {
    navigate("/settings", { state: { from: location.pathname } });
  };

  const handleDeleteFromMenu = () => {
    if (!contextMenu) return;
    const threadToDelete = threads.find(t => t.supabase_id === contextMenu.threadId);
    if (threadToDelete) {
      setDeletingThread(threadToDelete);
    }
    setContextMenu(null);
  };

  const handlePinFromMenu = () => {
    if (!contextMenu) return;
    handlePinThread();
    setContextMenu(null);
  };

  const executeDelete = async () => {
    if (!deletingThread) return;
    const supabaseIdToDelete = deletingThread.supabase_id!;

    // Remove messages for the thread locally
    await db.messages
      .where("thread_supabase_id")
      .equals(supabaseIdToDelete)
      .delete();

    // Remove thread locally using the supabase_id index
    await db.threads.where("supabase_id").equals(supabaseIdToDelete).delete();

    // Remove from Supabase
    try {
      await fetch(`/api/sync/thread?supabase_id=${supabaseIdToDelete}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Failed to delete thread on Supabase:", err);
    }

    // Navigate away if the deleted thread was open
    if (supabaseThreadId === supabaseIdToDelete) {
      navigate("/chat");
    }
    setDeletingThread(null);
  };

  const handleStartRename = () => {
    if (!contextMenu) return;
    const thread = threads.find((t) => t.supabase_id === contextMenu.threadId);
    if (thread) {
      setEditingThreadId(thread.supabase_id!);
      setEditingTitle(thread.title);
    }
    setContextMenu(null);
  };

  const handleConfirmRename = async (thread: typeof threads[number]) => {
    if (editingTitle.trim() && editingTitle.trim() !== thread.title) {
      const updatedTitle = editingTitle.trim();
      const updatedAt = new Date();

      await db.threads.update(thread.id!, { title: updatedTitle, updatedAt });

      // Sync with supabase
      try {
        const threadForSync = await db.threads.get(thread.id!);
        await fetch(`/api/sync/thread`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(threadForSync),
        });
      } catch (err) {
        console.error("Failed to sync thread rename on Supabase:", err);
      }
    }
    setEditingThreadId(null);
    setEditingTitle("");
  };

  const handleTitleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    thread: typeof threads[number]
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditingThreadId(null);
      setEditingTitle("");
    }
  };

  const filteredThreads = threads.filter(thread => 
    thread.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pinnedThreads = filteredThreads.filter(t => t.is_pinned);
  const unpinnedThreads = filteredThreads.filter(t => !t.is_pinned);

  const groupedThreads = unpinnedThreads.reduce((acc, thread) => {
    // Group by the relative time using the thread's `updatedAt` field.
    const group = getRelativeTimeGroup(thread.updatedAt);
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push(thread);
    return acc;
  }, {} as Record<string, typeof threads>);

  // Define the order in which to display the groups.
  const groupOrder = ["Today", "Yesterday", "Last 7 days", "Last 30 days", "Older"];

  const renderThread = (thread: typeof threads[number]) => (
    editingThreadId === thread.supabase_id ? (
      <div key={thread.supabase_id} className="relative group p-1.5">
        <input
          type="text"
          value={editingTitle}
          onChange={(e) => setEditingTitle(e.target.value)}
          onKeyDown={(e) => handleTitleKeyDown(e, thread)}
          onBlur={() => handleConfirmRename(thread)}
          autoFocus
          className="w-full bg-white/10 text-white border border-white/20 rounded-lg text-sm px-3 py-2.5 focus:outline-none"
        />
      </div>
    ) : (
      <div
        key={thread.supabase_id}
        className="relative group"
        onContextMenu={(e) => handleContextMenu(e, thread)}
      >
        <Link
          to={`/chat/${thread.supabase_id}`}
          className={`block w-full px-3 py-3 rounded-lg text-sm transition-all duration-200 ${
            supabaseThreadId ===
            thread.supabase_id?.toString()
              ? "bg-white/10 text-white border border-white/20"
              : "text-white/70 hover:bg-white/5 hover:text-white"
          }`}
          title={thread.title}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 truncate pr-2 flex items-center space-x-2">
              {thread.is_pinned && (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="text-white/70 shrink-0"
                >
                  <line
                    x1="12"
                    y1="17"
                    x2="12"
                    y2="22"
                  ></line>
                  <path
                    d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"
                    fill="currentColor"
                  ></path>
                </svg>
              )}
              <span>{thread.title}</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDeletingThread(thread);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 hover:bg-red-500/20 rounded text-red-400 hover:text-red-300"
              title="Delete chat"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c0-1 1-2 2-2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
          </div>
        </Link>
      </div>
    )
  );

  if (!userId) {
    return (
      <>
        {/* Toggle button - positioned fixed when collapsed */}
        <button
          onClick={toggleSidebar}
          className={`glass-button-sidebar w-8 h-8 flex items-center justify-center text-white rounded-lg hover:shadow-lg transition-all duration-300 shrink-0 z-50 ${
            isCollapsed ? "fixed top-8 left-4" : "absolute top-8 left-4"
          }`}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-300 ${
              isCollapsed ? "rotate-180" : ""
            }`}
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div
          className={`sidebar-glass flex flex-col h-full shrink-0 transition-all duration-300 ease-in-out relative ${
            isCollapsed ? "w-0" : "w-80"
          }`}
        >
                  {!isCollapsed && (
          <div className="flex flex-col h-full">
            <div className="p-6 pt-20 border-b border-gray-600/20">
              <div className="w-full bg-gray-600/30 py-3 px-4 rounded-lg flex items-center justify-center">
                <span className="text-white/70 text-sm">Loading...</span>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/30 mx-auto mb-3"></div>
                <p className="text-white/60 text-sm">Loading user...</p>
              </div>
            </div>
          </div>
        )}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Toggle button - positioned fixed when collapsed */}
      <button
        onClick={toggleSidebar}
        className={`glass-button-sidebar w-8 h-8 flex items-center justify-center text-white rounded-lg hover:shadow-lg transition-all duration-300 shrink-0 z-50 ${
          isCollapsed ? "fixed top-12 left-4" : "absolute top-12 left-4"
        }`}
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-300 ${
            isCollapsed ? "rotate-180" : ""
          }`}
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <div
        className={`bg-gray-700/40 backdrop-blur-xl border-r border-gray-600/30 flex flex-col h-full shrink-0 transition-all duration-300 ease-in-out relative ${
          isCollapsed ? "w-0" : "w-80"
        }`}
      >
        {!isCollapsed && (
          <div className="flex flex-col h-full">
            {/* Header section */}
            <div className="p-6 pt-20 border-b border-gray-600/20">
              <button
                onClick={onNewChat}
                className="w-full bg-white hover:bg-gray-100 text-gray-900 font-medium py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center space-x-2 shadow-sm hover:shadow-md"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5v14m-7-7h14" />
                </svg>
                <span>New Chat</span>
              </button>
            </div>
            
            {/* Search Bar */}
            <div className="px-6 py-3 border-b border-gray-600/20">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                  </svg>
                </div>
                <input
                  type="text"
                  name="search"
                  id="search"
                  className="block w-full bg-gray-600/20 backdrop-blur-sm rounded-lg py-2.5 pl-10 pr-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500/50 focus:bg-gray-600/30 transition-all sm:text-sm border border-gray-600/20"
                  placeholder="Search your threads..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Chats section */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 px-3 pb-20 overflow-hidden">
                {filteredThreads.length > 0 ? (
                  <div className="h-full overflow-y-auto custom-scrollbar-thin pr-3">
                    <div className="space-y-1">
                      {/* Pinned Threads */}
                      {pinnedThreads.length > 0 && (
                        <div className="mb-4">
                          <h2 className="px-3 pt-4 pb-2 text-sm font-medium text-white/60 uppercase tracking-wide">
                            Pinned
                          </h2>
                          <div className="space-y-1">
                            {pinnedThreads.map(renderThread)}
                          </div>
                        </div>
                      )}

                      {/* Grouped Unpinned Threads */}
                      {groupOrder.map((group) => {
                        const threadsInGroup = groupedThreads[group];
                        if (!threadsInGroup || threadsInGroup.length === 0)
                          return null;

                        return (
                          <div key={group} className="mb-4">
                            <h2 className="px-3 pt-4 pb-2 text-sm font-medium text-white/60 uppercase tracking-wide">
                              {group}
                            </h2>
                            <div className="space-y-1">
                              {threadsInGroup.map(renderThread)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <div className="text-white/40 mb-2">
                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <p className="text-white/60 text-sm font-medium">
                      {searchQuery ? "No matching chats" : "No chats yet"}
                    </p>
                    <p className="text-white/40 text-xs mt-1">
                      {searchQuery ? "Try a different search term" : "Start a conversation to see your chats here"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Settings button at bottom */}
            <button
              onClick={handleSettingsClick}
              className="absolute bottom-4 left-4 right-4 bg-gray-600/50 hover:bg-gray-600/70 backdrop-blur-sm text-white hover:text-white py-8 px-6 rounded-xl transition-all duration-200 flex items-center justify-center space-x-3 border border-gray-500/30 shadow-lg hover:shadow-xl font-medium text-base"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <span>Settings</span>
            </button>

            {/* Context menu */}
            {contextMenu && (
              <ContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                isPinned={contextMenu.isPinned}
                onClose={() => setContextMenu(null)}
                onShare={handleShareThread}
                onDelete={handleDeleteFromMenu}
                onRename={handleStartRename}
                onPin={handlePinFromMenu}
              />
            )}
            {deletingThread && (
              <DeleteConfirmationModal
                threadTitle={deletingThread.title}
                onConfirm={executeDelete}
                onCancel={() => setDeletingThread(null)}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}