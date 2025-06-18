"use client";

import { SignInButton } from "@clerk/nextjs";
import { useRef, useCallback } from "react";
// Using inline SVG for chevron down icon

export default function LandingPage() {
  const titleRef = useRef<HTMLHeadingElement>(null);

  const scrollToFeatures = () => {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleMouseEnter = useCallback(() => {
    if (titleRef.current && !titleRef.current.classList.contains('glitch-played')) {
      // Allow animation to play, then mark as played after animation duration
      setTimeout(() => {
        if (titleRef.current) {
          titleRef.current.classList.add('glitch-played');
        }
      }, 600); // Match the animation duration
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (titleRef.current) {
      titleRef.current.classList.remove('glitch-played');
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#3a3d4f] text-white">
      {/* Hero Section */}
      <section className="h-screen flex flex-col items-center justify-center relative">
        <div className="text-center max-w-4xl mx-auto px-4">          <h1 
            ref={titleRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className="text-6xl md:text-8xl font-bold mb-6 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent glitch-title" 
            data-text="Tweak3"
          >
            Tweak3
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-8">
            A t3 cloneathon project
          </p>
          <SignInButton mode="modal">
            <button className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-4 px-8 rounded-lg text-lg transition-all duration-300 transform hover:scale-105 shadow-lg">
              Sign In to Try
            </button>
          </SignInButton>
        </div>
        
        {/* More Info Section */}
        <div className="absolute bottom-8 flex flex-col items-center">
          <p className="text-gray-400 mb-2">more info</p>
          <button
            onClick={scrollToFeatures}
            className="text-gray-400 hover:text-white transition-colors duration-300 animate-bounce"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16 text-white">
            Features
          </h2>
          
          {/* Core Requirements */}
          <div className="mb-16">
            <h3 className="text-2xl font-semibold mb-8 text-gray-300">Core Requirements</h3>
       
            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-start space-x-4">
                  <div className="text-2xl">💬</div>
                  <div>
                    <h4 className="text-xl font-semibold mb-2 text-white">Chat with Various LLMs</h4>
                    <p className="text-gray-300 mb-3">
                      Implement support for multiple language models and providers
                    </p>
                    <span className="inline-flex items-center text-green-400 text-sm">
                      ✓ 
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-start space-x-4">
                  <div className="text-2xl">👤</div>
                  <div>
                    <h4 className="text-xl font-semibold mb-2 text-white">Authentication & Sync</h4>
                    <p className="text-gray-300 mb-3">
                      User authentication with chat history synchronization
                    </p>
                    <span className="inline-flex items-center text-green-400 text-sm">
                      ✓ 
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Bonus Features */}
          <div>
            <h3 className="text-2xl font-semibold mb-8 text-gray-300">Bonus Features</h3>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-start space-x-4">
                  <div className="text-2xl">📎</div>
                  <div>
                    <h4 className="text-xl font-semibold mb-2 text-white">Attachment Support</h4>
                    <p className="text-gray-300">
                      Allow users to upload files (images and pdfs)
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-start space-x-4">
                  <div className="text-2xl">🎨</div>
                  <div>
                    <h4 className="text-xl font-semibold mb-2 text-white">Image Generation Support</h4>
                    <p className="text-gray-300">
                      Implemented but we do not have a key that can do image generation #broke
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-start space-x-4">
                  <div className="text-2xl">🔍</div>
                  <div>
                    <h4 className="text-xl font-semibold mb-2 text-white">Syntax Highlighting</h4>
                    <p className="text-gray-300">
                      Beautiful code formatting and highlighting
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-start space-x-4">
                  <div className="text-2xl">⚡</div>
                  <div>
                    <h4 className="text-xl font-semibold mb-2 text-white">Resumable Streams</h4>
                    <p className="text-gray-300">
                      Continue generation after page refresh
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-start space-x-4">
                  <div className="text-2xl">🌳</div>
                  <div>
                    <h4 className="text-xl font-semibold mb-2 text-white">Chat Branching</h4>
                    <p className="text-gray-300">
                      Create alternative conversation paths
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-start space-x-4">
                  <div className="text-2xl">🔗</div>
                  <div>
                    <h4 className="text-xl font-semibold mb-2 text-white">Chat Sharing</h4>
                    <p className="text-gray-300">
                      Share conversations with others
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-start space-x-4">
                  <div className="text-2xl">🔍</div>
                  <div>
                    <h4 className="text-xl font-semibold mb-2 text-white">Web Search</h4>
                    <p className="text-gray-300">
                      Integrate real-time web search
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-start space-x-4">
                  <div className="text-2xl">🔑</div>
                  <div>
                    <h4 className="text-xl font-semibold mb-2 text-white">Bring Your Own Key</h4>
                    <p className="text-gray-300">
                      Use your own API keys
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-start space-x-4">
                  <div className="text-2xl">📱</div>
                  <div>
                    <h4 className="text-xl font-semibold mb-2 text-white">Mobile Friendly</h4>
                    <p className="text-gray-300">
                      You can visit our app on mobile!
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-start space-x-4">
                  <div className="text-2xl">✨</div>
                  <div>
                    <h4 className="text-xl font-semibold mb-2 text-white">Customisations and Themes!</h4>
                    <p className="text-gray-300">
                      Customise the look and feel of the model and the app.
                      (There is an experimental Liquid Glass theme)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
