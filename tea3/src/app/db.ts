import Dexie, { Table } from "dexie";

export interface Thread {
  id?: number; 
  supabase_id?: string | null; 
  userId: string; 
  title: string;
  createdAt: Date;
  updatedAt: Date;
  forked_from_id?: string | null;
  is_pinned?: boolean;
  pinned_at?: Date | null;
}

export interface UserPreferences {
  id?: number;
  userId: string;
  name?: string;
  role?: string;
  traits?: string[];
  customInstructions?: string;
  disableResumableStream?: boolean;
  useLiquidGlass?: boolean;
}

export interface MessageAttachment { 
 
  supabase_id?: string | null; 
  file_name: string;
  file_url: string; 
  mime_type?: string;
  uploaded_at?: Date; // This would be set by Supabase, less critical for Dexie to hold before sync
}

export interface Message {
  id?: number; 
  supabase_id?: string | null; 
  // CRITICAL: We link messages to threads on the client using the universal ID.
  thread_supabase_id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: MessageAttachment[]; 
  createdAt: Date;
  model?: string; 
}

export class AppDB extends Dexie {
  threads!: Table<Thread>;
  messages!: Table<Message>;
  userPreferences!: Table<UserPreferences>;

  constructor() {
    super("AppDB");
    // Increment version number when schema changes
 
    this.version(2).stores({
      threads: "++id, supabase_id, userId, title, createdAt, updatedAt", // Added supabase_id, title
      messages: "++id, supabase_id, threadId, role, content, createdAt, model", // Added supabase_id and other fields
      // No separate attachments table in Dexie, they are part of messages.
      // Ensure all indexed fields are listed.
    });
    this.version(3).stores({
      
      threads: "++id, &supabase_id, userId, title, createdAt, updatedAt",
      messages: "++id, supabase_id, thread_supabase_id, createdAt",
    });
    this.version(4).stores({
      threads: "++id, &supabase_id, userId, title, createdAt, updatedAt, forked_from_id", // <-- ADD forked_from_id
      messages: "++id, supabase_id, thread_supabase_id, createdAt",
    });
    this.version(5).stores({
      // No changes to threads
      threads: "++id, &supabase_id, userId, title, createdAt, updatedAt, forked_from_id",
      // Remove uniqueness constraint on supabase_id for messages if it was ever there,
      // and ensure it is properly indexed for lookups.
      messages: "++id, supabase_id, thread_supabase_id, createdAt",
    }).upgrade(tx => {
      // This upgrade is mostly to force a schema reload for users who might have
      // a bad schema version cached. No actual data modification is needed.
      console.log("Upgrading database to version 5, ensuring message indexes are correct.");
      return tx.table("messages").toCollection().first().then(() => {});
    });
    this.version(6).stores({
      threads: "++id, &supabase_id, userId, title, createdAt, updatedAt, forked_from_id",
      messages: "++id, supabase_id, thread_supabase_id, createdAt",
    }).upgrade(tx => {
      console.log("Upgrading database to version 6 for attachment mime_type support.");
      return tx.table("messages").toCollection().first().then(() => {});
    });
    this.version(7).stores({
      threads: "++id, &supabase_id, userId, createdAt, updatedAt, forked_from_id, is_pinned, title",
      messages: "++id, supabase_id, thread_supabase_id, createdAt",
    });
    this.version(8).stores({
      threads: "++id, &supabase_id, userId, createdAt, updatedAt, forked_from_id, is_pinned, pinned_at, title",
      messages: "++id, supabase_id, thread_supabase_id, createdAt",
    });
    this.version(9).stores({
      threads: "++id, &supabase_id, userId, createdAt, updatedAt, forked_from_id, is_pinned, pinned_at, title",
      messages: "++id, supabase_id, thread_supabase_id, createdAt",
      userPreferences: "++id, &userId",
    });
    this.version(10).stores({
      threads: "++id, &supabase_id, userId, createdAt, updatedAt, forked_from_id, is_pinned, pinned_at, title",
      messages: "++id, supabase_id, thread_supabase_id, createdAt",
      userPreferences: "++id, &userId",
    }).upgrade(tx => {
      return tx.table("userPreferences")
        .toCollection()
        .modify(pref => {
          if (pref.disableResumableStream === undefined) {
            pref.disableResumableStream = false;
          }
        });
    });
    // If you had a version 1 without these fields, you might need an upgrade function
    // Example:
    // this.version(1).stores({
    //   threads: '++id, userId, createdAt, updatedAt',
    //   messages: '++id, threadId, createdAt',
    // });
    // this.version(2).stores({
    //   threads: '++id, supabase_id, userId, title, createdAt, updatedAt',
    //   messages: '++id, supabase_id, threadId, role, content, createdAt, model',
    // }).upgrade(tx => {
    //   return tx.table("threads").toCollection().modify(thread => {
    //     thread.supabase_id = null;
    //     if (!thread.title) thread.title = "New Chat"; // Ensure title exists
    //   });
    //   // Similar modification for messages if needed
    // });

  }
}

export const db = new AppDB();