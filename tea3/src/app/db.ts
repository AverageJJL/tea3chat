import Dexie, { Table } from "dexie";

export interface Thread {
  id?: number;
  userId: string; 
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id?: number;
  threadId: number;
  role: "user" | "assistant";
  content: string;
  attachments?: string[]; 
  createdAt: Date;
  model?: string; 
}

export class MySubClassedDexie extends Dexie {
  threads!: Table<Thread>;
  messages!: Table<Message>;

  constructor() {
    super("tea3ChatDB");
    this.version(1).stores({
      threads: "++id, title, createdAt, updatedAt",
      messages: "++id, threadId, role, createdAt, model",
    });
   
    this.version(2).stores({
      threads: "++id, userId, title, createdAt, updatedAt", 
      messages: "++id, threadId, role, createdAt, model", 
    }).upgrade(tx => {
      console.log("Upgrading database to version 2: adding 'userId' to 'threads' table and indexing it.");
    });
   
  }
}

export const db = new MySubClassedDexie();