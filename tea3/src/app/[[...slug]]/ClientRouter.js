"use client";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ChatPage from "../ChatPage";

export default function ClientRouter() {
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