"use client";

import { CopilotChat } from "@copilotkit/react-ui";

export default function TestChatPage() {
  return (
    <div className="h-screen w-full bg-background">
      <div className="h-full max-w-2xl mx-auto border-x">
        <div className="p-4 border-b">
          <h1 className="text-xl font-bold">CopilotKit 测试页面</h1>
          <p className="text-sm text-muted-foreground">用于测试AI助手功能</p>
        </div>
        <div className="h-[calc(100vh-80px)]" data-copilot-chat="true">
          <CopilotChat
            labels={{
              title: "测试助手",
              initial: "你好！我是测试助手，可以帮你测试各种功能。",
            }}
            className="h-full"
          />
        </div>
      </div>
    </div>
  );
} 