// app/api/sync/message/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient, SupabaseClientOptions } from "@supabase/supabase-js";

// --- Re-use your existing Supabase connection logic ---
const supabaseUrl = "https://pdvptbdrdrbtrdvmwgdl.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const getSupabaseClient = async (getToken: Function) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase environment variables are not configured.");
  }
  const supabaseToken = await getToken({ template: "supabase" });
  if (!supabaseToken) {
    throw new Error("Could not retrieve Supabase token from Clerk.");
  }
  const options: SupabaseClientOptions<"public"> = {
    global: { headers: { Authorization: `Bearer ${supabaseToken}` } },
  };
  return createClient(supabaseUrl, supabaseAnonKey, options);
};

// --- The new POST handler for editing/regenerating messages ---
export async function POST(request: Request) {
  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { threadSupabaseId, messagesToUpsert, idsToDelete } =
      await request.json();

    // --- Payload Validation ---
    if (!threadSupabaseId) {
      // This is the error you were seeing. We now handle it gracefully.
      return NextResponse.json(
        { error: "Payload must include threadSupabaseId." },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseClient(getToken);

    // --- Step 1: Delete subsequent messages ---
    // Check if idsToDelete is a non-empty array before proceeding
    if (idsToDelete && Array.isArray(idsToDelete) && idsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from("messages")
        .delete()
        .in("shared_id", idsToDelete) // Use the universal shared_id
        .eq("clerk_user_id", userId); // Security check

      if (deleteError) {
        console.error("Supabase delete error:", deleteError);
        throw new Error(`Failed to delete messages: ${deleteError.message}`);
      }
    }

    // --- Step 2: Upsert the edited/regenerated messages ---
    if (
      messagesToUpsert &&
      Array.isArray(messagesToUpsert) &&
      messagesToUpsert.length > 0
    ) {
      // First, we need the internal integer ID of the thread to satisfy the foreign key constraint.
      const { data: thread, error: threadError } = await supabase
        .from("threads")
        .select("id")
        .eq("shared_id", threadSupabaseId) // Find thread by its universal ID
        .single();

      if (threadError || !thread) {
        console.error("Error fetching parent thread:", threadError);
        throw new Error(
          `Parent thread with shared_id ${threadSupabaseId} not found.`
        );
      }
      const internalThreadId = thread.id;

      // Prepare the data for upserting.
      const upsertPayload = messagesToUpsert.map((msg: any) => ({
        shared_id: msg.supabase_id, // The universal UUID
        threadId: internalThreadId, // The internal integer FK
        clerk_user_id: userId,
        role: msg.role,
        content: msg.content,
        model: msg.model,
        created_at: msg.createdAt,
      }));

      const { error: upsertError } = await supabase
        .from("messages")
        .upsert(upsertPayload, {
          onConflict: "shared_id", // This will overwrite messages with the same shared_id
        });

      if (upsertError) {
        console.error("Supabase upsert error:", upsertError);
        throw new Error(`Failed to upsert messages: ${upsertError.message}`);
      }
    }

    // --- Step 3: Update the thread's `updated_at` timestamp ---
    const { error: threadUpdateError } = await supabase
      .from("threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("shared_id", threadSupabaseId);

    if (threadUpdateError) {
      // This is not a critical failure, so we can just log it.
      console.warn(
        "Could not update thread timestamp:",
        threadUpdateError.message
      );
    }

    return NextResponse.json(
      { success: true, message: "Sync operation successful." },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in message sync endpoint:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}