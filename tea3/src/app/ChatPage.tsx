"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { useUser, UserButton } from "@clerk/nextjs";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Thread, Message, MessageAttachment, UserPreferences } from "./db"; // Ensure UserPreferences is imported
import { uploadFileToSupabaseStorage } from "./supabaseStorage";
import { v4 as uuidv4 } from "uuid";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Branch,
  XSquare,
  Loader2,
  Pencil,
  Recycle,
  Paperclip,
  SendHorizonal,
} from "./components/Icons";
import "./liquid-glass.css";
import "./md-renderer.css";
import LiquidGlass from "./components/LiquidGlass";

// --- SYNC SERVICE TYPES AND FUNCTIONS ---

interface FullThreadSyncPayload {
  threadData: Thread;
  messagesData: Message[];
  attachmentsData: {
    localMessageId: number;
    file_name: string;
    file_url: string;
  }[];
}

interface SupabaseAttachment {
  id: string;
  messageId: string;
  clerk_user_id: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
}

interface SupabaseMessage {
  id: string;
  shared_id: string; // this may be the shared_id which is the universal ID
  clerk_user_id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  created_at: string;
  attachments: SupabaseAttachment[];
}

interface SupabaseThread {
  id: string;
  shared_id: string; // this is the universal ID used across both Dexie and Supabase
  dexie_id: number | null;
  clerk_user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: SupabaseMessage[];
}

async function syncEditOperationToBackend(payload: {
  threadSupabaseId: string;
  messagesToUpsert: Message[];
  idsToDelete: string[];
}): Promise<any> {
  try {
    // --- Safeguard against missing supabase_id ---
    // Ensure every message being upserted has a valid UUID.
    const sanitizedMessages = payload.messagesToUpsert.map((msg) => {
      if (!msg.supabase_id) {
        console.warn(
          "Found message without supabase_id during sync, generating new one.",
          msg
        );
        return { ...msg, supabase_id: uuidv4() };
      }
      return msg;
    });

    const response = await fetch("/api/sync/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Send the new, more detailed payload with sanitized messages
      body: JSON.stringify({
        ...payload,
        messagesToUpsert: sanitizedMessages,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || `Failed to sync edit: ${response.statusText}`
      );
    }

    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error("Failed to sync edit operation to backend:", error);
    throw error;
  }
}

async function syncFullThreadToBackend(
  payload: FullThreadSyncPayload
): Promise<any> {
  try {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || `Failed to sync full thread: ${response.statusText}`
      );
    }
    const result = await response.json();

    if (result.success && result.data) {
      const syncedSupabaseThread = result.data.thread; // Assuming this is the structure from your backend
      const syncedSupabaseMessages = result.data.messages;

      // Update local thread with Supabase confirmed shared_id
      // Ensure your backend returns the thread object with a 'shared_id' property
      if (
        syncedSupabaseThread &&
        syncedSupabaseThread.shared_id &&
        payload.threadData.id
      ) {
        await db.threads.update(payload.threadData.id, {
          supabase_id: syncedSupabaseThread.shared_id,
        });
      }

      if (syncedSupabaseMessages && Array.isArray(syncedSupabaseMessages)) {
        for (const syncedMsg of syncedSupabaseMessages) {
          if (syncedMsg.dexie_id && syncedMsg.id) {
            // Assumes backend POST response returns dexie_id for messages
            await db.messages.update(syncedMsg.dexie_id, {
              supabase_id: syncedMsg.shared_id,
            });
            // TODO: Update attachments in Dexie with their supabase_ids if needed
          }
        }
      }
    }
    return result.data;
  } catch (error) {
    console.error("Failed to sync full thread to backend:", error);
    throw error;
  }
}

async function fetchAndStoreCloudData() {
  if (!db.isOpen()) {
    try {
      await db.open();
    } catch (e) {
      console.error("Failed to open Dexie DB:", e);
      return;
    }
  }
  try {
    const response = await fetch("/api/sync");
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || `Failed to fetch data: ${response.statusText}`
      );
    }
    const cloudFetchResult = await response.json();

    if (cloudFetchResult.success && cloudFetchResult.data) {
      const supabaseThreads: SupabaseThread[] = cloudFetchResult.data;

      await db.transaction("rw", db.threads, db.messages, async () => {
        for (const remoteThread of supabaseThreads) {
          const threadSupabaseId = remoteThread.shared_id;

          const threadPayloadToStore: Omit<Thread, "id"> = {
            supabase_id: threadSupabaseId,
            userId: remoteThread.clerk_user_id,
            title: remoteThread.title,
            createdAt: new Date(remoteThread.created_at),
            updatedAt: new Date(remoteThread.updated_at),
          };

          await db.threads.put(threadPayloadToStore);

          for (const remoteMessage of remoteThread.messages) {
            const messageSupabaseId = (remoteMessage as any).shared_id;
            if (!messageSupabaseId) continue;

            const localMessagePayload: Message = {
              supabase_id: messageSupabaseId,
              thread_supabase_id: threadSupabaseId, // Link using the universal ID
              role: remoteMessage.role,
              content: remoteMessage.content,
              attachments: remoteMessage.attachments.map((att) => ({
                supabase_id: att.id,
                file_name: att.file_name,
                file_url: att.file_url,
              })),
              createdAt: new Date(remoteMessage.created_at),
              model: remoteMessage.model,
            };

            await db.messages.put(localMessagePayload);
          }
        }
      });
    } else if (!cloudFetchResult.success) {
      console.error("Cloud sync failed:", cloudFetchResult.error);
    }
  } catch (error) {
    // console.error("Failed to fetch or store cloud data:", error);
  }
}

async function syncThreadWithAttachments(supabaseThreadId: string) {
  const threadData = await db.threads
    .where("supabase_id")
    .equals(supabaseThreadId)
    .first();

  if (!threadData) {
    console.error(
      `Sync failed: Could not find thread with supabase_id ${supabaseThreadId}`
    );
    return;
  }

  const messagesData = await db.messages
    .where("thread_supabase_id")
    .equals(supabaseThreadId)
    .toArray();

  // Create the payload for attachments by iterating through the messages
  const attachmentsData: {
    localMessageId: number;
    file_name: string;
    file_url: string;
  }[] = [];
  for (const msg of messagesData) {
    if (msg.id && msg.attachments) {
      for (const att of msg.attachments) {
        // Ensure we have the necessary data before pushing
        if (att.file_name && att.file_url) {
          attachmentsData.push({
            localMessageId: msg.id,
            file_name: att.file_name,
            file_url: att.file_url,
          });
        }
      }
    }
  }

  try {
    // Call the sync function with the complete payload
    await syncFullThreadToBackend({
      threadData,
      messagesData,
      attachmentsData, // Pass the correctly populated array
    });
  } catch (syncError) {
    console.error(`Sync failed for thread ${supabaseThreadId}:`, syncError);
  }
}

