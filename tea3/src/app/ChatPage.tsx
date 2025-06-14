"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useUser } from "@clerk/nextjs";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Thread, Message, MessageAttachment } from "./db"; // Ensure MessageAttachment is exported from db.ts
import { uploadFileToSupabaseStorage } from "./supabaseStorage";
import { v4 as uuidv4 } from "uuid"; // Added for generating unique IDs
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
// import { SendHorizonal, Paperclip, XSquare, Loader2 } from 'lucide-react'; // Assuming lucide-react for icons

// Placeholder for icons if lucide-react is not used or to avoid import errors
const SendHorizonal = () => <span>Send</span>;
const Paperclip = () => <span>Attach</span>;
const XSquare = () => <span>X</span>;
const Loader2 = () => <span>Loading...</span>;
const Pencil = () => <span>Edit</span>;
const Recycle = () => <span>Regen</span>;

interface AiModel {
  value: string;
  displayName: string;
  supportsImages?: boolean; // Added from previous context
}

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
      //const syncedSupabaseMessages = result.data.messages;

      // Update local thread with Supabase confirmed shared_id
      // Ensure your backend returns the thread object with a 'shared_id' property
      if (
        syncedSupabaseThread &&
        syncedSupabaseThread.shared_id &&
        payload.threadData.id &&
        !payload.threadData.supabase_id
      ) {
        await db.threads.update(payload.threadData.id, {
          supabase_id: syncedSupabaseThread.shared_id,
        });
      }

      // if (syncedSupabaseMessages && Array.isArray(syncedSupabaseMessages)) {
      //   for (const syncedMsg of syncedSupabaseMessages) {
      //     if (syncedMsg.dexie_id && syncedMsg.id) {
      //       // Assumes backend POST response returns dexie_id for messages
      //       await db.messages.update(syncedMsg.dexie_id, {
      //         supabase_id: syncedMsg.id,
      //       });
      //       // TODO: Update attachments in Dexie with their supabase_ids if needed
      //     }
      //   }
      // }
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

          const existingLocalThread = await db.threads
            .where("supabase_id")
            .equals(threadSupabaseId)
            .first();

          if (!existingLocalThread) {
            const threadPayloadToStore: Omit<Thread, "id"> = {
              supabase_id: threadSupabaseId,
              userId: remoteThread.clerk_user_id,
              title: remoteThread.title,
              createdAt: new Date(remoteThread.created_at),
              updatedAt: new Date(remoteThread.updated_at),
            };
          
            await db.threads.put(threadPayloadToStore);
          } 

          for (const remoteMessage of remoteThread.messages) {
            const messageSupabaseId = remoteMessage.shared_id;
            if (!messageSupabaseId) continue;

            const existingLocalMessage = await db.messages
              .where("supabase_id")
              .equals(messageSupabaseId)
              .first();

            if (!existingLocalMessage) {
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
            }
          } 
      });
    } else if (!cloudFetchResult.success) {
      console.error("Cloud sync failed:", cloudFetchResult.error);
    }
  } catch (error) {
    console.error("Failed to fetch or store cloud data:", error);
  }
}

