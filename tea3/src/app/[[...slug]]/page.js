"use client";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ChatPage from "../ChatPage"; 

// temporary potential home page or other routes
function HomePage() {
  return (
    <div className="p-4">
      <h1 className="text-xl">Welcome!</h1>
      <p>Navigate to <a href="/chat" className="text-blue-600 hover:underline">/chat</a> to start chatting.</p>
      {/* Or use Link from react-router-dom for client-side navigation if this component is part of the Routes */}
    </div>
  );
}

export default function AppClientRouter() {
  // ensure this component only renders on the client-side where window is available for BrowserRouter
  if (typeof window === "undefined") {
    return null; 
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/chat" element={<ChatPage />} />
        {/* Example: Redirect root to /chat, or define a HomePage component for "/" */}
        <Route path="/" element={<Navigate replace to="/chat" />} />
        {/* You can add more routes here */}
        {/* <Route path="/" element={<HomePage />} /> */}
        {/* <Route path="*" element={<div>Page Not Found</div>} /> */}
      </Routes>
    </BrowserRouter>
  );
}