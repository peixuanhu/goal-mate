import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import OpenAI from "openai";

const prisma = new PrismaClient();

// 检查环境变量并初始化
console.log("🔧 Initializing CopilotKit...");

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL;

if (!apiKey) {
  console.error("❌ OPENAI_API_KEY environment variable is missing");
}

if (!baseURL) {
  console.error("❌ OPENAI_BASE_URL environment variable is missing");
}

console.log("✅ Environment check:");
console.log("- OPENAI_API_KEY:", apiKey ? `${apiKey.substring(0, 8)}...` : "未设置");
console.log("- OPENAI_BASE_URL:", baseURL || "未设置");

// 创建自定义的 OpenAI 客户端，拦截 chat.completions.create
class CustomOpenAI extends OpenAI {
  constructor(config: any) {
    super(config);
    
    // 拦截 chat.completions.create 方法
    const originalCreate = this.chat.completions.create;
    
    this.chat.completions.create = (body: any, options?: any): any => {
      console.log("🚨 Intercepting OpenAI chat.completions.create");
      
      // 深度清理所有 developer 角色
      const cleanMessages = (messages: any[]): any[] => {
        return messages.map(message => {
          const cleaned = { ...message };
          
          if (cleaned.role === 'developer') {
            console.log("🚨 FOUND AND REPLACING DEVELOPER ROLE in OpenAI call!");
            cleaned.role = 'user';
          }
          
          // 也检查嵌套的内容
          if (cleaned.content && typeof cleaned.content === 'object') {
            if (Array.isArray(cleaned.content)) {
              cleaned.content = cleaned.content.map((item: any) => {
                if (item.role === 'developer') {
                  console.log("🚨 FOUND AND REPLACING DEVELOPER ROLE in content!");
                  return { ...item, role: 'user' };
                }
                return item;
              });
            }
          }
          
          return cleaned;
        });
      };
      
      // 清理请求体中的消息
      if (body.messages && Array.isArray(body.messages)) {
        console.log("📝 Original message roles:", body.messages.map((m: any) => m.role));
        body.messages = cleanMessages(body.messages);
        console.log("✅ Cleaned message roles:", body.messages.map((m: any) => m.role));
      }
      
      return originalCreate.call(this.chat.completions, body, options);
    };
  }
}

const customOpenAI = new CustomOpenAI({
  apiKey: apiKey,
  baseURL: baseURL,
});

// 配置阿里云百炼适配器 - 使用更标准的模型名称
const serviceAdapter = new OpenAIAdapter({
  model: "qwen-plus",
  openai: customOpenAI,
});

console.log("✅ OpenAI Adapter initialized");