export default function ChatPage() {
  const { supabaseThreadId } = useParams<{ supabaseThreadId?: string }>();
  const navigate = useNavigate();
  const { user, isLoaded: isUserLoaded } = useUser();
  
  const [availableModels, setAvailableModels] = useState<AiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [input, setInput] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedPreview, setAttachedPreview] = useState<string | null>(null);
  // Add drag and drop state
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  // Add edit message state
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  // Add scroll to bottom button state
  const [showScrollButton, setShowScrollButton] = useState<boolean>(false);
  // Add web search state
  const [useWebSearch, setUseWebSearch] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

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

  // --- MODEL FETCHING ---
  useEffect(() => {
    const fetchModels = async () => {
      setIsLoadingModels(true);
      try {
        const response = await fetch("/api/chat"); // Assuming GET on /api/chat lists models
        if (!response.ok) throw new Error("Failed to fetch models");
        const data = await response.json();
        if (data.models && data.models.length > 0) {
          setAvailableModels(data.models);
          // Default to Gemini model, fallback to first model if Gemini not available
          const geminiModel = data.models.find(
            (model: AiModel) => model.value === "gemini-2.5-flash-preview-05-20"
          );
          setSelectedModel(
            geminiModel ? geminiModel.value : data.models[0].value
          );
        }
      } catch (err: any) {
        setError(err.message || "Error loading models.");
        console.error(err);
      } finally {
        setIsLoadingModels(false);
      }
    };
    fetchModels();
  }, []);

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
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isScrollable = scrollHeight > clientHeight;

    // Show button when the user is more than 200px away from the bottom
    setShowScrollButton(distanceFromBottom > 200 && isScrollable);
  }, []);

  // Re-evaluate button visibility whenever messages change (e.g., new message appended)
  useEffect(() => {
    // Run in next tick to ensure DOM has rendered any new content
    const id = setTimeout(handleScroll, 50);
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

  // Simple title generation fallback
  async function generateTitleFromPrompt(
    prompt: string,
    maxLength: number
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
    return msgs.map((m) => {
      if (
        m.attachments &&
        m.attachments.length > 0 &&
        m.attachments[0].file_url
      ) {
        // Check if model supports images OR if the attachment is a data URL (local preview)
        if (
          modelSupportsImagesFlag ||
          m.attachments[0].file_url.startsWith("data:")
        ) {
          const contentArray: any[] = [];
          if (m.content && m.content.trim()) {
            // Ensure content is not empty before adding
            contentArray.push({ type: "text", text: m.content });
          }
          const url = m.attachments[0].file_url;
          // Basic check for image types for image_url, otherwise treat as generic file_url
          if (url.match(/^data:image|\\.(png|jpe?g|gif|webp)$/i)) {
            contentArray.push({ type: "image_url", image_url: { url } });
          } else {
            // For non-image files or when model doesn't support images but we have a URL
            contentArray.push({ type: "file_url", file_url: { url } });
          }
          return { role: m.role, content: contentArray };
        }
      }
      return { role: m.role, content: m.content };
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  if ((!input.trim() && !attachedFile) || isSending || !user || !user.id) {
    return;
  }

  const modelSupportsImages =
    selectedModel === "meta-llama/llama-4-maverick:free" ||
    selectedModel === "gemini-2.5-flash-preview-05-20";
  if (attachedFile && !modelSupportsImages) {
    setError("Attachments are not supported by the selected model.");
    return;
  }

  setError(null);
  setIsSending(true);

  // --- Block 1: Handle Message Editing ---
  // This logic is now self-contained and runs only when editing.
  if (editingMessage && editingMessage.id) {
    try {
      // Get the universal thread ID from the message being edited.
      const threadId = editingMessage.thread_supabase_id;

      // Update the existing message content in Dexie.
      await db.messages.update(editingMessage.id, { content: input });

      // BUG FIX: Query using the correct indexed field 'thread_supabase_id'.
      const allMessagesInThread = await db.messages
        .where("thread_supabase_id")
        .equals(threadId)
        .sortBy("createdAt");

      const editedMessageIndex = allMessagesInThread.findIndex(
        (m) => m.id === editingMessage.id
      );

      if (editedMessageIndex !== -1) {
        // Delete all assistant messages that came after the edited user message.
        const messagesToDelete = allMessagesInThread.slice(editedMessageIndex + 1);
        for (const msgToDelete of messagesToDelete) {
          if (msgToDelete.id) {
            await db.messages.delete(msgToDelete.id);
          }
        }

        // Get history up to and including the *newly updated* message.
        const historyUpToEdit = allMessagesInThread.slice(0, editedMessageIndex + 1);
        const historyForAI = buildHistoryForAI(historyUpToEdit, modelSupportsImages);

        // Create a new placeholder for the assistant's response.
        const assistantMessageData: Message = {
          thread_supabase_id: threadId,
          role: "assistant",
          content: "",
          createdAt: new Date(),
          model: selectedModel,
        };
        const assistantLocalMessageId = await db.messages.add(assistantMessageData);

        // Clear the editing state *before* the API call.
        setEditingMessage(null);
        setInput("");
        setAttachedFile(null);
        setAttachedPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";

        // Call the AI API to regenerate the response.
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            model: selectedModel, 
            messages: historyForAI,
            useWebSearch: useWebSearch && currentModelSupportsWebSearch()
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
                db.messages.update(assistantLocalMessageId, { content: fullResponse });
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
        
        const finalMessagesData = await db.messages
          .where("thread_supabase_id")
          .equals(editingMessage.thread_supabase_id)
          .toArray();
        if (finalThreadData) {
          await syncFullThreadToBackend({
            threadData: finalThreadData,
            messagesData: finalMessagesData,
            attachmentsData: [],
          });
        }
      }
    }
    return; // Exit the function after handling the edit.
  }

  // --- Block 2: Handle New Message Submission ---
  // This logic runs only when submitting a new message.
  let currentSupabaseThreadId = supabaseThreadId;
  let assistantLocalMessageId: number | null = null;

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

      syncFullThreadToBackend({
        threadData: newThreadData,
        messagesData: [],
        attachmentsData: [],
      }).catch((err) => console.error("Initial thread sync failed:", err));

      currentSupabaseThreadId = newThreadSupabaseId;
      navigate(`/chat/${newThreadSupabaseId}`, { replace: true });
    } else {
      // If it's the first message in an existing but empty thread, update the title.
      const messagesInThread = await db.messages
        .where("thread_supabase_id")
        .equals(currentSupabaseThreadId)
        .count();
      if (messagesInThread === 0) {
        const title = (await generateTitleFromPrompt(input, 50)) || "New Chat";
        await db.threads
          .where({ supabase_id: currentSupabaseThreadId })
          .modify({ title: title, updatedAt: new Date() });
      }
    }

    // File Upload Logic
    let attachmentsForDb: MessageAttachment[] = [];
    let uploadedSupabaseUrl: string | null = null;
    if (attachedFile) {
      const { supabaseUrl, fileName, error } = await uploadFileToSupabaseStorage(
        attachedFile
      );
      if (error || !supabaseUrl || !fileName) {
        throw new Error(`Supabase upload failed: ${error}`);
      }
      uploadedSupabaseUrl = supabaseUrl;
      attachmentsForDb = [{ file_name: fileName, file_url: supabaseUrl }];
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
    assistantLocalMessageId = await db.messages.add(assistantMessageData);

    // Clear inputs from UI
    setInput("");
    setAttachedFile(null);
    setAttachedPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Build history for AI, now including the new user message
    const fullHistory = await db.messages
      .where("thread_supabase_id")
      .equals(currentSupabaseThreadId)
      .sortBy("createdAt");
    const historyForAI = buildHistoryForAI(fullHistory, modelSupportsImages);

    // Call AI API
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        model: selectedModel, 
        messages: historyForAI,
        useWebSearch: useWebSearch && currentModelSupportsWebSearch()
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
            db.messages.update(assistantLocalMessageId!, { content: fullResponse });
          } catch (e) {
            console.warn("Failed to parse stream line", line, e);
          }
        }
      });
    }
  } catch (err: any) {
    console.error("Submit error:", err);
    setError(err.message || "Failed to get response.");
    // If an error occurs, update the placeholder message to show it.
    if (assistantLocalMessageId) {
      await db.messages.update(assistantLocalMessageId, {
        content: `Error: ${err.message}`,
      });
    }
  } finally {
    setIsSending(false);
    // Sync the entire thread state after the operation completes or fails.
    if (currentSupabaseThreadId) {
      // BUG FIX: Look up thread using the correct universal ID.
      const finalThreadData = await db.threads
        .where("supabase_id")
        .equals(currentSupabaseThreadId)
        .first();
      // BUG FIX: Query messages using the correct universal ID.
      const finalMessagesData = await db.messages
        .where("thread_supabase_id")
        .equals(currentSupabaseThreadId)
        .toArray();

      if (finalThreadData) {
        try {
          await syncFullThreadToBackend({
            threadData: finalThreadData,
            messagesData: finalMessagesData,
            attachmentsData: [], // Populate this if needed
          });
        } catch (syncError) {
          console.error("Sync failed in finally block:", syncError);
          // Optionally set another error state for sync-specific failures.
        }
      }
    }
  }
};

  // --- HELPER FUNCTIONS for message editing, file handling ---
  const handleEditMessage = (msg: Message) => {
    setEditingMessage(msg);
    setInput(msg.content);
    setAttachedFile(null);
    setAttachedPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Consider scrolling to the input area or the message being edited
    // messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setInput("");
    setAttachedFile(null);
    setAttachedPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachedFile = () => {
    setAttachedFile(null);
    setAttachedPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };
  // --- END HELPER FUNCTIONS ---

  const handleRegenerate = async (msg: Message) => {
    if (!messages || !msg.id || isSending) return;
    const index = messages.findIndex((m) => m.id === msg.id);
    if (index === -1) return;

    const historyBefore = messages.slice(0, index);

    const modelToUse = msg.model || selectedModel;
    const currentModelSpec = availableModels.find((m) => m.value === modelToUse);
    const modelSupportsImagesFlag = currentModelSpec?.supportsImages || false;
    const historyForAI = buildHistoryForAI(historyBefore, modelSupportsImagesFlag);

    setIsSending(true);
    // Ensure msg.id is valid before updating
    if (msg.id) {
      await db.messages.update(msg.id, { content: "" });
    }

    try {
      // Main try for handleRegenerate API call and stream processing
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          model: modelToUse, 
          messages: historyForAI,
          useWebSearch: useWebSearch && modelToUse === "gemini-2.5-flash-preview-05-20"
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
    }
  }; // End of handleRegenerate

  // Helper function to process a File object (used by both file input and drag&drop)
  const processFile = (file: File) => {
    if (attachedFile) {
      setError("Please remove the current file before adding a new one.");
      return;
    }

    setAttachedFile(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setAttachedPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setAttachedPreview(null);
    }
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

    const file = files[0]; // Only handle the first file
    if (files.length > 1) {
      setError("Please drop only one file at a time.");
      return;
    }

    processFile(file);
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
          <div className="bg-red-500/20 border border-red-500/30 backdrop-filter backdrop-blur-md text-red-100 rounded-xl p-4">
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
        {/* Drag overlay */}
        {isDragOver && (
          <div className="absolute inset-0 bg-blue-600/20 backdrop-blur-sm border-2 border-dashed border-blue-400 rounded-lg flex items-center justify-center z-50 drag-overlay">
            <div className="text-white text-2xl font-semibold bg-blue-600/80 px-6 py-3 rounded-lg backdrop-blur">
              Drop file here to attach
            </div>
          </div>
        )}

        <div className="mx-auto max-w-5xl space-y-6 px-4 pb-45">
          {/* Welcome message when no messages */}
          {(!messages || messages.length === 0) && !attachedFile && (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="text-white text-2xl font-semibold mb-3">
                Welcome to Tweak3 Chat
              </div>
              <div className="text-white/60 text-lg max-w-md">
                Start a conversation with AI. Ask questions, get help with code, or just chat!
              </div>
            </div>
          )}

          {messages?.map((m) => (
            <div
              key={m.id}
              className={`group flex ${
                m.role === "user" ? "justify-end" : "justify-start"
              } mb-8`}
            >
              {m.role === "assistant" ? (
                // Assistant message - no bubble, clean layout
                <div className="max-w-4xl w-full">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center">
                        <span className="text-white text-sm font-semibold">AI</span>
                      </div>
                      <div className="text-white/80 text-sm font-medium">
                        {availableModels.find((am) => am.value === m.model)?.displayName || m.model}
                      </div>
                      <div className="text-white/40 text-xs">
                        {new Date(m.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRegenerate(m)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-white/50 hover:text-white/80 hover:bg-white/10 rounded-md"
                      title="Regenerate response"
                    >
                      <Recycle />
                    </button>
                  </div>
                  <div className="prose prose-invert prose-lg max-w-none text-white/90 leading-relaxed">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ inline, className, children }: { inline?: boolean; className?: string; children: React.ReactNode }) {
                          const match = /language-(\w+)/.exec(className || "");
                          return !inline && match ? (
                            <div className="my-4">
                              <SyntaxHighlighter
                                style={vscDarkPlus as any}
                                language={match[1]}
                                PreTag="div"
                                customStyle={{
                                  borderRadius: '8px',
                                  fontSize: '14px',
                                  lineHeight: '1.5',
                                }}
                              >
                                {String(children).replace(/\n$/, "")}
                              </SyntaxHighlighter>
                            </div>
                          ) : (
                            <code className={`${className || ""} bg-gray-800/60 text-blue-300 rounded px-1.5 py-0.5 font-mono text-sm`}>
                              {children}
                            </code>
                          );
                        },
                        p: ({ children }) => (
                          <p className="mb-4 last:mb-0 text-white/90 leading-relaxed">{children}</p>
                        ),
                        ul: ({ children }) => (
                          <ul className="mb-4 space-y-1 text-white/90">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="mb-4 space-y-1 text-white/90">{children}</ol>
                        ),
                        li: ({ children }) => (
                          <li className="text-white/90">{children}</li>
                        ),
                        h1: ({ children }) => (
                          <h1 className="text-2xl font-bold text-white mb-4 mt-6 first:mt-0">{children}</h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-xl font-semibold text-white mb-3 mt-5 first:mt-0">{children}</h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-lg font-semibold text-white mb-2 mt-4 first:mt-0">{children}</h3>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-blue-500/50 pl-4 my-4 text-white/80 italic">{children}</blockquote>
                        ),
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
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
                // User message - keep bubble styling
                <div className="max-w-xl">
                  <div className="bg-blue-600 text-white rounded-2xl px-4 py-3 shadow-lg">
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-medium text-sm text-blue-100">You</div>
                      <button
                        type="button"
                        onClick={() => handleEditMessage(m)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-blue-200 hover:text-white hover:bg-blue-500/30 rounded"
                        title="Edit message"
                      >
                        <Pencil />
                      </button>
                    </div>
                    <div className="text-white leading-relaxed">
                      <p style={{ whiteSpace: "pre-wrap" }}>{m.content}</p>
                    </div>
                    {m.attachments &&
                      m.attachments.map((att, index) => (
                        <div key={index} className="mt-3">
                          {att.file_url.startsWith("data:image") ? (
                            <img
                              src={att.file_url}
                              alt={att.file_name}
                              className="max-w-xs rounded-lg"
                            />
                          ) : (
                            <a
                              href={att.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-200 hover:text-white hover:underline"
                            >
                              {att.file_name}
                            </a>
                          )}
                        </div>
                      ))}
                    <div className="text-xs text-blue-200/70 mt-2">
                      {new Date(m.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} /> {/* For scrolling to bottom */}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20">
        {/* Scroll to bottom button */}
        {showScrollButton && (
          <div className="flex justify-center mb-4">
            <button
              onClick={scrollToBottom}
              className="bg-gray-800/90 hover:bg-gray-700/90 backdrop-blur-sm border border-gray-600/50 text-white/80 hover:text-white px-4 py-2 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-2 text-sm font-medium"
              title="Scroll to bottom"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 13l3 3 3-3"/>
                <path d="M7 6l3 3 3-3"/>
              </svg>
              <span>Scroll to bottom</span>
            </button>
          </div>
        )}
        <div className="pt-8 pb-6">
          <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-4">
            <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 rounded-2xl p-4 shadow-2xl">
              {/* Model Controls Row */}
              <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {/* Model Selector */}
                  <div className="flex items-center space-x-2">
                    <span className="text-white/70 text-sm font-medium">Model:</span>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="glass-button-sidebar px-3 py-2 text-white text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all min-w-0"
                      disabled={isLoadingModels || availableModels.length === 0}
                    >
                      {isLoadingModels && <option value="" className="bg-gray-800 text-white">Loading models...</option>}
                      {!isLoadingModels && availableModels.length === 0 && (
                        <option value="" className="bg-gray-800 text-white">No models available</option>
                      )}
                      {availableModels.map((m) => (
                        <option key={m.value} value={m.value} className="bg-gray-800 text-white">
                          {m.displayName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Web Search Toggle */}
                  {currentModelSupportsWebSearch() && (
                    <div className="flex items-center space-x-3">
                      <div className="w-px h-6 bg-white/20"></div>
                      <label className="flex items-center space-x-2 cursor-pointer glass-button-sidebar px-3 py-2 rounded-lg hover:shadow-lg transition-colors">
                        <input
                          type="checkbox"
                          checked={useWebSearch}
                          onChange={(e) => setUseWebSearch(e.target.checked)}
                          className="w-4 h-4 text-blue-600 bg-transparent border-2 border-white/40 rounded focus:ring-blue-500 focus:ring-2"
                        />
                        <span className="text-white text-sm font-medium">Web Search</span>
                      </label>
                      <div className="group relative">
                        <button
                          type="button"
                          className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
                        >
                          <svg 
                            className="w-3 h-3 text-gray-400 hover:text-white cursor-help" 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M9,9h0a3,3,0,0,1,5.12,2.12h0A3,3,0,0,1,13,14.26V16"/>
                            <circle cx="12" cy="20" r="1"/>
                          </svg>
                        </button>
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800/90 backdrop-blur text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                          Enable real-time web search for current information
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {editingMessage && (
                <div className="mb-3 p-3 bg-blue-600/10 border border-blue-500/20 rounded-xl flex items-center justify-between">
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
              {useWebSearch && currentModelSupportsWebSearch() && (
                <div className="mb-3 p-3 bg-green-600/10 border border-green-500/20 rounded-xl flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="M21 21l-4.35-4.35"/>
                  </svg>
                  <span className="text-green-300 text-sm font-medium">
                    Web search enabled - responses will include real-time information
                  </span>
                </div>
              )}
              {attachedFile && (
                <div className="mb-3 p-3 bg-gray-700/50 rounded-xl flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {attachedPreview ? (
                      <img
                        src={attachedPreview}
                        alt="Preview"
                        className="w-12 h-12 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-600 rounded-lg flex items-center justify-center">
                        <span className="text-gray-300 text-xs font-medium">FILE</span>
                      </div>
                    )}
                    <div>
                      <div className="text-white text-sm font-medium truncate max-w-xs">
                        {attachedFile.name}
                      </div>
                      <div className="text-gray-400 text-xs">
                        {(attachedFile.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeAttachedFile}
                    className="text-red-400 hover:text-red-300 p-1.5 rounded-md hover:bg-red-500/10 transition-colors"
                  >
                    <XSquare />
                  </button>
                </div>
              )}
              <div className="flex items-end space-x-3">
                <div className="flex-1">
                  <textarea
                    className="w-full bg-transparent text-white placeholder-gray-400 resize-none focus:outline-none text-base leading-relaxed p-3 rounded-xl border border-gray-600/50 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    value={input}
                    placeholder="Type your message..."
                    onChange={(e) => setInput(e.target.value)}
                    disabled={isSending}
                    rows={1}
                    style={{ minHeight: "3rem", maxHeight: "8rem" }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e as any);
                      }
                    }}
                  />
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSending || editingMessage !== null}
                  className="p-3 text-gray-400 hover:text-white transition-colors rounded-xl hover:bg-gray-700/50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Attach file"
                >
                  <Paperclip />
                </button>
                <button
                  type="submit"
                  disabled={isSending || (!input.trim() && !attachedFile)}
                  className="p-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-xl transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
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
}