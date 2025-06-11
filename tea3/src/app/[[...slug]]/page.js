"use client";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import ChatPage from "../ChatPage"; 

export default function AppClientRouter() {
  // ensure this component only renders on the client-side where window is available for BrowserRouter
  if (typeof window === "undefined") {
    return null; 
  }
  
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Show a consistent loading state during hydration
  if (!isClient) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* this route will handle existing chats */}
        <Route path="/chat/:threadId" element={<ChatPage />} />
        {/* this route can handle the initial state, like creating a new chat */}
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/" element={<Navigate replace to="/chat" />} />
      </Routes>
    </BrowserRouter>
  );
}