// 定义系统API调用Actions
const runtime = new CopilotRuntime({
  actions: [
    // 智能任务推荐
    {
      name: "recommendTasks",
      description: "根据用户当前状态智能推荐合适的任务",
      parameters: [
        {
          name: "userState",
          type: "string",
          description: "用户描述的当前状态，如：累、活力满满、有点忙、想学习等",
          required: true,
        }
      ],
      handler: async (args: any) => {
        console.log("🎯 recommendTasks called:", args);
        try {
          const { userState } = args;
          
          // 获取所有未完成的计划
          const allPlans = await prisma.plan.findMany({
            where: {
              progress: { lt: 1 }
            },
            include: { tags: true },
            orderBy: { gmt_create: 'desc' }
          });

          if (allPlans.length === 0) {
            return { 
              success: true, 
              data: {
                message: "目前没有未完成的计划，建议先创建一些目标和计划。",
                tasks: [],
                recommendation: "可以说'帮我创建一个读书目标'来开始制定计划。"
              }
            };
          }

          // 根据用户状态智能分析和推荐
          let recommendedTasks = [];
          let analysisMessage = "";
          
          // 使用简单的关键词匹配和逻辑来分析用户状态
          const stateText = userState.toLowerCase();
          
          if (stateText.includes('累') || stateText.includes('疲劳') || stateText.includes('tired') || stateText.includes('下班')) {
            // 推荐轻松的任务
            recommendedTasks = allPlans
              .filter(plan => plan.difficulty === '低' || plan.name.includes('轻松') || plan.name.includes('简单'))
              .slice(0, 3);
            analysisMessage = "检测到你比较疲劳，为你推荐一些轻松的任务";
          } else if (stateText.includes('活力') || stateText.includes('精力') || stateText.includes('energetic') || stateText.includes('motivated')) {
            // 推荐有挑战性的任务
            recommendedTasks = allPlans
              .filter(plan => plan.difficulty === '高' || plan.difficulty === '中')
              .slice(0, 3);
            analysisMessage = "检测到你精力充沛，为你推荐一些有挑战性的任务";
          } else if (stateText.includes('学习') || stateText.includes('读书') || stateText.includes('study')) {
            // 推荐学习相关任务
            recommendedTasks = allPlans
              .filter(plan => 
                plan.tags.some(tag => tag.tag.includes('学习') || tag.tag.includes('读书') || tag.tag.includes('技能'))
              )
              .slice(0, 3);
            analysisMessage = "检测到你想学习，为你推荐学习相关的任务";
          } else if (stateText.includes('忙') || stateText.includes('时间少') || stateText.includes('busy')) {
            // 推荐快速完成的任务
            recommendedTasks = allPlans
              .filter(plan => plan.difficulty === '低')
              .slice(0, 2);
            analysisMessage = "检测到你比较忙，为你推荐一些可以快速完成的任务";
          } else {
            // 默认推荐：根据进度和优先级
            recommendedTasks = allPlans
              .sort((a, b) => a.progress - b.progress) // 优先推荐进度较低的
              .slice(0, 3);
            analysisMessage = "根据你的计划进度，为你推荐以下任务";
          }

          // 如果没有匹配的任务，回退到通用推荐
          if (recommendedTasks.length === 0) {
            recommendedTasks = allPlans.slice(0, 3);
            analysisMessage = "为你推荐一些待完成的任务";
          }

          const result = recommendedTasks.map(plan => ({
            ...plan,
            tags: plan.tags.map(t => t.tag)
          }));

          console.log("✅ Found", result.length, "recommended tasks");
          return { 
            success: true, 
            data: {
              message: analysisMessage,
              userState: userState,
              tasks: result,
              totalAvailable: allPlans.length
            }
          };
        } catch (error: any) {
          console.error("❌ Error:", error);
          return { success: false, error: error.message };
        }
      },
    },

    // 查询计划
    {
      name: "queryPlans",
      description: "查询计划列表，可以按难度筛选，如果不指定难度则返回所有计划",
      parameters: [
        {
          name: "difficulty",
          type: "string",
          description: "难度筛选（可选）",
          required: false,
        }
      ],
      handler: async (args: any) => {
        console.log("🔍 queryPlans called:", args);
        try {
          const where = args.difficulty ? { difficulty: args.difficulty } : {};
          const plans = await prisma.plan.findMany({
            where,
            include: { tags: true },
            orderBy: { gmt_create: 'desc' }
          });
          
          const result = plans.map(plan => ({
            ...plan,
            tags: plan.tags.map(t => t.tag)
          }));

          console.log("✅ Found", result.length, "plans");
          console.log("📋 Plan names:", result.map(p => p.name));
          return { success: true, data: result };
        } catch (error: any) {
          console.error("❌ Error:", error);
          return { success: false, error: error.message };
        }
      },
    },

    // 创建目标
    {
      name: "createGoal",
      description: "创建新目标",
      parameters: [
        {
          name: "name",
          type: "string",
          description: "目标名称",
          required: true,
        },
        {
          name: "tag",
          type: "string",
          description: "目标标签",
          required: true,
        },
        {
          name: "description",
          type: "string",
          description: "目标描述",
          required: false,
        }
      ],
      handler: async (args: any) => {
        console.log("➕ createGoal called:", args);
        try {
          const { name, tag, description } = args;
          const goal = await prisma.goal.create({
            data: {
              goal_id: `goal_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
              name,
              tag,
              description
            }
          });
          console.log("✅ Goal created:", goal);
          return { success: true, data: goal };
        } catch (error: any) {
          console.error("❌ Error:", error);
          return { success: false, error: error.message };
        }
      },
    },

    // 获取系统选项（标签和难度）
    {
      name: "getSystemOptions",
      description: "获取系统中已有的标签列表和标准难度选项，用于创建计划时参考",
      parameters: [],
      handler: async () => {
        console.log("📋 getSystemOptions called");
        try {
          // 获取所有已有标签
          const existingTags = await prisma.planTagAssociation.findMany({
            select: { tag: true },
            distinct: ['tag']
          });
          
          const tagList = existingTags.map(t => t.tag);
          
          // 标准难度选项
          const difficultyOptions = ['easy', 'medium', 'hard'];
          
          console.log("📋 Available tags:", tagList);
          console.log("📋 Difficulty options:", difficultyOptions);
          
          return { 
            success: true, 
            data: {
              existingTags: tagList,
              difficultyOptions: difficultyOptions,
              message: `系统信息：\n\n可用标签：${tagList.length > 0 ? tagList.join(', ') : '暂无标签'}\n\n标准难度选项：${difficultyOptions.join(', ')}\n\n创建计划时请优先使用已有标签，难度必须使用标准选项。`
            }
          };
        } catch (error: any) {
          console.error("❌ Error:", error);
          return { success: false, error: error.message };
        }
      },
    },

    // 创建计划
    {
      name: "createPlan",
      description: "创建新计划，用于具体的任务执行",
      parameters: [
        {
          name: "name",
          type: "string",
          description: "计划名称",
          required: true,
        },
        {
          name: "description",
          type: "string",
          description: "计划描述（可包含链接等信息）",
          required: false,
        },
        {
          name: "difficulty",
          type: "string",
          description: "难度等级，必须使用以下标准值之一：easy、medium、hard。如果用户说中文（如简单、中等、困难），请转换为对应的英文标准值",
          required: true,
        },
        {
          name: "tags",
          type: "string",
          description: "标签，多个标签用逗号分隔。请优先使用已有标签，避免创建重复标签",
          required: true,
        }
      ],
      handler: async (args: any) => {
        console.log("📋 createPlan called:", args);
        try {
          const { name, description, difficulty, tags } = args;
          
          // 查询已有标签，提供给AI参考（但实际上AI在调用时已经看到了描述）
          const existingTags = await prisma.planTagAssociation.findMany({
            select: { tag: true },
            distinct: ['tag']
          });
          
          const existingTagList = existingTags.map(t => t.tag);
          console.log("📋 Existing tags in database:", existingTagList);
          
          // 验证难度值是否为标准值
          const validDifficulties = ['easy', 'medium', 'hard'];
          if (!validDifficulties.includes(difficulty)) {
            console.warn(`⚠️ Non-standard difficulty value: ${difficulty}, using 'medium' as default`);
            // 这里可以返回错误让AI重新选择，或者使用默认值
            return { 
              success: false, 
              error: `难度值必须是以下之一：${validDifficulties.join('、')}。您提供的值是：${difficulty}`,
              validOptions: validDifficulties
            };
          }
          
          // 处理标签
          const tagList = tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag);
          console.log("📋 User provided tags:", tagList);
          console.log("📋 Available existing tags:", existingTagList);
          
          // 生成唯一的plan_id
          const plan_id = `plan_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
          
          // 创建计划
          const plan = await prisma.plan.create({
            data: {
              plan_id,
              name,
              description: description || '',
              difficulty: difficulty,
              progress: 0,
            }
          });

          // 创建标签关联
          for (const tag of tagList) {
            await prisma.planTagAssociation.create({
              data: {
                plan_id: plan.plan_id,
                tag
              }
            });
          }

          // 返回创建的计划信息（包含标签）
          const createdPlan = await prisma.plan.findUnique({
            where: { plan_id },
            include: { tags: true }
          });

          const result = {
            ...createdPlan,
            tags: createdPlan?.tags.map(t => t.tag) || []
          };

          console.log("✅ Plan created:", result);
          return { 
            success: true, 
            data: result,
            message: `计划已成功创建。\n\nID: ${plan.id}\n创建时间: ${plan.gmt_create}\n修改时间: ${plan.gmt_modified}\n计划ID: ${plan.plan_id}\n标签: ${tagList.join(', ')}\n名称: ${name}\n描述: ${description || '无'}\n难度: ${difficulty}\n\n请记得按时完成这个计划！`
          };
        } catch (error: any) {
          console.error("❌ Error:", error);
          return { success: false, error: error.message };
        }
      },
    },

    // 查找计划 - 增强版本
    {
      name: "findPlan",
      description: "根据名称查找计划，支持模糊搜索，也可以通过标签查找（如exercise、学习等）",
      parameters: [
        {
          name: "planName",
          type: "string",
          description: "计划名称、关键词或标签（如：锻炼、exercise、学习、读书等）",
          required: true,
        }
      ],
      handler: async (args: any) => {
        console.log("🔍 findPlan called:", args);
        try {
          const { planName } = args;
          
          // 先尝试精确搜索
          let plans = await prisma.plan.findMany({
            where: {
              OR: [
                { name: { contains: planName, mode: 'insensitive' } },
                { description: { contains: planName, mode: 'insensitive' } }
              ]
            },
            include: { tags: true }
          });

          // 如果没找到，尝试通过标签搜索
          if (plans.length === 0) {
            console.log("🔍 Trying tag search for:", planName);
            
            // 尝试标签搜索
            const tagSearchResults = await prisma.plan.findMany({
              where: {
                tags: {
                  some: {
                    tag: {
                      contains: planName,
                      mode: 'insensitive'
                    }
                  }
                }
              },
              include: { tags: true }
            });
            
            plans = plans.concat(tagSearchResults);
          }

          // 如果还是没找到，尝试拆分关键词搜索
          if (plans.length === 0) {
            const keywords = planName.split(/[\s《》【】()（）]/);
            console.log("🔍 Trying keyword search with:", keywords);
            
            for (const keyword of keywords) {
              if (keyword.trim()) {
                // 名称和描述搜索
                const keywordPlans = await prisma.plan.findMany({
                  where: {
                    OR: [
                      { name: { contains: keyword.trim(), mode: 'insensitive' } },
                      { description: { contains: keyword.trim(), mode: 'insensitive' } }
                    ]
                  },
                  include: { tags: true }
                });
                
                // 标签搜索
                const tagPlans = await prisma.plan.findMany({
                  where: {
                    tags: {
                      some: {
                        tag: {
                          contains: keyword.trim(),
                          mode: 'insensitive'
                        }
                      }
                    }
                  },
                  include: { tags: true }
                });
                
                plans = plans.concat(keywordPlans, tagPlans);
              }
            }
            
            // 去重
            plans = plans.filter((plan, index, self) => 
              index === self.findIndex(p => p.plan_id === plan.plan_id)
            );
          }

          const result = plans.map(plan => ({
            ...plan,
            tags: plan.tags.map(t => t.tag)
          }));

          console.log("✅ Found", result.length, "plans");
          console.log("📋 Found plan names:", result.map(p => p.name));
          console.log("📋 Found plan tags:", result.map(p => p.tags));
          return { success: true, data: result };
        } catch (error: any) {
          console.error("❌ Error:", error);
          return { success: false, error: error.message };
        }
      },
    },

    // 更新进度
    {
      name: "updateProgress",
      description: "更新计划进度",
      parameters: [
        {
          name: "plan_id",
          type: "string",
          description: "计划ID",
          required: true,
        },
        {
          name: "progress",
          type: "number",
          description: "进度(0-100，仅用于普通任务)",
          required: false,
        },
        {
          name: "content",
          type: "string",
          description: "进度描述",
          required: false,
        },
        {
          name: "custom_time",
          type: "string",
          description: "自定义时间（ISO格式，如'2025-01-06T22:00'），可选",
          required: false,
        }
      ],
      handler: async (args: any) => {
        console.log("📈 updateProgress called:", args);
        try {
          const { plan_id, progress, content, custom_time } = args;
          
          // 首先尝试直接查找计划
          let targetPlan = await prisma.plan.findUnique({
            where: { plan_id },
            include: {
              progressRecords: true
            }
          });
          
          // 如果没找到，检查是否传入了 goal_id
          if (!targetPlan && plan_id.startsWith('goal_')) {
            console.log("⚠️ Detected goal_id instead of plan_id, searching for plans by context");
            
            // 尝试通过上下文查找相关计划
            const recentPlans = await prisma.plan.findMany({
              include: { tags: true, progressRecords: true },
              orderBy: { gmt_modified: 'desc' },
              take: 10
            });
            
            // 由于我们知道用户想要更新 LeetCode 相关的计划，先查找算法相关的
            const algorithmPlans = recentPlans.filter(plan => 
              plan.tags.some(tag => tag.tag.includes('algorithm')) ||
              plan.name.toLowerCase().includes('leetcode')
            );
            
            if (algorithmPlans.length > 0) {
              targetPlan = algorithmPlans[0]; // 选择最近的算法计划
              console.log("🎯 Found algorithm plan:", targetPlan.name, targetPlan.plan_id);
            }
          }
          
          // 如果还是没找到，尝试根据进度描述中的关键词查找
          if (!targetPlan && content) {
            console.log("🔍 Searching plans by progress content keywords:", content);
            
            const contentLower = content.toLowerCase();
            let searchPlans: any[] = [];
            
            // LeetCode相关的精确匹配
            if (contentLower.includes('leetcode')) {
              const leetcodePlans = await prisma.plan.findMany({
                where: {
                  OR: [
                    { name: { contains: 'LeetCode', mode: 'insensitive' } },
                    { description: { contains: 'LeetCode', mode: 'insensitive' } }
                  ]
                },
                include: { progressRecords: true }
              });
              
              console.log("📋 Found LeetCode plans:", leetcodePlans.map(p => p.name));
              
              // 优先匹配"每日"相关的计划
              if (contentLower.includes('每日') || contentLower.includes('日常') || contentLower.includes('daily')) {
                targetPlan = leetcodePlans.find(p => 
                  p.name.toLowerCase().includes('每日') || 
                  p.name.toLowerCase().includes('日常') ||
                  p.name.toLowerCase().includes('daily')
                ) || null;
                console.log("�� Matched daily plan:", targetPlan?.name);
              }
              
              // 如果没找到每日的，再找周赛相关
              if (!targetPlan && (contentLower.includes('周赛') || contentLower.includes('contest'))) {
                targetPlan = leetcodePlans.find(p => 
                  p.name.toLowerCase().includes('周赛') || 
                  p.name.toLowerCase().includes('contest')
                ) || null;
                console.log("🎯 Matched contest plan:", targetPlan?.name);
              }
              
              // 如果都没找到，选择第一个LeetCode计划
              if (!targetPlan && leetcodePlans.length > 0) {
                targetPlan = leetcodePlans[0];
                console.log("🎯 Fallback to first LeetCode plan:", targetPlan?.name);
              }
            }
            
            // 拳击/健身相关
            else if (contentLower.includes('拳击') || contentLower.includes('健身') || contentLower.includes('锻炼') || contentLower.includes('运动')) {
              const exercisePlans = await prisma.plan.findMany({
                where: {
                  OR: [
                    { name: { contains: '拳击', mode: 'insensitive' } },
                    { name: { contains: '健身', mode: 'insensitive' } },
                    { name: { contains: '锻炼', mode: 'insensitive' } },
                    { name: { contains: '运动', mode: 'insensitive' } },
                    { description: { contains: '拳击', mode: 'insensitive' } },
                    { description: { contains: '健身', mode: 'insensitive' } }
                  ]
                },
                include: { progressRecords: true }
              });
              
              console.log("🏃 Found exercise plans:", exercisePlans.map(p => p.name));
              
              // 根据具体关键词匹配
              if (contentLower.includes('拳击')) {
                targetPlan = exercisePlans.find(p => p.name.toLowerCase().includes('拳击')) || null;
              }
              
              if (!targetPlan && exercisePlans.length > 0) {
                targetPlan = exercisePlans[0];
              }
            }
            
            // 算法/刷题相关（但不包含LeetCode）
            else if (contentLower.includes('算法') || contentLower.includes('刷题')) {
              const algorithmPlans = await prisma.plan.findMany({
                where: {
                  OR: [
                    { name: { contains: '算法', mode: 'insensitive' } },
                    { name: { contains: '刷题', mode: 'insensitive' } }
                  ]
                },
                include: { progressRecords: true }
              });
              
              console.log("🧮 Found algorithm plans:", algorithmPlans.map(p => p.name));
              
              if (algorithmPlans.length > 0) {
                targetPlan = algorithmPlans[0];
              }
            }
            
            if (targetPlan) {
              console.log("🎯 Found plan by content keywords:", targetPlan.name, targetPlan.plan_id);
            }
          }
          
          // 如果仍然没找到计划，返回详细错误信息
          if (!targetPlan) {
            console.error("❌ Plan not found. Provided ID:", plan_id);
            console.log("🔍 Available plans:");
            const allPlans = await prisma.plan.findMany({
              select: { plan_id: true, name: true },
              take: 5
            });
            allPlans.forEach(p => console.log(`  - ${p.name} (${p.plan_id})`));
            
            return { 
              success: false, 
              error: `无法找到计划 ID: ${plan_id}。请确认计划是否存在，或者重新搜索计划。`,
              suggestions: allPlans.map(p => ({ name: p.name, plan_id: p.plan_id }))
            };
          }

          // 创建进度记录
          const createData: {
            plan_id: string;
            content: string;
            thinking?: string;
            gmt_create?: Date;
          } = {
            plan_id: targetPlan.plan_id,
            content: content || '进展记录',
            thinking: ''
          };
          
          // 如果提供了自定义时间，使用该时间
          if (custom_time) {
            createData.gmt_create = new Date(custom_time);
          }
          
          const record = await prisma.progressRecord.create({
            data: createData
          });

          // 根据任务类型决定如何处理
          if (targetPlan.is_recurring) {
            // 周期性任务：不更新progress字段，基于进展记录判断完成状态
            console.log("📅 Processing recurring task:", targetPlan.name);
            
            // 重新获取最新的进展记录以计算状态
            const updatedPlan = await prisma.plan.findUnique({
              where: { plan_id: targetPlan.plan_id },
              include: { progressRecords: true }
            });

            // 计算当前周期内的完成次数
            const { isRecurringTaskCompleted } = require('@/lib/recurring-utils');
            const isCompleted = isRecurringTaskCompleted(updatedPlan);
            
            // 计算当前周期内的记录次数
            const { getCurrentPeriodStart, getCurrentPeriodEnd, RecurrenceType } = require('@/lib/recurring-utils');
            const recurrenceType = targetPlan.recurrence_type as any;
            const periodStart = getCurrentPeriodStart(recurrenceType);
            const periodEnd = getCurrentPeriodEnd(recurrenceType);
            
            const currentPeriodRecords = updatedPlan?.progressRecords.filter(r => {
              const recordDate = new Date(r.gmt_create);
              return recordDate >= periodStart && recordDate <= periodEnd;
            }).length || 0;

            const targetCount = parseInt(targetPlan.recurrence_value || '1');
            
            console.log("✅ Recurring task record added:", {
              plan: targetPlan.name,
              currentRecords: currentPeriodRecords,
              targetCount: targetCount,
              isCompleted: isCompleted
            });

            return {
              success: true,
              data: {
                plan: updatedPlan,
                record,
                message: `已成功记录"${targetPlan.name}"的进展。当前周期进度：${currentPeriodRecords}/${targetCount} ${isCompleted ? '✅ 已完成' : ''}`
              }
            };
          } else {
            // 普通任务：更新progress字段
            if (progress !== undefined) {
              const updatedPlan = await prisma.plan.update({
                where: { plan_id: targetPlan.plan_id },
                data: { progress: progress / 100 }
              });
              
              console.log("✅ Progress updated successfully for regular plan:", targetPlan.name);
              return {
                success: true,
                data: {
                  plan: updatedPlan,
                  record,
                  message: `已成功更新计划"${targetPlan.name}"的进度至${progress}%`
                }
              };
            } else {
              console.log("✅ Progress record added for regular plan:", targetPlan.name);
              return {
                success: true,
                data: {
                  plan: targetPlan,
                  record,
                  message: `已成功添加计划"${targetPlan.name}"的进展记录`
                }
              };
            }
          }
        } catch (error: any) {
          console.error("❌ Error:", error);
          return { 
            success: false, 
            error: `更新进度失败: ${error.message}`,
            details: error.stack
          };
        }
      },
    },

    // 添加进展记录（支持自定义时间）
    {
      name: "addProgressRecord",
      description: "添加进展记录，支持自定义时间，主要用于记录过去时间的进展",
      parameters: [
        {
          name: "plan_name",
          type: "string",
          description: "计划名称或关键词",
          required: true,
        },
        {
          name: "content",
          type: "string",
          description: "进展内容",
          required: true,
        },
        {
          name: "record_time",
          type: "string",
          description: "记录时间（如'昨天晚上10点'、'昨晚10点'、'今天下午2点'等自然语言时间）",
          required: true,
        }
      ],
      handler: async (args: any) => {
        console.log("📝 addProgressRecord called:", args);
        try {
          const { plan_name, content, record_time } = args;
          
          // 搜索计划 - 改进匹配逻辑
          let targetPlan = null;
          const planNameLower = plan_name.toLowerCase();
          
          console.log("🔍 Searching for plan with keywords:", planNameLower);
          
          // 精确匹配：LeetCode相关
          if (planNameLower.includes('leetcode')) {
            const algorithmPlans = await prisma.plan.findMany({
              where: {
                OR: [
                  { name: { contains: 'LeetCode', mode: 'insensitive' } },
                  { description: { contains: 'LeetCode', mode: 'insensitive' } }
                ]
              },
              include: { progressRecords: true }
            });
            
            console.log("📋 Found LeetCode plans:", algorithmPlans.map(p => p.name));
            
            // 优先匹配"每日"相关的计划
            if (planNameLower.includes('每日') || planNameLower.includes('日常') || planNameLower.includes('daily')) {
              targetPlan = algorithmPlans.find(p => 
                p.name.toLowerCase().includes('每日') || 
                p.name.toLowerCase().includes('日常') ||
                p.name.toLowerCase().includes('daily')
              );
            }
            
            // 如果没找到每日的，再找周赛相关
            if (!targetPlan && (planNameLower.includes('周赛') || planNameLower.includes('contest'))) {
              targetPlan = algorithmPlans.find(p => 
                p.name.toLowerCase().includes('周赛') || 
                p.name.toLowerCase().includes('contest')
              );
            }
            
            // 如果都没找到，选择第一个LeetCode计划
            if (!targetPlan && algorithmPlans.length > 0) {
              targetPlan = algorithmPlans[0];
            }
          }
          
          // 拳击/健身相关
          else if (planNameLower.includes('拳击') || planNameLower.includes('健身') || planNameLower.includes('锻炼') || planNameLower.includes('运动')) {
            const exercisePlans = await prisma.plan.findMany({
              where: {
                OR: [
                  { name: { contains: '拳击', mode: 'insensitive' } },
                  { name: { contains: '健身', mode: 'insensitive' } },
                  { name: { contains: '锻炼', mode: 'insensitive' } },
                  { name: { contains: '运动', mode: 'insensitive' } },
                  { description: { contains: '拳击', mode: 'insensitive' } },
                  { description: { contains: '健身', mode: 'insensitive' } }
                ]
              },
              include: { progressRecords: true }
            });
            
            console.log("🏃 Found exercise plans:", exercisePlans.map(p => p.name));
            
            // 根据具体关键词匹配
            if (planNameLower.includes('拳击')) {
              targetPlan = exercisePlans.find(p => p.name.toLowerCase().includes('拳击'));
            }
            
            if (!targetPlan && exercisePlans.length > 0) {
              targetPlan = exercisePlans[0];
            }
          }
          
          // 算法/刷题相关（但不包含LeetCode）
          else if (planNameLower.includes('算法') || planNameLower.includes('刷题')) {
            const algorithmPlans = await prisma.plan.findMany({
              where: {
                OR: [
                  { name: { contains: '算法', mode: 'insensitive' } },
                  { name: { contains: '刷题', mode: 'insensitive' } }
                ]
              },
              include: { progressRecords: true }
            });
            
            console.log("🧮 Found algorithm plans:", algorithmPlans.map(p => p.name));
            
            if (algorithmPlans.length > 0) {
              targetPlan = algorithmPlans[0];
            }
          }
          
          // 如果还没找到，尝试直接按名称模糊搜索
          if (!targetPlan) {
            console.log("🔍 Trying fuzzy search for:", plan_name);
            
            const searchPlans = await prisma.plan.findMany({
              where: {
                OR: [
                  { name: { contains: plan_name, mode: 'insensitive' } },
                  { description: { contains: plan_name, mode: 'insensitive' } }
                ]
              },
              include: { progressRecords: true }
            });
            
            console.log("📋 Fuzzy search results:", searchPlans.map(p => p.name));
            
            if (searchPlans.length > 0) {
              // 优先选择名称更匹配的计划
              targetPlan = searchPlans.find(p => 
                p.name.toLowerCase().includes(planNameLower)
              ) || searchPlans[0];
            }
          }
          
          if (!targetPlan) {
            console.log("❌ No plan found for:", plan_name);
            return {
              success: false,
              error: `无法找到名称包含"${plan_name}"的计划。请检查计划名称是否正确，或者创建新的计划。`
            };
          }

          console.log("✅ Selected plan:", targetPlan.name);
          
          // 解析时间
          const parseRecordTime = (timeStr: string): Date => {
            const now = new Date();
            const timeLower = timeStr.toLowerCase();
            
            // 昨天相关
            if (timeLower.includes('昨天') || timeLower.includes('昨晚')) {
              const yesterday = new Date(now);
              yesterday.setDate(yesterday.getDate() - 1);
              
              if (timeLower.includes('10点') || timeLower.includes('10:00')) {
                yesterday.setHours(22, 0, 0, 0); // 晚上10点
              } else if (timeLower.includes('9点') || timeLower.includes('9:00')) {
                yesterday.setHours(21, 0, 0, 0);
              } else if (timeLower.includes('8点') || timeLower.includes('8:00')) {
                yesterday.setHours(20, 0, 0, 0);
              } else {
                yesterday.setHours(20, 0, 0, 0); // 默认晚上8点
              }
              return yesterday;
            }
            
            // 今天相关
            if (timeLower.includes('今天') || timeLower.includes('今晚')) {
              const today = new Date(now);
              
              if (timeLower.includes('10点') || timeLower.includes('10:00')) {
                if (timeLower.includes('下午') || timeLower.includes('晚上')) {
                  today.setHours(22, 0, 0, 0);
                } else {
                  today.setHours(10, 0, 0, 0);
                }
              } else if (timeLower.includes('2点') || timeLower.includes('2:00')) {
                if (timeLower.includes('下午')) {
                  today.setHours(14, 0, 0, 0);
                } else {
                  today.setHours(2, 0, 0, 0);
                }
              } else {
                today.setHours(now.getHours(), now.getMinutes(), 0, 0);
              }
              return today;
            }
            
            // 如果无法解析，返回1小时前
            const oneHourAgo = new Date(now);
            oneHourAgo.setHours(oneHourAgo.getHours() - 1);
            return oneHourAgo;
          };
          
          const recordDate = parseRecordTime(record_time);
          
          // 创建进展记录
          const record = await prisma.progressRecord.create({
            data: {
              plan_id: targetPlan.plan_id,
              content: content,
              thinking: '',
              gmt_create: recordDate
            }
          });

          // 根据任务类型返回不同的响应
          if (targetPlan.is_recurring) {
            // 重新获取最新数据以计算状态
            const updatedPlan = await prisma.plan.findUnique({
              where: { plan_id: targetPlan.plan_id },
              include: { progressRecords: true }
            });

            const { getCurrentPeriodCount, getTargetCount, isRecurringTaskCompleted } = require('@/lib/recurring-utils');
            const currentCount = getCurrentPeriodCount(updatedPlan);
            const targetCount = getTargetCount(updatedPlan);
            const isCompleted = isRecurringTaskCompleted(updatedPlan);
            
            return {
              success: true,
              data: {
                plan: updatedPlan,
                record,
                message: `已成功记录"${targetPlan.name}"在${record_time}的进展。当前周期进度：${currentCount}/${targetCount} ${isCompleted ? '✅ 已完成' : ''}`
              }
            };
          } else {
            return {
              success: true,
              data: {
                plan: targetPlan,
                record,
                message: `已成功记录"${targetPlan.name}"在${record_time}的进展`
              }
            };
          }
        } catch (error: any) {
          console.error("❌ Error:", error);
          return {
            success: false,
            error: `添加进展记录失败: ${error.message}`
          };
        }
      },
    }
  ],
});

console.log("✅ CopilotRuntime initialized with", runtime.actions.length, "actions");

export const POST = async (req: NextRequest) => {
  console.log("🚀 CopilotKit API called");
  
  try {
    // 处理请求体，过滤不支持的角色
    let body;
    try {
      body = await req.json();
      console.log("📨 Original request body keys:", Object.keys(body));
      
      // 添加详细日志来查看实际结构
      if (body.variables) {
        console.log("🔍 Variables keys:", Object.keys(body.variables));
        if (body.variables.messages) {
          console.log("📝 Message count:", body.variables.messages.length);
          console.log("📝 First few messages:", JSON.stringify(body.variables.messages.slice(0, 2), null, 2));
        }
      }
      
    } catch (jsonError) {
      console.error("❌ Failed to parse JSON:", jsonError);
      return new Response("Invalid JSON", { status: 400 });
    }
    
    // 定义支持的角色
    const supportedRoles = ['system', 'assistant', 'user', 'tool', 'function'];
    
    // 消息过滤函数 - 简化但更全面的版本
    const filterMessage = (message: any): any | null => {
      if (!message || typeof message !== 'object') {
        return null;
      }
      
      // 递归处理所有可能包含 role 的字段
      const processRoles = (obj: any): any => {
        if (typeof obj !== 'object' || obj === null) {
          return obj;
        }
        
        if (Array.isArray(obj)) {
          return obj.map(processRoles);
        }
        
        const result = { ...obj };
        
        // 处理 role 字段
        if (result.role && !supportedRoles.includes(result.role)) {
          console.log(`⚠️ Converting role "${result.role}" to "user"`);
          result.role = 'user';
        }
        
        // 递归处理所有对象属性
        for (const key in result) {
          if (typeof result[key] === 'object' && result[key] !== null) {
            result[key] = processRoles(result[key]);
          }
        }
        
        return result;
      };
      
      return processRoles(message);
    };
    
    // 处理GraphQL格式的消息过滤
    if (body.variables && body.variables.messages && Array.isArray(body.variables.messages)) {
      console.log("📝 Processing", body.variables.messages.length, "messages");
      body.variables.messages = body.variables.messages
        .map(filterMessage)
        .filter((message: any) => message !== null);
    }
    
    // 也处理直接的messages字段（兼容性）
    if (body.messages && Array.isArray(body.messages)) {
      console.log("📝 Processing direct messages");
      body.messages = body.messages
        .map(filterMessage)
        .filter((message: any) => message !== null);
    }
    
    // 创建新的请求对象
    const filteredReq = new NextRequest(req.url, {
      method: req.method,
      headers: req.headers,
      body: JSON.stringify(body)
    });

    console.log("✅ Handling filtered request...");
    
    // 全局 fetch 拦截器 - 拦截所有请求
    const originalFetch = global.fetch;
    global.fetch = async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      
      // 记录所有 fetch 请求
      console.log("🌐 Intercepting fetch request to:", url);
      
      if (init?.body) {
        try {
          const requestBody = JSON.parse(init.body);
          
          // 检查是否包含消息
          if (requestBody.messages || requestBody.data?.messages || requestBody.input?.messages) {
            console.log("📨 Found messages in fetch request!");
            console.log("🔍 Request URL:", url);
            console.log("🔍 Request body keys:", Object.keys(requestBody));
            
            // 递归查找和替换所有 developer 角色
            const replaceDevRoles = (obj: any): any => {
              if (typeof obj !== 'object' || obj === null) {
                return obj;
              }
              
              if (Array.isArray(obj)) {
                return obj.map(replaceDevRoles);
              }
              
              const result = { ...obj };
              
              if (result.role === 'developer') {
                console.log("🚨 FOUND AND REPLACING DEVELOPER ROLE!");
                result.role = 'user';
              }
              
              for (const key in result) {
                if (typeof result[key] === 'object' && result[key] !== null) {
                  result[key] = replaceDevRoles(result[key]);
                }
              }
              
              return result;
            };
            
            const cleanedBody = replaceDevRoles(requestBody);
            init.body = JSON.stringify(cleanedBody);
            
            console.log("✅ Cleaned request body");
          }
        } catch (e) {
          // 如果不是 JSON，尝试文本处理
          if (typeof init.body === 'string' && init.body.includes('developer')) {
            console.log("🚨 Found 'developer' in text body!");
            init.body = init.body.replace(/"role":"developer"/g, '"role":"user"');
            init.body = init.body.replace(/'role':'developer'/g, "'role':'user'");
          }
        }
      }
      
      return originalFetch(input, init);
    };

    try {
      const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
        runtime,
        serviceAdapter,
        endpoint: "/api/copilotkit",
      });

      const response = await handleRequest(filteredReq);
      console.log("✅ Request handled successfully");
      return response;
    } finally {
      // 恢复原始的 fetch
      global.fetch = originalFetch;
    }
  } catch (error) {
    console.error("❌ Error in CopilotKit API:", error);
    console.error("❌ Error stack:", error instanceof Error ? error.stack : "No stack trace");
    return new Response(
      JSON.stringify({ 
        error: "服务器错误", 
        details: error instanceof Error ? error.message : "未知错误" 
      }),
      { 
        status: 500, 
        headers: { "Content-Type": "application/json" } 
      }
    );
  }
};
