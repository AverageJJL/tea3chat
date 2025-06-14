"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useUser } from "@clerk/nextjs";
import { db, Thread, Message } from "./db";
import { v4 as uuidv4 } from "uuid";

async function syncFullThreadToBackend(payload: {
  threadData: Thread;
  messagesData: Message[];
}): Promise<any> {
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
    return await response.json();
  } catch (error) {
    console.error("Failed to sync forked thread to backend:", error);
    // Don't re-throw, as the main goal (local import) succeeded.
    // The app can handle syncing later.
  }
}

export default function SharePage() {
  const { sharedThreadId } = useParams<{ sharedThreadId: string }>();
  const navigate = useNavigate();
  const { user, isLoaded } = useUser();
  const [status, setStatus] = useState("Initializing..."); // Changed initial status
  const [error, setError] = useState<string | null>(null);
  
  const importAttempted = useRef(false);

  useEffect(() => {
    if (!isLoaded) {
      setStatus("Waiting for user session...");
      return;
    }

    if (!user) {
      setError("You must be signed in to view a shared chat.");
      setStatus("Redirecting to sign-in...");
      // Store the intended share path to redirect back after sign-in
      // This depends on how your sign-in flow handles redirects.
      // For example, using query parameters:
      navigate(`/sign-in?redirectUrl=/share/${sharedThreadId}`);
      return;
    }

    if (!sharedThreadId) {
      setError("No shared chat ID provided.");
      setStatus("Error.");
      return;
    }

    // Prevent multiple import attempts
    if (importAttempted.current) {
      return;
    }
    importAttempted.current = true;

  

    const importSharedChat = async () => {
      try {
        setStatus("Checking for existing imported chat...");
        const existingFork = await db.threads
          .where("forked_from_id") // Make sure this field is added when forking
          .equals(sharedThreadId)
          .first();

        if (existingFork && existingFork.supabase_id) {
          setStatus("Chat already imported. Redirecting...");
          navigate(`/chat/${existingFork.supabase_id}`);
          return;
        }

        setStatus("Importing shared chat...");
        const response = await fetch(`/api/share/${sharedThreadId}`);
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Could not fetch shared chat.");
        }
        const { data: sharedData } = await response.json();

        if (!sharedData) {
          throw new Error("No data received for the shared chat.");
        }

        const newThreadSupabaseId = uuidv4();
        const newThreadForCurrentUser: Thread = {
          supabase_id: newThreadSupabaseId,
          userId: user.id,
          title: `[Shared] ${sharedData.title}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          forked_from_id: sharedThreadId, // Add this field
        };

        const newMessagesForCurrentUser: Message[] = sharedData.messages.map(
          (msg: any) => ({
            supabase_id: msg.shared_id || uuidv4(),
            thread_supabase_id: newThreadSupabaseId,
            role: msg.role,
            content: msg.content,
            attachments: msg.attachments || [],
            createdAt: new Date(msg.created_at),
            model: msg.model,
          }),
        );

        await db.transaction(
          "rw",
          db.threads,
          db.messages,
          async () => {
            await db.threads.add(newThreadForCurrentUser);
            await db.messages.bulkAdd(newMessagesForCurrentUser);
          },
        );

        syncFullThreadToBackend({
          threadData: newThreadForCurrentUser,
          messagesData: newMessagesForCurrentUser,
        });

        setStatus("Redirecting to your new chat...");
        navigate(`/chat/${newThreadSupabaseId}`);
      } catch (err: any) {
        console.error("Failed to import shared chat:", err);
        setError(err.message || "An unknown error occurred during import.");
        setStatus("Import failed.");
      }
    };

    importSharedChat();
    // Ensure dependencies are correct to prevent unnecessary re-runs.
    // `navigate` can cause re-runs if its identity changes.
    // `user.id` is more stable than the whole `user` object if only id is needed.
  }, [sharedThreadId, user?.id, isLoaded, navigate, importAttempted]);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-gray-900 text-white">
      <div className="text-2xl font-semibold mb-4">{status}</div>
      {error ? (
        <div className="text-red-400 bg-red-500/10 p-4 rounded-md">
          {error}
        </div>
      ) : (
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      )}
    </div>
  );
}