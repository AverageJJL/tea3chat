"use client";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ChatPage from "../ChatPage";
import SettingsPage from "../SettingsPage";
import AppShell from "../AppShell";

export default function ClientRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* AppShell keeps Sidebar (and potentially header) mounted while nested routes change */}
        <Route element={<AppShell />}>
          <Route path="/chat/:supabaseThreadId" element={<ChatPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        {/* default redirect */}
        <Route path="/" element={<Navigate replace to="/chat" />} />
      </Routes>
    </BrowserRouter>
  );
} 