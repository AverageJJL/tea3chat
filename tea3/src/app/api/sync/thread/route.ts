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

    const dataToInsert = {
      // Assuming Supabase 'id' is auto-generated (e.g., UUID by default).
      // Store the original Dexie ID if you need a reference to it.
      dexie_id: threadData.id,
      clerk_user_id: userId, // Essential for RLS
      title: threadData.title,
      created_at: threadData.createdAt, // Ensure column names match your Supabase table
      updated_at: threadData.updatedAt
    };

    // Replace 'threads' with your actual table name in Supabase
    const { data, error } = await supabase
      .from('threads')
      .insert([dataToInsert])
      .select(); // Optionally select the inserted data to return or log

    if (error) {
      console.error('Supabase insert error:', error);
      // Provide more specific error if RLS is the issue
      if (error.message.includes("violates row-level security policy")) {
        return NextResponse.json({ error: "Supabase RLS policy violation. Check table permissions and clerk_user_id handling." }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: any) {
    console.error('Error syncing thread to Supabase:', error);
    return NextResponse.json({ error: error.message || 'Failed to sync thread' }, { status: 500 });
  }
}
