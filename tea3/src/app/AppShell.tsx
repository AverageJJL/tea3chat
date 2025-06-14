"use client";

import React from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useUser } from "@clerk/nextjs";
import Sidebar from "./Sidebar";

export default function AppShell() {
  const { user, isLoaded } = useUser();
  const navigate = useNavigate();

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
        <Outlet />
      </div>
    </div>
  );
} 