// app/api/chat/resume/route.ts
import { NextResponse } from "next/server";
import { getRedisClient } from "@/lib/redis";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const assistantMessageId = searchParams.get("id");
  const timestamp = new Date().toISOString();

  console.log(
    `[${timestamp}] [RESUME] Received poll for ID: ${assistantMessageId}`
  );

  if (!assistantMessageId) {
    console.error(`[${timestamp}] [RESUME] Error: No ID provided.`);
    return NextResponse.json(
      { error: "Message ID is required" },
      { status: 400 }
    );
  }

  try {
    const redis = await getRedisClient();
    const redisKey = `stream:${assistantMessageId}`;

    const content = await redis.get(redisKey);

    if (content !== null) {
      console.log(
        `[${timestamp}] [RESUME] Found key ${redisKey}. Status: streaming. Content length: ${content.length}`
      );
      // return NextResponse.json({ status: "streaming", content });
      // Key exists, return the full state object
      return NextResponse.json(JSON.parse(content.toLocaleString()));
    } else {
      console.log(
        `[${timestamp}] [RESUME] Key ${redisKey} not found. Status: complete.`
      );
      // return NextResponse.json({ status: "complete" });
      return NextResponse.json({ status: "expired" });
    }
  } catch (error) {
    console.error(`[${timestamp}] [RESUME] API error:`, error);
    return NextResponse.json(
      { error: "Failed to check stream status" },
      { status: 500 }
    );
  }
}