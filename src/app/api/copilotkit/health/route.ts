import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseURL = process.env.OPENAI_BASE_URL;

    return NextResponse.json({
      status: "healthy",
      copilotkit: "configured",
      environment: {
        hasApiKey: !!apiKey,
        hasBaseURL: !!baseURL,
        apiKeyMasked: apiKey ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}` : "未设置",
        baseURL: baseURL || "未设置"
      },
      actions: [
        "recommendTasks",
        "queryPlans", 
        "createGoal",
        "findPlan",
        "updateProgress"
      ],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
} 