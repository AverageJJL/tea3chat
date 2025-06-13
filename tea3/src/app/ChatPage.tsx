"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/nextjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Thread, Message, MessageAttachment } from './db'; // Ensure MessageAttachment is exported from db.ts
import { uploadFileToSupabaseStorage } from './supabaseStorage'; // ASSUMPTION: Create and import this utility
import Sidebar from './Sidebar';
// import { SendHorizonal, Paperclip, XSquare, Loader2, Bot, User } from 'lucide-react'; // Assuming lucide-react for icons

// Placeholder for icons if lucide-react is not used or to avoid import errors
const SendHorizonal = () => <span>Send</span>;
const Paperclip = () => <span>Attach</span>;
const XSquare = () => <span>X</span>;
const Loader2 = () => <span>Loading...</span>;
const Bot = () => <span>Bot</span>;
const User = () => <span>User</span>;

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
    console.log("Full thread synced to backend:", result);

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
    console.log("Attempting to fetch data from Supabase backend...");
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
      console.log("Data synced from Supabase and stored locally.");
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
  const [attachedImage, setAttachedImage] = useState<string | null>(null); // This is a base64 data URL for preview
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
          setSelectedModel(data.models[0].value); // Default to first model
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

  // Title Generation (Placeholder - assuming it exists elsewhere or is simple)
  async function generateTitleFromPrompt(prompt: string, maxLength: number): Promise<string | null> {
    if (!prompt) return "New Chat";
    return prompt.substring(0, Math.min(prompt.length, maxLength));
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
    if (!input.trim() && !attachedImage) return;
    if (isSending) return;
    if (!user || !user.id) { setError("User not authenticated."); return; }

    const modelSupportsImages = selectedModel === "meta-llama/llama-4-maverick:free";
    if (attachedImage && !modelSupportsImages) {
      setError("Image attachments are not supported by the selected model.");
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

      if (attachedImage && fileInputRef.current?.files?.[0]) {
        const fileToUpload = fileInputRef.current.files[0];
        try {
          console.log(`Attempting to upload ${fileToUpload.name} to Supabase Storage...`);
          // ASSUMPTION: uploadFileToSupabaseStorage is an async function that uploads the file
          // and returns { supabaseUrl: string, fileName: string, error?: string }
          console.log("heyy");
          
          const { supabaseUrl, fileName, error: uploadError } = await uploadFileToSupabaseStorage(fileToUpload);
          console.log("completed upload");
          
          // Replace with actual call. For now, using a placeholder to illustrate logic:
          // const uploadResponse = { supabaseUrl: `https://fake-supabase.url/${fileToUpload.name}`, fileName: fileToUpload.name, error: undefined }; // Placeholder
          // const { supabaseUrl, fileName, error: uploadError } = await uploadFileToSupabaseStorage(fileToUpload);


          if (uploadError) {
            throw new Error(`Supabase upload failed: ${uploadError}`);
          }
          if (!supabaseUrl || !fileName) {
            throw new Error("Supabase upload returned invalid data.");
          }
          uploadedSupabaseUrl = supabaseUrl;
          uploadedFileName = fileName;
          console.log(`File uploaded to Supabase: ${uploadedSupabaseUrl}`);
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
      const currentAttachedImageForPreview = attachedImage; setAttachedImage(null); // Keep using currentAttachedImage for preview reset
      if (fileInputRef.current) fileInputRef.current.value = "";

      const assistantMessageData: Omit<Message, 'id'> = {
        threadId: currentLocalThreadId, role: "assistant", content: "", createdAt: new Date(), model: selectedModel, supabase_id: null
      };
      assistantLocalMessageId = await db.messages.add(assistantMessageData as Message);

      const historyForAI = (messages || []).map(m => {
        if (m.attachments && m.attachments.length > 0 && m.attachments[0].file_url) {
          // If the attachment URL is a data URL OR the current model (selected for the new message) supports images, send as multi-modal
          if (m.attachments[0].file_url.startsWith('data:') || modelSupportsImages) {
            const contentArray = [];
            if (m.content.trim()) { // Add text part if text exists
                contentArray.push({ type: "text", text: m.content });
            }
            contentArray.push({ type: "image_url", image_url: { url: m.attachments[0].file_url } });
            return { role: m.role, content: contentArray };
          }
        }
        // Otherwise, send only text
        return { role: m.role, content: m.content };
      });

      const apiRequestBody: any = { model: selectedModel, messages: [...historyForAI] };
      
      const currentUserMessageContentForAI: any = { role: "user" };
      if (uploadedSupabaseUrl && modelSupportsImages) {
        const contentArray = [];
        if (currentInput.trim()) {
          // This is the part that creates the duplicate text
          contentArray.push({ type: "text", text: currentInput });
        }
        contentArray.push({
          type: "image_url",
          image_url: { url: uploadedSupabaseUrl },
        });
        currentUserMessageContentForAI.content = contentArray;
      } else {
        currentUserMessageContentForAI.content = currentInput; // Only text
      }
      apiRequestBody.messages.push(currentUserMessageContentForAI);

      console.log(
        "FRONTEND: Sending this body to /api/chat:",
        JSON.stringify(apiRequestBody, null, 2)
      );
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
    const reader = new FileReader();
    reader.onload = () => setAttachedImage(reader.result as string); // Store as data URL for preview
    reader.readAsDataURL(file);
  };

  const removeAttachedImage = () => {
    setAttachedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 ">
            <div className="mx-auto max-w-4xl space-y-6">
            {messages?.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`message-bubble max-w-xl p-4 rounded-2xl ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white'}`}>
              <div className="font-bold capitalize"><small>{m.role === 'assistant' ? (availableModels.find(am => am.value === m.model)?.displayName || m.model): m.role}</small></div>
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
              {attachedImage && (
                <div className="mb-2 p-2 bg-gray-700 rounded flex items-center justify-between">
                  <img src={attachedImage} alt="Preview" className="max-h-16 max-w-xs rounded" />
                  <button type="button" onClick={removeAttachedImage} className="text-red-400 hover:text-red-300"><XSquare /></button>
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
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" style={{ display: 'none' }} />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isSending} className="p-3 text-white/70 hover:text-white transition-colors rounded-lg hover:bg-white/10 focus:outline-none">
                  <Paperclip />
                </button>
                <button type="submit" disabled={isSending || (!input.trim() && !attachedImage)} className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors focus:outline-none disabled:opacity-50">
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