import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Ensure these environment variables are set in your .env.local file
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase URL or Anon Key is missing. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file.");
  // Depending on how critical this is at startup, you might throw an error
  // or allow the app to run with a non-functional Supabase client.
}

// Initialize Supabase client, Memoize the client so it's not recreated on every call if this file is imported multiple times.
let supabase: SupabaseClient | null = null;
if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.warn("Supabase client could not be initialized due to missing URL or Key.");
}


const BUCKET_NAME = 'attachments'; // IMPORTANT: Create this bucket in your Supabase project.

interface UploadResponse {
  supabaseUrl: string | null;
  fileName: string | null; // This will be the original name of the file
  error: string | null;
}

export async function uploadFileToSupabaseStorage(file: File): Promise<UploadResponse> {
  if (!supabase) {
    return { supabaseUrl: null, fileName: file?.name || null, error: "Supabase client is not initialized." };
  }
  if (!file) {
    return { supabaseUrl: null, fileName: null, error: "No file provided." };
  }

  try {
    const fileExt = file.name.split('.').pop();
    // Using a timestamp and a random string for more uniqueness, plus the original extension
    const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `${uniqueFileName}`; // You could organize files into folders, e.g., `user.id/${uniqueFileName}`

    console.log(`Uploading '${file.name}' as '${filePath}' to Supabase bucket '${BUCKET_NAME}'...`);
    console.log(`File type being sent: ${file.type}`); // Log the file type

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: '3600', // Cache for 1 hour
        upsert: false, // Do not overwrite if file with the same path exists (should be rare with uniqueFileName)
        contentType: file.type, // Explicitly set content type based on the file
      });

    if (uploadError) {
      console.error("Supabase upload error object:", uploadError); // Log the full error object
      return { supabaseUrl: null, fileName: file.name, error: uploadError.message };
    }

    if (!uploadData) {
        return { supabaseUrl: null, fileName: file.name, error: "Upload successful but no data returned from Supabase." };
    }

    console.log("Supabase upload successful, data:", uploadData);

    // Get the public URL for the uploaded file
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(uploadData.path); // Use the path returned by the upload

    if (!publicUrlData || !publicUrlData.publicUrl) {
      console.error("Failed to get public URL for:", uploadData.path);
      // It's possible the file is uploaded but the URL retrieval fails.
      // You might want to handle this by trying to construct the URL manually if your bucket is public
      // or by informing the user that the upload succeeded but the URL is unavailable.
      return { supabaseUrl: null, fileName: file.name, error: "File uploaded but failed to get public URL." };
    }
    
    console.log(`Public URL for '${uploadData.path}': ${publicUrlData.publicUrl}`);

    return {
      supabaseUrl: publicUrlData.publicUrl,
      fileName: file.name, // Return the original file name
      error: null,
    };

  } catch (e: any) {
    console.error("Error in uploadFileToSupabaseStorage:", e);
    return { supabaseUrl: null, fileName: file.name, error: e.message || "An unknown error occurred during upload." };
  }
}
