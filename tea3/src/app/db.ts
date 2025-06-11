import Dexie from "dexie";

interface Thread {
  id?: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Message {
  id?: number;
  threadId: number;
  role: 'user' | 'assistant';
  content: string;
  // Data URLs for any image attachments associated with the message
  attachments?: string[];
  createdAt: Date;
}

export class MySubClassedDexie extends Dexie {
  threads!: Dexie.Table<Thread, number>;
  messages!: Dexie.Table<Message, number>;

  constructor() {
    super("t3-chat-clone-db");

    this.version(1).stores({
      threads: "++id, title, createdAt, updatedAt",
      messages: "++id, threadId, role, content, createdAt, [threadId+createdAt]",
    });
  }
}

// Create a single, reusable instance of the database
export const db = new MySubClassedDexie();