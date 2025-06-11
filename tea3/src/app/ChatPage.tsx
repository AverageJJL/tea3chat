"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db"; // Your Dexie instance

// Define a type for the model objects for better TypeScript support
interface AiModel {
  value: string;
  displayName: string;
}

export default function ChatPage() {
  const { threadId } = useParams();
  const navigate = useNavigate();

  // --- STATE FROM chatpage.js (MERGED) ---
  const [availableModels, setAvailableModels] = useState<AiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState<boolean>(false); // For the "Sending..." button state

  // --- STATE FROM original chatpage.tsx ---
  const [input, setInput] = useState("");

  // --- ATTACHMENTS STATE ---
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- MODEL FETCHING LOGIC (from chatpage.js) ---
  useEffect(() => {
    const fetchModels = async () => {
      try {
        // A GET request to the same endpoint should return the models
        const response = await fetch("/api/chat");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.error) {
          throw new Error(data.error);
        }
        setAvailableModels(data.models);
        if (data.models.length > 0) {
          setSelectedModel(data.models[0].value);
        }
      } catch (err: any) {
        console.error("Failed to fetch models:", err);
        setError(
          err.message ||
            "Failed to load available models. Please refresh the page."
        );
      } finally {
        setIsLoadingModels(false);
      }
    };

    fetchModels();
  }, []);

  // --- DATA FETCHING (from original chatpage.tsx) ---
  const messages = useLiveQuery(
    () => {
      if (!threadId) return [];
      return db.messages
        .where("threadId")
        .equals(parseInt(threadId))
        .sortBy("createdAt");
    },
    [threadId]
  );

  // --- ACTIONS (MERGED) ---
  const handleNewChat = async () => {
    try {
      const newThreadId = await db.threads.add({
        title: "New Chat",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      navigate(`/chat/${newThreadId}`);
    } catch (error) {
      console.error("Failed to create new chat:", error);
      setError("Failed to create a new chat session.");
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() && !attachedImage) return; // Require text or image
    if (isSending) return;

    // If an image is attached but the selected model doesn't support it, show an error
    const modelSupportsImages = selectedModel === "meta-llama/llama-4-maverick:free";
    if (attachedImage && !modelSupportsImages) {
      setError("Image attachments are not supported by the selected model.");
      return;
    }

    setError(null); // Clear previous errors on a new submission
    setIsSending(true); // Set sending state for the button

    let currentThreadId: number;

    // If no threadId exists, create a new thread automatically
    if (!threadId) {
      try {
        currentThreadId = await db.threads.add({
          title: "New Chat",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        navigate(`/chat/${currentThreadId}`);
      } catch (error) {
        console.error("Failed to create new chat:", error);
        setError("Failed to create a new chat session.");
        setIsSending(false);
        return;
      }
    } else {
      currentThreadId = parseInt(threadId);
    }

    let assistantMessageId: number | null = null;

    const historyForAI = (messages || []).map((m) => {
      // Re-hydrate messages for the AI provider – if a message has attachments, convert them to the multimodal format
      if (m.attachments && m.attachments.length > 0) {
        return {
          role: m.role,
          content: [
            { type: "text", text: m.content },
            ...m.attachments.map((url) => ({
              type: "image_url",
              image_url: { url },
            })),
          ],
        } as any;
      }
      return { role: m.role, content: m.content } as any;
    });

    try {
      await db.messages.add({
        threadId: currentThreadId,
        role: "user",
        content: input,
        attachments: attachedImage ? [attachedImage] : undefined,
        createdAt: new Date(),
      });

      const currentInput = input;
      setInput("");

      assistantMessageId = await db.messages.add({
        threadId: currentThreadId,
        role: "assistant",
        content: "",
        createdAt: new Date(),
      });

      let userMessageForAPI: any;
      if (attachedImage) {
        const multimodalParts: any[] = [];
        if (currentInput.trim()) {
          multimodalParts.push({ type: "text", text: currentInput });
        }
        multimodalParts.push({ type: "image_url", image_url: { url: attachedImage } });
        userMessageForAPI = { role: "user", content: multimodalParts };
      } else {
        userMessageForAPI = { role: "user", content: currentInput };
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          model: selectedModel, // <-- Send the selected model
          messages: [...historyForAI, userMessageForAPI],
        }),
      });

      if (!response.body) throw new Error("Response has no body");
      if (!response.ok) {
        // Handle HTTP errors from the API route
        const errorData = await response.json();
        throw new Error(errorData.error || "An unknown error occurred.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        while (buffer.includes("\n")) {
          const newlineIndex = buffer.indexOf("\n");
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.startsWith("0:")) {
            const content = JSON.parse(line.slice(2));
            fullResponse += content;
            await db.messages.update(assistantMessageId, {
              content: fullResponse,
            });
          }
        }
      }
    } catch (err: any) {
      console.error("Failed to handle submission:", err);
      setError(err.message || "Failed to get a response from the AI.");
      if (assistantMessageId) {
        await db.messages.update(assistantMessageId, {
          content: `Sorry, something went wrong: ${err.message}`,
        });
      }
    } finally {
      setIsSending(false); // Reset sending state
      setAttachedImage(null); // Clear image after send or error
    }
  };

  // --- IMAGE HANDLERS ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeAttachedImage = () => {
    setAttachedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // --- UI / JSX (MERGED) ---

  if (isLoadingModels) {
    return (
      <div className="chat-container h-screen w-screen flex items-center justify-center">
        <div className="glass-effect rounded-2xl p-8 text-white text-lg font-medium">
          Loading models...
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container h-screen w-screen flex flex-col">
      {/* Modern Header */}
      <div className="header-glass p-6 flex justify-between items-center relative z-10">
        <div className="flex items-center space-x-6">
          <h1 className="text-2xl font-bold text-white">Tea3 Chat</h1>
        </div>
        <button
          onClick={handleNewChat}
          className="glass-button px-6 py-3 text-white rounded-xl font-medium hover:shadow-lg transition-all duration-300"
        >
          + New Chat
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-6 mt-4 relative z-10">
          <div className="bg-red-500/20 border border-red-500/30 backdrop-filter backdrop-blur-md text-red-100 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">{error}</span>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-200 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-4xl mx-auto px-6 py-8 pb-60">
          {!threadId ? (
            <div className="text-center">
              {/* This can be a welcome message or placeholder */}
            </div>
          ) : (
            <div className="space-y-6 pb-6">
              {messages?.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-3xl p-6 rounded-2xl ${
                      m.role === "user"
                        ? "user-message text-white"
                        : "assistant-message text-white"
                    }`}
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                    {m.attachments?.map((url, idx) => (
                      <img
                        key={idx}
                        src={url}
                        alt="attachment"
                        className="mt-3 max-w-xs rounded-lg border border-white/10"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="chat-input-unified rounded-t-2xl">
            <div className="flex items-center space-x-4 px-6 py-3">
              <div className="flex items-center space-x-3">
                <label htmlFor="model-select" className="text-sm font-medium text-white/80">
                  Model:
                </label>
                <select
                  id="model-select"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="glass-input px-4 py-2 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/30 bg-white/10"
                  disabled={availableModels.length === 0}
                >
                  {availableModels.map((model) => (
                    <option key={model.value} value={model.value} className="bg-gray-800">
                      {model.displayName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-6 flex items-end space-x-4">
            <div className="flex-1">
              <textarea
                className="w-full bg-transparent text-white placeholder-white/50 resize-none focus:outline-none text-lg leading-relaxed"
                value={input}
                placeholder="Type your message here..."
                onChange={(e) => setInput(e.target.value)}
                disabled={isSending}
                rows={1}
                style={{
                  minHeight: '4.5rem',
                  maxHeight: '8rem',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if ((input.trim() || attachedImage) && !isSending) {
                      handleSubmit(e as any);
                    }
                  }
                }}
              />
            </div>

            {/* Attach image button */}
            <div className="flex items-center space-x-2">
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="glass-button p-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[48px]"
              >
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 16V4a1 1 0 011-1h12a1 1 0 011 1v12m-4 4H7a2 2 0 01-2-2V8a2 2 0 012-2h10a2 2 0 012 2v6a2 2 0 01-2 2z"
                  />
                </svg>
              </button>

              {attachedImage && (
                <div className="relative">
                  <img
                    src={attachedImage}
                    alt="preview"
                    className="w-12 h-12 object-cover rounded-md border border-white/10"
                  />
                  <button
                    type="button"
                    onClick={removeAttachedImage}
                    className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-0.5"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Send button */}
              <button
                type="submit"
                disabled={(!input.trim() && !attachedImage) || isSending}
                className="glass-button p-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[48px]"
              >
                {isSending ? (
                  <svg
                    className="animate-spin w-5 h-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                )}
              </button>
            </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}