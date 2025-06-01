import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseURL = process.env.OPENAI_BASE_URL;
    const databaseUrl = process.env.DATABASE_URL;

    return NextResponse.json({
      status: "success",
      environment: {
        OPENAI_API_KEY: apiKey ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}` : "未设置",
        OPENAI_BASE_URL: baseURL || "未设置",
        DATABASE_URL: databaseUrl ? "已设置" : "未设置",
      },
      checks: {
        hasApiKey: !!apiKey,
        hasBaseURL: !!baseURL,
        hasDatabase: !!databaseUrl,
        allConfigured: !!(apiKey && baseURL && databaseUrl)
      },
      nodeEnv: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
} 