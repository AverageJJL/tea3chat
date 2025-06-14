"use client";

import React from "react";
import { useUser } from "@clerk/nextjs";

export default function SettingsPage() {
  const { user, isLoaded: isUserLoaded } = useUser();

  if (!isUserLoaded) {
    return (
      <div className="chat-container h-screen w-screen flex items-center justify-center">
        <div className="glass-effect rounded-2xl p-8 text-white text-lg font-medium">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container flex-grow flex flex-col">
      <div className="header-glass p-6 flex justify-between items-center relative z-10 shrink-0">
        <div className="flex items-center space-x-6">
          <h1 className="text-2xl font-bold text-white">Settings</h1>
        </div>
        {user && (
          <div className="text-white">
            {user.primaryEmailAddress?.emailAddress}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 relative">
        <div className="mx-auto max-w-5xl space-y-6 px-4">
          {/* Settings content will go here */}
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="text-white text-2xl font-semibold mb-3">
              Settings
            </div>
            <div className="text-white/60 text-lg max-w-md">
              Settings page coming soon...
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 