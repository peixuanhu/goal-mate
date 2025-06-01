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

      case "updateProgress":
        // 测试 updateProgress 逻辑
        const { plan_id, progress, content } = args;
        
        // 首先尝试直接查找计划
        let targetPlan = await prisma.plan.findUnique({
          where: { plan_id }
        });
        
        // 如果没找到，检查是否传入了 goal_id
        if (!targetPlan && plan_id.startsWith('goal_')) {
          console.log("⚠️ Detected goal_id instead of plan_id, searching for plans by context");
          
          const recentPlans = await prisma.plan.findMany({
            include: { tags: true },
            orderBy: { gmt_modified: 'desc' },
            take: 10
          });
          
          const algorithmPlans = recentPlans.filter(plan => 
            plan.tags.some(tag => tag.tag.includes('algorithm')) ||
            plan.name.toLowerCase().includes('leetcode')
          );
          
          if (algorithmPlans.length > 0) {
            targetPlan = algorithmPlans[0];
            console.log("🎯 Found algorithm plan:", targetPlan.name, targetPlan.plan_id);
          }
        }
        
        // 如果还是没找到，尝试根据进度描述中的关键词查找
        if (!targetPlan && content) {
          console.log("🔍 Searching plans by progress content keywords");
          
          const contentLower = content.toLowerCase();
          let searchPlans: any[] = [];
          
          if (contentLower.includes('leetcode') || contentLower.includes('每日一题') || contentLower.includes('刷题')) {
            searchPlans = await prisma.plan.findMany({
              where: {
                OR: [
                  { name: { contains: 'LeetCode', mode: 'insensitive' } },
                  { name: { contains: '每日一题', mode: 'insensitive' } },
                  { description: { contains: 'LeetCode', mode: 'insensitive' } }
                ]
              }
            });
          }
          
          if (searchPlans.length > 0) {
            targetPlan = searchPlans[0];
            console.log("🎯 Found plan by content keywords:", targetPlan?.name, targetPlan?.plan_id);
          }
        }
        
        if (!targetPlan) {
          console.error("❌ Plan not found. Provided ID:", plan_id);
          const allPlans = await prisma.plan.findMany({
            select: { plan_id: true, name: true },
            take: 5
          });
          
          return NextResponse.json({
            success: false,
            action: "updateProgress",
            error: `无法找到计划 ID: ${plan_id}`,
            suggestions: allPlans.map(p => ({ name: p.name, plan_id: p.plan_id }))
          });
        }
        
        // 更新计划进度
        const updatedPlan = await prisma.plan.update({
          where: { plan_id: targetPlan.plan_id },
          data: { progress: progress / 100 }
        });
        
        // 创建进度记录
        const record = await prisma.progressRecord.create({
          data: { 
            plan_id: targetPlan.plan_id, 
            content: content || `进度更新至 ${progress}%` 
          }
        });
        
        return NextResponse.json({
          success: true,
          action: "updateProgress",
          data: { 
            plan: updatedPlan, 
            record,
            message: `已成功更新计划"${targetPlan.name}"的进度至${progress}%`
          }
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