interface ChatPageContext {
  availableModels: {
    value: string;
    displayName: string;
    supportsImages?: boolean;
  }[];
  selectedModel: string;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  isLoadingModels: boolean;
  modelsError: string | null;
}

// After the SVG icon definitions and before helper/service code, add memoized MessageRow component
const MessageRow = React.memo(
  function MessageRow({
    message,
    availableModels,
    onEdit,
    onRegenerate,
    onBranch,
    isGenerating,
  }:{
    message: Message;
    availableModels: { value: string; displayName: string }[];
    onEdit: (m: Message) => void;
    onRegenerate: (m: Message) => void;
    onBranch: (m: Message) => void;
    isGenerating?: boolean;
  }) {
    // No hover state; CSS handles visibility via group-hover

    // Callbacks are stable via useCallback
    const handleCopy = React.useCallback(() => {
      navigator.clipboard
        .writeText(message.content)
        .then(() => {
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        })
        .catch((err) => console.error("Failed to copy", err));
    }, [message.content]);

    // Determine role
    const isAssistant = message.role === "assistant";

    // Create a custom code component to handle syntax highlighting
    const CodeBlock = React.useCallback(
      ({ inline, className, children, ...rest }: any) => {
        const [codeIsCopied, setCodeIsCopied] = React.useState(false);
        const match = /language-(\w+)/.exec(className || "");

        const handleCodeCopy = React.useCallback(async () => {
          try {
            await navigator.clipboard.writeText(String(children));
            setCodeIsCopied(true);
            setTimeout(() => setCodeIsCopied(false), 2000);
          } catch (err) {
            console.error("Failed to copy code:", err);
          }
        }, [children]);

        return !inline && match ? (
          <div className="code-block-container group">
            <div className="code-block-header">
              <span className="code-block-language">{match[1]}</span>
              <button
                onClick={handleCodeCopy}
                className="code-block-copy-btn"
                title={codeIsCopied ? "Copied!" : "Copy code"}
              >
                {codeIsCopied ? (
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
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
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
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>
            <div className="code-block-content">
              <SyntaxHighlighter
                style={vscDarkPlus as any}
                language={match[1]}
                PreTag="div"
                showLineNumbers={false}
                wrapLines={false}
                customStyle={{
                  margin: 0,
                  padding: "20px 24px",
                  background: "transparent",
                  fontSize: "15px",
                  lineHeight: "1.8",
                  letterSpacing: "0.025em",
                }}
                {...(rest as any)}
              >
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            </div>
          </div>
        ) : (
          <code className={className} {...(rest as any)}>
            {children}
          </code>
        );
      },
      []
    );

    // Memoise heavy Markdown render
    const markdownBody = React.useMemo(() => {
      if (!isAssistant) return null;

      if (isGenerating && !message.content) {
        return (
          <div className="flex items-center space-x-3 text-white/70">
            <Loader2 className="animate-spin text-white/50" />
          </div>
        );
      }

      return (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex, rehypeRaw]}
          components={{
            code: CodeBlock,
            table: ({ node, ...props }) => (
              <div className="table-wrapper">
                <table {...props} />
              </div>
            ),
          }}
        >
          {message.content}
        </ReactMarkdown>
      );
    }, [isAssistant, message.content, CodeBlock]);

    const [isCopied, setIsCopied] = React.useState(false);

    return (
      <div
        className={`group flex ${
          message.role === "user" ? "justify-end" : "justify-start"
        } mb-12`}
      >
        {isAssistant ? (
          <div className="max-w-4xl w-full relative pb-8">
            {/* Header: model name + timestamp */}
            <div className="flex items-center mb-3">
              <div className="flex items-center space-x-2">
                <div className="text-white/80 text-sm font-medium">
                  {availableModels.find((am) => am.value === message.model)
                    ?.displayName || message.model}
                </div>
                <div className="text-white/40 text-xs">
                  {new Date(message.createdAt).toLocaleTimeString()}
                </div>
              </div>
            </div>
            {/* Markdown body */}
            <div className="obsidian-theme max-w-none">{markdownBody}</div>
            {/* Action buttons; visible on hover via CSS */}
            <div className="absolute bottom-0 left-0 flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={handleCopy}
                className={`p-1.5 rounded-md transition-all ${
                  isCopied
                    ? "text-green-400 bg-green-500/20"
                    : "text-white/50 hover:text-white/80 hover:bg-white/10"
                }`}
              >
                {isCopied ? (
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
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
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
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={() => onRegenerate(message)}
                className="p-1.5 text-white/50 hover:text-white/80 hover:bg-white/10 rounded-md transition-colors"
              >
                <Recycle />
              </button>
              <button
                type="button"
                onClick={() => onBranch(message)}
                className="p-1.5 text-white/50 hover:text-white/80 hover:bg-white/10 rounded-md transition-colors"
                title="Branch from this point"
              >
                <Branch />
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl relative pb-8">
            <div className="frosted-glass rounded-2xl px-6 py-4 shadow-lg">
              {message.attachments && message.attachments.length > 0 && (
                <div className="mb-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {message.attachments.map((att, index) => (
                    <div key={index} className="relative group">
                      {att.mime_type?.startsWith("image/") ? (
                        <a
                          href={att.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={att.file_url}
                            alt={att.file_name}
                            className="w-full h-24 object-cover rounded-lg cursor-pointer"
                          />
                        </a>
                      ) : (
                        <a
                          href={att.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full h-24 bg-gray-700/50 rounded-lg flex flex-col items-center justify-center p-2 text-center hover:bg-gray-600/50 transition-colors"
                        >
                          <Paperclip />
                          <span className="text-gray-300 text-xs font-medium truncate w-full mt-2">
                            {att.file_name}
                          </span>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Only render the content paragraph if there is content */}
              {message.content && (
                <div className="text-white/90 leading-relaxed text-lg">
                  <p style={{ whiteSpace: "pre-wrap" }}>{message.content}</p>
                </div>
              )}
            </div>
            {/* User message buttons */}
            <div className="absolute bottom-0 right-0 flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={handleCopy}
                className={`p-1.5 rounded-md transition-all ${
                  isCopied
                    ? "text-green-400 bg-green-500/20"
                    : "text-white/50 hover:text-white/80 hover:bg-white/10"
                }`}
              >
                {isCopied ? (
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
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
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
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={() => onEdit(message)}
                className="p-1.5 text-white/50 hover:text-white/80 hover:bg-white/10 rounded-md transition-colors"
              >
                <Pencil />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.message.content === next.message.content &&
    prev.message.attachments?.length === next.message.attachments?.length &&
    prev.message.model === next.message.model &&
    prev.isGenerating === next.isGenerating &&
    prev.onRegenerate === next.onRegenerate &&
    prev.onEdit === next.onEdit &&
    prev.onBranch === next.onBranch
);

// -------------------------
// Memoized list of messages
export default function ChatPage() {
  const { supabaseThreadId } = useParams<{ supabaseThreadId?: string }>();
  const navigate = useNavigate();
  const { user, isLoaded: isUserLoaded } = useUser();
  const {
    availableModels,
    selectedModel,
    setSelectedModel,
    isLoadingModels,
    modelsError,
  } = useOutletContext<ChatPageContext>();

  const userPreferences = useLiveQuery(
    () => {
      if (!user) return undefined;
      return db.userPreferences.where({ userId: user.id }).first();
    },
    [user?.id]
  );

  const currentThread = useLiveQuery(
    () => {
      if (!supabaseThreadId) return undefined;
      return db.threads.where({ supabase_id: supabaseThreadId }).first();
    },
    [supabaseThreadId]
  );

  const [error, setError] = useState<string | null>(null);
  const [isErrorFading, setIsErrorFading] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isResuming, setIsResuming] = useState<boolean>(false);
  const [input, setInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [attachedPreviews, setAttachedPreviews] = useState<string[]>([]);
  // Add drag and drop state
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  // Add edit message state
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [generatingMessageId, setGeneratingMessageId] = useState<number | null>(null);
  // Add scroll to bottom button state
  const [showScrollButton, setShowScrollButton] = useState<boolean>(false);
  // Add web search state
  const [useWebSearch, setUseWebSearch] = useState<boolean>(false);
  // Add state for textarea expansion
  const [isTextareaExpanded, setIsTextareaExpanded] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const glassRef = useRef<HTMLDivElement | null>(null); // Add this line
  // Throttle scroll handler using rAF
  const scrollRafRef = useRef<number | null>(null);
  // Store the default (collapsed) scrollHeight to avoid recalculating every keystroke
  const baseTextareaHeightRef = useRef<number>(0);
  const isSendingRef = useRef(isSending);
  useEffect(() => {
    isSendingRef.current = isSending;
  }, [isSending]);

  const isSubmittingRef = useRef(false);
  // Ref to manage aborting ongoing fetch/stream requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Handler to stop the current generation stream
  const handleStopGeneration = React.useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    // Optimistically reset UI state; final cleanup happens in catch/finally blocks
    setIsSending(false);
  }, []);

  const handleWebSearchToggle = () => {
    setUseWebSearch(!useWebSearch);
  };

  // Auto-clear error after 3 seconds
  useEffect(() => {
    if (error) {
      // reset fade state immediately when a new error appears
      setIsErrorFading(false);

      // first trigger fade after 2.5s
      const fadeTimer = setTimeout(() => {
        setIsErrorFading(true);
      }, 2500);

      const timer = setTimeout(() => {
        setError(null);
      }, 3000);
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(timer);
      };
    }
  }, [error]);

  useEffect(() => {
    if (modelsError) {
      setError(modelsError);
    }
  }, [modelsError]);

  // Helper function to check if current model supports web search
  const currentModelSupportsWebSearch = () => {
    return selectedModel === "gemini-2.5-flash";
  };

  // Reset web search when switching to a model that doesn't support it
  React.useEffect(() => {
    if (!currentModelSupportsWebSearch() && useWebSearch) {
      setUseWebSearch(false);
    }
  }, [selectedModel, useWebSearch]);

  // Establish the baseline (collapsed) height once after mount
  React.useEffect(() => {
    if (textareaRef.current) {
      // After the first render the textarea has 2 rows (collapsed)
      baseTextareaHeightRef.current = textareaRef.current.scrollHeight;
    }
  }, []);

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to allow the textarea to shrink when text is deleted
      textarea.style.height = "auto";
      // Set the height to its scroll height to fit the content perfectly
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [input]);

  // --- DATA FETCHING & SYNC ---
  const messages = useLiveQuery(
    () => {
      if (!supabaseThreadId) return [];
      return db.messages
        .where("thread_supabase_id")
        .equals(supabaseThreadId)
        .sortBy("createdAt");
    },
    [supabaseThreadId]
  );

  useEffect(() => {
    if (user && isUserLoaded) {
      fetchAndStoreCloudData();
    }
  }, [user, isUserLoaded]);

  // Smart autoscroll - only scroll if user is within 200px of bottom
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || !messagesEndRef.current) return;

    // Check if user is within 200px of the bottom
    const scrollTop = scrollContainer.scrollTop;
    const scrollHeight = scrollContainer.scrollHeight;
    const clientHeight = scrollContainer.clientHeight;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // Only autoscroll if user is within 200px of the bottom
    if (distanceFromBottom <= 200) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Handle scroll events to control visibility of the "scroll to bottom" button
  const handleScroll = React.useCallback(() => {
    if (scrollRafRef.current !== null) return; // already scheduled
    scrollRafRef.current = requestAnimationFrame(() => {
      const scrollContainer = scrollContainerRef.current;
      if (scrollContainer) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        const isScrollable = scrollHeight > clientHeight;
        setShowScrollButton(distanceFromBottom > 200 && isScrollable);
      }
      scrollRafRef.current = null;
    });
  }, []);

  // Re-check button visibility whenever the messages array changes (e.g. new streaming chunks)
  useEffect(() => {
    const id = setTimeout(handleScroll, 50); // delay to allow DOM paint
    return () => clearTimeout(id);
  }, [messages, handleScroll]);

  // Function to scroll to bottom smoothly
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Prevent default drag behavior on the entire window
  useEffect(() => {
    const preventDefault = (e: DragEvent) => {
      e.preventDefault();
    };

    window.addEventListener("dragover", preventDefault);
    window.addEventListener("drop", preventDefault);

    return () => {
      window.removeEventListener("dragover", preventDefault);
      window.removeEventListener("drop", preventDefault);
    };
  }, []);

  useEffect(() => {
    if (userPreferences?.disableResumableStream) return;
    const resumeStream = async (assistantMessageId: string) => {
      const timestamp = new Date().toLocaleTimeString();
      console.log(
        `[${timestamp}] [FE] Starting resumeStream for ID: ${assistantMessageId}`
      );
      setIsResuming(true);
      setIsSending(true); // Block user input

      const messageToResume = await db.messages
        .where("supabase_id")
        .equals(assistantMessageId)
        .first();

      if (!messageToResume || !messageToResume.id) {
        console.error(
          `[${timestamp}] [FE] Could not find message ${assistantMessageId} in Dexie to resume.`
        );
        sessionStorage.removeItem("inFlightAssistantMessageId");
        setIsResuming(false);
        setIsSending(false);
        return;
      }

      const cleanup = (sync: boolean = false) => {
        const cleanupTimestamp = new Date().toLocaleTimeString();
        console.log(
          `[${cleanupTimestamp}] [FE] Cleaning up resume process for ${assistantMessageId}. Sync: ${sync}`
        );
        isCancelled = true; // Stop the while loop
        sessionStorage.removeItem("inFlightAssistantMessageId");
        setIsResuming(false);
        setIsSending(false);
        if (sync && messageToResume.thread_supabase_id) {
          console.log(
            `[${cleanupTimestamp}] [FE] Resumption complete, performing final sync.`
          );
          syncThreadWithAttachments(messageToResume.thread_supabase_id);
        }
      };

      let isCancelled = false;
      const pollInterval = 2000;
      let lastContentLength = -1;
      let stablePolls = 0;

      // Polling loop is now directly part of resumeStream
      (async () => {
        while (!isCancelled) {
          try {
            const response = await fetch(
              `/api/chat/resume?id=${assistantMessageId}`
            );
            if (!response.ok) throw new Error("Resume API request failed");
            const data = await response.json(); // data is now { status, content } or { status: 'expired' }

            if (data.content) {
              await db.messages.update(messageToResume.id!, {
                content: data.content,
              });
            }

            if (data.status === "complete" || data.status === "expired") {
              console.log(
                `[FE] Received final status: "${data.status}". Finalizing.`
              );
              cleanup(true); // Final update is done, now cleanup and sync.
              break; // Exit the polling loop
            }

            // If still streaming, wait and poll again
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
          } catch (error) {
            console.error(`[FE] Error during poll:`, error);
            cleanup(false); // Cleanup without sync on error
            break;
          }
        }
      })();
    };

    const inFlightId = sessionStorage.getItem("inFlightAssistantMessageId");

    if (inFlightId && !isSubmittingRef.current) {
      resumeStream(inFlightId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPreferences?.disableResumableStream]);

  // Simple title generation fallback
  async function generateTitleFromPrompt(
    prompt: string,
    maxLength: number
  ): Promise<string | null> {
    return prompt ? prompt.slice(0, maxLength) : "New Chat";
  }

  // --- ACTIONS ---
  // Creation of a brand-new chat is now handled by the persistent AppShell/Sidebar.

  const buildHistoryForAI = (
    msgs: Message[],
    modelSupportsImagesFlag: boolean
  ) => {
    // 1) Build the normal user / assistant history first
    const transformedHistory = msgs.map((m) => {
      if (m.attachments && m.attachments.length > 0) {
        if (modelSupportsImagesFlag) {
          const contentArray: any[] = [];
          if (m.content && m.content.trim()) {
            contentArray.push({ type: "text", text: m.content });
          }

          m.attachments.forEach((attachment) => {
            const url = attachment.file_url;
            const mimeType = attachment.mime_type;

            // Basic check for image types for image_url, otherwise treat as generic file_url
            if (mimeType?.startsWith("image/")) {
              contentArray.push({ type: "image_url", image_url: { url } });
            } else {
              contentArray.push({
                type: "file_url",
                file_url: {
                  url,
                  mime_type: mimeType,
                  file_name: attachment.file_name,
                },
              });
            }
          });

          return { role: m.role, content: contentArray };
        }
      }
      return { role: m.role, content: m.content };
    });

    // The system prompt is now handled by the backend in api/chat/route.ts
    return transformedHistory;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (
      (!input.trim() && attachedFiles.length === 0) ||
      isSending ||
      !user ||
      !user.id
    ) {
      return;
    }

    const modelForResponse = selectedModel;

    const currentModelSpec = availableModels.find(
      (m) => m.value === selectedModel
    );
    const modelSupportsImages = currentModelSpec?.supportsImages || false;
    if (attachedFiles.length > 0 && !modelSupportsImages) {
      setError("Attachments are not supported by the selected model.");
      return;
    }

    setError(null);
    setIsSending(true);

    // --- Block 1: Handle Message Editing ---
    if (editingMessage && editingMessage.id) {
      let assistantMessageToUpdate: Message | null = null;
      let assistantLocalMessageId: number | null = null;
      const idsToDelete: string[] = [];
      try {
        // Get the universal thread ID from the message being edited.
        const threadId = editingMessage.thread_supabase_id;

        // Update the existing message content in Dexie.
        const updateData: Partial<Message> = { content: input };
        // Ensure the message has a supabase_id for proper sync
        if (!editingMessage.supabase_id) {
          updateData.supabase_id = uuidv4();
        }
        await db.messages.update(editingMessage.id, updateData);

        const allMessagesInThread = await db.messages
          .where("thread_supabase_id")
          .equals(threadId)
          .sortBy("createdAt");

        const editedMessageIndex = allMessagesInThread.findIndex(
          (m) => m.id === editingMessage.id
        );

        // The entire block of logic that depends on finding the message
        // index is now correctly wrapped in curly braces.
        if (editedMessageIndex !== -1) {
          if (
            allMessagesInThread.length > editedMessageIndex + 1 &&
            allMessagesInThread[editedMessageIndex + 1].role === "assistant"
          ) {
            assistantMessageToUpdate =
              allMessagesInThread[editedMessageIndex + 1];
          }

          const startIndexToDelete = assistantMessageToUpdate
            ? editedMessageIndex + 2
            : editedMessageIndex + 1;
          const messagesToDelete = allMessagesInThread.slice(
            startIndexToDelete
          );

          for (const msgToDelete of messagesToDelete) {
            if (msgToDelete.id) {
              if (msgToDelete.supabase_id) {
                idsToDelete.push(msgToDelete.supabase_id);
              }
              await db.messages.delete(msgToDelete.id);
            }
          }

          // Get history up to and including the *newly updated* message.
          const historyUpToEdit = allMessagesInThread.slice(
            0,
            editedMessageIndex + 1
          );
          const historyForAI = buildHistoryForAI(
            historyUpToEdit,
            modelSupportsImages
          );

          if (assistantMessageToUpdate && assistantMessageToUpdate.id) {
            // It exists, so clear its content to act as a placeholder.
            // It keeps its original `id` and `supabase_id`.
            await db.messages.update(assistantMessageToUpdate.id, {
              content: "",
              model: modelForResponse, // Also update the model used
            });
          } else {
            // Create a new placeholder for the assistant's response.
            const assistantMessageData: Message = {
              supabase_id: uuidv4(),
              thread_supabase_id: threadId,
              role: "assistant",
              content: "",
              createdAt: new Date(),
              model: modelForResponse,
            };
            assistantMessageToUpdate = await db.messages.add(
              assistantMessageData
            );
          }

          // This is critical: ensure we have a valid message to update.
          if (!assistantMessageToUpdate || !assistantMessageToUpdate.id) {
            throw new Error("Failed to prepare assistant message for update.");
          }
          assistantLocalMessageId = assistantMessageToUpdate.id;

          // Clear the editing state before the API call.
          setEditingMessage(null);
          setInput("");
          setAttachedFiles([]);
          setAttachedPreviews([]);
          if (fileInputRef.current) fileInputRef.current.value = "";

          // Create AbortController for this request
          const editController = new AbortController();
          abortControllerRef.current = editController;
          const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: modelForResponse,
              messages: historyForAI,
              useWebSearch: useWebSearch && currentModelSupportsWebSearch(),
              assistantMessageId: assistantMessageToUpdate.supabase_id,
              userPreferences: userPreferences,
            }),
            signal: editController.signal,
          });

          if (!response.body || !response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "API error during regeneration");
          }

          // Stream the new response into the placeholder message.
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullResponse = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            chunk.split("\n").forEach((line) => {
              if (line.startsWith("0:")) {
                try {
                  fullResponse += JSON.parse(line.substring(2));
                  db.messages.update(assistantLocalMessageId!, {
                    content: fullResponse,
                  });
                } catch (e) {
                  console.warn("Failed to parse stream line", line, e);
                }
              }
            });
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          console.log("Generation aborted by user (edit flow).");
        } else {
          console.error("Failed to update message:", err);
          setError(err.message || "Failed to update message.");
        }
      } finally {
        setIsSending(false);
        abortControllerRef.current = null;
        // Always sync the thread after an edit operation completes or fails.
        if (editingMessage?.thread_supabase_id) {
          const finalThreadData = await db.threads
            .where("supabase_id")
            .equals(editingMessage.thread_supabase_id)
            .first();

          if (finalThreadData) {
            try {
              // Get the edited user message and the new assistant message
              const editedUserMessage = await db.messages.get(
                editingMessage.id
              );
              const newAssistantMessage = assistantLocalMessageId
                ? await db.messages.get(assistantLocalMessageId)
                : null;

              const updatedAssistantMessage = assistantMessageToUpdate?.id
                ? await db.messages.get(assistantMessageToUpdate.id)
                : null;

              const messagesToUpsert = [];
              if (editedUserMessage) messagesToUpsert.push(editedUserMessage);
              if (updatedAssistantMessage)
                messagesToUpsert.push(updatedAssistantMessage);
              await syncEditOperationToBackend({
                threadSupabaseId: editingMessage.thread_supabase_id,
                messagesToUpsert,
                idsToDelete: idsToDelete,
              });
            } catch (syncError) {
              console.error(
                "Failed to sync edited messages to Supabase:",
                syncError
              );
              setError(
                "Messages updated but failed to sync to cloud. Your changes are saved locally."
              );
            }
          }
        }
      }
      return;
    }

    isSubmittingRef.current = true;

    // --- Block 2: Handle New Message Submission ---
    let currentSupabaseThreadId = supabaseThreadId;
    let assistantLocalMessageId: number | null = null;
    let assistantMessageSupabaseId: string | null = null;

    try {
      // If there's no thread ID in the URL, it's the first message of a new chat.
      if (!currentSupabaseThreadId) {
        const newThreadSupabaseId = uuidv4();
        const title = (await generateTitleFromPrompt(input, 50)) || "New Chat";
        const newThreadData: Thread = {
          supabase_id: newThreadSupabaseId,
          userId: user.id,
          title: title,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await db.threads.put(newThreadData);

        await syncFullThreadToBackend({
          threadData: newThreadData,
          messagesData: [],
          attachmentsData: [],
        });

        currentSupabaseThreadId = newThreadSupabaseId;
        navigate(`/chat/${newThreadSupabaseId}`, { replace: true });
      } else {
        // For an existing thread, always update the `updatedAt` timestamp.
        const modifications: Partial<Thread> = { updatedAt: new Date() };

        // If it's the first message in an existing but empty thread, also update the title.
        const messagesInThread = await db.messages
          .where("thread_supabase_id")
          .equals(currentSupabaseThreadId)
          .count();
        if (messagesInThread === 0) {
          modifications.title =
            (await generateTitleFromPrompt(input, 50)) || "New Chat";
        }

        await db.threads
          .where({ supabase_id: currentSupabaseThreadId })
          .modify(modifications);
      }

      // File Upload Logic
      let attachmentsForDb: MessageAttachment[] = [];
      if (attachedFiles.length > 0) {
        const uploadPromises = attachedFiles.map((file) =>
          uploadFileToSupabaseStorage(file)
        );
        const uploadResults = await Promise.all(uploadPromises);

        for (const result of uploadResults) {
          if (
            result.error ||
            !result.supabaseUrl ||
            !result.fileName ||
            !result.mimeType
          ) {
            throw new Error(`Supabase upload failed: ${result.error}`);
          }
          attachmentsForDb.push({
            file_name: result.fileName,
            file_url: result.supabaseUrl,
            mime_type: result.mimeType,
          });
        }
      }

      // Create User Message in Dexie
      const currentInput = input; // Capture input before clearing it.
      const userMessageData: Message = {
        supabase_id: uuidv4(),
        thread_supabase_id: currentSupabaseThreadId,
        role: "user",
        content: currentInput,
        attachments: attachmentsForDb,
        createdAt: new Date(),
        model: selectedModel,
      };
      await db.messages.add(userMessageData);

      // Create Assistant Placeholder Message in Dexie
      const assistantMessageData: Message = {
        supabase_id: uuidv4(),
        thread_supabase_id: currentSupabaseThreadId,
        role: "assistant",
        content: "",
        createdAt: new Date(),
        model: modelForResponse,
      };
      assistantMessageSupabaseId = assistantMessageData.supabase_id!;
      assistantLocalMessageId = await db.messages.add(assistantMessageData);
      setGeneratingMessageId(assistantLocalMessageId);
      
      if (!userPreferences?.disableResumableStream) {
        sessionStorage.setItem(
          "inFlightAssistantMessageId",
          assistantMessageSupabaseId
        );
      }

      // Clear inputs from UI
      setInput("");
      setAttachedFiles([]);
      setAttachedPreviews([]);
      if (fileInputRef.current) fileInputRef.current.value = "";

      // Build history for AI, now including the new user message
      const fullHistory = await db.messages
        .where("thread_supabase_id")
        .equals(currentSupabaseThreadId)
        .sortBy("createdAt");
      const historyForAI = buildHistoryForAI(fullHistory, modelSupportsImages);

      // Create AbortController for this streaming request
      const submitController = new AbortController();
      abortControllerRef.current = submitController;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelForResponse,
          messages: historyForAI,
          useWebSearch: useWebSearch && currentModelSupportsWebSearch(),
          assistantMessageId: assistantMessageSupabaseId,
          userPreferences: userPreferences,
        }),
        signal: submitController.signal,
      });

      if (!response.body || !response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || errData.error || "API error");
      }

      // Stream response into the assistant placeholder
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        chunk.split("\n").forEach((line) => {
          if (line.startsWith("0:")) {
            try {
              fullResponse += JSON.parse(line.substring(2));
              db.messages.update(assistantLocalMessageId!, {
                content: fullResponse,
              });
            } catch (e) {
              console.warn("Failed to parse stream line", line, e);
            }
          }
        });
      }
      console.log(
        `[${new Date().toLocaleTimeString()}] [FE] Stream finished normally for ID: ${assistantMessageSupabaseId}`
      );
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("Generation aborted by user (new message flow).");
        if (assistantLocalMessageId) {
          const msgToUpdate = await db.messages.get(assistantLocalMessageId);
          const currentContent = msgToUpdate?.content || "";
          const cancellationMessage =
            '\n\n<div class="my-2 p-3 bg-red-500/20 border border-red-500/30 text-red-200 rounded-xl text-sm font-medium text-center">Generation stopped by user.</div>';
          await db.messages.update(assistantLocalMessageId, {
            content: currentContent + cancellationMessage,
          });
        }
      } else {
        console.error("Submit error:", err);
        setError(err.message || "Failed to get response.");
        // If an error occurs, update the placeholder message to show it.
        if (assistantLocalMessageId) {
          await db.messages.update(assistantLocalMessageId, {
            content: `Error: ${err.message}`,
          });
        }
      }
      sessionStorage.removeItem("inFlightAssistantMessageId");
    } finally {
      setIsSending(false);
      abortControllerRef.current = null;
      sessionStorage.removeItem("inFlightAssistantMessageId");
      isSubmittingRef.current = false;

      // Sync after the operation completes or fails.
      if (currentSupabaseThreadId) {
        try {
          await syncThreadWithAttachments(currentSupabaseThreadId);
        } catch (syncError) {
          console.error(
            `Sync failed for thread ${currentSupabaseThreadId}:`,
            syncError
          );
          setError(
            "Message sent but failed to sync to cloud. Your changes are saved locally."
          );
        }
      }
      setGeneratingMessageId(null);
    }
  };

  // --- HELPER FUNCTIONS for message editing, file handling ---
  const handleEditMessage = React.useCallback((msg: Message) => {
    setEditingMessage(msg);
    setInput(msg.content);
    setAttachedFiles([]);
    setAttachedPreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Consider scrolling to the input area or the message being edited
    // messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setInput("");
    setAttachedFiles([]);
    setAttachedPreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Add Escape key listener to exit edit mode
  React.useEffect(() => {
    if (!editingMessage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancelEdit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editingMessage]);

  // Exit edit mode when switching chat threads
  React.useEffect(() => {
    if (editingMessage) {
      handleCancelEdit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseThreadId]);

  // Always scroll to the bottom when switching to a new chat thread
  React.useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    // Defer the scroll until after the next paint to ensure DOM is ready
    const rafId = requestAnimationFrame(() => {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    });

    return () => cancelAnimationFrame(rafId);
  }, [supabaseThreadId]);

  const removeAttachedFile = (indexToRemove: number) => {
    setAttachedFiles((files) =>
      files.filter((_, index) => index !== indexToRemove)
    );
    setAttachedPreviews((previews) =>
      previews.filter((_, index) => index !== indexToRemove)
    );
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    processFiles(Array.from(files));
  };
  // --- END HELPER FUNCTIONS ---

  const handleRegenerate = React.useCallback(
    async (msg: Message) => {
      if (!messages || !msg.id || isSendingRef.current) return;

      const allMessagesInThread = await db.messages
      .where("thread_supabase_id")
      .equals(msg.thread_supabase_id)
      .sortBy("createdAt");

      const index = allMessagesInThread.findIndex((m) => m.id === msg.id);
      if (index === -1) return;

      const idsToDelete: string[] = [];
      const messagesToDelete = allMessagesInThread.slice(index + 1);
      for (const msgToDelete of messagesToDelete) {
        if (msgToDelete.id) {
          if (msgToDelete.supabase_id) {
            idsToDelete.push(msgToDelete.supabase_id);
          }
          await db.messages.delete(msgToDelete.id);
        }
      }

      const historyBefore = messages.slice(0, index);

      const modelToUse = msg.model || selectedModel;
      const currentModelSpec = availableModels.find(
        (m) => m.value === modelToUse
      );
      const modelSupportsImagesFlag = currentModelSpec?.supportsImages || false;
      const historyForAI = buildHistoryForAI(
        historyBefore,
        modelSupportsImagesFlag
      );

      setIsSending(true);
      setGeneratingMessageId(msg.id);

      const modelForRegeneration = msg.model || selectedModel;
      // Ensure msg.id is valid before updating
      if (msg.id) {
        await db.messages.update(msg.id, {
          content: "",
          model: modelForRegeneration,
        });
      }

      let regenerationStreamId = msg.supabase_id;
      if (!regenerationStreamId) {
        regenerationStreamId = uuidv4();
        await db.messages.update(msg.id, {
          supabase_id: regenerationStreamId,
        });
      }

      if (!userPreferences?.disableResumableStream) {
        // Set the session storage key to allow resuming the regeneration on refresh.
        sessionStorage.setItem(
          "inFlightAssistantMessageId",
          regenerationStreamId
        );
      }

      try {
        // Main try for handleRegenerate API call and stream processing
        const regenController = new AbortController();
        abortControllerRef.current = regenController;
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelForRegeneration,
            messages: historyForAI,
            useWebSearch:
              useWebSearch && modelToUse === "gemini-2.5-flash",
            assistantMessageId: regenerationStreamId,
            userPreferences: userPreferences,
          }),
          signal: regenController.signal,
        });
        if (!response.ok || !response.body) throw new Error("API error");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let full = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          chunk.split("\n").forEach((line) => {
            if (line.startsWith("0:")) {
              try {
                full += JSON.parse(line.substring(2));
                if (msg.id) {
                  db.messages.update(msg.id, { content: full });
                }
              } catch (e) {
                console.warn("parse stream line failed", line, e);
              }
            }
          });
        } // Closes while loop for stream reading
        // Correct placement of the catch and finally for the main try block of handleRegenerate
      } catch (err: any) {
        if (err.name === "AbortError") {
          console.log("Generation aborted by user (regenerate flow).");
          if (msg.id) {
            const msgToUpdate = await db.messages.get(msg.id);
            const currentContent = msgToUpdate?.content || "";
            const cancellationMessage =
              '\n\n<div class="my-2 p-3 bg-red-500/20 border border-red-500/30 text-red-200 rounded-xl text-sm font-medium text-center">Generation stopped by user.</div>';
            await db.messages.update(msg.id, {
              content: currentContent + cancellationMessage,
            });
          }
        } else {
          console.error("Regenerate error:", err);
          if (msg.id) {
            await db.messages.update(msg.id, {
              content: `Error: ${err.message}`,
            });
          }
        }
      } finally {
        setIsSending(false);
        abortControllerRef.current = null;
        setGeneratingMessageId(null);
        sessionStorage.removeItem("inFlightAssistantMessageId");

        // Sync only the regenerated message to Supabase
        if (msg.thread_supabase_id && msg.id) {
          try {
            const updatedMessage = await db.messages.get(msg.id);
            const messagesToUpsert = updatedMessage ? [updatedMessage] : [];
            await syncEditOperationToBackend({
              threadSupabaseId: msg.thread_supabase_id,
              messagesToUpsert,
              idsToDelete: idsToDelete,
            });
          } catch (syncError) {
            console.error(
              "Failed to sync regenerated message to Supabase:",
              syncError
            );
            setError(
              "Message regenerated but failed to sync to cloud. Your changes are saved locally."
            );
          }
        }
      }
    },
    [selectedModel, availableModels, useWebSearch, userPreferences]
  ); // End of handleRegenerate

  const handleBranch = React.useCallback(
    async (messageToBranchFrom: Message) => {
      if (!user || !user.id || isSending) return;

      setIsSending(true);
      setError(null);

      try {
        const originalThreadId = messageToBranchFrom.thread_supabase_id;
        if (!originalThreadId) {
          throw new Error("Cannot branch from a message without a thread ID.");
        }

        // 1. Get all original messages from Dexie up to the branch point
        const allOriginalMessages = await db.messages
          .where("thread_supabase_id")
          .equals(originalThreadId)
          .sortBy("createdAt");

        const branchIndex = allOriginalMessages.findIndex(
          (m) => m.id === messageToBranchFrom.id
        );
        if (branchIndex === -1) {
          throw new Error(
            "Could not find the branching message in the database."
          );
        }
        const messagesToCopy = allOriginalMessages.slice(0, branchIndex + 1);

        // 2. Create the new forked thread locally
        const originalThreadData = await db.threads
          .where("supabase_id")
          .equals(originalThreadId)
          .first();
        const newThreadSupabaseId = uuidv4();
        const newThreadData: Thread = {
          supabase_id: newThreadSupabaseId,
          userId: user.id,
          title: `${originalThreadData?.title || "New Chat"}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          forked_from_id: originalThreadId,
        };
        await db.threads.add(newThreadData);

        // 3. Create new message objects for the new thread
        const newMessagesData = messagesToCopy.map((msg) => {
          const { id, ...rest } = msg; // Strip local Dexie 'id'
          return {
            ...rest,
            supabase_id: uuidv4(), // CRITICAL: New universal ID for the copied message
            thread_supabase_id: newThreadSupabaseId, // Link to the new thread
          };
        });

        // 4. Add new messages to Dexie
        await db.messages.bulkAdd(newMessagesData);

        // 5. Sync the entire new thread to the backend
        const newThreadForSync = await db.threads
          .where("supabase_id")
          .equals(newThreadSupabaseId)
          .first();
        const newMessagesForSync = await db.messages
          .where("thread_supabase_id")
          .equals(newThreadSupabaseId)
          .toArray();

        if (!newThreadForSync) {
          throw new Error("Failed to retrieve newly created thread for sync.");
        }

        const attachmentsData: {
          localMessageId: number;
          file_name: string;
          file_url: string;
        }[] = [];
        for (const msg of newMessagesForSync) {
          if (msg.id && msg.attachments) {
            for (const att of msg.attachments) {
              if (att.file_name && att.file_url) {
                attachmentsData.push({
                  localMessageId: msg.id,
                  file_name: att.file_name,
                  file_url: att.file_url,
                });
              }
            }
          }
        }

        await syncFullThreadToBackend({
          threadData: newThreadForSync,
          messagesData: newMessagesForSync,
          attachmentsData,
        });

        // 6. Navigate to the new thread
        navigate(`/chat/${newThreadSupabaseId}`);
      } catch (err: any) {
        console.error("Failed to create branch:", err);
        setError(
          err.message || "An unexpected error occurred while branching."
        );
      } finally {
        setIsSending(false);
      }
    },
    [user, isSending, navigate]
  );

  // Helper function to process a File object (used by both file input and drag&drop)
  const processFiles = (files: File[]) => {
    setAttachedFiles((prev) => [...prev, ...files]);

    const newPreviewPromises = files.map((file) => {
      return new Promise<string>((resolve) => {
        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => resolve("");
          reader.readAsDataURL(file);
        } else {
          resolve(""); // For non-image files, we can use a placeholder or empty string
        }
      });
    });

    Promise.all(newPreviewPromises).then((newPreviews) => {
      setAttachedPreviews((prev) => [...prev, ...newPreviews]);
    });

    setError(null); // Clear any previous errors
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragOver to false if we're leaving the drop zone entirely
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (isSending) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    processFiles(files);
  };

  // Ensure glass effect is initialized on mount (for SSR/React hydration)
  useEffect(() => {
    if (typeof window !== "undefined" && window.liquidGlassManager) {
      document.querySelectorAll(".liquid-glass").forEach((element) => {
        const options = JSON.parse(
          element.getAttribute("data-glass-options") || "{}"
        );
        window.liquidGlassManager.register(element, options);
      });
    }
  }, []);

  const processedMessages = useMemo(() => {
    if (!messages || !currentThread?.forked_from_id) {
      return messages?.map((m) => ({ type: "message", data: m as Message }));
    }

    const threadCreationTime = currentThread.createdAt.getTime();
    let separatorInserted = false;
    const result: (
      | { type: "message"; data: Message }
      | { type: "separator"; id: string }
    )[] = [];

    const relevantMessages =
      messages.filter((m) => m.thread_supabase_id === supabaseThreadId) || [];

    for (const message of relevantMessages) {
      if (
        !separatorInserted &&
        message.createdAt.getTime() >= threadCreationTime
      ) {
        if (result.length > 0) {
          result.push({ type: "separator", id: "fork-separator" });
          separatorInserted = true;
        }
      }
      result.push({ type: "message", data: message });
    }

    return result;
  }, [messages, currentThread, supabaseThreadId]);

  // --- RENDER ---
  if (isLoadingModels || !isUserLoaded) {
    return (
      <div className="chat-container h-screen w-screen flex items-center justify-center">
        <div className="frosted-glass rounded-2xl p-8 text-white text-lg font-medium">
          Loading...
        </div>
      </div>
    );
  }

const ChatInputContent = (
    <>
      {editingMessage && (
        <div className="liquid-glass-content mb-3 p-3 bg-blue-600/10 backdrop-filter backdrop-blur-md border border-blue-500/30 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <span className="text-blue-300 text-sm font-medium">
              Editing message...
            </span>
          </div>
          <button
            type="button"
            onClick={handleCancelEdit}
            className="text-blue-400 hover:text-blue-300 text-sm font-medium px-2 py-1 rounded-md hover:bg-blue-500/10 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
      <textarea
        ref={textareaRef}
        className="chat-textarea w-full bg-transparent text-white placeholder-gray-400 resize-none focus:outline-none text-lg leading-relaxed transition-all mb-4 px-4" // Added "chat-textarea" class
        value={input}
        placeholder="Ask anything..."
        onChange={(e) => setInput(e.target.value)}
        disabled={isSending}
        rows={2} // Set a base of 2 rows for the initial size
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e as any);
          } else if (e.key === "Escape" && editingMessage) {
            e.preventDefault();
            handleCancelEdit();
          }
        }}
      />

      {attachedFiles.length > 0 && (
        <div className="mb-3 p-3 frosted-button-sidebar rounded-xl grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {attachedFiles.map((file, index) => (
            <div key={index} className="relative group">
              {attachedPreviews[index] ? (
                <img
                  src={attachedPreviews[index]}
                  alt="Preview"
                  className="w-full h-24 object-cover rounded-lg"
                />
              ) : (
                <div className="w-full h-24 frosted-button-sidebar rounded-lg flex flex-col items-center justify-center p-2">
                  <span className="text-gray-300 text-xs font-medium text-center truncate w-full">
                    {file.name}
                  </span>
                  <span className="text-gray-400 text-xs mt-1">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeAttachedFile(index)}
                className="absolute top-1 right-1 text-white bg-black/60 backdrop-filter backdrop-blur-sm hover:bg-red-500/80 p-1 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                title="Remove file"
              >
                <XSquare />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: "none" }}
            multiple
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending || editingMessage !== null}
            className="text-gray-400 hover:text-white transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            title="Attach file"
          >
            <Paperclip />
          </button>

          <div className="flex items-center gap-3">
            {/* Model Selector */}
            <div className="flex items-center space-x-2">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-gray-800/95 backdrop-blur-xl border border-gray-700/50 shadow-xl px-2 py-1 md:px-3 md:py-2 text-white text-xs md:text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all min-w-0 max-w-[8rem] md:max-w-none truncate"
                disabled={isLoadingModels || availableModels.length === 0}
              >
                {isLoadingModels && (
                  <option value="" className="bg-gray-800/95 text-white">
                    Loading models...
                  </option>
                )}
                {!isLoadingModels && availableModels.length === 0 && (
                  <option value="" className="bg-gray-800/95 text-white">
                    No models available
                  </option>
                )}
                {availableModels.map((m) => (
                  <option
                    key={m.value}
                    value={m.value}
                    className="bg-gray-800/95 text-white"
                  >
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>

            {/* Web Search Toggle */}
            {currentModelSupportsWebSearch() && (
              <div className="flex items-center space-x-3">
                <div className="group relative">
                  <button
                    type="button"
                    onClick={handleWebSearchToggle}
                    className={`p-2 rounded-lg transition-all duration-200 flex items-center justify-center ${
                      useWebSearch
                        ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                        : "frosted-button-sidebar text-white/70 hover:text-white"
                    }`}
                    title={
                      useWebSearch
                        ? "Disable web search"
                        : "Enable web search"
                    }
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                      <path d="M2 12h20" />
                    </svg>
                  </button>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800/90 backdrop-blur text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                    {useWebSearch
                      ? "Disable web search"
                      : "Enable real-time web search"}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          type={isSending ? "button" : "submit"}
          onClick={isSending ? handleStopGeneration : undefined}
          disabled={
            !isSending && (!input.trim() && attachedFiles.length === 0)
          }
          className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors focus:outline-none shadow-lg hover:shadow-xl ${
            isSending
              ? "frosted-button-sidebar text-white"
              : "bg-white hover:bg-gray-200 text-black disabled:bg-gray-500 disabled:cursor-not-allowed disabled:opacity-50"
          }`}
          title={
            isSending
              ? "Stop generating"
              : editingMessage
              ? "Update message"
              : "Send message"
          }
        >
          {isSending ? (
            <XSquare />
          ) : editingMessage ? (
            <SendHorizonal/>
          ) : (
            <SendHorizonal />
          )}
        </button>
      </div>
    </>
  );

  return (
    <div className="chat-container flex-grow flex flex-col relative">
      {/* UserButton positioned absolutely in the top right corner */}
      {user && (
        <div className="absolute top-6 right-6 z-20">
          <UserButton
            appearance={{
              elements: {
              avatarBox: "w-8 h-8",
              userButtonPopoverCard:
                "bg-gray-900/95 backdrop-blur border border-gray-700",
              userButtonPopoverActionButton:
                "text-white hover:bg-gray-700",
              userButtonPopoverActionButtonText: "text-white",
              userButtonPopoverFooter: "hidden",
                  },
            }}
          />
        </div>
      )}

      {error && (
        <div className="mx-6 mt-4 relative z-10">
          <div
            className={`bg-red-500/20 border border-red-500/30 backdrop-filter backdrop-blur-md text-red-100 rounded-xl p-4 transition-opacity duration-500 ${
              isErrorFading ? "opacity-0" : "opacity-100"
            }`}
          >
            Error: {error}
          </div>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className="chat-scroll-container flex-grow overflow-y-auto custom-scrollbar p-6"
        onScroll={handleScroll}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="mx-auto margin max-w-5xl space-y-8 px-6 pb-45">
          {/* Welcome message when no messages */}
          {(!messages || messages.length === 0) &&
            attachedFiles.length === 0 && (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <div className="text-white text-2xl font-semibold mb-3">
                  Welcome to Tweak3 Chat
                </div>
                <div className="text-white/60 text-lg max-w-md">
                  Start a conversation with AI. Ask questions, get help with
                  code, or just chat!
                </div>
              </div>
            )}

          {currentThread?.forked_from_id && (
            <div className="text-center text-white/50 text-sm py-4 border-b border-white/10">
              --- This is a copy of a conversation ---
            </div>
          )}

          {processedMessages?.map((item) => {
            if (item.type === "separator") {
              return (
                <div
                  key={item.id}
                  className="text-center text-white/50 text-sm py-4 border-b border-t border-white/10 my-4"
                >
                  --- Messages beyond this point are only visible to you ---
                </div>
              );
            }
            const m = item.data;
            return (
              <MessageRow
                key={m.id}
                message={m}
                availableModels={availableModels}
                onEdit={handleEditMessage}
                onRegenerate={handleRegenerate}
                onBranch={handleBranch}
                isGenerating={generatingMessageId === m.id}
              />
            );
          })}
          <div ref={messagesEndRef} /> {/* For scrolling to bottom */}
        </div>
      </div>

      {/* Chatbar wrapper: flush to bottom on mobile, slight gap on md+ */}
      <div className="absolute bottom-0 md:bottom-2 left-10 right-10 z-20">
        {/* Scroll to bottom button - positioned above chatbar */}
        {showScrollButton && (
          <div className="flex justify-center mb-3">
            <button
              type="button"
              onClick={scrollToBottom}
              className="frosted-glass backdrop-blur-xl px-4 py-2 rounded-xl text-white/80 hover:text-white text-sm font-medium transition-colors shadow-lg flex items-center space-x-2"
              title="Scroll to bottom"
            >
              <span>Scroll to bottom</span>
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
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        )}

        <div className="pt-8 pb-0 md:pb-6">
          <form onSubmit={handleSubmit} className="max-w-5xl mx-auto">
            {userPreferences?.useLiquidGlass ? (
              <LiquidGlass className="rounded-2xl p-4 shadow-2xl flex flex-col">
                <LiquidGlass.Foreground>
                  {ChatInputContent}
                </LiquidGlass.Foreground>
              </LiquidGlass>
            ) : (
              <div className="frosted-glass rounded-2xl p-4 shadow-2xl flex flex-col">
                {ChatInputContent}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

// Declare global types
declare global {
  interface Window {
    liquidGlassManager?: any;
  }
}