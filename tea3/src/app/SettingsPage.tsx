"use client";

import React, { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useNavigate } from "react-router-dom";

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const referrer = document.referrer;
        const currentOrigin = window.location.origin;
        // Check if the user came from a chat page within this app
        if (referrer.startsWith(currentOrigin) && referrer.includes("/chat")) {
          navigate(-1); // Go back to the specific chat page
        } else {
          navigate("/chat"); // Fallback to the general chat page
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [navigate]);

  if (!isLoaded) {
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
        <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-white">Customize Tweak3 Chat</h2>
            
            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-lg font-medium text-white/90 mb-3">
                What should Tweak3 Chat call you?
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="name"
                  placeholder="Enter your name"
                  className="input-glass w-full rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">0/50</span>
              </div>
            </div>

            {/* Role */}
            <div>
              <label htmlFor="role" className="block text-lg font-medium text-white/90 mb-3">
                What do you do?
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="role"
                  placeholder="Engineer, student, etc."
                  className="input-glass w-full rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">0/100</span>
              </div>
            </div>

            {/* Traits */}
            <div>
              <label htmlFor="traits" className="block text-lg font-medium text-white/90 mb-3">
                What traits should Tweak3 Chat have?
                <span className="text-white/60 text-base ml-2 font-normal">(up to 5, max 100 chars each)</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="traits"
                  placeholder="Type a trait and press Enter or Tab..."
                  className="input-glass w-full rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">0/50</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                {['tweaky'].map(trait => (
                  <button key={trait} className="glass-button-sidebar px-4 py-2 text-sm text-white/80 rounded-full flex items-center space-x-2 hover:text-white transition-all">
                    <span>{trait}</span>
                    <span className="text-white/50">+</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Instructions */}
            <div>
              <label htmlFor="custom-instructions" className="block text-lg font-medium text-white/90 mb-3">
                Anything else Tweak3 Chat should know about you?
              </label>
              <div className="relative">
                <textarea
                  id="custom-instructions"
                  rows={8}
                  placeholder="Interests, values, or preferences to keep in mind"
                  className="input-glass w-full rounded-lg px-4 py-3 text-white placeholder-white/40 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                ></textarea>
                <span className="absolute right-4 bottom-4 text-white/40 text-sm pointer-events-none">0/3000</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              className="glass-button bg-rose-600/80 hover:bg-rose-500/80 border-rose-500/80 text-white font-bold py-3 px-8 rounded-lg transition-all shadow-lg hover:shadow-rose-500/30"
            >
              Save Preferences
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 