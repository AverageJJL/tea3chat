import { createClient } from "redis";

// Declare the client variable in the module scope.
let redisClient: ReturnType<typeof createClient> | null = null;

/**
 * Gets a connected Redis client instance.
 * If the client is not already connected, it will connect.
 * This singleton pattern prevents creating new connections for every request.
 */
export async function getRedisClient() {
  if (!redisClient) {
    // If the client doesn't exist, create it.
    redisClient = createClient({
      url: process.env.REDIS_URL,
    });

    redisClient.on("error", (err) => console.error("Redis Client Error", err));

    // We only need to connect once. The `redis` library handles reconnections.
    await redisClient.connect();
  }

  return redisClient;
}