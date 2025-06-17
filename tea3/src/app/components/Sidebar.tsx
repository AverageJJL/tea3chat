"use client";

import React, {
  useState,
  useRef,
  useEffect,
  memo,
  useMemo,
  useCallback,
} from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { createPortal } from "react-dom";
import { Thread as ThreadType } from "../db";
import { Branch } from "./Icons";

const getRelativeTimeGroup = (date: Date): string => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffDays = Math.round(
    (todayStart.getTime() - dateOnly.getTime()) / (1000 * 60 * 60 * 24)
  );

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
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16,6 12,2 8,6" />
          <line x1="12" y1="2" x2="12" y2="15" />
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
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
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
          <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c0-1 1-2 2-2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
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
            autoFocus
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof window !== "undefined") {
    return createPortal(modalContent, document.body);
  }
  return null;
};

// --- Memoized ThreadRow (outside Sidebar to avoid recreation) ---
interface ThreadRowProps {
  thread: ThreadType;
  active: boolean;
  isEditing: boolean;
  editingTitle: string;
  onChangeTitle: (v: string) => void;
  onTitleKeyDown: (
    e: React.KeyboardEvent<HTMLInputElement>,
    thread: ThreadType
  ) => void;
  onConfirmRename: (thread: ThreadType) => void;
  onContextMenu: (e: React.MouseEvent, thread: ThreadType) => void;
  setDeletingThread: (t: ThreadType) => void;
  supabaseThreadId: string | undefined;
}

const ThreadRow = memo(
  ({
    thread,
    active,
    isEditing,
    editingTitle,
    onChangeTitle,
    onTitleKeyDown,
    onConfirmRename,
    onContextMenu,
    setDeletingThread,
    supabaseThreadId,
  }: ThreadRowProps) => {
    if (isEditing) {
      return (
        <div key={thread.supabase_id} className="relative group p-1.5">
          <input
            type="text"
            value={editingTitle}
            onChange={(e) => onChangeTitle(e.target.value)}
            onKeyDown={(e) => onTitleKeyDown(e, thread)}
            onBlur={() => onConfirmRename(thread)}
            autoFocus
            className="w-full bg-white/10 text-white border border-white/20 rounded-lg text-sm px-3 py-2.5 focus:outline-none"
          />
        </div>
      );
    }

    return (
      <div
        key={thread.supabase_id}
        className="relative group flex items-center w-full"
        onContextMenu={(e) => onContextMenu(e, thread)}
      >
        <ThreadLink
          threadId={thread.supabase_id!}
          disabled={supabaseThreadId === thread.supabase_id?.toString()}
          className={`flex flex-1 items-center min-w-0 px-3 py-3 rounded-lg text-sm transition-all duration-200 group-hover:max-w-[calc(100%-2.75rem)] ${
            active
              ? "bg-white/10 text-white border border-white/20"
              : "text-white/70 hover:bg-white/5 hover:text-white"
          }`}
          title={thread.title}
        >
          {thread.is_pinned && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-white/70 shrink-0 mr-2"
            >
              <line x1="12" y1="17" x2="12" y2="22"></line>
              <path
                d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"
                fill="currentColor"
              ></path>
            </svg>
          )}
          {thread.forked_from_id && (
            <div
              title="This is a branched chat"
              className="text-white/70 shrink-0 mr-2"
            >
              <Branch />
            </div>
          )}
          <span className="truncate select-none">{thread.title}</span>
        </ThreadLink>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDeletingThread(thread);
          }}
          className="w-0 h-10 opacity-0 group-hover:w-10 group-hover:opacity-100 transition-all duration-200 hover:bg-red-500/20 rounded text-red-400 hover:text-red-300 overflow-hidden shrink-0 ml-0 group-hover:ml-1 flex items-center justify-center"
          title="Delete chat"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c0-1 1-2 2-2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
      </div>
    );
  },
  (prev, next) => {
    // Equality check: re-render only if relevant data changes.
    const threadEqual =
      prev.thread.title === next.thread.title &&
      prev.thread.updatedAt.getTime() === next.thread.updatedAt.getTime() &&
      prev.thread.is_pinned === next.thread.is_pinned;

    return (
      threadEqual &&
      prev.active === next.active &&
      prev.isEditing === next.isEditing &&
      (prev.isEditing ? prev.editingTitle === next.editingTitle : true)
    );
  }
);

