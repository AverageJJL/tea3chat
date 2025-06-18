"use client";

import { SignInButton } from "@clerk/nextjs";
import { useRef, useCallback, useEffect, useState } from "react";

export default function LandingPage() {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);

    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth) * 100,
        y: (e.clientY / window.innerHeight) * 100,
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const scrollToFeatures = () => {
    document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleMouseEnter = useCallback(() => {
    if (
      titleRef.current &&
      !titleRef.current.classList.contains("glitch-played")
    ) {
      setTimeout(() => {
        if (titleRef.current) {
          titleRef.current.classList.add("glitch-played");
        }
      }, 600);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (titleRef.current) {
      titleRef.current.classList.remove("glitch-played");
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950 text-white overflow-hidden">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 z-0">
        {/* Floating Orbs */}
        <div
          className="absolute w-96 h-96 bg-slate-500/5 rounded-full blur-3xl"
          style={{
            top: "10%",
            left: `${20 + mousePosition.x * 0.02}%`,
            transform: `translate(-50%, -50%)`,
            animation: "float 20s ease-in-out infinite",
          }}
        />
        <div
          className="absolute w-72 h-72 bg-blue-500/5 rounded-full blur-3xl"
          style={{
            top: "60%",
            right: `${10 + mousePosition.y * 0.03}%`,
            transform: `translate(50%, -50%)`,
            animation: "float 25s ease-in-out infinite reverse",
          }}
        />
        <div
          className="absolute w-64 h-64 bg-fuchsia-500/5 rounded-full blur-3xl"
          style={{
            bottom: "20%",
            left: `${60 + mousePosition.x * 0.01}%`,
            transform: `translate(-50%, 50%)`,
            animation: "float 30s ease-in-out infinite",
          }}
        />

        {/* Gradient Mesh */}
        <div
          className="absolute inset-0 opacity-15"
          style={{
            background: `radial-gradient(circle at ${mousePosition.x}% ${mousePosition.y}%, rgba(100, 116, 139, 0.15) 0%, transparent 60%)`,
          }}
        />

        {/* Grid Pattern */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
            `,
            backgroundSize: "50px 50px",
            transform: `translate(${mousePosition.x * 0.1}px, ${mousePosition.y * 0.1}px)`,
          }}
        />
      </div>

      {/* Hero Section */}
      <section className="h-screen flex flex-col items-center justify-center relative z-10">
        <div
          className={`text-center max-w-4xl mx-auto px-4 transition-all duration-1000 ${
            isLoaded ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
          }`}
        >
          {/* Floating Badge */}
          <div className="mb-8 inline-flex items-center space-x-2 bg-white/5 backdrop-blur-lg rounded-full px-4 py-2 border border-white/10 shadow-lg">
            <div className="w-2 h-2 bg-lime-400/80 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-400">Now Available</span>
          </div>

          <h1
            ref={titleRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className="text-6xl md:text-8xl font-bold mb-6 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-400 bg-clip-text text-transparent glitch-title hover:scale-105 transition-transform duration-300"
            data-text="Tweak3"
          >
            Tweak3
          </h1>

          <p className="text-xl md:text-2xl text-gray-300 mb-8 max-w-2xl mx-auto leading-relaxed">
            A revolutionary t3 cloneathon project that transforms readability
            and elevates UI design to new heights
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <SignInButton mode="modal">
              <button className="group bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white font-semibold py-4 px-8 rounded-xl text-lg transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-slate-500/30 relative overflow-hidden">
                <span className="relative z-10">Sign In to Try</span>
                <div className="absolute inset-0 bg-gradient-to-r from-slate-500 to-slate-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </button>
            </SignInButton>

          </div>

          {/* Feature Pills */}
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            {[
              "Multi-LLM Support",
              "Real-time Sync",
              "AI Image Generation",
              "Web Search",
            ].map((feature, index) => (
              <div
                key={feature}
                className="bg-white/3 backdrop-blur-lg rounded-full px-4 py-2 border border-white/8 text-sm text-gray-400 hover:bg-white/6 hover:text-gray-300 transition-all duration-300 cursor-pointer hover:scale-105"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {feature}
              </div>
            ))}
          </div>
        </div>

        {/* Enhanced More Info Section */}
        <div
          className={`absolute bottom-8 flex flex-col items-center z-20 transition-all duration-1000 delay-500 ${
            isLoaded ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
          }`}
        >
          <p className="text-gray-400 mb-2 text-sm">Discover more features</p>
          <button
            onClick={scrollToFeatures}
            className="group text-gray-400 hover:text-white transition-all duration-300 p-3 rounded-full bg-white/5 backdrop-blur-lg border border-white/10 hover:bg-white/10 hover:border-white/20 hover:scale-110"
          >
            <svg
              className="h-6 w-6 animate-bounce group-hover:animate-none transition-all duration-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="pt-20 pb-20 px-4 relative z-10">
        {/* Section Background */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/40 backdrop-blur-sm"></div>

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Powerful Features
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Everything you need for the perfect AI chat experience, built with
              modern technology
            </p>
          </div>

          {/* Core Requirements */}
          <div className="mb-20">
            <h3 className="text-2xl font-semibold mb-8 text-gray-200 text-center">
              Core Features
            </h3>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="group frosted-glass rounded-2xl p-8 hover:scale-105 transition-all duration-500 hover:shadow-xl hover:shadow-slate-500/10">
                <div className="flex items-start space-x-6">
                  <div className="text-4xl group-hover:scale-110 transition-transform duration-300">
                    💬
                  </div>
                  <div>
                    <h4 className="text-2xl font-semibold mb-3 text-white group-hover:text-slate-300 transition-colors duration-300">
                      Chat with Various LLMs
                    </h4>
                    <p className="text-gray-300 mb-4 leading-relaxed">
                      Seamlessly interact with multiple language models and
                      providers for the ultimate AI experience
                    </p>
                    <div className="flex items-center text-teal-400/80 text-sm font-medium">
                      <svg
                        className="w-4 h-4 mr-2"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Implemented
                    </div>
                  </div>
                </div>
              </div>

              <div className="group frosted-glass rounded-2xl p-8 hover:scale-105 transition-all duration-500 hover:shadow-xl hover:shadow-slate-500/10">
                <div className="flex items-start space-x-6">
                  <div className="text-4xl group-hover:scale-110 transition-transform duration-300">
                    👤
                  </div>
                  <div>
                    <h4 className="text-2xl font-semibold mb-3 text-white group-hover:text-slate-300 transition-colors duration-300">
                      Authentication & Sync
                    </h4>
                    <p className="text-gray-300 mb-4 leading-relaxed">
                      Secure user authentication with seamless chat history
                      synchronization across devices
                    </p>
                    <div className="flex items-center text-teal-400/80 text-sm font-medium">
                      <svg
                        className="w-4 h-4 mr-2"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Implemented
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bonus Features */}
          <div>
            <h3 className="text-2xl font-semibold mb-8 text-gray-200 text-center">
              Advanced Capabilities
            </h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  icon: "📎",
                  title: "Attachment Support",
                  desc: "Upload and process images and PDFs seamlessly",
                  color: "sky-300",
                },
                {
                  icon: "🎨",
                  title: "Image Generation",
                  desc: "AI-powered image creation with GPT-4 integration",
                  color: "fuchsia-300",
                },
                {
                  icon: "🔍",
                  title: "Syntax Highlighting",
                  desc: "Beautiful code formatting with syntax highlighting",
                  color: "emerald-300",
                },
                {
                  icon: "⚡",
                  title: "Resumable Streams",
                  desc: "Continue generation after page refresh",
                  color: "amber-300",
                },
                {
                  icon: "🌳",
                  title: "Chat Branching",
                  desc: "Create alternative conversation paths",
                  color: "violet-300",
                },
                {
                  icon: "🔗",
                  title: "Chat Sharing",
                  desc: "Share conversations with others instantly",
                  color: "indigo-300",
                },
                {
                  icon: "🔍",
                  title: "Web Search",
                  desc: "Integrate real-time web search capabilities",
                  color: "cyan-300",
                },
                {
                  icon: "🔑",
                  title: "Bring Your Own Key",
                  desc: "Use your personal API keys for enhanced control",
                  color: "orange-300",
                },
                {
                  icon: "📱",
                  title: "Mobile Friendly",
                  desc: "Fully responsive design for all devices",
                  color: "teal-300",
                },
                {
                  icon: "✨",
                  title: "Custom Themes",
                  desc: "Personalize with themes including Liquid Glass",
                  color: "rose-300",
                },
              ].map((feature, index) => (
                <div
                  key={feature.title}
                  className={`group frosted-glass rounded-xl p-6 hover:scale-105 transition-all duration-500 hover:shadow-xl hover:shadow-slate-500/10`}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="flex items-start space-x-4">
                    <div className="text-3xl group-hover:scale-110 transition-transform duration-300">
                      {feature.icon}
                    </div>
                    <div>
                      <h4
                        className={`text-lg font-semibold mb-2 text-white group-hover:text-${feature.color} transition-colors duration-300`}
                      >
                        {feature.title}
                      </h4>
                      <p className="text-gray-300 text-sm leading-relaxed">
                        {feature.desc}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <style jsx>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0px) rotate(0deg);
          }
          33% {
            transform: translateY(-30px) rotate(120deg);
          }
          66% {
            transform: translateY(-10px) rotate(240deg);
          }
        }

        .glitch-title {
          font-size: 6rem;
          font-weight: bold;
          color: #fff;
          position: relative;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 3px;
          font-family: system-ui, -apple-system, sans-serif;
        }

        .glitch-title::before,
        .glitch-title::after {
          content: attr(data-text);
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: transparent;
          -webkit-background-clip: text;
          background-clip: text;
        }

        .glitch-title::before {
          /* Muted red/brown */
          background: linear-gradient(90deg, rgb(140, 60, 60), rgb(140, 60, 60));
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          z-index: -1;
        }

        .glitch-title::after {
          /* Muted teal/blue */
          background: linear-gradient(
            90deg,
            rgb(60, 140, 140),
            rgb(60, 140, 140)
          );
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          z-index: -2;
        }

        .glitch-title:hover::before {
          animation: glitch-1 0.6s ease-in-out;
        }

        .glitch-title:hover::after {
          animation: glitch-2 0.6s ease-in-out;
        }

        .glitch-title:hover {
          animation: glitch-main 0.6s ease-in-out;
        }

        .glitch-title.glitch-played:hover::before,
        .glitch-title.glitch-played:hover::after,
        .glitch-title.glitch-played:hover {
          animation: none !important;
        }

        @keyframes glitch-main {
          0%,
          100% {
            transform: translate(0);
          }
          20% {
            transform: translate(-1px, 1px);
          }
          40% {
            transform: translate(-1px, -1px);
          }
          60% {
            transform: translate(1px, 1px);
          }
          80% {
            transform: translate(1px, -1px);
          }
        }

        @keyframes glitch-1 {
          0%,
          100% {
            transform: translate(0);
          }
          10% {
            transform: translate(-2px, -1px);
          }
          20% {
            transform: translate(-1px, 1px);
          }
          30% {
            transform: translate(1px, -1px);
          }
          40% {
            transform: translate(-1px, 1px);
          }
          50% {
            transform: translate(1px, -1px);
          }
          60% {
            transform: translate(-1px, 1px);
          }
          70% {
            transform: translate(1px, -1px);
          }
          80% {
            transform: translate(-1px, 1px);
          }
          90% {
            transform: translate(1px, -1px);
          }
        }

        @keyframes glitch-2 {
          0%,
          100% {
            transform: translate(0);
          }
          10% {
            transform: translate(1px, 1px);
          }
          20% {
            transform: translate(-1px, -1px);
          }
          30% {
            transform: translate(-1px, 1px);
          }
          40% {
            transform: translate(1px, -1px);
          }
          50% {
            transform: translate(-1px, 1px);
          }
          60% {
            transform: translate(1px, -1px);
          }
          70% {
            transform: translate(-1px, 1px);
          }
          80% {
            transform: translate(1px, -1px);
          }
          90% {
            transform: translate(-1px, 1px);
          }
        }

        .frosted-glass {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          transition: all 0.3s cubic-bezier(0.4, 0.2, 0.2, 1);
        }

        .frosted-glass:hover {
          transform: translateY(-8px) scale(1.02);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
      `}</style>
    </div>
  );
}