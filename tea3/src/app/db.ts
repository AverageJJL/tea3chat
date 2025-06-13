import Dexie, { Table } from "dexie";

export interface Thread {
  id?: number; 
  supabase_id?: string | null; 
  userId: string; 
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageAttachment { 
 
  supabase_id?: string | null; 
  file_name: string;
  file_url: string; 
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