"use client";

import dynamic from "next/dynamic";

// Dynamically import the router component with no SSR
const ClientRouter = dynamic(() => import("./ClientRouter"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen">
      <div className="text-gray-600">Loading...</div>
    </div>
  ),
});

export default function AppClientRouter() {
  return <ClientRouter />;
}