"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { useNavigate, useLocation } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, UserPreferences } from "./db";

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [traits, setTraits] = useState<string[]>([]);
  const [currentTrait, setCurrentTrait] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [saveStatus, setSaveStatus] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const userPreferences = useLiveQuery(() => {
    if (!user) return undefined;
    return db.userPreferences.where({ userId: user.id }).first();
  }, [user]);

  useEffect(() => {
    if (userPreferences) {
      setName(userPreferences.name || "");
      setRole(userPreferences.role || "");
      setTraits(userPreferences.traits || []);
      setCustomInstructions(userPreferences.customInstructions || "");
    }
  }, [userPreferences]);

  const addTrait = useCallback(() => {
    const trimmed = currentTrait.trim();
    if (!trimmed) return;
    if (traits.length >= 5) {
      alert("You can add up to 5 traits only.");
      return;
    }
    if (trimmed.length > 200) {
      alert("Trait exceeds 200 characters limit.");
      return;
    }
    setTraits((prev) => [...prev, trimmed]);
    setCurrentTrait("");
  }, [currentTrait, traits]);

  const removeTrait = useCallback((traitToRemove: string) => {
    setTraits((prev) => prev.filter((t) => t !== traitToRemove));
  }, []);

  const handleTraitKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      addTrait();
    }
  };

  const handleTweakyClick = () => {
    setCurrentTrait(
      "You are jittery, restless, overly energetic and hypercreative. Like you've had too much caffeine."
    );
  };

  const handleSave = async () => {
    if (!user) return;
    try {
      const existingPrefs = await db.userPreferences.where({ userId: user.id }).first();

      const payload: UserPreferences = {
        userId: user.id,
        name,
        role,
        traits,
        customInstructions,
      };

      await db.userPreferences.put({ ...payload, id: existingPrefs?.id });
      setSaveStatus({ message: 'Preferences saved!', type: 'success' });
    } catch (e) {
      console.error("Failed to save preferences", e);
      setSaveStatus({ message: 'Failed to save.', type: 'error' });
    }
  };

  useEffect(() => {
    if (saveStatus) {
      const timer = setTimeout(() => {
        setSaveStatus(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Prefer route state passed from Sidebar to know previous path
        const fromPath = (location.state as any)?.from as string | undefined;

        if (fromPath && fromPath.startsWith("/chat/")) {
          navigate(fromPath);
        } else if (fromPath === "/chat") {
          navigate("/chat");
        } else {
          // If no state available, fall back to history or /chat
          navigate(-1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [navigate, location.state]);

  if (!isLoaded) {
    return (
      <div className="chat-container h-screen w-screen flex items-center justify-center">
        <div className="frosted-glass rounded-2xl p-8 text-white text-lg font-medium">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container flex-grow flex flex-col">
      <div className="frosted-header p-6 flex justify-between items-center relative z-10 shrink-0">
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
                  className="frosted-input w-full rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={50}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">{name.length}/50</span>
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
                  className="frosted-input w-full rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  maxLength={50}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">{role.length}/50</span>
              </div>
            </div>

            {/* Traits */}
            <div>
              <label htmlFor="traits" className="block text-lg font-medium text-white/90 mb-3">
                What traits should Tweak3 Chat have?
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="traits"
                  placeholder="Type a trait and press Enter or Tab..."
                  className="frosted-input w-full rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  value={currentTrait}
                  onChange={(e) => setCurrentTrait(e.target.value)}
                  onKeyDown={handleTraitKeyDown}
                  maxLength={200}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">{currentTrait.length}/200</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                {traits.map((trait) => (
                  <button
                    key={trait}
                    type="button"
                    onClick={() => removeTrait(trait)}
                    className="frosted-button-sidebar px-4 py-2 text-sm text-white/80 rounded-full flex items-center space-x-2 hover:text-white transition-all"
                    title="Remove trait"
                  >
                    <span>{trait}</span>
                    <span className="text-white/50">×</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleTweakyClick}
                  className="frosted-button-sidebar px-4 py-2 text-sm text-white/80 rounded-full flex items-center space-x-2 hover:text-white transition-all"
                >
                  <span>tweaky +</span>
                </button>
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
                  className="frosted-input w-full rounded-lg px-4 py-3 text-white placeholder-white/40 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  maxLength={3000}
                ></textarea>
                <span className="absolute right-4 bottom-4 text-white/40 text-sm pointer-events-none">{customInstructions.length}/3000</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end items-center pt-4 gap-4">
            {saveStatus && (
              <span
                className={`text-sm font-medium transition-opacity duration-500 ${
                  saveStatus.type === 'success' ? 'text-gray-300' : 'text-gray-400'
                }`}
              >
                {saveStatus.message}
              </span>
            )}
            <button
              onClick={handleSave}
              className="frosted-button bg-rose-600/80 hover:bg-rose-500/80 border-rose-500/80 text-white font-bold py-3 px-8 rounded-lg transition-all shadow-lg hover:shadow-rose-500/30"
            >
              Save Preferences
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 