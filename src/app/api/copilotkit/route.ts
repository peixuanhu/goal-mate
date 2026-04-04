import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import OpenAI from "openai";
import { isRecurringTaskCompleted } from "@/lib/recurring-utils";

const prisma = new PrismaClient();

/**
 * 通义千问等 OpenAI 兼容 API：带 tool_calls 的 assistant 之后必须为每个 tool_call_id
 * 提供 role 为 tool 的消息。CopilotKit 在多轮里偶发插入 user，打断 tool 序列，会触发 400。
 * 在缺失处插入占位 tool 消息，仅用于通过校验；模型一般会据此继续对话。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function repairAssistantToolCallSequence(messages: any[]): any[] {
  const out = [...messages];
  let i = 0;
  while (i < out.length) {
    const m = out[i];
    const toolCalls =
      m?.role === "assistant" && Array.isArray(m.tool_calls) ? m.tool_calls : null;
    if (!toolCalls || toolCalls.length === 0) {
      i++;
      continue;
    }
    const required = new Set<string>();
    for (const tc of toolCalls) {
      const id = tc?.id;
      if (typeof id === "string" && id.length > 0) required.add(id);
    }
    if (required.size === 0) {
      i++;
      continue;
    }
    let j = i + 1;
    const got = new Set<string>();
    while (j < out.length && out[j]?.role === "tool") {
      const tid = out[j]?.tool_call_id;
      if (typeof tid === "string" && required.has(tid)) got.add(tid);
      j++;
    }
    const missing = [...required].filter((id) => !got.has(id));
    if (missing.length === 0) {
      i++;
      continue;
    }
    const insertAt = j;
    const placeholders = missing.map((tool_call_id) => ({
      role: "tool" as const,
      tool_call_id,
      content: JSON.stringify({
        ok: false,
        note: "Goal Mate: missing tool result in history; placeholder for API compliance.",
      }),
    }));
    out.splice(insertAt, 0, ...placeholders);
    console.log(
      `🔧 repairAssistantToolCallSequence: inserted ${placeholders.length} tool placeholder(s) before index ${insertAt} (assistant index ${i})`,
    );
    i++;
  }
  return out;
}

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
  constructor(config: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    super(config);
    
    // 拦截 chat.completions.create 方法
    const originalCreate = this.chat.completions.create;
    
    this.chat.completions.create = (body: any, options?: any): any => { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.log("🚨 Intercepting OpenAI chat.completions.create");
      
      // 深度清理所有 developer 角色
      const cleanMessages = (messages: any[]): any[] => { // eslint-disable-line @typescript-eslint/no-explicit-any
        return messages.map(message => {
          const cleaned = { ...message };
          
          if (cleaned.role === 'developer') {
            console.log("🚨 FOUND AND REPLACING DEVELOPER ROLE in OpenAI call!");
            cleaned.role = 'user';
          }
          
          // 也检查嵌套的内容
          if (cleaned.content && typeof cleaned.content === 'object') {
            if (Array.isArray(cleaned.content)) {
              cleaned.content = cleaned.content.map((item: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
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
        console.log("📝 Original message roles:", body.messages.map((m: any) => m.role)); // eslint-disable-line @typescript-eslint/no-explicit-any
        body.messages = cleanMessages(body.messages);
        
        // 注入读书相关的系统提示词
        const systemPrompt = `你是Goal Mate AI助手，专注于帮助用户管理目标、制定计划和跟踪进度。

**核心工作流程（重要）：**
当用户提到任何与学习、完成、进展相关的内容时，请按以下顺序操作：

1. **首先查询已有计划**：使用 \`queryPlans\` 或 \`findPlan\` 查询用户的现有计划
2. **智能匹配判断**：
   - 如果找到相关计划 → 直接使用 \`analyzeAndRecordProgress\` 或 \`addProgressRecord\` 添加进展记录
   - 如果没有找到相关计划 → 询问用户是否需要创建新的目标或计划
3. **标签优先级**：创建计划前，先使用 \`getSystemOptions\` 获取已有标签，优先选择现有标签

**特别指令 - 读书问题处理：**
当用户询问关于书籍、阅读计划或读书相关的问题时，请遵循以下格式：

1. **自动联网搜索** - 使用已启用的搜索功能获取最新的书籍信息
2. **使用Markdown格式** 输出，包含以下结构：

## 📚 [书名]

### 📖 基本信息
- **作者**：[作者姓名]
- **出版时间**：[出版年份]
- **页数**：[大约页数]
- **难度等级**：⭐⭐⭐ (1-5星)
- **推荐阅读时间**：[预估时间]

### 📋 内容简介
[书籍的核心内容和价值]

### 📑 章节大纲
1. **第一章** - [章节标题和要点]
2. **第二章** - [章节标题和要点]
3. **第三章** - [章节标题和要点]
...

### 💡 阅读建议
- **适合人群**：[目标读者]
- **阅读方法**：[建议的阅读策略]
- **重点章节**：[特别需要关注的章节]

### 🎯 学习计划建议
根据用户现有计划，推荐具体的阅读计划和进度安排。

---

**重要指令 - 进展记录智能处理：**
当用户更新某个计划的进展记录时，需要智能地理解和分析用户的输入文本：

1. **智能分割内容**：
   - 将用户描述分割成"事项"和"思考"两部分
   - "事项"：用户实际完成的具体行动、任务或学习内容
   - "思考"：用户的心得体会、遇到的问题、学到的知识、感悟等
   
2. **分析示例**：
   - 输入："我今天读完了《CSAPP》第3章，这章讲的是机器级编程，感觉汇编语言还是有点复杂"
   - 分析结果：
     - 事项：读完了《CSAPP》第3章机器级编程
     - 思考：感觉汇编语言还是有点复杂

**重要指令 - 智能处理流程示例：**

用户说："我听了巴赫的众赞歌，听到第9首了。和声好神奇！"

正确处理流程：
1. **必须先调用findPlan**：使用 \`findPlan\` 搜索关键词"巴赫 众赞歌 音乐"等
2. 如果找到相关计划：
   - 使用 \`addProgressRecord\` 记录进展（推荐）
   - 或使用 \`analyzeAndRecordProgress\` 智能分析记录
   - 事项：听了巴赫众赞歌到第9首
   - 思考：对和声产生浓厚兴趣，觉得很神奇
3. 如果没找到相关计划：
   - 询问用户是否需要创建"提高音乐欣赏能力"（目标）或"系统学习巴赫众赞歌"（计划）

**重要：绝对不要直接调用analyzeAndRecordProgress而不先调用findPlan！**

**重要指令 - 目标与计划创建区分：**
当用户表达想做某件事且确认需要创建时，需要智能判断应该创建"目标"还是"计划"：

1. **判断原则**：
   - **创建目标**：用户描述比较抽象、宏观，无法直接分割成具体执行步骤
     - 例如："我想提高编程能力"、"我想学会机器学习"、"我想变得更健康"
   - **创建计划**：用户描述比较具体、明确，可以直接执行或有明确的完成标准
     - 例如："我想读完《CSAPP》这本书"、"我想学会Python"、"我想每天跑步30分钟"

2. **标签处理规则**：
   - **创建前必须先查询**：使用 \`getSystemOptions\` 获取已有标签列表
   - **目标标签**：只能单选一个标签
   - **计划标签**：可以多选标签，用逗号分隔
   - **标签语言**：统一使用英文填写
   - **标签优先级**：优先使用系统中已有的标签，避免创建重复标签

3. **常用标签参考**（在已有标签不足时使用）：
   - 学习类：study, programming, reading, learning, music
   - 工作类：work, career, project
   - 健康类：health, fitness, exercise
   - 技能类：skill, language, development
   - 生活类：life, hobby, personal

**对于其他问题**，继续使用正常的对话方式，但在需要时也适当使用markdown格式来提升可读性。

**核心功能**：
- 智能任务推荐：根据用户状态推荐合适的任务
- 计划管理：创建、查询、更新各种学习和工作计划
- 进度跟踪：记录用户的学习进展和思考
- 数据分析：基于用户数据生成报告和建议

**重要指令 - 任务推荐过滤规则（必须遵守）：**

1. **仅推荐未完成任务**：
   - 当使用 'recommendTasks'、'queryPlans' 或 'findPlan' 查询任务时，**只返回未完成的任务**
   - 未完成任务定义：
     - 普通任务：进度(progress) < 100%（即小于1）
     - 周期性任务：当前周期内完成次数未达到目标次数(recurrence_value)
   - **绝对不要**在推荐中显示已完成状态的任务

2. **已完成任务处理**：
   - 除非用户**明确询问**"我有哪些已完成的任务"或"我完成了什么"，否则不要输出已完成任务
   - 当用户询问已完成任务时，才查询并显示已完成状态的任务

3. **推荐时的过滤逻辑**：
   - 调用 'recommendTasks' 时，系统会自动过滤已完成任务
   - 在回复用户时，确保只展示未完成的任务列表
   - 如果所有任务都已完成，告知用户"目前没有未完成的任务，建议创建新计划"

**重要指令 - 操作确认规则（必须遵守）：**

对于所有**增删改**操作，必须先向用户展示即将执行的操作详情，等待用户确认后再执行。

1. **需要确认的操作**（创建、更新、删除）：
   - **createGoal** (创建目标)：向用户展示"创建目标：xxx，标签：xxx；是否确认？"
   - **createPlan** (创建计划)：向用户展示"创建计划：xxx，难度：xxx，标签：xxx；是否确认？"
   - **updateProgress** (更新进度)：向用户展示"更新计划"xxx"的进度至xx%；是否确认？"
   - **addProgressRecord** (添加进展记录)：向用户展示"为计划"xxx"添加进展记录：xxx；是否确认？"
   - **analyzeAndRecordProgress** (智能分析记录)：向用户展示"分析并记录到计划"xxx"：进展内容xxx；是否确认？"

2. **确认流程**：
   - 第一步：向用户清晰展示操作详情（操作类型 + 具体内容）
   - 第二步：询问"是否确认？"或"请确认是否执行此操作"
   - 第三步：等待用户明确回复"确认"、"是的"、"执行"等肯定答复后，才调用相应的action
   - 如果用户回复"取消"、"否"、"不执行"等，则取消操作

3. **内容补充时的处理规则**：
   - 如果用户补充或修改了之前待确认的内容，**必须重新展示完整的操作详情**（包含补充后的内容）
   - **必须再次询问确认**，等待用户明确回复后才能执行
   - 示例：
     - AI："为您添加进展记录：事项：今天做了肩颈拉伸；思考：（暂无）；是否确认？"
     - 用户："心得体会是最近身体不错"
     - AI："更新进展记录：事项：今天做了肩颈拉伸；思考：最近身体不错；是否确认添加？"
     - 用户："确认"
     - AI：才调用addProgressRecord执行记录

4. **不需要确认的操作**（查询、搜索、聊天）：
   - **recommendTasks** (任务推荐)：直接输出推荐结果
   - **queryPlans** (查询计划)：直接输出查询结果
   - **findPlan** (查找计划)：直接输出查找结果
   - **getSystemOptions** (获取系统选项)：直接输出选项列表
   - 正常的对话聊天、联网搜索：直接输出回复内容

**重要指令 - 推荐时必须给出理由（必须遵守）：**

当进行任何推荐时（包括推荐任务、书籍、计划、学习方法等），**在提供任务描述、标签、进度等信息之外，必须同时说明推荐理由**：

1. **任务推荐**（recommendTasks）：
   - 每个推荐的任务都要说明为什么推荐这个任务
   - 理由可以包括：与当前状态的匹配度、优先级、难度适合性、时间紧迫性等

2. **书籍推荐**：
   - 必须说明为什么推荐这本书
   - 理由可以包括：适合当前学习阶段、经典必读、与已有计划的相关性、难度适中等

3. **学习计划/方法推荐**：
   - 说明为什么这个计划或方法适合用户
   - 结合用户的已有目标和当前进度给出个性化理由

**原则**：不要只列出推荐项，要让用户理解"为什么"这个推荐对他有价值。

**重要指令 - 时间段查询规则（必须遵守）：**

当用户的问题涉及到时间段（如今天、本周、下周、本月、本季度、今年等）时，**必须限制时间范围**进行数据查询：

1. **时间关键词识别**：
   - **今天**：当前日期 00:00 至 23:59
   - **昨天**：昨天日期 00:00 至 23:59
   - **本周/这周**：本周一 00:00 至本周日 23:59
   - **下周**：下周一 00:00 至下周日 23:59
   - **本月/这个月**：本月1日 00:00 至本月最后一日 23:59
   - **下月**：下月1日 00:00 至下月最后一日 23:59
   - **本季度/这季度**：本季度首月1日 00:00 至本季度末月最后一日 23:59
   - **今年/本年度**：本年1月1日 00:00 至本年12月31日 23:59

2. **查询数据时的处理**：
   - 当用户询问"我今天完成了什么"、"本周有哪些进展"、"本月完成了哪些任务"等问题时
   - **必须**根据对应的时间段限制查询范围
   - 使用 'queryPlans' 或 'findPlan' 查询后，**必须进一步过滤**结果中符合时间条件的进展记录(progressRecords)
   - 只返回在指定时间范围内的进展记录

3. **时间范围过滤示例**：
   - 用户问："我今天有什么进展？"
   - 正确做法：
     1. 调用 'queryPlans' 获取所有计划
     2. 筛选出今天（当前日期 00:00-23:59）有进展记录的计划
     3. 只展示今天产生的进展记录，而不是所有历史记录

4. **默认时间范围**：
   - 如果用户没有明确指定时间范围，默认查询所有时间的数据
   - 一旦用户提到任何时间词，**必须**应用时间过滤

请始终以友好、专业的态度协助用户，并充分利用联网搜索功能提供准确、最新的信息。`;
        
        // 如果没有系统消息，或者第一条消息不是系统消息，则添加系统提示
        if (body.messages.length === 0 || body.messages[0].role !== 'system') {
          body.messages.unshift({
            role: 'system',
            content: systemPrompt
          });
        } else {
          // 如果已存在系统消息，则更新内容
          body.messages[0].content = systemPrompt + '\n\n' + body.messages[0].content;
        }

        body.messages = repairAssistantToolCallSequence(body.messages);
        
        console.log("✅ Cleaned message roles:", body.messages.map((m: any) => m.role)); // eslint-disable-line @typescript-eslint/no-explicit-any
      }
      
      // 添加联网搜索功能
      if (!options) {
        options = {};
      }
      
      // 为通义千问模型启用联网搜索
      options.extra_body = {
        ...(options.extra_body || {}),
        enable_search: true
      };
      
      console.log("🔍 Enabled search functionality for Qwen model");
      
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
  model: "qwen3.5-plus",
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
          
          // 获取所有计划（包括周期性任务需要检查progressRecords）
          const allPlans = await prisma.plan.findMany({
            include: { 
              tags: true,
              progressRecords: true 
            },
            orderBy: { gmt_create: 'desc' }
          });

          // 过滤出未完成的任务
          const incompletePlans = allPlans.filter((plan: any) => {
            // 周期性任务：检查当前周期是否已完成
            if (plan.is_recurring) {
              return !isRecurringTaskCompleted(plan);
            }
            // 普通任务：检查进度是否小于100%
            return plan.progress < 1;
          });

          if (incompletePlans.length === 0) {
            return { 
              success: true, 
              data: {
                message: "目前没有未完成的任务，建议先创建一些目标和计划。",
                tasks: [],
                recommendation: "可以创建新的目标和计划来开始。"
              }
            };
          }

          // 应用基本筛选（如果提供了筛选条件）
          let filteredPlans = incompletePlans;
          if (filterCriteria) {
            // 简单的筛选逻辑，可以根据难度或标签筛选
            filteredPlans = incompletePlans.filter((plan: any) => 
              (plan.difficulty && plan.difficulty.includes(filterCriteria)) ||
              plan.tags.some((tag: any) => tag.tag.includes(filterCriteria))
            );
          }

          // 默认推荐逻辑：根据进度和创建时间
          const recommendedTasks = filteredPlans
            .sort((a: any, b: any) => a.progress - b.progress)
            .slice(0, 5);

          const result = recommendedTasks.map((plan: any) => ({
            ...plan,
            tags: plan.tags.map((t: any) => t.tag)
          }));

          console.log("✅ Found", result.length, "recommended tasks");
          return { 
            success: true, 
            data: {
              message: `基于当前状态"${userState}"为您推荐以下任务`,
              userState: userState,
              tasks: result,
              totalAvailable: incompletePlans.length
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
      description: "查询计划列表，支持多种筛选条件。默认只返回未完成的任务，除非用户明确询问已完成的任务。支持时间范围筛选",
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
        },
        {
          name: "includeCompleted",
          type: "boolean",
          description: "是否包含已完成的任务。默认为false，只在用户明确询问已完成任务时设为true",
          required: false,
        },
        {
          name: "timeRange",
          type: "string",
          description: "时间范围筛选，支持：today(今天)、yesterday(昨天)、this_week(本周)、next_week(下周)、this_month(本月)、next_month(下月)、this_quarter(本季度)、this_year(今年)。当用户问题涉及时间段时必须使用",
          required: false,
        }
      ],
      handler: async (args: any) => {
        console.log("🔍 queryPlans called:", args);
        try {
          const { difficulty, tag, keyword, includeCompleted, timeRange } = args;
          
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
            include: { 
              tags: true,
              progressRecords: true 
            },
            orderBy: { gmt_create: 'desc' }
          });
          
          // 如果指定了标签，进一步筛选
          if (tag) {
            plans = plans.filter((plan: any) => 
              plan.tags.some((t: any) => t.tag.includes(tag))
            );
          }
          
          // 默认过滤掉已完成的任务，除非明确要求包含已完成
          if (!includeCompleted) {
            plans = plans.filter((plan: any) => {
              // 周期性任务：检查当前周期是否已完成
              if (plan.is_recurring) {
                return !isRecurringTaskCompleted(plan);
              }
              // 普通任务：检查进度是否小于100%
              return plan.progress < 1;
            });
          }

          // 时间范围过滤处理
          let startDate: Date | null = null;
          let endDate: Date | null = null;
          const now = new Date();

          if (timeRange) {
            switch (timeRange.toLowerCase()) {
              case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                break;
              case 'yesterday':
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
                endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
                break;
              case 'this_week':
                const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
                const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                const monday = new Date(now);
                monday.setDate(now.getDate() - diffToMonday);
                startDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 0, 0, 0);
                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                endDate = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate(), 23, 59, 59);
                break;
              case 'next_week':
                const nextMonday = new Date(now);
                nextMonday.setDate(now.getDate() + (7 - now.getDay() + 1));
                startDate = new Date(nextMonday.getFullYear(), nextMonday.getMonth(), nextMonday.getDate(), 0, 0, 0);
                const nextSunday = new Date(nextMonday);
                nextSunday.setDate(nextMonday.getDate() + 6);
                endDate = new Date(nextSunday.getFullYear(), nextSunday.getMonth(), nextSunday.getDate(), 23, 59, 59);
                break;
              case 'this_month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                break;
              case 'next_month':
                startDate = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);
                break;
              case 'this_quarter':
                const quarter = Math.floor(now.getMonth() / 3);
                startDate = new Date(now.getFullYear(), quarter * 3, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59);
                break;
              case 'this_year':
                startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
                break;
            }
          }

          // 如果指定了时间范围，过滤进展记录
          if (startDate && endDate) {
            plans = plans.map((plan: any) => ({
              ...plan,
              progressRecords: plan.progressRecords.filter((record: any) => {
                const recordDate = new Date(record.gmt_create);
                return recordDate >= startDate! && recordDate <= endDate!;
              })
            })).filter((plan: any) => {
              // 如果只查询有进展的计划，可以过滤掉没有进展记录的计划
              // 但如果用户查询"今天有什么进展"，应该返回有进展的计划
              // 这里保留所有计划，但进展记录已按时间过滤
              return true;
            });
          }

          const result = plans.map((plan: any) => ({
            ...plan,
            tags: plan.tags.map((t: any) => t.tag)
          }));

          console.log("✅ Found", result.length, "plans", timeRange ? `(filtered by timeRange: ${timeRange})` : '');
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
          
          const tagList = existingTags.map((t: any) => t.tag);
          
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
            tags: createdPlan?.tags.map((t: any) => t.tag) || []
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
      description: "根据名称、关键词或标签查找计划，支持模糊搜索。默认只返回未完成的任务，除非用户明确询问已完成的任务。支持时间范围筛选",
      parameters: [
        {
          name: "searchTerm",
          type: "string",
          description: "搜索词，可以是计划名称、关键词或标签",
          required: true,
        },
        {
          name: "includeCompleted",
          type: "boolean",
          description: "是否包含已完成的任务。默认为false，只在用户明确询问已完成任务时设为true",
          required: false,
        },
        {
          name: "timeRange",
          type: "string",
          description: "时间范围筛选，支持：today(今天)、yesterday(昨天)、this_week(本周)、next_week(下周)、this_month(本月)、next_month(下月)、this_quarter(本季度)、this_year(今年)。当用户问题涉及时间段时必须使用",
          required: false,
        }
      ],
      handler: async (args: any) => {
        console.log("🔍 findPlan called:", args);
        try {
          const { searchTerm, includeCompleted, timeRange } = args;
          
          // 将搜索词分割成多个关键词
          const keywords = searchTerm.split(/[\s,，、]+/).filter((word: string) => word.length > 0);
          console.log("🔍 Search keywords:", keywords);
          
          // 构建搜索条件：任何一个关键词匹配即可
          const searchConditions = keywords.flatMap((keyword: string) => [
            { name: { contains: keyword, mode: 'insensitive' as const } },
            { description: { contains: keyword, mode: 'insensitive' as const } },
            {
              tags: {
                some: {
                  tag: {
                    contains: keyword,
                    mode: 'insensitive' as const
                  }
                }
              }
            }
          ]);
          
          // 综合搜索：名称、描述、标签
          let plans = await prisma.plan.findMany({
            where: {
              OR: searchConditions
            },
            include: { 
              tags: true,
              progressRecords: true 
            }
          });

          // 默认过滤掉已完成的任务，除非明确要求包含已完成
          if (!includeCompleted) {
            plans = plans.filter((plan: any) => {
              // 周期性任务：检查当前周期是否已完成
              if (plan.is_recurring) {
                return !isRecurringTaskCompleted(plan);
              }
              // 普通任务：检查进度是否小于100%
              return plan.progress < 1;
            });
          }

          // 时间范围过滤处理
          let startDate: Date | null = null;
          let endDate: Date | null = null;
          const now = new Date();

          if (timeRange) {
            switch (timeRange.toLowerCase()) {
              case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                break;
              case 'yesterday':
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
                endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
                break;
              case 'this_week':
                const dayOfWeek = now.getDay();
                const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                const monday = new Date(now);
                monday.setDate(now.getDate() - diffToMonday);
                startDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 0, 0, 0);
                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                endDate = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate(), 23, 59, 59);
                break;
              case 'next_week':
                const nextMonday = new Date(now);
                nextMonday.setDate(now.getDate() + (7 - now.getDay() + 1));
                startDate = new Date(nextMonday.getFullYear(), nextMonday.getMonth(), nextMonday.getDate(), 0, 0, 0);
                const nextSunday = new Date(nextMonday);
                nextSunday.setDate(nextMonday.getDate() + 6);
                endDate = new Date(nextSunday.getFullYear(), nextSunday.getMonth(), nextSunday.getDate(), 23, 59, 59);
                break;
              case 'this_month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                break;
              case 'next_month':
                startDate = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);
                break;
              case 'this_quarter':
                const quarter = Math.floor(now.getMonth() / 3);
                startDate = new Date(now.getFullYear(), quarter * 3, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59);
                break;
              case 'this_year':
                startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
                break;
            }
          }

          // 如果指定了时间范围，过滤进展记录
          if (startDate && endDate) {
            plans = plans.map((plan: any) => ({
              ...plan,
              progressRecords: plan.progressRecords.filter((record: any) => {
                const recordDate = new Date(record.gmt_create);
                return recordDate >= startDate! && recordDate <= endDate!;
              })
            }));
          }

          // 按匹配度排序：匹配更多关键词的计划排在前面
          const plansWithScore = plans.map(plan => {
            let score = 0;
            const planText = `${plan.name} ${plan.description || ''} ${plan.tags.map(t => t.tag).join(' ')}`.toLowerCase();
            
            keywords.forEach((keyword: string) => {
              const keywordLower = keyword.toLowerCase();
              // 名称匹配得分更高
              if (plan.name.toLowerCase().includes(keywordLower)) {
                score += 3;
              }
              // 描述匹配
              if ((plan.description || '').toLowerCase().includes(keywordLower)) {
                score += 2;
              }
              // 标签匹配
              if (plan.tags.some(tag => tag.tag.toLowerCase().includes(keywordLower))) {
                score += 1;
              }
            });
            
            return { ...plan, matchScore: score };
          });
          
          // 按匹配分数排序，分数高的在前
          const sortedPlans = plansWithScore
            .filter(plan => plan.matchScore > 0)
            .sort((a, b) => b.matchScore - a.matchScore);

          const result = sortedPlans.map((plan: any) => ({
            ...plan,
            tags: plan.tags.map((t: any) => t.tag)
          }));

          console.log("✅ Found", result.length, "plans with scores:", result.map(p => ({ name: p.name, score: p.matchScore })));
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
      description: "更新计划进度，支持思考内容记录",
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
          name: "thinking",
          type: "string",
          description: "思考内容，记录完成该进展时的心得体会、遇到的问题、学到的知识等",
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
          const { plan_id, progress, content, thinking, custom_time } = args;
          
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
              thinking: thinking || ''
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
                message: `已成功更新计划"${plan.name}"的进度${thinking ? '，并记录了思考内容' : ''}`
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
            thinking: thinking || ''
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
                message: `已成功记录"${targetPlan.name}"的进展${thinking ? '，并记录了思考内容' : ''}`
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
                  message: `已成功更新计划"${targetPlan.name}"的进度至${progress}%${thinking ? '，并记录了思考内容' : ''}`
                }
              };
            } else {
              return {
                success: true,
                data: {
                  plan: targetPlan,
                  record,
                  message: `已成功添加计划"${targetPlan.name}"的进展记录${thinking ? '，并记录了思考内容' : ''}`
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
      description: "添加进展记录，支持自定义时间和思考内容",
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
          name: "thinking",
          type: "string",
          description: "思考内容，记录完成该进展时的心得体会、遇到的问题、学到的知识等",
          required: false,
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
          const { plan_identifier, content, thinking, record_time } = args;
          
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
              thinking: thinking || '',
              gmt_create: recordDate
            }
          });

          return {
            success: true,
            data: {
              plan: targetPlan,
              record,
              message: `已成功记录"${targetPlan.name}"的进展${thinking ? '，并记录了思考内容' : ''}`
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
    },

    // 智能进展分析和记录
    {
      name: "analyzeAndRecordProgress",
      description: "智能分析用户的完成汇报，自动提取进展内容、思考内容和时间信息，然后记录到相应的计划中",
      parameters: [
        {
          name: "user_report",
          type: "string",
          description: "用户的完成汇报原文，包含所做的事情、时间、思考等信息",
          required: true,
        }
      ],
      handler: async (args: any) => {
        console.log("🧠 analyzeAndRecordProgress called:", args);
        
        try {
          const { user_report } = args;
          
          // 智能解析用户汇报
          const parseUserReport = (report: string) => {
            const result = {
              activity: '',
              thinking: '',
              time: '',
              keywords: [] as string[]
            };
            
            // 提取活动内容的常见模式
            const activityPatterns = [
              /我(完成了|做了|打了|练了|学了|读了|看了|写了)(.+?)(?=[，。；！？]|$)/,
              /我把(.+?)完成了/,
              /我(.+?)了/,
            ];
            
            for (const pattern of activityPatterns) {
              const match = report.match(pattern);
              if (match) {
                result.activity = match[0];
                // 提取关键词
                const keywords = match[0].match(/[\u4e00-\u9fa5a-zA-Z0-9]+/g) || [];
                result.keywords = keywords.filter(k => k.length > 1 && !['完成', '了', '我', '把', '的'].includes(k));
                break;
              }
            }
            
            // 提取思考内容的模式
            const thinkingPatterns = [
              /思考[是：:](.*?)(?=[，。；！？]|$)/,
              /感觉(.*?)(?=[，。；！？]|$)/,
              /发现(.*?)(?=[，。；！？]|$)/,
              /学到[了的](.*?)(?=[，。；！？]|$)/,
              /复习了(.*?)(?=[，。；！？]|$)/,
              /参考了(.*?)(?=[，。；！？]|$)/,
              /是个?(.*?)题?[，。；！？]/,
              /(模板题|算法题|简单题|中等题|困难题)/,
              /参考.*?(笔记|资料|模板)/,
            ];
            
            for (const pattern of thinkingPatterns) {
              const match = report.match(pattern);
              if (match) {
                result.thinking += (result.thinking ? '；' : '') + match[0];
              }
            }
            
            // 提取时间信息
            const timePatterns = [
              /昨天.*?(\d{1,2}[点:]?\d{0,2})/,
              /今天.*?(\d{1,2}[点:]?\d{0,2})/,
              /前天.*?(\d{1,2}[点:]?\d{0,2})/,
              /(\d+)小时前/,
              /(\d+)分钟前/,
              /(昨天|今天|前天|昨晚|今晚)/,
            ];
            
            for (const pattern of timePatterns) {
              const match = report.match(pattern);
              if (match) {
                result.time = match[0];
                break;
              }
            }
            
            return result;
          };
          
          const parsed = parseUserReport(user_report);
          console.log("🧠 Parsed report:", parsed);
          
          // 如果没有提取到活动内容，使用原文作为内容
          if (!parsed.activity) {
            parsed.activity = user_report;
          }
          
          // 智能查找相关计划
          let targetPlan = null;
          
          if (parsed.keywords.length > 0) {
            // 使用改进的搜索逻辑，添加音乐相关的常见词汇
            const musicKeywords = ['巴赫', '众赞歌', '音乐', '和声', '四部', '听'];
            const allKeywords = [...parsed.keywords, ...musicKeywords];
            const uniqueKeywords = [...new Set(allKeywords)]; // 去重
            
            console.log("🔍 Searching with enhanced keywords:", uniqueKeywords);
            
            // 构建搜索条件：任何一个关键词匹配即可
            const searchConditions = uniqueKeywords.flatMap((keyword: string) => [
              { name: { contains: keyword, mode: 'insensitive' as const } },
              { description: { contains: keyword, mode: 'insensitive' as const } },
              {
                tags: {
                  some: {
                    tag: {
                      contains: keyword,
                      mode: 'insensitive' as const
                    }
                  }
                }
              }
            ]);
            
            // 根据关键词搜索计划
            const plans = await prisma.plan.findMany({
              where: {
                OR: searchConditions
              },
              include: { progressRecords: true, tags: true }
            });
            
            if (plans.length > 0) {
              // 按匹配度排序：匹配更多关键词的计划排在前面
              const plansWithScore = plans.map(plan => {
                let score = 0;
                
                uniqueKeywords.forEach((keyword: string) => {
                  const keywordLower = keyword.toLowerCase();
                  // 名称匹配得分更高
                  if (plan.name.toLowerCase().includes(keywordLower)) {
                    score += 3;
                  }
                  // 描述匹配
                  if ((plan.description || '').toLowerCase().includes(keywordLower)) {
                    score += 2;
                  }
                  // 标签匹配
                  if (plan.tags.some(tag => tag.tag.toLowerCase().includes(keywordLower))) {
                    score += 1;
                  }
                });
                
                return { ...plan, matchScore: score };
              });
              
              // 选择匹配分数最高的计划
              const sortedPlans = plansWithScore
                .filter(plan => plan.matchScore > 0)
                .sort((a, b) => b.matchScore - a.matchScore);
              
              if (sortedPlans.length > 0) {
                targetPlan = sortedPlans[0];
                console.log("✅ Found best matching plan:", targetPlan.name, "with score:", targetPlan.matchScore);
              }
            }
          }
          
          if (!targetPlan) {
            return {
              success: false,
              error: `无法根据描述"${user_report}"找到相关的计划。可能的关键词：${parsed.keywords.join(', ')}。请手动指定计划或确保计划名称包含相关关键词。`,
              data: {
                parsed,
                suggestions: "建议在描述中包含更具体的计划名称或关键词"
              }
            };
          }
          
          console.log("✅ Found target plan:", targetPlan.name);
          
          // 处理时间信息
          const parseNaturalTime = (timeStr: string): Date => {
            const now = new Date();
            const timeLower = timeStr.toLowerCase().trim();
            
            if (timeLower.includes('昨天') || timeLower.includes('昨晚')) {
              const yesterday = new Date(now);
              yesterday.setDate(yesterday.getDate() - 1);
              
              const timeMatch = timeLower.match(/(\d{1,2})[点:](\d{1,2})?/);
              if (timeMatch) {
                const hour = parseInt(timeMatch[1]);
                const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
                
                if (hour <= 12 && (timeLower.includes('晚') || timeLower.includes('夜'))) {
                  yesterday.setHours(hour + 12, minute, 0, 0);
                } else {
                  yesterday.setHours(hour, minute, 0, 0);
                }
              } else {
                yesterday.setHours(20, 0, 0, 0);
              }
              return yesterday;
            }
            
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
              }
              return today;
            }
            
            return now;
          };
          
          let recordDate = new Date();
          if (parsed.time) {
            recordDate = parseNaturalTime(parsed.time);
          }
          
          // 创建进展记录
          const record = await prisma.progressRecord.create({
            data: {
              plan_id: targetPlan.plan_id,
              content: parsed.activity,
              thinking: parsed.thinking || '',
              gmt_create: recordDate
            }
          });
          
          return {
            success: true,
            data: {
              plan: targetPlan,
              record,
              parsed,
              message: `已成功分析并记录到计划"${targetPlan.name}"：\n\n📝 进展内容：${parsed.activity}\n💭 思考内容：${parsed.thinking || '无'}\n⏰ 记录时间：${recordDate.toLocaleString()}`
            }
          };
          
        } catch (error: any) {
          console.error("❌ Error:", error);
          return {
            success: false,
            error: `智能分析失败: ${error.message}`
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