// Lightweight replacement for react-router Link that doesn't subscribe to location changes
const ThreadLink = memo(
  ({
    threadId,
    disabled,
    children,
    className,
    title,
  }: {
    threadId: string;
    disabled: boolean;
    children: React.ReactNode;
    className?: string;
    title?: string;
  }) => {
    const navigate = useNavigate();
    const handleClick = (e: React.MouseEvent) => {
      if (disabled) {
        // Stop the native link navigation if this thread is already active
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      navigate(`/chat/${threadId}`);
    };
    return (
      <a
        href={disabled ? undefined : `/chat/${threadId}`}
        onClick={handleClick}
        className={className}
        title={title}
        aria-disabled={disabled}
      >
        {children}
      </a>
    );
  }
);

export default function Sidebar({ userId, onNewChat }: SidebarProps) {
  const { supabaseThreadId } = useParams<{ supabaseThreadId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // Sidebar collapsed / expanded state
  // Default to collapsed on mobile viewports (< 768px)
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [deletingThread, setDeletingThread] =
    useState<(typeof threads)[number] | null>(null);
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

      const pinnedThreads = userThreads.filter((t) => t.is_pinned);
      const unpinnedThreads = userThreads.filter((t) => !t.is_pinned);

      // Sort pinned threads by pinned_at DESC (most recent first)
      pinnedThreads.sort(
        (a, b) => (b.pinned_at?.getTime() || 0) - (a.pinned_at?.getTime() || 0)
      );
      // Sort unpinned threads by updatedAt DESC
      unpinnedThreads.sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      );

      return [...pinnedThreads, ...unpinnedThreads];
    },
    [userId],
    []
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, thread: ThreadType) => {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        threadId: thread.supabase_id!,
        isPinned: !!thread.is_pinned,
      });
    },
    []
  );

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
    const threadToDelete = threads.find(
      (t) => t.supabase_id === contextMenu.threadId
    );
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

    if (supabaseThreadId === supabaseIdToDelete) {
      navigate("/chat");
    }
    // Close the confirmation modal.
    setDeletingThread(null);

    // Remove from Supabase
    fetch(`/api/sync/thread?supabase_id=${supabaseIdToDelete}`, {
      method: "DELETE",
    }).catch((err) => {
      // If the background deletion fails, we log the error.
      // The UI is already updated optimistically. A more robust implementation
      // could involve a sync queue to retry failed operations.
      console.error(
        `Background deletion failed for thread ${supabaseIdToDelete}:`,
        err
      );
    });
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

  const filteredThreads = useMemo(() => {
    return threads.filter((thread) =>
      thread.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [threads, searchQuery]);

  const pinnedThreads = useMemo(
    () => filteredThreads.filter((t) => t.is_pinned),
    [filteredThreads]
  );

  const unpinnedThreads = useMemo(
    () => filteredThreads.filter((t) => !t.is_pinned),
    [filteredThreads]
  );

  const groupedThreads = useMemo(() => {
    return unpinnedThreads.reduce(
      (acc: Record<string, ThreadType[]>, thread) => {
        const group = getRelativeTimeGroup(thread.updatedAt);
        if (!acc[group]) acc[group] = [];
        acc[group].push(thread);
        return acc;
      },
      {}
    );
  }, [unpinnedThreads]);

  // Define the order in which to display the groups.
  const groupOrder = [
    "Today",
    "Yesterday",
    "Last 7 days",
    "Last 30 days",
    "Older",
  ];

  const renderThread = (thread: ThreadType) => (
    <ThreadRow
      key={thread.supabase_id}
      thread={thread}
      active={supabaseThreadId === thread.supabase_id?.toString()}
      isEditing={editingThreadId === thread.supabase_id}
      editingTitle={editingTitle}
      onChangeTitle={setEditingTitle}
      onTitleKeyDown={handleTitleKeyDown}
      onConfirmRename={handleConfirmRename}
      onContextMenu={handleContextMenu}
      setDeletingThread={setDeletingThread}
      supabaseThreadId={supabaseThreadId}
    />
  );

  if (!userId) {
    return (
      <>
        {isCollapsed && (
          <button
            onClick={toggleSidebar}
            className="frosted-button-sidebar fixed top-4 left-4 z-50 flex h-8 w-8 items-center justify-center rounded-lg text-white transition-all duration-300 hover:shadow-lg"
            title="Expand sidebar"
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
              className="rotate-180 transition-transform duration-300"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        <div
          className={`relative flex h-full shrink-0 flex-col border-r border-gray-600/30 bg-gray-700/40 backdrop-blur-xl transition-all duration-300 ease-in-out ${
            isCollapsed ? "w-0" : "w-72"
          }`}
        >
          {!isCollapsed && (
            <div className="flex h-full flex-col">
              <div className="flex h-20 shrink-0 items-center justify-between px-4">
                <button
                  onClick={toggleSidebar}
                  className="frosted-button-sidebar flex h-8 w-8 items-center justify-center rounded-lg text-white transition-all duration-300 hover:shadow-lg"
                  title="Collapse sidebar"
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
                    className="transition-transform duration-300"
                  >
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <h1 className="select-none text-xl font-bold text-white">
                  Tweak3
                </h1>
                <div className="w-8"></div>
              </div>
              <div className="border-b border-gray-600/20 p-6 pt-0">
                <div className="flex w-full items-center justify-center rounded-lg bg-gray-600/30 py-3 px-4">
                  <span className="text-sm text-white/70">Loading...</span>
                </div>
              </div>
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-b-2 border-white/30"></div>
                  <p className="text-sm text-white/60">Loading user...</p>
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
      {isCollapsed && (
        <button
          onClick={toggleSidebar}
          className="frosted-button-sidebar fixed top-4 left-4 z-50 flex h-8 w-8 items-center justify-center rounded-lg text-white transition-all duration-300 hover:shadow-lg"
          title="Expand sidebar"
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
            className="rotate-180 transition-transform duration-300"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}
      <div
        className={`relative flex h-full shrink-0 flex-col border-r border-gray-600/30 bg-gray-700/40 backdrop-blur-xl transition-all duration-300 ease-in-out ${
          isCollapsed ? "w-0" : "w-68"
        }`}
      >
        {!isCollapsed && (
          <div className="flex h-full flex-col">
            <div className="flex h-20 shrink-0 items-center justify-between px-4">
              <button
                onClick={toggleSidebar}
                className="frosted-button-sidebar flex h-8 w-8 items-center justify-center rounded-lg text-white transition-all duration-300 hover:shadow-lg"
                title="Collapse sidebar"
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
                  className="transition-transform duration-300"
                >
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <h1 className="select-none text-xl font-bold text-white">
                Tweak3
              </h1>
              <div className="w-8"></div>
            </div>

            <div className="border-b border-gray-600/20 p-6 pt-0">
              <button
                onClick={onNewChat}
                className="flex w-full transform items-center justify-center space-x-2 rounded-lg bg-white py-3 px-4 font-semibold text-gray-800 shadow-md transition-all duration-300 ease-in-out hover:-translate-y-1 hover:bg-gray-50 hover:shadow-xl"
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

            <div className="relative px-6 py-3">
              <div className="pointer-events-none absolute inset-y-0 left-9 flex items-center">
                <svg
                  className="h-5 w-5 text-gray-400"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <input
                type="text"
                name="search"
                id="search"
                className="block w-full bg-transparent py-2.5 pl-10 pr-3 text-white placeholder-gray-400 transition-all focus:outline-none sm:text-sm"
                placeholder="Search your threads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-hidden px-3 pb-20">
                {filteredThreads.length > 0 ? (
                  <div className="h-full overflow-y-auto overflow-x-hidden pr-3 custom-scrollbar-thin">
                    <div className="space-y-1">
                      {pinnedThreads.length > 0 && (
                        <div className="mb-4">
                          <h2 className="px-3 pt-4 pb-2 text-sm font-medium uppercase tracking-wide text-indigo-400">
                            Pinned
                          </h2>
                          <div className="space-y-1">
                            {pinnedThreads.map(renderThread)}
                          </div>
                        </div>
                      )}

                      {groupOrder.map((group) => {
                        const threadsInGroup = groupedThreads[group];
                        if (!threadsInGroup || threadsInGroup.length === 0)
                          return null;

                        return (
                          <div key={group} className="mb-4">
                            <h2 className="px-3 pt-4 pb-2 text-sm font-medium uppercase tracking-wide text-indigo-400">
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
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="mb-2 text-white/40">
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
                    <p className="text-sm font-medium text-white/60">
                      {searchQuery ? "No matching chats" : "No chats yet"}
                    </p>
                    <p className="mt-1 text-xs text-white/40">
                      {searchQuery
                        ? "Try a different search term"
                        : "Start a conversation to see your chats here"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleSettingsClick}
              className="absolute bottom-4 left-4 right-4 flex items-center justify-center space-x-3 rounded-xl border border-gray-500/30 bg-gray-600/50 py-8 px-6 text-base font-medium text-white shadow-lg backdrop-blur-sm transition-all duration-200 hover:bg-gray-600/70 hover:text-white hover:shadow-xl"
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
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>Settings</span>
            </button>

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