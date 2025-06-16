"use client";

import dynamic from "next/dynamic";
import { SignIn, SignUp, useUser } from "@clerk/nextjs";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import LandingPage from "../components/LandingPage";

// Dynamically import the router component with no SSR
const ClientRouter = dynamic(() => import("./ClientRouter"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen">
      {/* This loading is for the ClientRouter component itself */}
      <div className="text-gray-400">Loading Application...</div>
    </div>
  ),
});

export default function AppClientRouter() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!isLoaded) return; // Wait for Clerk to load before doing anything

    if (isSignedIn) {
      // If user is signed in and tries to access an auth page (sign-in, sign-up) or landing page,
      // redirect them to the main application (e.g., /chat).
      if (pathname === "/" || pathname === "/sign-in" || pathname === "/sign-up") {
        router.push("/chat");
      }
    } else {
      // If user is not signed in and tries to access a page that isn't explicitly
      // a sign-in, sign-up, or landing page, redirect them to the landing page (/).
      if (pathname !== "/" && pathname !== "/sign-in" && pathname !== "/sign-up") {
        router.push("/");
      }
    }
  }, [isLoaded, isSignedIn, router, pathname]);

  if (!isLoaded) {
    // Show a loading state while Clerk is determining the auth status
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-gray-400">Loading Authentication...</div>
      </div>
    );
  }

  if (isSignedIn) {
    // If user is signed in:
    // If they are on an auth path, useEffect is already redirecting them.
    // Show a "Redirecting..." message until the navigation completes.
    if (pathname === "/" || pathname === "/sign-in" || pathname === "/sign-up") {
      return (
        <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
          <div className="text-gray-400">Redirecting...</div>
        </div>
      );
    }
    // If signed in and not on an auth path, render the main ClientRouter.
    return <ClientRouter />;
  }
  // If user is not signed in (and Clerk is loaded):
  // Show landing page for root path, Clerk components for explicit auth paths
  if (pathname === "/") {
    return <LandingPage />;
  }

  if (pathname === "/sign-in") {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <SignIn
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
          afterSignInUrl="/chat"
        />
      </div>
    );
  }

  if (pathname === "/sign-up") {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <SignUp
          routing="path"
          path="/sign-up" // This page handles sign-up at /sign-up
          signInUrl="/"
          afterSignUpUrl="/chat"
        />
      </div>
    );
  }

  // Fallback for !isSignedIn if path is somehow not caught by useEffect or above conditions
  // (e.g. during the brief moment of client-side redirection by useEffect)
  return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
      <div className="text-gray-400">Loading Page...</div>
    </div>
  );
}