// ChatPage.tsx
"use client";

import React, { useState, useEffect, useRef} from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { useUser } from "@clerk/nextjs";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Thread, Message, MessageAttachment } from "./db"; // Ensure MessageAttachment is exported from db.ts
import { uploadFileToSupabaseStorage } from "./supabaseStorage";
import { v4 as uuidv4 } from "uuid"; // Added for generating unique IDs
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
// import { SendHorizonal, Paperclip, XSquare, Loader2 } from 'lucide-react'; // Assuming lucide-react for icons

// SVG Icon components
const SendHorizonal = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
  </svg>
);
const Paperclip = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const XSquare = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6L6 18M6 6l12 12"/>
  </svg>
);
const Loader2 = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 11-6.219-8.56"/>
  </svg>
);
const Pencil = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
  </svg>
);
const Recycle = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
    <path d="M21 3v5h-5"/>
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
    <path d="M8 16H3v5"/>
  </svg>
);

// --- SYNC SERVICE TYPES AND FUNCTIONS ---

interface FullThreadSyncPayload {
  threadData: Thread;
  messagesData: Message[];
  attachmentsData: {
    localMessageId: number;
    file_name: string;
    file_url: string; // CRITICAL: This MUST be the Supabase Storage URL
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
  // dexie_id?: number | null; // If you decide to send local message ID to backend and get it back
}

interface SupabaseThread {
  id: string;
  shared_id: string; // This is the universal ID used across both Dexie and Supabase
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
    const sanitizedMessages = payload.messagesToUpsert.map(msg => {
      if (!msg.supabase_id) {
        console.warn("Found message without supabase_id during sync, generating new one.", msg);
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
        messagesToUpsert: sanitizedMessages
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
          // let localThreadId: number | undefined;

          const threadSupabaseId = remoteThread.shared_id;

          // const existingLocalThread = await db.threads
          //   .where("supabase_id")
          //   .equals(threadSupabaseId)
          //   .first();

          // if (!existingLocalThread) {
          const threadPayloadToStore: Omit<Thread, "id"> = {
            supabase_id: threadSupabaseId,
            userId: remoteThread.clerk_user_id,
            title: remoteThread.title,
            createdAt: new Date(remoteThread.created_at),
            updatedAt: new Date(remoteThread.updated_at),
          };

          await db.threads.put(threadPayloadToStore);
          //}

          for (const remoteMessage of remoteThread.messages) {
            const messageSupabaseId = (remoteMessage as any).shared_id;
            if (!messageSupabaseId) continue;

            // const existingLocalMessage = await db.messages
            //   .where("supabase_id")
            //   .equals(messageSupabaseId)
            //   .first();

            // if (!existingLocalMessage) {
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
            // Use .put() for messages as well.
            await db.messages.put(localMessagePayload);
          }
          //}
        }
      });
    } else if (!cloudFetchResult.success) {
      console.error("Cloud sync failed:", cloudFetchResult.error);
    }
  } catch (error) {
    // console.error("Failed to fetch or store cloud data:", error);
  }
}

// Add this helper function inside ChatPage.tsx
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
    // Optionally set an error state for the UI
  }
}

