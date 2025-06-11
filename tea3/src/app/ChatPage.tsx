"use client";

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db"; // Import your Dexie instance

export default function ChatPage() {
  // Get the current chat ID from the URL
  const { threadId } = useParams();
  const navigate = useNavigate();

  // State for the input field
  const [input, setInput] = useState("");

  // --- DATA FETCHING ---
  // This is the core of Dexie's reactivity.
  // useLiveQuery will automatically re-run and update the component
  // whenever the data in the 'messages' table changes.
  const messages = useLiveQuery(
    () => {
      if (!threadId) return []; // If no thread is selected, show no messages
      // Find all messages for the current thread and sort them by creation time
      return db.messages
        .where("threadId")
        .equals(parseInt(threadId))
        .sortBy("createdAt");
    },
    [threadId] // Re-run the query if the threadId changes
  );

  // --- ACTIONS ---
  const handleNewChat = async () => {
    try {
      // 1. Create a new thread in the database
      const newThreadId = await db.threads.add({
        title: "New Chat",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // 2. Navigate to the new chat's URL
      navigate(`/chat/${newThreadId}`);
    } catch (error) {
      console.error("Failed to create new chat:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || !threadId) return;

    const currentThreadId = parseInt(threadId);

    let assistantMessageId: number | null = null;

    const historyForAI: { role: "user" | "assistant"; content: string }[] = (
      messages || []
    ).map((m) => ({
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
        content: "", // Start with an empty string
        createdAt: new Date(),
      });

      const response = await fetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [...historyForAI, { role: "user", content: currentInput }],
        }),
      });

      if (!response.body) throw new Error("Response has no body");

      // --- THIS IS THE CORRECTED STREAM PARSING LOGIC ---
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Add the new chunk to our buffer
        buffer += decoder.decode(value, { stream: true });

        // Process all complete lines in the buffer
        while (buffer.includes("\n")) {
          const newlineIndex = buffer.indexOf("\n");
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          // We only care about lines that start with '0:', which indicates text content
          if (line.startsWith("0:")) {
            // Slice off the '0:' prefix and parse the rest as a JSON string
            const content = JSON.parse(line.slice(2));
            fullResponse += content;

            // Update the message in Dexie with the new, appended content
            await db.messages.update(assistantMessageId, {
              content: fullResponse,
            });
          }
        }
      }
    } catch (error) {
      console.error("Failed to handle submission:", error);
      await db.messages.update(assistantMessageId, {
        content: "Sorry, something went wrong.",
      });
    }
  };
  return (
    <div className="flex flex-col w-full max-w-2xl mx-auto h-screen">
      <div className="p-4 border-b">
        <button
          onClick={handleNewChat}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          + New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!threadId && (
          <div className="text-center text-gray-500">
            Select a chat or start a new one.
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
            {/* Use whitespace-pre-wrap to respect newlines from the AI */}
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex items-center">
          <input
            className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={input}
            placeholder={threadId ? "Say something..." : "Start a new chat first"}
            onChange={(e) => setInput(e.target.value)}
            disabled={!threadId}
          />
          <button
            type="submit"
            className="ml-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            disabled={!threadId || !input.trim()}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}