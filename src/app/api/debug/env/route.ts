import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    NODE_ENV: process.env.NODE_ENV,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.substring(0, 8)}...` : undefined,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    DATABASE_URL: process.env.DATABASE_URL ? 'configured' : undefined,
  });
} 