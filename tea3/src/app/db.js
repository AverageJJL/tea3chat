import Dexie from 'dexie';

class MyDatabase extends Dexie {
    constructor() {
        super('myDatabase');
        this.version(1).stores({
            threads: '++id, title, createdAt, updatedAt', // Index createdAt, updatedAt
            messages: '++id, threadId, role, content, createdAt, [threadId+createdAt]' // Index threadId and [threadId+createdAt]
        });
    }
}

export const db = new MyDatabase();