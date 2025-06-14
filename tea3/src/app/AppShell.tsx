"use client";

import React, { useState, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useUser } from "@clerk/nextjs";
import Sidebar from "./Sidebar";

interface AiModel {
  value: string;
  displayName: string;
  supportsImages?: boolean;
}

export default function AppShell() {
  const { user, isLoaded } = useUser();
  const navigate = useNavigate();

  const [availableModels, setAvailableModels] = useState<AiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(true);
  const [modelsError, setModelsError] = useState<string | null>(null);

  useEffect(() => {
    const fetchModels = async () => {
      setIsLoadingModels(true);
      setModelsError(null);
      try {
        const response = await fetch("/api/chat");
        if (!response.ok) throw new Error("Failed to fetch models");
        const data = await response.json();
        if (data.models && data.models.length > 0) {
          setAvailableModels(data.models);
          const geminiModel = data.models.find(
            (model: AiModel) => model.value === "gemini-2.5-flash-preview-05-20"
          );
          setSelectedModel(
            geminiModel ? geminiModel.value : data.models[0].value
          );
        }
      } catch (err: any) {
        setModelsError(err.message || "Error loading models.");
        console.error(err);
      } finally {
        setIsLoadingModels(false);
      }
    };
    if (user) {
        fetchModels();
    }
  }, [user]);

  // Lightweight "new chat" handler – just navigate; ChatPage will create the thread when needed
  const handleNewChat = () => {
    navigate("/chat");
  };

  // While Clerk is loading we just render nothing; higher-level auth gate already shows a loader
  if (!isLoaded) return null;

  return (
    <div className="flex h-screen w-screen bg-gray-900">
      {user && <Sidebar userId={user.id} onNewChat={handleNewChat} />}
      <div className="flex-grow flex flex-col">
        <Outlet context={{ 
            availableModels, 
            selectedModel, 
            setSelectedModel, 
            isLoadingModels, 
            modelsError 
        }} />
      </div>
    </div>
  );
} 