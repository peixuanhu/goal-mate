"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function DebugPage() {
  const [testResult, setTestResult] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const testAPI = async () => {
    setIsLoading(true);
    setTestResult("测试中...");
    
    try {
      // 使用专门的健康检查端点
      const response = await fetch("/api/copilotkit/health", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        }
      });

      if (response.ok) {
        const data = await response.json();
        setTestResult(`✅ CopilotKit 健康检查结果:\n${JSON.stringify(data, null, 2)}`);
      } else {
        const errorData = await response.text();
        setTestResult(`❌ 健康检查失败:\n状态码: ${response.status}\n错误: ${errorData}`);
      }
    } catch (error) {
      setTestResult(`❌ 连接错误: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testSimpleAction = async () => {
    setIsLoading(true);
    setTestResult("测试 Actions...");
    
    try {
      // 直接调用我们的 API action 来测试
      const response = await fetch("/api/test-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "queryPlans",
          args: {}
        })
      });

      const data = await response.json();
      setTestResult(`✅ Action 测试结果:\n${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      setTestResult(`❌ Action 测试错误: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testDatabase = async () => {
    setIsLoading(true);
    setTestResult("测试数据库连接...");
    
    try {
      const response = await fetch("/api/test-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "checkDatabase",
          args: {}
        })
      });

      const data = await response.json();
      setTestResult(`✅ 数据库连接测试结果:\n${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      setTestResult(`❌ 数据库连接错误: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const checkEnvVars = async () => {
    setIsLoading(true);
    setTestResult("检查环境变量...");
    
    try {
      const response = await fetch("/api/debug/env");
      const data = await response.json();
      setTestResult(JSON.stringify(data, null, 2));
    } catch (error) {
      setTestResult(`错误: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">调试页面</h1>
      
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>环境变量检查</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              检查 OPENAI_API_KEY 和 OPENAI_BASE_URL 是否正确设置
            </p>
            <Button onClick={checkEnvVars} disabled={isLoading}>
              检查环境变量
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API 连通性测试</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              测试 CopilotKit API 端点是否正常工作
            </p>
            <div className="flex gap-2">
              <Button onClick={testAPI} disabled={isLoading}>
                测试 CopilotKit 端点
              </Button>
              <Button onClick={testSimpleAction} disabled={isLoading} variant="outline">
                测试 Actions 功能
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>数据库连接测试</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              测试数据库连接和基本 API 功能
            </p>
            <Button onClick={testDatabase} disabled={isLoading} variant="secondary">
              测试数据库查询
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>配置说明</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div>
                <p><strong>创建 .env.local 文件并配置：</strong></p>
                <pre className="bg-muted p-4 rounded text-xs">
{`# 阿里云百炼 API 配置
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# 数据库配置
DATABASE_URL="postgresql://username:password@localhost:5432/goalmate"`}
                </pre>
              </div>
              
              <div>
                <p><strong>获取阿里云百炼 API Key：</strong></p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-4">
                  <li>访问 <a href="https://dashscope.console.aliyun.com/" target="_blank" className="text-blue-500 underline">阿里云百炼控制台</a></li>
                  <li>创建应用并获取 API Key</li>
                  <li>确保选择的模型是 DeepSeek-R1 或兼容模型</li>
                  <li>将 API Key 配置到环境变量中</li>
                </ol>
              </div>

              <div>
                <p><strong>常见问题排查：</strong></p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                  <li>确保环境变量正确设置且重启了开发服务器</li>
                  <li>检查数据库连接是否正常</li>
                  <li>验证阿里云百炼 API Key 是否有效</li>
                  <li>查看浏览器控制台是否有 JavaScript 错误</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {testResult && (
          <Card>
            <CardHeader>
              <CardTitle>测试结果</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded text-xs whitespace-pre-wrap">
                {testResult}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
} 