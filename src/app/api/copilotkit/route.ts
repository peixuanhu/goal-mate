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
          description: "进度(0-100)",
          required: true,
        },
        {
          name: "content",
          type: "string",
          description: "进度描述",
          required: false,
        }
      ],
      handler: async (args: any) => {
        console.log("📈 updateProgress called:", args);
        try {
          const { plan_id, progress, content } = args;
          
          // 首先尝试直接查找计划
          let targetPlan = await prisma.plan.findUnique({
            where: { plan_id }
          });
          
          // 如果没找到，检查是否传入了 goal_id
          if (!targetPlan && plan_id.startsWith('goal_')) {
            console.log("⚠️ Detected goal_id instead of plan_id, searching for plans by context");
            
            // 尝试通过上下文查找相关计划
            // 这里可以根据最近的对话上下文来推断用户想要的计划
            const recentPlans = await prisma.plan.findMany({
              include: { tags: true },
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
          
          console.log("✅ Progress updated successfully for plan:", targetPlan.name);
          return { 
            success: true, 
            data: { 
              plan: updatedPlan, 
              record,
              message: `已成功更新计划"${targetPlan.name}"的进度至${progress}%`
            }
          };
        } catch (error: any) {
          console.error("❌ Error:", error);
          return { 
            success: false, 
            error: `更新进度失败: ${error.message}`,
            details: error.stack
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
