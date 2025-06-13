import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClientOptions } from '@supabase/supabase-js';

const supabaseUrl = 'https://pdvptbdrdrbtrdvmwgdl.supabase.co'; // Ensure this is set in your environment variables
// Ensure NEXT_PUBLIC_SUPABASE_ANON_KEY is set in your environment variables
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Helper function to initialize Supabase client
const getSupabaseClient = async (getToken: Function) => {
  if (!supabaseUrl) {
    console.error('Supabase URL is not configured. Please set NEXT_PUBLIC_SUPABASE_URL in your environment variables.');
    throw new Error('Supabase URL is not configured.');
  }
  if (!supabaseAnonKey) {
    console.error('Supabase anon key is not configured. Please set NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment variables.');
    throw new Error('Supabase anon key is not configured.');
  }

  const supabaseToken = await getToken({ template: 'supabase' });
  if (!supabaseToken) {
    throw new Error('Could not retrieve Supabase token for user from Clerk.');
  }

  // Initialize the client with the anon key.
  // The user-specific JWT will be used for requests via the global headers.
  const options: SupabaseClientOptions<"public"> = {
    global: {
      headers: {
        Authorization: `Bearer ${supabaseToken}`,
      },
    },
    // Optional: you can add auth options here if needed, e.g., persistSession
    // auth: {
    //   persistSession: false // Example: useful for server-side operations
    // }
  };
  
  return createClient(supabaseUrl, supabaseAnonKey, options);
};

export async function POST(request: Request) {
  const { userId, getToken } = await auth(); // Corrected: Added await
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { threadData, messagesData, attachmentsData } = await request.json();
    const supabase = await getSupabaseClient(getToken);

    // 1. Upsert Thread
    // IMPORTANT: Ensure you have a unique constraint on (dexie_id, clerk_user_id) in your 'threads' table for onConflict to work.
    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .upsert(
        {
          shared_id: threadData.supabase_id, // The universal UUID from the client
          clerk_user_id: userId,
          title: threadData.title,
          created_at: threadData.createdAt,
          updated_at: threadData.updatedAt,
        },
        {
          onConflict: "shared_id", // CONFLICT ON THE UNIVERSAL ID
        }
      )
      .select("id, shared_id") // Select the internal ID and the shared_id
      .single();

    if (threadError) {
      console.error('Supabase thread upsert error:', threadError);
      throw threadError;
    }
    if (!thread || !thread.id) {
      console.error('Failed to upsert thread or retrieve its ID from Supabase. Thread object:', thread);
      throw new Error('Failed to upsert thread or retrieve its ID from Supabase.');
    }

    const supabaseThreadId = thread.id;

    // 2. Insert Messages and their Attachments
    const insertedMessages = [];
    for (const msg of messagesData) {
      const { data: message, error: messageError } = await supabase
        .from('messages')
        .insert({
          // dexie_id: msg.id, // Store local message ID if needed
          threadId: supabaseThreadId,
          clerk_user_id: userId, // For RLS on messages table
          role: msg.role,
          content: msg.content,
          model: msg.model,
          created_at: msg.createdAt,
        })
        .select()
        .single();

      if (messageError) {
        console.error(`Supabase message insert error for local message ID ${msg.id || 'unknown'}:`, messageError);
        continue; 
      }
      if (!message || !message.id) {
        console.error(`Failed to insert message or retrieve its ID from Supabase for local message ID ${msg.id || 'unknown'}. Resulting message object:`, message);
        continue;
      }
      const supabaseMessageId = message.id;
      
      const insertedAttachmentsForMessage = [];
      // Ensure attachmentsData is an array and msg.id is the local dexie ID of the message
      const currentMessageAttachments = (attachmentsData || []).filter((att: any) => att.localMessageId === msg.id); 
      for (const att of currentMessageAttachments) {
        const { data: newAttachment, error: attachmentError } = await supabase
          .from('attachments')
          .insert({
            messageId: supabaseMessageId,
            clerk_user_id: userId, // For RLS on attachments table
            file_name: att.file_name,
            file_url: att.file_url, // This MUST be the Supabase storage URL after upload
          })
          .select() // Select the newly inserted attachment
          .single(); // Expecting a single attachment

        if (attachmentError) {
          console.error('Supabase attachment insert error:', attachmentError);
          // Decide if you want to roll back or continue
        } else if (newAttachment) {
          // Assuming 'att.id' is the local Dexie ID of the attachment
          insertedAttachmentsForMessage.push({ ...newAttachment, dexie_id: att.id }); 
        }
      }
      // Add attachments to the message object
      insertedMessages.push({ ...message, dexie_id: msg.id, attachments: insertedAttachmentsForMessage });
    }

    return NextResponse.json({ 
      success: true, 
      data: { 
        thread: { ...thread, dexie_id: threadData.id }, 
        messages: insertedMessages 
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error syncing thread and messages to Supabase:', error);
    const errorMessage = error.message || 'Failed to sync thread and messages';
    const status = error.message === 'Could not retrieve Supabase token.' ? 500 : (error.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}


export async function GET(request: Request) {
  const { userId, getToken } = await auth(); // Corrected: Added await
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const lastSyncTimestamp = searchParams.get('lastSync');

  try {
    const supabase = await getSupabaseClient(getToken);

    // Fetch Threads with nested Messages and Attachments
    let query = supabase
      .from('threads')
      .select(`
        id,
        dexie_id,
        clerk_user_id,
        title,
        created_at,
        updated_at,
        messages (
          id,
          threadId,
          clerk_user_id,
          role,
          content,
          model,
          created_at,
          attachments (
            id,
            messageId, 
            clerk_user_id,
            file_name,
            file_url,
            uploaded_at
          )
        )
      `)
      .eq('clerk_user_id', userId)
      .order('created_at', { ascending: false }); // Order threads by their own created_at column

    if (lastSyncTimestamp) {
      query = query.gt('updated_at', lastSyncTimestamp);
    }

    const { data: threads, error } = await query;

    if (error) {
      console.error('Supabase fetch error:', error);
      throw error;
    }

    return NextResponse.json({ success: true, data: threads });

  } catch (error: any) {
    console.error('Error fetching data from Supabase:', error);
    const errorMessage = error.message || 'Failed to fetch data';
    const status = error.message === 'Could not retrieve Supabase token.' ? 500 : (error.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
