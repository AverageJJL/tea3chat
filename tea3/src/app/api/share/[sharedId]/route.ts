// app/api/share/[sharedId]/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET(
  request: Request,
  { params }: { params: { sharedId: string } },
) {
  // Require user to be logged in to view a shared chat
  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sharedId } = params;
  if (!sharedId) {
    return NextResponse.json(
      { error: "Shared ID is missing" },
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

    // Fetch the thread. The RLS policy will automatically enforce
    // that we can only fetch it if `is_public` is true.
    const { data: thread, error } = await supabase
      .from("threads")
      .select(
        `
        shared_id,
        title,
        messages (
          shared_id,
          role,
          content,
          model,
          created_at,
          attachments (
            file_name,
            file_url
          )
        )
      `,
      )
      .eq("shared_id", sharedId)
      .eq("is_public", true) // Explicitly check for public status
      .single();

    if (error || !thread) {
      console.error("Supabase fetch shared thread error:", error);
      return NextResponse.json(
        { error: "Chat not found or is not public." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: thread });
  } catch (error: any) {
    console.error("Error fetching shared thread:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch shared thread" },
      { status: 500 },
    );
  }
}