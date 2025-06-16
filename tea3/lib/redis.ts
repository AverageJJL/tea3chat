import { createClient } from "redis";

// Cached client instance (module-level singleton)
let redisClient: ReturnType<typeof createClient> | null = null;

/**
 * Return a **connected** Redis client. If a connection attempt fails, the
 * promise rejects so callers can handle it (e.g., send a 503 to the client).
 * Automatic reconnection is disabled so we surface connection problems
 * immediately instead of flooding the logs with retry errors.
 */
export async function getRedisClient() {
  if (redisClient) return redisClient;

  redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
      reconnectStrategy: false, // fail fast – let callers decide what to do
    },
  });

  // Convert "error" events into promise rejections by caching the first error
  // until `connect()` resolves/rejects. This ensures ECONNREFUSED surfaces.
  let firstError: any | null = null;
  const errorListener = (err: any) => {
    firstError ??= err; // store only the first error
  };
  redisClient.once("error", errorListener);

  try {
    await redisClient.connect();
  } catch (err) {
    // Connection failed – clean up and propagate the error
    redisClient.removeListener("error", errorListener);
    redisClient = null;
    throw err;
  }

  // Connected successfully – no need to keep the temporary listener
  redisClient.removeListener("error", errorListener);

  // Still log subsequent errors for diagnostics but do not crash the process
  redisClient.on("error", (err) => {
    console.error("Redis Client Error", err);
  });

  return redisClient;
}