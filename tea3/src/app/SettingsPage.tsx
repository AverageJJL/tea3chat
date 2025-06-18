"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useUser, UserButton } from "@clerk/nextjs";
import { useNavigate, useLocation } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, UserPreferences } from "./db";

const DeleteAllConfirmationModal = ({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel]);

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] animate-in fade-in-0 duration-300"
      onMouseDown={onCancel}
    >
      <div
        className="bg-gray-800/90 border border-gray-700/50 rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4 animate-in fade-in-0 zoom-in-95 duration-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-white">Delete All Chats</h2>
        <p className="text-white/70 mt-2 text-sm">
          Are you sure you want to delete all chats? This action cannot be undone.
        </p>
        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white/80 hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
            autoFocus
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof window !== "undefined") {
    return createPortal(modalContent, document.body);
  }
  return null;
};

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [currentTrait, setCurrentTrait] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [saveStatus, setSaveStatus] = useState<{message: string, type: 'success' | 'error', source?: 'prefs' | 'keys' | 'settings'} | null>(null);
  const [activeSection, setActiveSection] = useState("account");
  const [disableResumableStream, setDisableResumableStream] = useState(false);
  const [useLiquidGlass, setUseLiquidGlass] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [openaiApiKey, setOpenaiApiKey] = useState("");

  const userPreferences = useLiveQuery(() => {
    if (!user) return undefined;
    return db.userPreferences.where({ userId: user.id }).first();
  }, [user]);

  const navigationSections = [
    { id: "account", label: "Account" },
    { id: "customization", label: "Customization" },
    { id: "api-keys", label: "API Keys" },
    { id: "theme", label: "Theme" },
    { id: "site-settings", label: "Site Settings" }
  ];

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(sectionId);
    }
  };

  useEffect(() => {
    if (userPreferences) {
      setName(userPreferences.name || "");
      setRole(userPreferences.role || "");
      const loadedTraits = (userPreferences.traits || []).join("\n");
      setCurrentTrait(loadedTraits);
      setCustomInstructions(userPreferences.customInstructions || "");
      setDisableResumableStream(
        userPreferences.disableResumableStream ?? false
      );
      setUseLiquidGlass(userPreferences.useLiquidGlass ?? false);
      setOpenaiApiKey(userPreferences.openaiApiKey || "");
    }
  }, [userPreferences]);

  const handleTraitKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      const lines = (currentTrait.split("\n").length);
      if (lines >= 5) {
        e.preventDefault();
      }
    }
  };

  const handleTweakyClick = () => {
    const tweakyText = "You are jittery, restless, overly energetic and hypercreative. Like you've had too much caffeine.";
    setCurrentTrait((prev) => (prev ? prev + "\n" + tweakyText : tweakyText));
  };

  const handleToggleResumableStream = async () => {
    if (!user) return;

    const newValue = !disableResumableStream;
    setDisableResumableStream(newValue); // Optimistic UI update

    try {
      const existingPrefs = await db.userPreferences
        .where({ userId: user.id })
        .first();

      if (existingPrefs?.id) {
        await db.userPreferences.update(existingPrefs.id, {
          disableResumableStream: newValue,
        });
      } else {
        await db.userPreferences.put({
          userId: user.id,
          disableResumableStream: newValue,
        });
      }
      setSaveStatus({ message: "Setting updated!", type: "success", source: 'settings' });
    } catch (e) {
      setDisableResumableStream(!newValue); // Revert on error
      console.error("Failed to update resumable stream preference", e);
      setSaveStatus({ message: "Failed to update setting.", type: "error", source: 'settings' });
    }
  };

  const handleToggleLiquidGlass = async () => {
    if (!user) return;

    const newValue = !useLiquidGlass;
    setUseLiquidGlass(newValue); // Optimistic UI update

    try {
      const existingPrefs = await db.userPreferences
        .where({ userId: user.id })
        .first();

      if (existingPrefs?.id) {
        await db.userPreferences.update(existingPrefs.id, {
          useLiquidGlass: newValue,
        });
      } else {
        await db.userPreferences.put({
          userId: user.id,
          useLiquidGlass: newValue,
        });
      }
      setSaveStatus({ message: "Setting updated!", type: "success", source: 'settings' });
    } catch (e) {
      setUseLiquidGlass(!newValue); // Revert on error
      console.error("Failed to update liquid glass preference", e);
      setSaveStatus({ message: "Failed to update setting.", type: "error", source: 'settings' });
    }
  };

  const handleConfirmDeleteAll = async () => {
    if (!user) return;
    setShowDeleteAllModal(false);

    const allThreads = await db.threads.where({ userId: user.id }).toArray();
    const supabaseThreadIds = allThreads
      .map((t) => t.supabase_id)
      .filter((id): id is string => !!id);

    // Concurrently delete from Supabase and locally
    const deletePromises: Promise<any>[] = [];

    // Remote deletion
    for (const supabaseId of supabaseThreadIds) {
      deletePromises.push(
        fetch(`/api/sync/thread?supabase_id=${supabaseId}`, {
          method: "DELETE",
        }).catch((err) =>
          console.error(
            `Failed to delete remote thread ${supabaseId}:`,
            err
          )
        )
      );
    }

    // Local deletion
    if (supabaseThreadIds.length > 0) {
      deletePromises.push(
        db.messages.where("thread_supabase_id").anyOf(supabaseThreadIds).delete()
      );
    }
    deletePromises.push(db.threads.where({ userId: user.id }).delete());

    await Promise.all(deletePromises);

    // Force a reload to ensure all state is cleared, including sidebar
    navigate("/chat");
  };

  const handleSave = async () => {
    if (!user) return;
    // Build traits array from textarea content (one per line)
    const rawLines = currentTrait.split("\n");
    const cleaned = rawLines.map((l) => l.trim()).filter(Boolean);
    const limited = cleaned.slice(0, 5).map((t) => t.slice(0, 200));
    try {
      const existingPrefs = await db.userPreferences
        .where({ userId: user.id })
        .first();

      const payload = {
        name,
        role,
        traits: limited,
        customInstructions,
      };

      if (existingPrefs?.id) {
        await db.userPreferences.update(existingPrefs.id, payload);
      } else {
        await db.userPreferences.put({ userId: user.id, ...payload });
      }

      // Update local state so UI reflects the newly saved trait immediately
      setCurrentTrait(limited.join("\n"));
      setSaveStatus({ message: "Preferences saved!", type: "success", source: 'prefs' });
    } catch (e) {
      console.error("Failed to save preferences", e);
      setSaveStatus({ message: "Failed to save.", type: "error", source: 'prefs' });
    }
  };

  const handleSaveApiKeys = async () => {
    if (!user) return;
    try {
      const existingPrefs = await db.userPreferences
        .where({ userId: user.id })
        .first();

      const payload = {
        openaiApiKey: openaiApiKey,
      };

      if (existingPrefs?.id) {
        await db.userPreferences.update(existingPrefs.id, payload);
      } else {
        await db.userPreferences.put({ userId: user.id, ...payload });
      }

      setSaveStatus({ message: "API Key saved!", type: "success", source: 'keys' });
    } catch (e) {
      console.error("Failed to save API key", e);
      setSaveStatus({ message: "Failed to save API key.", type: "error", source: 'keys' });
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

  // Intersection Observer to track which section is in view
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-45% 0px -60% 0px' }
    );

    navigationSections.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [navigationSections]);

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
    <>
    <div className="chat-container flex-grow flex flex-col">
      <h1 className="text-4xl pb-24 font-bold text-white inline-block align-middle mr-6 mt-6 ml-6">
        Settings
      </h1>
        {user && (
        <div className="absolute top-6 right-6 z-20">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "w-8 h-8",
                userButtonPopoverCard:
                  "bg-gray-900/95 backdrop-blur border border-gray-700",
                userButtonPopoverActionButton:
                  "text-white hover:bg-gray-700",
                userButtonPopoverActionButtonText: "text-white",
                userButtonPopoverFooter: "hidden",
              },
            }}
          />
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
       {/* Left Navigation - Simple Text */}
        <div className="w-48 flex-shrink-0 p-6">
          <div className="sticky top-6">
            <nav className="space-y-4">
              {navigationSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`block text-left text-sm transition-colors duration-200 ${
                    activeSection === section.id
                      ? 'text-white font-medium'
                      : 'text-white/60 hover:text-white/80'
                  }`}
                >
                  {section.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="max-w-4xl mx-auto p-8 space-y-16">

            {/* Account Section */}
            <section id="account" className="space-y-6 scroll-mt-8">
              <h2 className="text-3xl font-bold text-white">Account</h2>
              <p className="text-white/70">Manage your account preferences and information.</p>
              <div className="h-64 flex items-center justify-center text-white/50 frosted-glass rounded-xl">
                Coming soon...
              </div>
            </section>

            <div className="py-8">
              <hr className="my-12 border-t-2 border-white/20 rounded-lg shadow-lg" />
            </div>

            {/* Customization Section */}
            <section id="customization" className="space-y-6 scroll-mt-8">
              <h2 className="text-3xl font-bold text-white">Customize Chat</h2>
              
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
                    name="role"
                    autoComplete="organization-title"
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
                  <textarea
                  id="traits"
                  rows={1}
                  placeholder="Type traits here..."
                  className="frosted-input w-full rounded-lg px-4 pt-3 pb-8 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all resize-none overflow-y-hidden"
                  value={currentTrait}
                  onChange={(e) => {
                    setCurrentTrait(e.target.value);
                    e.currentTarget.style.height = "auto";
                    e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
                  }}
                  onKeyDown={handleTraitKeyDown}
                  maxLength={200}
                  />
                  <span className="absolute right-4 bottom-4 text-white/40 text-sm pointer-events-none">{currentTrait.length}/200</span>
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={handleTweakyClick}
                    className="frosted-button-sidebar px-4 py-2 text-sm text-white/80 rounded-full hover:text-white transition-all"
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
                    className="frosted-input w-full rounded-lg px-4 py-3 text-white placeholder-white/40 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all custom-scrollbar"
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    maxLength={3000}
                  ></textarea>
                  <span className="absolute right-4 bottom-4 text-white/40 text-sm pointer-events-none">{customInstructions.length}/3000</span>
                </div>
              </div>

              <div className="flex justify-end items-center pt-4 gap-4">
                {saveStatus && saveStatus.source === 'prefs' && (
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
            </section>

            <div className="py-8">
              <hr className="my-12 border-t-2 border-white/20 rounded-lg shadow-lg" />
            </div>

            {/* API Keys Section */}
            <section id="api-keys" className="space-y-6 scroll-mt-8">
              <h2 className="text-3xl font-bold text-white">API Keys</h2>
              <p className="text-white/70">Configure your API keys for different providers. Keys are stored locally and never sent to our servers.</p>
              
              <div className="space-y-8">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xl font-medium text-white">OpenAI API Key</h3>
                    <p className="text-white/60 text-sm">For GPT-4.1 Mini model (especially image generation, since our api key doesn't work)</p>
                  </div>

                  <div className="space-y-3">
                    <div className="relative max-w-md">
                      <input
                        type="password"
                        id="openai-api-key"
                        name="openai-api-key"
                        autoComplete="new-password"
                        placeholder="sk-..."
                        className="frosted-input w-full rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        value={openaiApiKey}
                        onChange={(e) => setOpenaiApiKey(e.target.value)}
                      />
                    </div>
                    <p className="text-white/50 text-xs">
                      Get your API key from{" "}
                      <a
                        href="https://platform.openai.com/account/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-rose-400 hover:text-rose-300 transition-colors underline"
                      >
                        OpenAI's Dashboard
                      </a>
                    </p>
                    <div className="flex justify-start items-center gap-4">
                      <button
                        onClick={handleSaveApiKeys}
                        className="frosted-button bg-rose-600/80 hover:bg-rose-500/80 border-rose-500/80 text-white font-bold py-2 px-6 rounded-lg transition-all shadow-lg hover:shadow-rose-500/30 text-sm"
                      >
                        Save API Key
                      </button>
                      {saveStatus && saveStatus.source === 'keys' && (
                        <span
                          className={`text-sm font-medium transition-opacity duration-500 ${
                            saveStatus.type === 'success' ? 'text-gray-300' : 'text-gray-400'
                          }`}
                        >
                          {saveStatus.message}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="py-8">
              <hr className="my-12 border-t-2 border-white/20 rounded-lg shadow-lg" />
            </div>

            {/* Theme Section */}
            <section id="theme" className="space-y-6 scroll-mt-8">
              <h2 className="text-3xl font-bold text-white">Theme</h2>
              <p className="text-white/70">Customize the appearance and visual style of your interface.</p>
              
              <div className="flex items-start mt-12 justify-between">
                <div className="flex-1 mr-6 ">
                  <label
                    htmlFor="use-liquid-glass"
                    className="block text-lg font-medium text-white/90 mb-2"
                  >
                    Enable Liquid Glass Effect
                  </label>
                  <p className="text-white/60 text-sm leading-relaxed">
                    Turn this on to enable the experimental liquid glass effect
                    for the chat input. This may impact performance.
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <button
                    type="button"
                    onClick={handleToggleLiquidGlass}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-transparent ${
                      useLiquidGlass
                        ? "bg-blue-600 shadow-lg shadow-blue-500/25"
                        : "bg-white/20 backdrop-blur-sm border border-white/30"
                    }`}
                    id="use-liquid-glass"
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out shadow-lg ${
                        useLiquidGlass ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
              
              <div className="h-64 flex items-center justify-center text-white/50 frosted-glass rounded-xl">
                Coming soon...
              </div>
            </section>

            <div className="py-8">
              <hr className="my-12 border-t-2 border-white/20 rounded-lg shadow-lg" />
            </div>


            {/* Site Settings Section */}
            <section id="site-settings" className="space-y-6 scroll-mt-8 mb-96 pb-32">
              <h2 className="text-3xl font-bold text-white">Site Settings</h2>
              <p className="text-white/70">Adjust global site preferences and behavior.</p>
              
              {/* Resumable Stream Toggle */}
              <div className="flex items-start mt-12 justify-between">
                <div className="flex-1 mr-6">
                  <label htmlFor="disable-resumable-stream" className="block text-lg font-medium text-white/90 mb-2">
                    Disable Resumable Stream
                  </label>
                  <p className="text-white/60 text-sm leading-relaxed">
                    Turn this on to disable resumable streaming for faster response generation. 
                    When enabled, responses will appear more quickly but cannot be resumed if interrupted.
                  </p>
                </div>
               
                <div className="flex-shrink-0">
                  <button
                    type="button"
                    onClick={handleToggleResumableStream}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-transparent ${
                      disableResumableStream
                        ? 'bg-blue-600 shadow-lg shadow-blue-500/25'
                        : 'bg-white/20 backdrop-blur-sm border border-white/30'
                    }`}
                    id="disable-resumable-stream"
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out shadow-lg ${
                        disableResumableStream ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="my-8">
                <hr className="border-t border-white/10" />
              </div>

              {/* Delete All Data */}
              <div className="flex items-start mt-12 justify-between">
                <div className="flex-1 mr-6">
                  <label className="block text-lg font-medium text-white/90 mb-2">
                    Delete All Chats
                  </label>
                  <p className="text-white/60 text-sm leading-relaxed">
                    Permanently delete all of your chat history, both locally and from the cloud. This action cannot be undone.
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowDeleteAllModal(true)}
                    className="bg-red-900/80 hover:bg-red-800/80 border-red-700/80 text-white font-bold py-2 px-5 rounded-lg transition-all shadow-lg hover:shadow-red-500/30 text-sm"
                  >
                    Delete All
                  </button>
                </div>
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
    {showDeleteAllModal && (
      <DeleteAllConfirmationModal
        onConfirm={handleConfirmDeleteAll}
        onCancel={() => setShowDeleteAllModal(false)}
      />
    )}
    </>
  );
}