interface ChatPageContext {
  availableModels: { value: string; displayName: string; supportsImages?: boolean }[];
  selectedModel: string;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  isLoadingModels: boolean;
  modelsError: string | null;
}

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
  // Add scroll to bottom button state
  const [showScrollButton, setShowScrollButton] = useState<boolean>(false);
  // Add web search state
  const [useWebSearch, setUseWebSearch] = useState<boolean>(false);
  // Add state for copy feedback
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  // Add state for textarea expansion
  const [isTextareaExpanded, setIsTextareaExpanded] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Throttle scroll handler using rAF
  const scrollRafRef = useRef<number | null>(null);
  // Store the default (collapsed) scrollHeight to avoid recalculating every keystroke
  const baseTextareaHeightRef = useRef<number>(0);

  const isSubmittingRef = useRef(false);

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
    return selectedModel === "gemini-2.5-flash-preview-05-20";
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

  // Auto-expand / collapse based on the number of lines in the textarea.
  // This avoids relying on scroll measurements that can be distorted by the
  // element's "rows" attribute, ensuring it collapses properly when the
  // content becomes short again.
  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Count how many logical lines the user has (line breaks + 1)
    const lineCount = (textarea.value.match(/\n/g) || []).length + 1;

    // Expand when more than 2 lines are present, otherwise collapse
    const needsExpansion = lineCount > 2;

    // Update state only if it changed to prevent redundant renders
    setIsTextareaExpanded(prev => (prev !== needsExpansion ? needsExpansion : prev));
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
    const pollInterval = 500;
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
              console.log(`[FE] Received final status: "${data.status}". Finalizing.`);
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
  }, []);

  // Simple title generation fallback
  async function generateTitleFromPrompt(
    prompt: string,
    maxLength: number,
  ): Promise<string | null> {
    return prompt ? prompt.slice(0, maxLength) : "New Chat";
  }

  // --- ACTIONS ---
  // Creation of a brand-new chat is now handled by the persistent AppShell/Sidebar.

  // Moved buildHistoryForAI before handleSubmit to resolve declaration error
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
                  file_name: attachment.file_name
                },
              });
            }
          });


          return { role: m.role, content: contentArray };
        }
      }
      return { role: m.role, content: m.content };
    });

    // 2) Construct the system prompt that should precede the conversation.
    const modelDisplayName =
      availableModels.find((am) => am.value === selectedModel)?.displayName ||
      selectedModel;
    const currentTimestamp = new Date().toLocaleString(undefined, {
      timeZoneName: "short",
    });

    const systemPrompt = `You are Tweak 3 Chat, an AI assistant powered by the ${modelDisplayName} model. Your role is to assist and engage in conversation while being helpful, respectful, and engaging.

If you are specifically asked about the model you are using, you may mention that you use the ${modelDisplayName} model. If you are not asked specifically about the model you are using, you do not need to mention it.
The current date and time including timezone is ${currentTimestamp}.
Always use LaTeX for mathematical expressions.

For inline math, use a single dollar sign, like $...$. For example, $E = mc^2$.
For display math, use double dollar signs, like $$...$$. For example, $$\int_{a}^{b} f(x) dx$$.

Ensure code is properly formatted using Prettier with a print width of 80 characters
Present code in Markdown code blocks with the correct language extension indicated`;

    const systemMessage = { role: "system" as const, content: systemPrompt };

    // 3) Prepend the system message to the rest of the history.
    return [systemMessage, ...transformedHistory];
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

    const modelSupportsImages =
      selectedModel === "meta-llama/llama-4-maverick:free" ||
      selectedModel === "gemini-2.5-flash-preview-05-20";
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
          const messagesToDelete = allMessagesInThread.slice(startIndexToDelete);

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
              model: selectedModel, // Also update the model used
            });
          } else {
            // Create a new placeholder for the assistant's response.
            const assistantMessageData: Message = {
              supabase_id: uuidv4(),
              thread_supabase_id: threadId,
              role: "assistant",
              content: "",
              createdAt: new Date(),
              model: selectedModel,
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

          // Clear the editing state *before* the API call.
          setEditingMessage(null);
          setInput("");
          setAttachedFiles([]);
          setAttachedPreviews([]);
          if (fileInputRef.current) fileInputRef.current.value = "";

          // Call the AI API to regenerate the response.
          const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: selectedModel,
              messages: historyForAI,
              useWebSearch: useWebSearch && currentModelSupportsWebSearch(),
            }),
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
        console.error("Failed to update message:", err);
        setError(err.message || "Failed to update message.");
      } finally {
        setIsSending(false);
        // Always sync the thread after an edit operation completes or fails.
        if (editingMessage?.thread_supabase_id) {
          // const finalThreadData = await db.threads.get({
          //   supabase_id: ,
          // });
          const finalThreadData = await db.threads
            .where("supabase_id")
            .equals(editingMessage.thread_supabase_id)
            .first();

          // const finalMessagesData = await db.messages
          //   .where("thread_supabase_id")
          //   .equals(editingMessage.thread_supabase_id)
          //   .toArray();
          if (finalThreadData) {
            try {
              // Get the edited user message and the new assistant message
              const editedUserMessage = await db.messages.get(
                editingMessage.id
              );
              const newAssistantMessage = assistantLocalMessageId
                ? await db.messages.get(assistantLocalMessageId)
                : null;

              // const messagesToSync = [];
              // if (editedUserMessage) messagesToSync.push(editedUserMessage);
              // if (newAssistantMessage) messagesToSync.push(newAssistantMessage);

              // if (messagesToSync.length > 0) {
              //   await syncMessagesToBackend(messagesToSync);
              // }

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
                idsToDelete: idsToDelete, // Pass the list of IDs to delete
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
        model: selectedModel,
      };
      assistantMessageSupabaseId = assistantMessageData.supabase_id!;
      assistantLocalMessageId = await db.messages.add(assistantMessageData);

      sessionStorage.setItem(
        "inFlightAssistantMessageId",
        assistantMessageSupabaseId
      );

      
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

      // Call AI API
      const submitTimestamp = new Date().toLocaleTimeString();
      console.log(
        `[${submitTimestamp}] [FE] Sending request to /api/chat with ID: ${assistantMessageSupabaseId}`
      );
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: historyForAI,
          useWebSearch: useWebSearch && currentModelSupportsWebSearch(),
          assistantMessageId: assistantMessageSupabaseId,
        }),
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
      console.error("Submit error:", err);
      setError(err.message || "Failed to get response.");
      // If an error occurs, update the placeholder message to show it.
      if (assistantLocalMessageId) {
        await db.messages.update(assistantLocalMessageId, {
          content: `Error: ${err.message}`,
        });
      }
      sessionStorage.removeItem("inFlightAssistantMessageId");
    } finally {
      setIsSending(false);
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

  const handleRegenerate = React.useCallback(async (msg: Message) => {
    if (!messages || !msg.id || isSending) return;
    const index = messages.findIndex((m) => m.id === msg.id);
    if (index === -1) return;

    const idsToDelete: string[] = [];
    const threadSupabaseId = msg.thread_supabase_id;
    const messagesToDelete = messages.slice(index + 1);
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
    const currentModelSpec = availableModels.find((m) => m.value === modelToUse);
    const modelSupportsImagesFlag = currentModelSpec?.supportsImages || false;
    const historyForAI = buildHistoryForAI(
      historyBefore,
      modelSupportsImagesFlag
    );

   

    setIsSending(true);
    // Ensure msg.id is valid before updating
    if (msg.id) {
      await db.messages.update(msg.id, { content: "" });
    }

    let regenerationStreamId = msg.supabase_id;
    if (!regenerationStreamId) {
      regenerationStreamId = uuidv4();
      await db.messages.update(msg.id, { supabase_id: regenerationStreamId });
    }

    // Set the session storage key to allow resuming the regeneration on refresh.
    sessionStorage.setItem("inFlightAssistantMessageId", regenerationStreamId);

    try {
      // Main try for handleRegenerate API call and stream processing
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelToUse,
          messages: historyForAI,
          useWebSearch:
            useWebSearch && modelToUse === "gemini-2.5-flash-preview-05-20",
          assistantMessageId: regenerationStreamId,
          }),
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
      console.error("Regenerate error:", err);
      if (msg.id) {
        await db.messages.update(msg.id, { content: `Error: ${err.message}` });
      }
    } finally {
      setIsSending(false);
      sessionStorage.removeItem("inFlightAssistantMessageId");
      // Sync only the regenerated message to Supabase
      if (msg.thread_supabase_id && msg.id) {
        try {
          // Get the updated message from the database
          const updatedMessage = await db.messages.get(msg.id);
          // if (updatedMessage) {
          //   await syncMessagesToBackend([updatedMessage]);
          // }
          
          const messagesToUpsert = updatedMessage ? [updatedMessage] : [];
          await syncEditOperationToBackend({
            threadSupabaseId: msg.thread_supabase_id,
            messagesToUpsert,
            idsToDelete: idsToDelete, // Pass the list of IDs to delete
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
  }, [messages, selectedModel, availableModels, useWebSearch, isSending]); // End of handleRegenerate

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

  // --- RENDER ---
  if (isLoadingModels || !isUserLoaded) {
    return (
      <div className="chat-container h-screen w-screen flex items-center justify-center">
        <div className="glass-effect rounded-2xl p-8 text-white text-lg font-medium">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container flex-grow flex flex-col">
      <div className="header-glass p-6 flex justify-between items-center relative z-10 shrink-0">
        <div className="flex items-center space-x-6">
          <h1 className="text-2xl font-bold text-white">Tweak3 Chat</h1>
          {/* Removed Model Selector and Web Search Toggle - moved to chatbar */}
        </div>
        {user && (
          <div className="text-white">
            {user.primaryEmailAddress?.emailAddress}
          </div>
        )}
      </div>

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
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto custom-scrollbar p-6 relative"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="mx-auto max-w-5xl space-y-8 px-4 pb-45">
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

          {messages?.map((m) => (
            <div
              key={m.id}
              className={`group flex ${
                m.role === "user" ? "justify-end" : "justify-start"
              } mb-12`}
            >
              {m.role === "assistant" ? (
                // Assistant message - no bubble, clean layout
                <div className="max-w-4xl">
                  <div className="flex items-center mb-3">
                    <div className="flex items-center space-x-2">
                      <div className="text-white/80 text-sm font-medium">
                        {availableModels.find((am) => am.value === m.model)
                          ?.displayName || m.model}
                      </div>
                      <div className="text-white/40 text-xs">
                        {new Date(m.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <div className="prose prose-invert prose-xl max-w-none text-white/90 leading-relaxed text-lg">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        code({
                          inline,
                          className,
                          children,
                        }: {
                          inline?: boolean;
                          className?: string;
                          children: React.ReactNode;
                        }) {
                          const match = /language-(\w+)/.exec(className || "");

                          const getFileExtension = (
                            language: string
                          ): string => {
                            const extensionMap: { [key: string]: string } = {
                              javascript: ".js",
                              js: ".js",
                              jsx: ".jsx",
                              typescript: ".ts",
                              ts: ".ts",
                              tsx: ".tsx",
                              python: ".py",
                              py: ".py",
                              java: ".java",
                              cpp: ".cpp",
                              "c++": ".cpp",
                              cxx: ".cpp",
                              c: ".c",
                              csharp: ".cs",
                              cs: ".cs",
                              html: ".html",
                              htm: ".html",
                              css: ".css",
                              scss: ".scss",
                              sass: ".sass",
                              json: ".json",
                              xml: ".xml",
                              yaml: ".yml",
                              yml: ".yml",
                              shell: ".sh",
                              bash: ".sh",
                              sh: ".sh",
                              sql: ".sql",
                              php: ".php",
                              ruby: ".rb",
                              rb: ".rb",
                              go: ".go",
                              rust: ".rs",
                              rs: ".rs",
                              swift: ".swift",
                              kotlin: ".kt",
                              r: ".r",
                              matlab: ".m",
                              perl: ".pl",
                              lua: ".lua",
                              dart: ".dart",
                              scala: ".scala",
                              clojure: ".clj",
                              haskell: ".hs",
                              elm: ".elm",
                              dockerfile: ".dockerfile",
                              makefile: ".makefile",
                              ini: ".ini",
                              toml: ".toml",
                              conf: ".conf",
                              txt: ".txt",
                              md: ".md",
                              markdown: ".md",
                            };
                            return (
                              extensionMap[language.toLowerCase()] || ".txt"
                            );
                          };

                          const getLanguageDisplayName = (
                            language: string
                          ): string => {
                            const displayNames: { [key: string]: string } = {
                              javascript: "JavaScript",
                              js: "JavaScript",
                              jsx: "JavaScript (JSX)",
                              typescript: "TypeScript",
                              ts: "TypeScript",
                              tsx: "TypeScript (TSX)",
                              python: "Python",
                              py: "Python",
                              java: "Java",
                              cpp: "C++",
                              "c++": "C++",
                              cxx: "C++",
                              c: "C",
                              csharp: "C#",
                              cs: "C#",
                              html: "HTML",
                              htm: "HTML",
                              css: "CSS",
                              scss: "SCSS",
                              sass: "Sass",
                              json: "JSON",
                              xml: "XML",
                              yaml: "YAML",
                              yml: "YAML",
                              shell: "Shell",
                              bash: "Bash",
                              sh: "Shell",
                              sql: "SQL",
                              php: "PHP",
                              ruby: "Ruby",
                              rb: "Ruby",
                              go: "Go",
                              rust: "Rust",
                              rs: "Rust",
                              swift: "Swift",
                              kotlin: "Kotlin",
                              r: "R",
                              matlab: "MATLAB",
                              perl: "Perl",
                              lua: "Lua",
                              dart: "Dart",
                              scala: "Scala",
                              clojure: "Clojure",
                              haskell: "Haskell",
                              elm: "Elm",
                              dockerfile: "Dockerfile",
                              makefile: "Makefile",
                              ini: "INI",
                              toml: "TOML",
                              conf: "Config",
                              txt: "Text",
                              md: "Markdown",
                              markdown: "Markdown",
                            };
                            return (
                              displayNames[language.toLowerCase()] ||
                              language.charAt(0).toUpperCase() +
                                language.slice(1)
                            );
                          };

                          const copyToClipboard = async (text: string) => {
                            try {
                              await navigator.clipboard.writeText(text);
                              // You could add a toast notification here if desired
                            } catch (err) {
                              console.error(
                                "Failed to copy to clipboard:",
                                err
                              );
                            }
                          };

                          const downloadCode = (
                            code: string,
                            language: string
                          ) => {
                            const extension = getFileExtension(language);
                            const blob = new Blob([code], {
                              type: "text/plain",
                            });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `code${extension}`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          };

                          return !inline && match ? (
                            <div className="my-4 relative group">
                              {/* Language label with download functionality */}
                              <div className="absolute top-2 left-3 z-10">
                                <button
                                  onClick={() =>
                                    downloadCode(
                                      String(children).replace(/\n$/, ""),
                                      match[1]
                                    )
                                  }
                                  className="glass-button-sidebar px-2 py-1 text-xs font-medium text-white/80 hover:text-white rounded-md transition-colors cursor-pointer flex items-center space-x-1 group/download"
                                  title={`Download ${getLanguageDisplayName(
                                    match[1]
                                  )} code`}
                                >
                                  <span>
                                    {getLanguageDisplayName(match[1])}
                                  </span>
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="opacity-0 group-hover/download:opacity-60 transition-opacity"
                                  >
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7,10 12,15 17,10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                </button>
                              </div>
                              {/* Copy button */}
                              <div className="absolute top-2 right-2 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                <button
                                  onClick={() =>
                                    copyToClipboard(
                                      String(children).replace(/\n$/, "")
                                    )
                                  }
                                  className="glass-button-sidebar p-1.5 text-white/70 hover:text-white rounded-md transition-colors"
                                  title="Copy code"
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
                                    <rect
                                      x="9"
                                      y="9"
                                      width="13"
                                      height="13"
                                      rx="2"
                                      ry="2"
                                    />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                  </svg>
                                </button>
                              </div>
                              <SyntaxHighlighter
                                style={vscDarkPlus as any}
                                language={match[1]}
                                PreTag="div"
                                customStyle={{
                                  borderRadius: "8px",
                                  fontSize: "14px",
                                  lineHeight: "1.5",
                                  paddingTop: "2.5rem", // Add top padding to make room for the language label
                                }}
                              >
                                {String(children).replace(/\n$/, "")}
                              </SyntaxHighlighter>
                            </div>
                          ) : (
                            <code
                              className={`${
                                className || ""
                              } bg-gray-800/60 text-blue-300 rounded px-1.5 py-0.5 font-mono text-sm`}
                            >
                              {children}
                            </code>
                          );
                        },
                        p: ({ children }) => (
                          <p className="mb-4 last:mb-0 text-white/90 leading-relaxed text-lg">
                            {children}
                          </p>
                        ),
                        ul: ({ children }) => (
                          <ul className="mb-4 space-y-1 text-white/90 text-lg">
                            {children}
                          </ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="mb-4 space-y-1 text-white/90 text-lg">
                            {children}
                          </ol>
                        ),
                        li: ({ children }) => (
                          <li className="text-white/90 text-lg">{children}</li>
                        ),
                        h1: ({ children }) => (
                          <h1 className="text-2xl font-bold text-white mb-4 mt-6 first:mt-0">
                            {children}
                          </h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-xl font-semibold text-white mb-3 mt-5 first:mt-0">
                            {children}
                          </h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-lg font-semibold text-white mb-2 mt-4 first:mt-0">
                            {children}
                          </h3>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-blue-500/50 pl-4 my-4 text-white/80 italic text-lg">
                            {children}
                          </blockquote>
                        ),
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
                  
                  {/* Action buttons at bottom of message */}
                  <div className="flex items-center justify-start space-x-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="relative group/copy">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(m.content);
                            setCopiedMessageId(m.id || null);
                            setTimeout(() => setCopiedMessageId(null), 2000);
                          } catch (err) {
                            console.error("Failed to copy to clipboard:", err);
                          }
                        }}
                        className={`p-1.5 rounded-md transition-all ${
                          copiedMessageId === m.id
                            ? "text-green-400 bg-green-500/20"
                            : "text-white/50 hover:text-white/80 hover:bg-white/10"
                        }`}
                      >
                        {copiedMessageId === m.id ? (
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
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800/90 backdrop-blur text-white text-xs rounded opacity-0 group-hover/copy:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                        {copiedMessageId === m.id ? "Copied!" : "Copy message"}
                      </div>
                    </div>
                    
                    <div className="relative group/regen">
                      <button
                        type="button"
                        onClick={() => handleRegenerate(m)}
                        className="p-1.5 text-white/50 hover:text-white/80 hover:bg-white/10 rounded-md transition-colors"
                      >
                        <Recycle />
                      </button>
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800/90 backdrop-blur text-white text-xs rounded opacity-0 group-hover/regen:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                        Regenerate response
                      </div>
                    </div>
                  </div>

                  {m.attachments &&
                    m.attachments.map((att, index) => (
                      <div key={index} className="mt-4">
                        {att.file_url.startsWith("data:image") ? (
                          <img
                            src={att.file_url}
                            alt={att.file_name}
                            className="max-w-md rounded-lg shadow-lg"
                          />
                        ) : (
                          <a
                            href={att.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-2 text-blue-400 hover:text-blue-300 hover:underline"
                          >
                            <span>{att.file_name}</span>
                          </a>
                        )}
                      </div>
                    ))}
                </div>
              ) : (
                // User message - glass aesthetic styling
                <div className="max-w-4xl">
                  <div className="glass-effect rounded-2xl px-6 py-4 shadow-lg">
                    <div className="text-white/90 leading-relaxed text-lg">
                      <p style={{ whiteSpace: "pre-wrap" }}>{m.content}</p>
                    </div>
                    {m.attachments &&
                      m.attachments.map((att, index) => (
                        <div key={index} className="mt-4">
                          {att.file_url.startsWith("data:image") ? (
                            <img
                              src={att.file_url}
                              alt={att.file_name}
                              className="max-w-md rounded-lg shadow-lg"
                            />
                          ) : (
                            <a
                              href={att.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center space-x-2 text-blue-400 hover:text-blue-300 hover:underline"
                            >
                              <span>{att.file_name}</span>
                            </a>
                          )}
                        </div>
                      ))}
                  </div>
                  {/* Action buttons for user message */}
                  <div className="flex items-center justify-end space-x-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="relative group/copy">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(m.content);
                            setCopiedMessageId(m.id || null);
                            setTimeout(() => setCopiedMessageId(null), 2000);
                          } catch (err) {
                            console.error("Failed to copy to clipboard:", err);
                          }
                        }}
                        className={`p-1.5 rounded-md transition-all ${
                          copiedMessageId === m.id
                            ? "text-green-400 bg-green-500/20"
                            : "text-white/50 hover:text-white/80 hover:bg-white/10"
                        }`}
                      >
                        {copiedMessageId === m.id ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        )}
                      </button>
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800/90 backdrop-blur text-white text-xs rounded opacity-0 group-hover/copy:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                        {copiedMessageId === m.id ? "Copied!" : "Copy"}
                      </div>
                    </div>
                    <div className="relative group/edit">
                      <button
                        type="button"
                        onClick={() => handleEditMessage(m)}
                        className="p-1.5 text-white/50 hover:text-white/80 hover:bg-white/10 rounded-md transition-colors"
                      >
                        <Pencil />
                      </button>
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800/90 backdrop-blur text-white text-xs rounded opacity-0 group-hover/edit:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                        Edit
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} /> {/* For scrolling to bottom */}
        </div>
      </div>

      {/* Chatbar wrapper: flush to bottom on mobile, slight gap on md+ */}
      <div className="absolute bottom-0 md:bottom-2 left-0 right-0 z-20">
        <div className="pt-8 pb-0 md:pb-6">
          <form onSubmit={handleSubmit} className="max-w-5xl mx-auto">
            <div className="glass-effect backdrop-blur-xl rounded-2xl p-4 shadow-2xl flex flex-col">
              {editingMessage && (
                <div className="mb-3 p-3 bg-blue-600/10 backdrop-filter backdrop-blur-md border border-blue-500/30 rounded-xl flex items-center justify-between">
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
                className="w-full bg-transparent text-white placeholder-gray-400 resize-none focus:outline-none text-lg leading-relaxed transition-all mb-4"
                value={input}
                placeholder="Ask anything..."
                onChange={(e) => setInput(e.target.value)}
                disabled={isSending}
                rows={isTextareaExpanded ? 4 : 2}
                style={{ minHeight: isTextareaExpanded ? "4rem" : "2.5rem", maxHeight: "8rem" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e as any);
                  }
                }}
              />

              {attachedFiles.length > 0 && (
                <div className="mb-3 p-3 glass-button-sidebar rounded-xl grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {attachedFiles.map((file, index) => (
                    <div key={index} className="relative group">
                      {attachedPreviews[index] ? (
                        <img
                          src={attachedPreviews[index]}
                          alt="Preview"
                          className="w-full h-24 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-full h-24 glass-button-sidebar rounded-lg flex flex-col items-center justify-center p-2">
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
                        /*
                          Responsive sizing:
                          - Default (mobile): tighter padding, smaller text, truncate long labels.
                          - md and up: original spacing / font.
                        */
                        className="glass-button-sidebar px-2 py-1 md:px-3 md:py-2 text-white text-xs md:text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all min-w-0 max-w-[8rem] md:max-w-none truncate"
                        disabled={
                          isLoadingModels || availableModels.length === 0
                        }
                      >
                        {isLoadingModels && (
                          <option
                            value=""
                            className="bg-gray-800 text-white"
                          >
                            Loading models...
                          </option>
                        )}
                        {!isLoadingModels && availableModels.length === 0 && (
                          <option
                            value=""
                            className="bg-gray-800 text-white"
                          >
                            No models available
                          </option>
                        )}
                        {availableModels.map((m) => (
                          <option
                            key={m.value}
                            value={m.value}
                            className="bg-gray-800 text-white"
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
                            onClick={() => setUseWebSearch(!useWebSearch)}
                            className={`p-2 rounded-lg transition-all duration-200 flex items-center justify-center ${
                              useWebSearch
                                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                                : "glass-button-sidebar text-white/70 hover:text-white"
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
                  type="submit"
                  disabled={
                    isSending || (!input.trim() && attachedFiles.length === 0)
                  }
                  className="w-10 h-10 flex items-center justify-center bg-white hover:bg-gray-200 disabled:bg-gray-500 text-black rounded-full transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
                  title={editingMessage ? "Update message" : "Send message"}
                >
                  {isSending ? (
                    <div className="animate-spin">
                      <Loader2 />
                    </div>
                  ) : editingMessage ? (
                    <span className="text-sm font-medium">Update</span>
                  ) : (
                    <SendHorizonal />
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
