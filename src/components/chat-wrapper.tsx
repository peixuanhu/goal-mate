"use client";

import { CopilotChat } from "@copilotkit/react-ui";
import { useEffect, useState } from "react";

export function ChatWrapper() {
  const [mounted, setMounted] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsClient(typeof window !== 'undefined');
  }, []);

  if (!mounted || !isClient) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  // 确保 navigator 对象存在
  if (typeof navigator === 'undefined') {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-muted-foreground">正在初始化...</div>
      </div>
    );
  }

  return (
    <CopilotChat
      labels={{
        title: "Goal Mate AI助手",
        initial: "你好！我是你的AI助手，可以帮你管理目标、制定计划、跟踪进度。\n\n试试说：\n• 我想看看有什么轻松的任务可以做\n• 帮我创建一个读书目标\n• 更新我的学习进度",
      }}
      className="h-full w-full"
    />
  );
} 