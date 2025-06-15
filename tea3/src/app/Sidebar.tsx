"use client";

import React, { useState, useRef, useEffect } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { createPortal } from "react-dom";

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

  const menu = (
    <div
      ref={menuRef}
      className="fixed z-50 w-48 bg-gray-800/90 backdrop-blur-xl border border-gray-700/50 rounded-lg shadow-xl py-2"
      style={{ top: y, left: x }}
    >
      <button
        onClick={onShare}
        className="block w-full text-left px-4 py-2.5 text-sm text-white/90 hover:bg-white/10 hover:text-white transition-colors duration-150 flex items-center space-x-2"
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
        onClick={onDelete}
        className="block w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors duration-150 flex items-center space-x-2"
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

export default function Sidebar({ userId, onNewChat }: SidebarProps) {
  const { supabaseThreadId } = useParams<{ supabaseThreadId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

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
    [],
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
    handleDeleteThread(contextMenu.threadId);
    setContextMenu(null);
  };

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
            isCollapsed ? "w-0" : "w-64 md:w-72"
          }`}
        >
                  {!isCollapsed && (
          <div className="flex flex-col h-full">
            <div className="p-6 pt-20 border-b border-gray-700/30">
              <div className="w-full bg-gray-700/50 py-3 px-4 rounded-lg flex items-center justify-center">
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
        className={`bg-gray-800/30 backdrop-blur-xl border-r border-gray-700/50 flex flex-col h-full shrink-0 transition-all duration-300 ease-in-out relative ${
          isCollapsed ? "w-0" : "w-72"
        }`}
      >
        {!isCollapsed && (
          <div className="flex flex-col h-full">
            {/* Header section */}
            <div className="p-6 pt-20 border-b border-gray-700/30">
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

            {/* Chats section */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-6 py-4">
                <h2 className="text-sm font-medium text-white/60 uppercase tracking-wide">
                  Recent Chats
                </h2>
              </div>

              <div className="flex-1 px-3 pb-24 overflow-hidden">
                {threads && threads.length > 0 ? (
                  <div className="h-full overflow-y-auto custom-scrollbar-thin pr-3">
                    <div className="space-y-1">
                      {threads.map((thread) => (
                        <div
                          key={thread.supabase_id}
                          className="relative group"
                          onContextMenu={(e) =>
                            handleContextMenu(e, thread.supabase_id!)
                          }
                        >
                          <Link
                            to={`/chat/${thread.supabase_id}`}
                            className={`block w-full px-3 py-3 rounded-lg text-sm transition-all duration-200 ${
                              supabaseThreadId === thread.supabase_id?.toString()
                                ? "bg-white/10 text-white border border-white/20"
                                : "text-white/70 hover:bg-white/5 hover:text-white"
                            }`}
                            title={thread.title}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 truncate pr-2">
                                {thread.title}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDeleteThread(thread.supabase_id!);
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
                      ))}
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
                    <p className="text-white/60 text-sm font-medium">No chats yet</p>
                    <p className="text-white/40 text-xs mt-1">
                      Start a conversation to see your chats here
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Settings button at bottom */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-gray-800/80 via-gray-800/60 to-transparent backdrop-blur-xl">
              <button
                onClick={handleSettingsClick}
                className="w-full bg-gray-700/70 hover:bg-gray-700/90 text-white hover:text-white py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center space-x-3 border border-gray-600/40 shadow-lg hover:shadow-xl font-medium text-base"
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
            </div>

            {/* Context menu */}
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
        )}
      </div>
    </>
  );
}