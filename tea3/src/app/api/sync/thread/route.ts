import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL; // Ensure this is set in your environment variables
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(request: Request) {
  const { userId, getToken } = await auth(); // Get Clerk auth context

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const threadData = await request.json();

    // Ensure supabase_id (our shared_id) is present in the request
    if (!threadData.supabase_id) {
      console.error('Error: supabase_id (acting as shared_id) missing in threadData for sync.');
      return NextResponse.json({ error: 'supabase_id (acting as shared_id) is required in the request body.' }, { status: 400 });
    }

    const supabaseToken = await getToken({ template: 'supabase' });

    if (!supabaseToken) {
      return NextResponse.json({ error: 'Could not retrieve Supabase token. Ensure JWT template is configured in Clerk.' }, { status: 500 });
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase environment variables are missing.' }, { status: 500 });
    }

    // Initialize Supabase client with the anon key and attach the user token via headers
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${supabaseToken}`,
        },
      },
    });

    // Prepare data for Supabase, using threadData.supabase_id as the shared_id
    // Assumes your Supabase 'threads' table has a 'shared_id' column (UUID, unique)
    // and 'id' is the auto-generated primary key.
    const dataToUpsert = {
      shared_id: threadData.supabase_id, // This is the client-generated UUID
      dexie_id: threadData.id,           // Original Dexie ID (local to the client that initiated sync)
      clerk_user_id: userId,             // Authenticated user
      title: threadData.title,
      created_at: threadData.createdAt,  // Client-provided creation timestamp
      updated_at: threadData.updatedAt   // Client-provided update timestamp
    };

    // Upsert into 'threads' table.
    // This will insert a new row if no row with the given 'shared_id' exists for the user,
    // or update the existing row if it does.
    // Assumes 'shared_id' has a unique constraint.
    const { data, error } = await supabase
      .from('threads')
      .upsert(dataToUpsert, {
        onConflict: 'shared_id', // Specify the column(s) for conflict detection
        // ignoreDuplicates: false, // Default is true. Upsert updates on conflict.
      })
      .select() // Select the inserted or updated row
      .single(); // Expecting a single row back

    if (error) {
      console.error('Supabase upsert error:', error);
      if (error.message.includes("violates row-level security policy")) {
        return NextResponse.json({ error: "Supabase RLS policy violation. Check table permissions and clerk_user_id handling." }, { status: 403 });
      }
      if (error.message.includes("duplicate key value violates unique constraint")) {
         return NextResponse.json({ error: `Unique constraint violation: ${error.message}` }, { status: 409 }); // 409 Conflict
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // The 'data' returned from Supabase will contain the full thread record,
    // including its Supabase 'id' (PK) and the 'shared_id'.
    // The client should use data.shared_id to ensure its local Dexie thread.supabase_id is correct.
    return NextResponse.json({ success: true, data }, { status: 200 }); // 200 OK (usually for update, can be 201 for create)

  } catch (error: any) {
    console.error('Error syncing thread to Supabase:', error);
    return NextResponse.json({ error: error.message || 'Failed to sync thread' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const supabaseId = searchParams.get('supabase_id');

  if (!supabaseId) {
    return NextResponse.json({ error: 'supabase_id query param is required' }, { status: 400 });
  }

  try {
    const supabaseToken = await getToken({ template: 'supabase' });
    if (!supabaseToken) {
      return NextResponse.json({ error: 'Could not retrieve Supabase token.' }, { status: 500 });
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase environment variables are missing.' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${supabaseToken}` } },
    });

    const { data: thread, error: fetchError } = await supabase
      .from('threads')
      .select('id')
      .eq('shared_id', supabaseId)
      .eq('clerk_user_id', userId)
      .single();

    if (fetchError || !thread) {
      const msg = fetchError?.message || 'Thread not found';
      return NextResponse.json({ error: msg }, { status: 404 });
    }

    const { data: messageIdsData, error: msgFetchError } = await supabase
      .from('messages')
      .select('id')
      .eq('threadId', thread.id);

    if (msgFetchError) {
      return NextResponse.json({ error: msgFetchError.message }, { status: 500 });
    }

    const messageIds = (messageIdsData || []).map((m: any) => m.id);
    if (messageIds.length > 0) {
      await supabase.from('attachments').delete().in('messageId', messageIds);
    }

    await supabase.from('messages').delete().eq('threadId', thread.id);
    await supabase.from('threads').delete().eq('id', thread.id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting thread from Supabase:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete thread' }, { status: 500 });
  }
}
