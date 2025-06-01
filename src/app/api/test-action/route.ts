import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { action, args } = await req.json();
    
    console.log("🧪 Testing action:", action, "with args:", args);

    switch (action) {
      case "queryPlans":
        const plans = await prisma.plan.findMany({
          include: { tags: true },
          take: 5
        });
        
        const result = plans.map(plan => ({
          ...plan,
          tags: plan.tags.map(t => t.tag)
        }));

        return NextResponse.json({
          success: true,
          action: "queryPlans",
          data: result,
          count: result.length
        });

      case "checkDatabase":
        // 简单的数据库连接测试
        const goalCount = await prisma.goal.count();
        const planCount = await prisma.plan.count();
        
        return NextResponse.json({
          success: true,
          action: "checkDatabase",
          data: {
            goals: goalCount,
            plans: planCount,
            status: "connected"
          }
        });

      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}`
        }, { status: 400 });
    }
  } catch (error) {
    console.error("❌ Test action error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
} 