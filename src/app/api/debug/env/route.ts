import { requireApiAuth } from "@/lib/api-auth";
import { NextResponse } from "next/server";

export async function GET() {
  const unauthorized = await requireApiAuth();
  if (unauthorized) return unauthorized;

  return NextResponse.json({
    NODE_ENV: process.env.NODE_ENV,
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
  });
} 