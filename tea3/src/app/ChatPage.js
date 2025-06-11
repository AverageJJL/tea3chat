"use client";

// useChat will manage all our chat messages, the input box, and sending the form for us.
import { useChat } from "ai/react";
import { useState, useEffect } from "react";

export default function Chat() {
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Fetch available models on component mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch("/api/chat");
        const data = await response.json();
        setAvailableModels(data.models);
        // Set first model as default
        if (data.models.length > 0) {
          setSelectedModel(data.models[0].value);
        }
      } catch (error) {
        console.error("Failed to fetch models:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchModels();
  }, []);

  const { messages, input, handleInputChange, handleSubmit } = useChat({
    body: {
      model: selectedModel,
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-600">Loading models...</div>
      </div>
    );
  }

  return (
    // This is the main container for our chat window.
    <div className="flex flex-col w-full max-w-2xl mx-auto h-screen">
      {/* Model selector header */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex items-center gap-3">
          <label htmlFor="model-select" className="text-sm font-medium text-gray-700">
            Model:
          </label>
          <select
            id="model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {availableModels.map((model) => (
              <option key={model.value} value={model.value}>
                {model.displayName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* This is the area where messages will appear. */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* We loop through the 'messages' array. For each message, we create a div. */}
        {messages.map((m) => (
          <div
            key={m.id}
            // This line changes the style based on who sent the message.
            className={`p-3 rounded-lg ${
              m.role === "user"
                ? "bg-blue-500 text-white self-end"
                : "bg-gray-200 text-gray-800 self-start"
            }`}
          >
            <span className="font-bold">
              {m.role === "user" ? "You" : "AI"}:{" "}
            </span>
            {m.content}
          </div>
        ))}
      </div>

      {/* This is the form at the bottom with the input box and send button. */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex items-center">
          <input
            className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={input} // The text in the box is controlled by the hook.
            placeholder="Say something..."
            onChange={handleInputChange} // The hook updates the text as you type.
            disabled={!selectedModel}
          />
          <button
            type="submit"
            disabled={!selectedModel || !input.trim()}
            className="ml-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}