import { requireApiAuth } from "@/lib/api-auth";
import { NextResponse } from "next/server";

export async function GET() {
  const unauthorized = await requireApiAuth();
  if (unauthorized) return unauthorized;

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseURL = process.env.OPENAI_BASE_URL;

    return NextResponse.json({
      status: "healthy",
      copilotkit: "configured",
      environment: {
        hasApiKey: !!apiKey,
        hasBaseURL: !!baseURL,
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