// app/api/share/enable/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(request: Request) {
  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { supabaseThreadId } = await request.json();
  if (!supabaseThreadId) {
    return NextResponse.json(
      { error: "supabaseThreadId is required" },
      { status: 400 },
    );
  }

  try {
    const supabaseToken = await getToken({ template: "supabase" });
    if (!supabaseToken || !supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase configuration error.");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${supabaseToken}` } },
    });

    // RLS ensures the user can only update their own thread.
    const { data, error } = await supabase
      .from("threads")
      .update({ is_public: true, updated_at: new Date().toISOString() })
      .eq("shared_id", supabaseThreadId)
      .eq("clerk_user_id", userId) // Explicit ownership check
      .select()
      .single();

    if (error) {
      console.error("Supabase share enable error:", error);
      if (error.code === "PGRST116") {
        // PostgREST error for "No rows found"
        return NextResponse.json(
          { error: "Thread not found or you do not have permission." },
          { status: 404 },
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error enabling share:", error);
    return NextResponse.json(
      { error: error.message || "Failed to enable sharing" },
      { status: 500 },
    );
  }
}