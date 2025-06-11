"use client";

import { useState, useEffect } from "react";
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
    if (!input.trim() || !threadId || isSending) return;

    setError(null); // Clear previous errors on a new submission
    setIsSending(true); // Set sending state for the button

    const currentThreadId = parseInt(threadId);
    let assistantMessageId: number | null = null;

    const historyForAI = (messages || []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      await db.messages.add({
        threadId: currentThreadId,
        role: "user",
        content: input,
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

      const response = await fetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          model: selectedModel, // <-- Send the selected model
          messages: [...historyForAI, { role: "user", content: currentInput }],
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
    }
  };

  // --- UI / JSX (MERGED) ---

  if (isLoadingModels) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-600">Loading models...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full max-w-2xl mx-auto h-screen">
      {/* Header with New Chat and Model Selector */}
      <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <label
            htmlFor="model-select"
            className="text-sm font-medium text-gray-700"
          >
            Model:
          </label>
          <select
            id="model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={availableModels.length === 0}
          >
            {availableModels.map((model) => (
              <option key={model.value} value={model.value}>
                {model.displayName}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleNewChat}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          + New Chat
        </button>
      </div>

      {/* Error Display Area */}
      {error && (
        <div className="mx-4 mt-2 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md">
          <div className="flex items-center">
            <span className="font-semibold mr-2">Error:</span>
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700 font-bold"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Message Display Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!threadId && (
          <div className="text-center text-gray-500">
            Select a chat from the sidebar or start a new one.
          </div>
        )}
        {messages?.map((m) => (
          <div
            key={m.id}
            className={`p-3 rounded-lg flex flex-col ${
              m.role === "user"
                ? "bg-blue-500 text-white self-end items-end"
                : "bg-gray-200 text-gray-800 self-start items-start"
            }`}
          >
            <span className="font-bold">
              {m.role === "user" ? "You" : "AI"}
            </span>
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
      </div>

      {/* Form / Input Area */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex items-center">
          <input
            className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={input}
            placeholder={
              threadId ? "Say something..." : "Start a new chat first"
            }
            onChange={(e) => setInput(e.target.value)}
            disabled={!threadId || isSending}
          />
          <button
            type="submit"
            disabled={!threadId || !input.trim() || isSending}
            className="ml-2 px-4 py-2 w-28 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 flex items-center justify-center"
          >
            {isSending ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
                Sending...
              </>
            ) : (
              "Send"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}