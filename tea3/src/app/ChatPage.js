"use client";

// useChat will manage all our chat messages, the input box, and sending the form for us.
import { useChat } from "ai/react";
import { useState, useEffect } from "react";

export default function Chat() {
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch available models on component mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch("/api/chat");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.error) {
          throw new Error(data.error);
        }
        setAvailableModels(data.models);
        // Set first model as default
        if (data.models.length > 0) {
          setSelectedModel(data.models[0].value);
        }
      } catch (error) {
        console.error("Failed to fetch models:", error);
        setError(error.message || "Failed to load available models. Please refresh the page to try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchModels();
  }, []);

  const { messages, input, handleInputChange, handleSubmit, isLoading: isSending } = useChat({
    body: {
      model: selectedModel,
    },
    onError: (error) => {
      console.error("Chat error:", error);
      setError(error.message || "Failed to send message. Please try again.");
    },
    onFinish: () => {
      // Clear any previous errors when a message is successfully sent
      setError(null);
    },
  });

  // Custom submit handler to clear errors before sending
  const handleFormSubmit = (e) => {
    setError(null); // Clear any existing errors
    handleSubmit(e);
  };

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

      {/* Error message display */}
      {error && (
        <div className="mx-4 mt-2 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md">
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

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
      <form onSubmit={handleFormSubmit} className="p-4 border-t">
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
            disabled={!selectedModel || !input.trim() || isSending}
            className="ml-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 flex items-center"
          >
            {isSending ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Sending...
              </>
            ) : (
              "Send"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}