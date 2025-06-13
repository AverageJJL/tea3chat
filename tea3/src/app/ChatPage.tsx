"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/nextjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Thread, Message, MessageAttachment } from './db'; // Ensure MessageAttachment is exported from db.ts
import { uploadFileToSupabaseStorage } from './supabaseStorage';
import Sidebar from './Sidebar';
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
  threadId: string; 
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
  dexie_id: number | null; 
  clerk_user_id: string;
  title: string;
  created_at: string; 
  updated_at: string; 
  messages: SupabaseMessage[];
}

async function syncFullThreadToBackend(payload: FullThreadSyncPayload): Promise<any> {
  try {
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to sync full thread: ${response.statusText}`);
    }
    const result = await response.json();

    if (result.success && result.data) {
      const syncedSupabaseThread = result.data.thread;
      const syncedSupabaseMessages = result.data.messages;

      if (syncedSupabaseThread && syncedSupabaseThread.id && payload.threadData.id) {
        await db.threads.update(payload.threadData.id, { supabase_id: syncedSupabaseThread.id });
      }

      if (syncedSupabaseMessages && Array.isArray(syncedSupabaseMessages)) {
        for (const syncedMsg of syncedSupabaseMessages) {
          if (syncedMsg.dexie_id && syncedMsg.id) { // Assumes backend POST response returns dexie_id for messages
            await db.messages.update(syncedMsg.dexie_id, { supabase_id: syncedMsg.id });
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
    try { await db.open(); } catch (e) { console.error("Failed to open Dexie DB:", e); return; }
  }
  try {
    const response = await fetch('/api/sync');
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to fetch data: ${response.statusText}`);
    }
    const cloudFetchResult = await response.json();

    if (cloudFetchResult.success && cloudFetchResult.data) {
      const supabaseThreads: SupabaseThread[] = cloudFetchResult.data;

      await db.transaction('rw', db.threads, db.messages, async () => {
        for (const remoteThread of supabaseThreads) {
          let localThreadId: number | undefined;
          const existingThreadBySupabaseId = await db.threads.get({ supabase_id: remoteThread.id });

          const threadPayloadToStore: Omit<Thread, 'id'> = {
            supabase_id: remoteThread.id,
            userId: remoteThread.clerk_user_id,
            title: remoteThread.title,
            createdAt: new Date(remoteThread.created_at),
            updatedAt: new Date(remoteThread.updated_at),
          };

          if (existingThreadBySupabaseId && existingThreadBySupabaseId.id) {
            localThreadId = existingThreadBySupabaseId.id;
            await db.threads.update(localThreadId, threadPayloadToStore);
          } else {
            localThreadId = await db.threads.add(threadPayloadToStore as Thread);
          }

          if (!localThreadId) continue;

          for (const remoteMessage of remoteThread.messages) {
            const localMessageAttachments: MessageAttachment[] = remoteMessage.attachments.map(att => ({
              supabase_id: att.id,
              file_name: att.file_name,
              file_url: att.file_url,
            }));

            const existingMessageBySupabaseId = await db.messages.get({ supabase_id: remoteMessage.id });
            const messagePayloadToStore: Omit<Message, 'id'> = {
              supabase_id: remoteMessage.id,
              threadId: localThreadId,
              role: remoteMessage.role,
              content: remoteMessage.content,
              attachments: localMessageAttachments,
              createdAt: new Date(remoteMessage.created_at),
              model: remoteMessage.model,
            };

            if (existingMessageBySupabaseId && existingMessageBySupabaseId.id) {
              await db.messages.update(existingMessageBySupabaseId.id, messagePayloadToStore);
            } else {
              await db.messages.add(messagePayloadToStore as Message);
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
  const { threadId: routeThreadId } = useParams<{ threadId?: string }>();
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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
          const geminiModel = data.models.find((model: AiModel) => model.value === "gemini-2.5-flash-preview-05-20");
          setSelectedModel(geminiModel ? geminiModel.value : data.models[0].value);
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
      if (!routeThreadId) return [];
      const currentLocalThreadId = parseInt(routeThreadId);
      if (isNaN(currentLocalThreadId)) return [];
      return db.messages.where("threadId").equals(currentLocalThreadId).sortBy("createdAt");
    },
    [routeThreadId]
  );

  useEffect(() => {
    if (user && isUserLoaded) {
      fetchAndStoreCloudData();
    }
  }, [user, isUserLoaded]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Prevent default drag behavior on the entire window
  useEffect(() => {
    const preventDefault = (e: DragEvent) => {
      e.preventDefault();
    };

    window.addEventListener('dragover', preventDefault);
    window.addEventListener('drop', preventDefault);

    return () => {
      window.removeEventListener('dragover', preventDefault);
      window.removeEventListener('drop', preventDefault);
    };
  }, []);

  // Simple title generation fallback
  async function generateTitleFromPrompt(prompt: string, maxLength: number): Promise<string | null> {
    return prompt ? prompt.slice(0, maxLength) : "New Chat";
  }

  // --- ACTIONS ---
  const handleNewChat = async () => {
    if (!user || !user.id) {
      setError("User not authenticated."); return;
    }
    try {
      const newThreadLocalData: Omit<Thread, 'id'> = {
        userId: user.id,
        title: "New Chat",
        createdAt: new Date(),
        updatedAt: new Date(),
        supabase_id: null,
      };
      const newThreadLocalId = await db.threads.add(newThreadLocalData as Thread);
      const newThreadForSync = await db.threads.get(newThreadLocalId);
      if (newThreadForSync) {
        try {
          await syncFullThreadToBackend({ threadData: newThreadForSync, messagesData: [], attachmentsData: [] });
        } catch (e) { console.error("Sync failed for new thread:", e); }
      }
      navigate(`/chat/${newThreadLocalId}`);
    } catch (err) { console.error("Failed to create new chat:", err); setError("Failed to create chat."); }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() && !attachedFile) return;
    if (isSending) return;
    if (!user || !user.id) { setError("User not authenticated."); return; }

    const modelSupportsImages = selectedModel === "meta-llama/llama-4-maverick:free" || selectedModel === "gemini-2.5-flash-preview-05-20";
    if (attachedFile && !modelSupportsImages) {
      setError("Attachments are not supported by the selected model.");
      return;
    }
    setError(null); setIsSending(true);

    let currentLocalThreadId: number;

    if (!routeThreadId) {
      try {
        const title = await generateTitleFromPrompt(input, 50) || "New Chat";
        const newThreadData: Omit<Thread, 'id'> = { userId: user.id, title, createdAt: new Date(), updatedAt: new Date(), supabase_id: null };
        currentLocalThreadId = await db.threads.add(newThreadData as Thread);
        const threadToSync = await db.threads.get(currentLocalThreadId);
        if (threadToSync) await syncFullThreadToBackend({ threadData: threadToSync, messagesData: [], attachmentsData: [] });
        navigate(`/chat/${currentLocalThreadId}`);
      } catch (err) { console.error("Failed to create new thread on submit:", err); setError("Failed to create thread."); setIsSending(false); return; }
    } else {
      currentLocalThreadId = parseInt(routeThreadId);
      if (isNaN(currentLocalThreadId)) { setError("Invalid thread ID."); setIsSending(false); return; }
      // Potentially update title if first message in an empty "New Chat"
      const currentThreadData = await db.threads.get(currentLocalThreadId);
      const messagesInThread = await db.messages.where('threadId').equals(currentLocalThreadId).count();
      if (messagesInThread === 0 && input.trim() && currentThreadData && (currentThreadData.title === "New Chat" || !currentThreadData.title)) {
        const newTitle = await generateTitleFromPrompt(input, 50);
        if (newTitle) {
          await db.threads.update(currentLocalThreadId, { title: newTitle, updatedAt: new Date() });
          const updatedThreadForSync = await db.threads.get(currentLocalThreadId);
          if (updatedThreadForSync) await syncFullThreadToBackend({ threadData: updatedThreadForSync, messagesData: [], attachmentsData: [] });
        }
      }
    }

    let assistantLocalMessageId: number | null = null;
    try {
      let userMessageLocalId: number | undefined;
      let attachmentsForDb: MessageAttachment[] = [];
      let attachmentsForSync: FullThreadSyncPayload['attachmentsData'] = [];
      let uploadedSupabaseUrl: string | null = null;
      let uploadedFileName: string | null = null;

      if (attachedFile) {
        const fileToUpload = attachedFile;
        try {
          const { supabaseUrl, fileName, error: uploadError } = await uploadFileToSupabaseStorage(fileToUpload);


          if (uploadError) {
            throw new Error(`Supabase upload failed: ${uploadError}`);
          }
          if (!supabaseUrl || !fileName) {
            throw new Error("Supabase upload returned invalid data.");
          }
          uploadedSupabaseUrl = supabaseUrl;
          uploadedFileName = fileName;
          attachmentsForDb = [{ file_name: uploadedFileName, file_url: uploadedSupabaseUrl, supabase_id: null }];
        } catch (uploadErr: any) {
          console.error("Supabase storage upload failed:", uploadErr);
          setError(`Failed to upload image: ${uploadErr.message}`);
          setIsSending(false);
          return; 
        }
      } else {
        attachmentsForDb = [];
      }

      const userMessageData: Omit<Message, 'id'> = {
        threadId: currentLocalThreadId,
        role: "user",
        content: input,
        attachments: attachmentsForDb,
        createdAt: new Date(),
        model: selectedModel,
        supabase_id: null,
      };
      userMessageLocalId = await db.messages.add(userMessageData as Message);

      if (userMessageLocalId && uploadedSupabaseUrl && uploadedFileName && attachmentsForDb.length > 0) {
        attachmentsForSync = attachmentsForDb.map(att => ({
          localMessageId: userMessageLocalId!,
          file_name: att.file_name, 
          file_url: att.file_url, 
        }));
      } else {
        attachmentsForSync = [];
      }

      const currentInput = input; setInput("");
      const currentAttachedFileForPreview = attachedPreview; setAttachedPreview(null); setAttachedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      const assistantMessageData: Omit<Message, 'id'> = {
        threadId: currentLocalThreadId, role: "assistant", content: "", createdAt: new Date(), model: selectedModel, supabase_id: null
      };
      assistantLocalMessageId = await db.messages.add(assistantMessageData as Message);

      const historyForAI = (messages || []).map(m => {
        if (m.attachments && m.attachments.length > 0 && m.attachments[0].file_url) {
          if (m.attachments[0].file_url.startsWith('data:') || modelSupportsImages) {
            const contentArray = [] as any[];
            if (m.content.trim()) {
              contentArray.push({ type: "text", text: m.content });
            }
            const url = m.attachments[0].file_url;
            if (url.match(/^data:image|\.(png|jpe?g|gif|webp)$/i)) {
              contentArray.push({ type: "image_url", image_url: { url } });
            } else {
              contentArray.push({ type: "file_url", file_url: { url } });
            }
            return { role: m.role, content: contentArray };
          }
        }
        return { role: m.role, content: m.content };
      });

      const apiRequestBody: any = { model: selectedModel, messages: [...historyForAI] };
      
      const currentUserMessageContentForAI: any = { role: "user" };
      if (uploadedSupabaseUrl && modelSupportsImages && attachedFile) {
        const contentArray = [] as any[];
        if (currentInput.trim()) {
          contentArray.push({ type: "text", text: currentInput });
        }
        if (attachedFile.type.startsWith('image/')) {
          contentArray.push({ type: "image_url", image_url: { url: uploadedSupabaseUrl } });
        } else {
          contentArray.push({ type: "file_url", file_url: { url: uploadedSupabaseUrl, mime_type: attachedFile.type } });
        }
        currentUserMessageContentForAI.content = contentArray;
      } else {
        currentUserMessageContentForAI.content = currentInput;
      }
      apiRequestBody.messages.push(currentUserMessageContentForAI);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json", // <-- ADD THIS HEADER
        },
        body: JSON.stringify(apiRequestBody),
      });
      if (!response.body) throw new Error("Response has no body");
      if (!response.ok) {
        const errData = await response.json();
        let displayErrorMessage = "API error"; // Default message
        if (errData) {
          if (errData.error) {
            if (typeof errData.error === 'string') {
              displayErrorMessage = errData.error;
            } else if (errData.error.message && typeof errData.error.message === 'string') {
              // If errData.error is an object with a message property
              displayErrorMessage = errData.error.message;
            } else {
              // Otherwise, try to stringify the errData.error object
              try {
                displayErrorMessage = JSON.stringify(errData.error);
              } catch (stringifyError) {
                displayErrorMessage = "Invalid error object received from API";
              }
            }
          } else if (typeof errData.message === 'string') {
            // Fallback if the error message is directly in errData.message
            displayErrorMessage = errData.message;
          }
        }
        throw new Error(displayErrorMessage);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // Process Vercel AI SDK stream format (assuming 0: prefix for content)
        chunk.split('\n').forEach(line => {
          if (line.startsWith("0:")) {
            try {
              fullResponse += JSON.parse(line.substring(2));
              if (assistantLocalMessageId) db.messages.update(assistantLocalMessageId, { content: fullResponse });
            } catch (e) { console.warn("Failed to parse stream line", line, e); }
          }
        });
      }
    } catch (err: any) {
      console.error("Submit error:", err);
      setError(err.message || "Failed to get response.");
      if (assistantLocalMessageId) await db.messages.update(assistantLocalMessageId, { content: `Error: ${err.message}` });
    } finally {
      setIsSending(false);
      // Sync the entire thread state after the operation
      const finalThreadData = await db.threads.get(currentLocalThreadId);
      const finalMessagesData = await db.messages.where('threadId').equals(currentLocalThreadId).toArray();
      let finalAttachmentsDataForSync: FullThreadSyncPayload['attachmentsData'] = [];
      for (const msg of finalMessagesData) {
        if (msg.attachments && msg.id) {
          msg.attachments.forEach(att => {
            // Ensure att.file_url is the Supabase Storage URL for sync
            if (att.file_url && !att.file_url.startsWith('data:')) { 
              finalAttachmentsDataForSync.push({ localMessageId: msg.id!, file_name: att.file_name, file_url: att.file_url });
            } else if (att.file_url && att.file_url.startsWith('data:')) {
              // This case means an old message still has a data URL.
              // It won't be synced correctly unless it was uploaded during this session and updated in finalMessagesData.
              // The current logic primarily fixes new uploads.
              console.warn(`Attachment ${att.file_name} for message ${msg.id} has a data URL. It might not be synced correctly if not uploaded to Supabase.`);
            }
          });
        }
      }
      if (finalThreadData) {
        try {
          await syncFullThreadToBackend({ threadData: finalThreadData, messagesData: finalMessagesData, attachmentsData: finalAttachmentsDataForSync });
        } catch (syncError) { console.error("Sync failed in finally block:", syncError); }
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const removeAttachedFile = () => {
    setAttachedFile(null);
    setAttachedPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleEditMessage = (msg: Message) => {
    setInput(msg.content);
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const buildHistoryForAI = (msgs: Message[], modelSupportsImages: boolean) => {
    return msgs.map((m) => {
      if (m.attachments && m.attachments.length > 0 && m.attachments[0].file_url) {
        if (m.attachments[0].file_url.startsWith('data:') || modelSupportsImages) {
          const contentArray: any[] = [];
          if (m.content.trim()) {
            contentArray.push({ type: 'text', text: m.content });
          }
          const url = m.attachments[0].file_url;
          if (url.match(/^data:image|\.(png|jpe?g|gif|webp)$/i)) {
            contentArray.push({ type: 'image_url', image_url: { url } });
          } else {
            contentArray.push({ type: 'file_url', file_url: { url } });
          }
          return { role: m.role, content: contentArray };
        }
      }
      return { role: m.role, content: m.content };
    });
  };

  const handleRegenerate = async (msg: Message) => {
    if (!messages || !msg.id || isSending) return;
    const index = messages.findIndex((m) => m.id === msg.id);
    if (index === -1 || index === 0) return;
    const historyBefore = messages.slice(0, index);
    const modelToUse = msg.model || selectedModel;
    const modelSupportsImages = modelToUse === "meta-llama/llama-4-maverick:free" || modelToUse === "gemini-2.5-flash-preview-05-20";
    const historyForAI = buildHistoryForAI(historyBefore, modelSupportsImages);

    setIsSending(true);
    await db.messages.update(msg.id, { content: '' });
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelToUse, messages: historyForAI }),
      });
      if (!response.ok || !response.body) throw new Error('API error');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        chunk.split('\n').forEach((line) => {
          if (line.startsWith('0:')) {
            try {
              full += JSON.parse(line.substring(2));
              db.messages.update(msg.id!, { content: full });
            } catch (e) {
              console.warn('parse stream line failed', line, e);
            }
          }
        });
      }
    } catch (err: any) {
      console.error('Regenerate error:', err);
      await db.messages.update(msg.id, { content: `Error: ${err.message}` });
    } finally {
      setIsSending(false);
    }
  };

  // Helper function to process a File object (used by both file input and drag&drop)
  const processFile = (file: File) => {
    if (attachedFile) {
      setError("Please remove the current file before adding a new one.");
      return;
    }
    
    setAttachedFile(file);
    if (file.type.startsWith('image/')) {
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
    return <div className="chat-container h-screen w-screen flex items-center justify-center">
      <div className="glass-effect rounded-2xl p-8 text-white text-lg font-medium">Loading...</div></div>;
  }

  return (
    <div className="flex h-screen w-screen bg-gray-900">
      {user && <Sidebar userId={user.id} onNewChat={handleNewChat} />}
      <div className="chat-container flex-grow flex flex-col">
        <div className="header-glass p-6 flex justify-between items-center relative z-10 shrink-0">
          <div className="flex items-center space-x-6">
            <h1 className="text-2xl font-bold text-white">Tweak3 Chat</h1>
            {/* Model Selector Dropdown Here */}
            <select 
              value={selectedModel} 
              onChange={e => setSelectedModel(e.target.value)} 
              className="bg-gray-800 text-white p-2 rounded"
              disabled={isLoadingModels || availableModels.length === 0}
            >
              {isLoadingModels && <option value="">Loading models...</option>}
              {!isLoadingModels && availableModels.length === 0 && <option value="">No models available</option>}
              {availableModels.map(m => <option key={m.value} value={m.value}>{m.displayName}</option>)}
            </select>
          </div>
          {user && <div className="text-white">{user.primaryEmailAddress?.emailAddress}</div>}
        </div>

        {error && (
          <div className="mx-6 mt-4 relative z-10">
            <div className="bg-red-500/20 border border-red-500/30 backdrop-filter backdrop-blur-md text-red-100 rounded-xl p-4">
              Error: {error}
            </div>
          </div>
        )}

        <div 
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


          
          <div className="mx-auto max-w-4xl space-y-6">
            {/* Welcome message when no messages */}
            {(!messages || messages.length === 0) && !attachedFile && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="text-white/60 text-lg mb-4">
                  Welcome to Tweak3 Chat
                </div>
                <div className="text-white/40 text-sm">
                  Start a conversation
                </div>
              </div>
            )}
            
            {messages?.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`message-bubble max-w-xl p-4 rounded-2xl ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white'}`}>
              <div className="flex justify-between items-center">
                <div className="font-bold capitalize"><small>{m.role === 'assistant' ? (availableModels.find(am => am.value === m.model)?.displayName || m.model): m.role}</small></div>
                {m.role === 'user' && (
                  <button type="button" onClick={() => handleEditMessage(m)} className="ml-2 text-xs text-white/70 hover:text-white"><Pencil /></button>
                )}
                {m.role === 'assistant' && (
                  <button type="button" onClick={() => handleRegenerate(m)} className="ml-2 text-xs text-white/70 hover:text-white"><Recycle /></button>
                )}
              </div>
              <p style={{ whiteSpace: 'pre-wrap' }}>{m.content}</p>
              {m.attachments && m.attachments.map((att, index) => (
                <div key={index} className="mt-2">
                {att.file_url.startsWith('data:image') ? (
                  <img src={att.file_url} alt={att.file_name} className="max-w-xs max-h-xs rounded" />
                ) : (
                  <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:underline">
                  {att.file_name}
                  </a>
                )}
                </div>
              ))}
              <div className="text-xs opacity-70 mt-1">{new Date(m.createdAt).toLocaleTimeString()}</div>
              </div>
            </div>
            ))}
            <div ref={messagesEndRef} /> {/* For scrolling to bottom */}
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-20">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
            <div className="chat-input-unified rounded-t-2xl p-4">
              {attachedFile && (
                <div className="mb-2 p-2 bg-gray-700 rounded flex items-center justify-between">
                  {attachedPreview ? (
                    <img src={attachedPreview} alt="Preview" className="max-h-16 max-w-xs rounded" />
                  ) : (
                    <span className="text-white text-sm">{attachedFile.name}</span>
                  )}
                  <button type="button" onClick={removeAttachedFile} className="text-red-400 hover:text-red-300"><XSquare /></button>
                </div>
              )}
              <div className="flex items-end space-x-3">
                <textarea
                  className="w-full bg-transparent text-white placeholder-white/50 resize-none focus:outline-none text-lg leading-relaxed p-3 rounded-lg border border-gray-600 focus:border-blue-500"
                  value={input}
                  placeholder="Type your message..."
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isSending}
                  rows={1}
                  style={{ minHeight: '3rem', maxHeight: '10rem' }} // Adjusted minHeight
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e as any); // Cast to any if type conflict, or adjust handleSubmit
                    }
                  }}
                />
                <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isSending} className="p-3 text-white/70 hover:text-white transition-colors rounded-lg hover:bg-white/10 focus:outline-none">
                  <Paperclip />
                </button>
                <button type="submit" disabled={isSending || (!input.trim() && !attachedFile)} className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors focus:outline-none disabled:opacity-50">
                  {isSending ? <Loader2 /> : <SendHorizonal />} {/* Removed className from Loader2 for now, will address if it's a styled component */}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
