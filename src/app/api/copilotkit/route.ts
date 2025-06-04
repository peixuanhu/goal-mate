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
          description: "用户描述的当前状态",
          required: true,
        },
        {
          name: "filterCriteria",
          type: "string",
          description: "筛选条件，如难度、标签等（可选）",
          required: false,
        }
      ],
      handler: async (args: any) => {
        console.log("🎯 recommendTasks called:", args);
        try {
          const { userState, filterCriteria } = args;
          
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
                recommendation: "可以创建新的目标和计划来开始。"
              }
            };
          }

          // 应用基本筛选（如果提供了筛选条件）
          let filteredPlans = allPlans;
          if (filterCriteria) {
            // 简单的筛选逻辑，可以根据难度或标签筛选
            filteredPlans = allPlans.filter(plan => 
              (plan.difficulty && plan.difficulty.includes(filterCriteria)) ||
              plan.tags.some(tag => tag.tag.includes(filterCriteria))
            );
          }

          // 默认推荐逻辑：根据进度和创建时间
          const recommendedTasks = filteredPlans
            .sort((a, b) => a.progress - b.progress)
            .slice(0, 5);

          const result = recommendedTasks.map(plan => ({
            ...plan,
            tags: plan.tags.map(t => t.tag)
          }));

          console.log("✅ Found", result.length, "recommended tasks");
          return { 
            success: true, 
            data: {
              message: `基于当前状态"${userState}"为您推荐以下任务`,
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
      description: "查询计划列表，支持多种筛选条件",
      parameters: [
        {
          name: "difficulty",
          type: "string",
          description: "难度筛选（可选）",
          required: false,
        },
        {
          name: "tag",
          type: "string",
          description: "标签筛选（可选）",
          required: false,
        },
        {
          name: "keyword",
          type: "string",
          description: "关键词搜索（可选）",
          required: false,
        }
      ],
      handler: async (args: any) => {
        console.log("🔍 queryPlans called:", args);
        try {
          const { difficulty, tag, keyword } = args;
          
          let where: any = {};
          
          if (difficulty) {
            where.difficulty = difficulty;
          }
          
          if (keyword) {
            where.OR = [
              { name: { contains: keyword, mode: 'insensitive' } },
              { description: { contains: keyword, mode: 'insensitive' } }
            ];
          }
          
          let plans = await prisma.plan.findMany({
            where,
            include: { tags: true },
            orderBy: { gmt_create: 'desc' }
          });
          
          // 如果指定了标签，进一步筛选
          if (tag) {
            plans = plans.filter(plan => 
              plan.tags.some(t => t.tag.includes(tag))
            );
          }
          
          const result = plans.map(plan => ({
            ...plan,
            tags: plan.tags.map(t => t.tag)
          }));

          console.log("✅ Found", result.length, "plans");
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
          description: "难度等级，必须使用以下标准值之一：easy、medium、hard",
          required: true,
        },
        {
          name: "tags",
          type: "string",
          description: "标签，多个标签用逗号分隔",
          required: true,
        }
      ],
      handler: async (args: any) => {
        console.log("📋 createPlan called:", args);
        try {
          const { name, description, difficulty, tags } = args;
          
          // 验证难度值是否为标准值
          const validDifficulties = ['easy', 'medium', 'hard'];
          if (!validDifficulties.includes(difficulty)) {
            return { 
              success: false, 
              error: `难度值必须是以下之一：${validDifficulties.join('、')}。您提供的值是：${difficulty}`,
              validOptions: validDifficulties
            };
          }
          
          // 处理标签
          const tagList = tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag);
          
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

    // 查找计划 - 简化版本
    {
      name: "findPlan",
      description: "根据名称、关键词或标签查找计划，支持模糊搜索",
      parameters: [
        {
          name: "searchTerm",
          type: "string",
          description: "搜索词，可以是计划名称、关键词或标签",
          required: true,
        }
      ],
      handler: async (args: any) => {
        console.log("🔍 findPlan called:", args);
        try {
          const { searchTerm } = args;
          
          // 综合搜索：名称、描述、标签
          const plans = await prisma.plan.findMany({
            where: {
              OR: [
                { name: { contains: searchTerm, mode: 'insensitive' } },
                { description: { contains: searchTerm, mode: 'insensitive' } },
                {
                  tags: {
                    some: {
                      tag: {
                        contains: searchTerm,
                        mode: 'insensitive'
                      }
                    }
                  }
                }
              ]
            },
            include: { tags: true }
          });

          const result = plans.map(plan => ({
            ...plan,
            tags: plan.tags.map(t => t.tag)
          }));

          console.log("✅ Found", result.length, "plans");
          return { success: true, data: result };
        } catch (error: any) {
          console.error("❌ Error:", error);
          return { success: false, error: error.message };
        }
      },
    },

    // 更新进度 - 简化版本
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
          description: "自定义时间（ISO格式或自然语言描述，如'昨天晚上11点59分'）",
          required: false,
        }
      ],
      handler: async (args: any) => {
        console.log("📈 updateProgress called:", args);
        
        // 自然语言时间解析函数
        function parseNaturalTime(timeStr: string): Date {
          const now = new Date();
          const timeLower = timeStr.toLowerCase().trim();
          
          // 处理"昨天"相关的时间
          if (timeLower.includes('昨天') || timeLower.includes('昨晚')) {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            
            // 提取时间信息
            const timeMatch = timeLower.match(/(\d{1,2})[点:](\d{1,2})?/);
            if (timeMatch) {
              const hour = parseInt(timeMatch[1]);
              const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
              
              // 判断是否为晚上时间
              if (hour <= 12 && (timeLower.includes('晚') || timeLower.includes('夜'))) {
                yesterday.setHours(hour + 12, minute, 0, 0);
              } else {
                yesterday.setHours(hour, minute, 0, 0);
              }
            } else {
              // 如果没有具体时间，默认设为晚上8点
              yesterday.setHours(20, 0, 0, 0);
            }
            return yesterday;
          }
          
          // 处理"今天"相关的时间
          if (timeLower.includes('今天') || timeLower.includes('今晚')) {
            const today = new Date(now);
            
            const timeMatch = timeLower.match(/(\d{1,2})[点:](\d{1,2})?/);
            if (timeMatch) {
              const hour = parseInt(timeMatch[1]);
              const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
              
              if (hour <= 12 && (timeLower.includes('下午') || timeLower.includes('晚') || timeLower.includes('夜'))) {
                today.setHours(hour + 12, minute, 0, 0);
              } else {
                today.setHours(hour, minute, 0, 0);
              }
            } else {
              today.setHours(now.getHours(), now.getMinutes(), 0, 0);
            }
            return today;
          }
          
          // 处理"前天"相关的时间
          if (timeLower.includes('前天')) {
            const dayBeforeYesterday = new Date(now);
            dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
            
            const timeMatch = timeLower.match(/(\d{1,2})[点:](\d{1,2})?/);
            if (timeMatch) {
              const hour = parseInt(timeMatch[1]);
              const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
              
              if (hour <= 12 && (timeLower.includes('晚') || timeLower.includes('夜'))) {
                dayBeforeYesterday.setHours(hour + 12, minute, 0, 0);
              } else {
                dayBeforeYesterday.setHours(hour, minute, 0, 0);
              }
            } else {
              dayBeforeYesterday.setHours(20, 0, 0, 0);
            }
            return dayBeforeYesterday;
          }
          
          // 处理具体的小时前
          const hoursAgoMatch = timeLower.match(/(\d+)小时前/);
          if (hoursAgoMatch) {
            const hoursAgo = parseInt(hoursAgoMatch[1]);
            const hoursAgoDate = new Date(now);
            hoursAgoDate.setHours(hoursAgoDate.getHours() - hoursAgo);
            return hoursAgoDate;
          }
          
          // 处理具体的分钟前
          const minutesAgoMatch = timeLower.match(/(\d+)分钟前/);
          if (minutesAgoMatch) {
            const minutesAgo = parseInt(minutesAgoMatch[1]);
            const minutesAgoDate = new Date(now);
            minutesAgoDate.setMinutes(minutesAgoDate.getMinutes() - minutesAgo);
            return minutesAgoDate;
          }
          
          // 如果都无法解析，返回当前时间
          return now;
        }
        
        try {
          const { plan_id, progress, content, custom_time } = args;
          
          // 查找计划
          const targetPlan = await prisma.plan.findUnique({
            where: { plan_id },
            include: {
              progressRecords: true
            }
          });
          
          if (!targetPlan) {
            // 尝试通过名称查找
            const plans = await prisma.plan.findMany({
              where: {
                OR: [
                  { name: { contains: plan_id, mode: 'insensitive' } },
                  { description: { contains: plan_id, mode: 'insensitive' } }
                ]
              },
              include: { progressRecords: true }
            });
            
            if (plans.length === 0) {
              return { 
                success: false, 
                error: `无法找到计划 ID: ${plan_id}。请确认计划是否存在。`
              };
            }
            
            // 使用第一个匹配的计划
            const plan = plans[0];
            
            // 创建进度记录
            const createData: {
              plan_id: string;
              content: string;
              thinking?: string;
              gmt_create?: Date;
            } = {
              plan_id: plan.plan_id,
              content: content || '进展记录',
              thinking: ''
            };
            
            if (custom_time) {
              try {
                // 首先尝试解析为ISO格式
                const isoDate = new Date(custom_time);
                if (!isNaN(isoDate.getTime())) {
                  createData.gmt_create = isoDate;
                } else {
                  // 如果ISO格式解析失败，尝试自然语言解析
                  createData.gmt_create = parseNaturalTime(custom_time);
                }
              } catch {
                createData.gmt_create = parseNaturalTime(custom_time);
              }
            }
            
            const record = await prisma.progressRecord.create({
              data: createData
            });

            // 更新progress字段（如果提供）
            if (progress !== undefined) {
              await prisma.plan.update({
                where: { plan_id: plan.plan_id },
                data: { progress: progress / 100 }
              });
            }

            return {
              success: true,
              data: {
                plan: plan,
                record,
                message: `已成功更新计划"${plan.name}"的进度`
              }
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
          
          if (custom_time) {
            createData.gmt_create = parseNaturalTime(custom_time);
          }
          
          const record = await prisma.progressRecord.create({
            data: createData
          });

          // 根据任务类型决定如何处理
          if (targetPlan.is_recurring) {
            // 周期性任务处理
            const updatedPlan = await prisma.plan.findUnique({
              where: { plan_id: targetPlan.plan_id },
              include: { progressRecords: true }
            });

            return {
              success: true,
              data: {
                plan: updatedPlan,
                record,
                message: `已成功记录"${targetPlan.name}"的进展`
              }
            };
          } else {
            // 普通任务：更新progress字段
            if (progress !== undefined) {
              const updatedPlan = await prisma.plan.update({
                where: { plan_id: targetPlan.plan_id },
                data: { progress: progress / 100 }
              });
              
              return {
                success: true,
                data: {
                  plan: updatedPlan,
                  record,
                  message: `已成功更新计划"${targetPlan.name}"的进度至${progress}%`
                }
              };
            } else {
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
            error: `更新进度失败: ${error.message}`
          };
        }
      },
    },

    // 添加进展记录 - 简化版本
    {
      name: "addProgressRecord",
      description: "添加进展记录，支持自定义时间",
      parameters: [
        {
          name: "plan_identifier",
          type: "string",
          description: "计划标识符（可以是plan_id、计划名称或关键词）",
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
          description: "记录时间（ISO格式或自然语言描述）",
          required: false,
        }
      ],
      handler: async (args: any) => {
        console.log("📝 addProgressRecord called:", args);
        
        // 自然语言时间解析函数
        function parseNaturalTime(timeStr: string): Date {
          const now = new Date();
          const timeLower = timeStr.toLowerCase().trim();
          
          // 处理"昨天"相关的时间
          if (timeLower.includes('昨天') || timeLower.includes('昨晚')) {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            
            // 提取时间信息
            const timeMatch = timeLower.match(/(\d{1,2})[点:](\d{1,2})?/);
            if (timeMatch) {
              const hour = parseInt(timeMatch[1]);
              const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
              
              // 判断是否为晚上时间
              if (hour <= 12 && (timeLower.includes('晚') || timeLower.includes('夜'))) {
                yesterday.setHours(hour + 12, minute, 0, 0);
              } else {
                yesterday.setHours(hour, minute, 0, 0);
              }
            } else {
              // 如果没有具体时间，默认设为晚上8点
              yesterday.setHours(20, 0, 0, 0);
            }
            return yesterday;
          }
          
          // 处理"今天"相关的时间
          if (timeLower.includes('今天') || timeLower.includes('今晚')) {
            const today = new Date(now);
            
            const timeMatch = timeLower.match(/(\d{1,2})[点:](\d{1,2})?/);
            if (timeMatch) {
              const hour = parseInt(timeMatch[1]);
              const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
              
              if (hour <= 12 && (timeLower.includes('下午') || timeLower.includes('晚') || timeLower.includes('夜'))) {
                today.setHours(hour + 12, minute, 0, 0);
              } else {
                today.setHours(hour, minute, 0, 0);
              }
            } else {
              today.setHours(now.getHours(), now.getMinutes(), 0, 0);
            }
            return today;
          }
          
          // 处理"前天"相关的时间
          if (timeLower.includes('前天')) {
            const dayBeforeYesterday = new Date(now);
            dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
            
            const timeMatch = timeLower.match(/(\d{1,2})[点:](\d{1,2})?/);
            if (timeMatch) {
              const hour = parseInt(timeMatch[1]);
              const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
              
              if (hour <= 12 && (timeLower.includes('晚') || timeLower.includes('夜'))) {
                dayBeforeYesterday.setHours(hour + 12, minute, 0, 0);
              } else {
                dayBeforeYesterday.setHours(hour, minute, 0, 0);
              }
            } else {
              dayBeforeYesterday.setHours(20, 0, 0, 0);
            }
            return dayBeforeYesterday;
          }
          
          // 处理具体的小时前
          const hoursAgoMatch = timeLower.match(/(\d+)小时前/);
          if (hoursAgoMatch) {
            const hoursAgo = parseInt(hoursAgoMatch[1]);
            const hoursAgoDate = new Date(now);
            hoursAgoDate.setHours(hoursAgoDate.getHours() - hoursAgo);
            return hoursAgoDate;
          }
          
          // 处理具体的分钟前
          const minutesAgoMatch = timeLower.match(/(\d+)分钟前/);
          if (minutesAgoMatch) {
            const minutesAgo = parseInt(minutesAgoMatch[1]);
            const minutesAgoDate = new Date(now);
            minutesAgoDate.setMinutes(minutesAgoDate.getMinutes() - minutesAgo);
            return minutesAgoDate;
          }
          
          // 如果都无法解析，返回当前时间
          return now;
        }
        
        try {
          const { plan_identifier, content, record_time } = args;
          
          // 搜索计划
          let targetPlan = await prisma.plan.findUnique({
            where: { plan_id: plan_identifier },
            include: { progressRecords: true }
          });
          
          // 如果按ID没找到，尝试按名称搜索
          if (!targetPlan) {
            const plans = await prisma.plan.findMany({
              where: {
                OR: [
                  { name: { contains: plan_identifier, mode: 'insensitive' } },
                  { description: { contains: plan_identifier, mode: 'insensitive' } }
                ]
              },
              include: { progressRecords: true }
            });
            
            if (plans.length > 0) {
              targetPlan = plans[0];
            }
          }
          
          if (!targetPlan) {
            return {
              success: false,
              error: `无法找到标识符为"${plan_identifier}"的计划。请检查计划名称或ID是否正确。`
            };
          }

          console.log("✅ Selected plan:", targetPlan.name);
          
          // 处理记录时间
          let recordDate = new Date();
          if (record_time) {
            try {
              // 首先尝试解析为ISO格式
              const isoDate = new Date(record_time);
              if (!isNaN(isoDate.getTime())) {
                recordDate = isoDate;
              } else {
                // 如果ISO格式解析失败，尝试自然语言解析
                recordDate = parseNaturalTime(record_time);
              }
            } catch {
              recordDate = parseNaturalTime(record_time);
            }
          }
          
          // 创建进展记录
          const record = await prisma.progressRecord.create({
            data: {
              plan_id: targetPlan.plan_id,
              content: content,
              thinking: '',
              gmt_create: recordDate
            }
          });

          return {
            success: true,
            data: {
              plan: targetPlan,
              record,
              message: `已成功记录"${targetPlan.name}"的进展`
            }
          };
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
