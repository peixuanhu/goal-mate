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

  // 动态美化聊天消息的函数
  useEffect(() => {
    if (!mounted || !isClient) return;

    const styleMessages = () => {
      // 查找所有消息容器
      const messageContainers = document.querySelectorAll('[role="log"] > div');
      
      messageContainers.forEach((container, index) => {
        const messageDiv = container.querySelector('div');
        if (!messageDiv) return;

        // 移除可能存在的旧类名
        messageDiv.classList.remove('user-message-bubble', 'ai-message-bubble');
        
        // 根据位置判断消息类型（偶数为AI，奇数为用户）
        if (index % 2 === 0) {
          // AI消息
          messageDiv.classList.add('ai-message-bubble');
        } else {
          // 用户消息
          messageDiv.classList.add('user-message-bubble');
        }
      });
    };

    // 初始样式化
    styleMessages();

    // 监听DOM变化，当有新消息时重新样式化
    const observer = new MutationObserver(() => {
      setTimeout(styleMessages, 100); // 延迟执行确保DOM已更新
    });

    const messagesContainer = document.querySelector('[role="log"]');
    if (messagesContainer) {
      observer.observe(messagesContainer, {
        childList: true,
        subtree: true
      });
    }

    // 定期检查并应用样式（备用方案）
    const interval = setInterval(styleMessages, 2000);

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, [mounted, isClient]);

  if (!mounted || !isClient) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <div className="text-muted-foreground text-sm">AI助手加载中...</div>
        </div>
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
    <div className="h-full w-full flex flex-col overflow-hidden">
      <style jsx global>{`
        /* 确保聊天容器的高度和滚动行为 */
        .copilotKitChat {
          height: 100% !important;
          display: flex !important;
          flex-direction: column !important;
          background: transparent;
          border: none;
          overflow: hidden !important;
        }
        
        /* 消息容器样式和滚动 */
        .copilotKitMessages {
          flex: 1 !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
          padding: 1.5rem 1.25rem !important;
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          min-height: 0 !important;
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 #f1f5f9;
        }
        
        /* 滚动条美化 */
        .copilotKitMessages::-webkit-scrollbar {
          width: 8px;
        }
        
        .copilotKitMessages::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 4px;
        }
        
        .copilotKitMessages::-webkit-scrollbar-thumb {
          background: linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%);
          border-radius: 4px;
          border: 1px solid #e2e8f0;
        }
        
        .copilotKitMessages::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
        }
        
        /* 消息气泡动画和样式 - 使用更通用的选择器 */
        [role="log"] > div,
        .copilotKitMessage,
        .copilotKitMessages > div {
          margin-bottom: 1.5rem !important;
          animation: messageSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          opacity: 0;
          animation-fill-mode: forwards;
        }
        
        @keyframes messageSlideIn {
          from { 
            opacity: 0; 
            transform: translateY(20px) scale(0.95);
          }
          to { 
            opacity: 1; 
            transform: translateY(0) scale(1);
          }
        }
        
        /* 默认消息容器样式 */
        [role="log"] > div > div {
          padding: 1rem 1.25rem !important;
          border-radius: 1.25rem !important;
          font-size: 0.9rem !important;
          line-height: 1.6 !important;
          word-wrap: break-word;
          position: relative;
          max-width: 400px !important;
          margin-bottom: 0.5rem !important;
          background: white !important;
          color: #374151 !important;
          border: 1px solid #e5e7eb !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
        }
        
        /* 用户消息气泡样式 */
        .user-message-bubble {
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%) !important;
          color: white !important;
          margin-left: auto !important;
          margin-right: 1rem !important;
          border-radius: 1.25rem 1.25rem 0.5rem 1.25rem !important;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25) !important;
          max-width: 360px !important;
          border: none !important;
        }
        
        /* 用户消息气泡尾巴 */
        .user-message-bubble::after {
          content: '';
          position: absolute;
          bottom: 0;
          right: -8px;
          width: 0;
          height: 0;
          border: 8px solid transparent;
          border-left-color: #1d4ed8;
          border-bottom: none;
        }
        
        /* AI助手消息气泡样式 */
        .ai-message-bubble {
          background: white !important;
          color: #374151 !important;
          margin-right: auto !important;
          margin-left: 1rem !important;
          border: 1px solid #e5e7eb !important;
          border-radius: 1.25rem 1.25rem 1.25rem 0.5rem !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
          max-width: 400px !important;
        }
        
        /* AI助手消息气泡尾巴 */
        .ai-message-bubble::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: -8px;
          width: 0;
          height: 0;
          border: 8px solid transparent;
          border-right-color: white;
          border-bottom: none;
        }
        
        /* 强制覆盖任何默认样式 */
        .copilotKitMessages * {
          box-sizing: border-box;
        }
        
        /* 确保消息文本样式 */
        .user-message-bubble p,
        .ai-message-bubble p,
        .user-message-bubble span,
        .ai-message-bubble span {
          margin: 0 !important;
          padding: 0 !important;
          color: inherit !important;
        }
        
        /* 列表样式 */
        .user-message-bubble ul,
        .ai-message-bubble ul,
        .user-message-bubble ol,
        .ai-message-bubble ol {
          margin: 0.5rem 0 !important;
          padding-left: 1rem !important;
        }
        
        .user-message-bubble li,
        .ai-message-bubble li {
          margin: 0.25rem 0 !important;
        }
        
        /* 输入区域样式 */
        .copilotKitInput {
          border-top: 1px solid #e5e7eb !important;
          background: white !important;
          padding: 1.25rem !important;
          flex-shrink: 0 !important;
          box-shadow: 0 -4px 8px rgba(0, 0, 0, 0.05) !important;
        }
        
        .copilotKitInputTextarea {
          border: 2px solid #e5e7eb !important;
          border-radius: 1rem !important;
          padding: 0.875rem 1.125rem !important;
          font-size: 0.9rem !important;
          resize: none !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
          background: #f9fafb !important;
          min-height: 44px !important;
          max-height: 120px !important;
        }
        
        .copilotKitInputTextarea:focus {
          outline: none !important;
          border-color: #3b82f6 !important;
          background: white !important;
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1), 0 1px 3px rgba(0, 0, 0, 0.1) !important;
          transform: translateY(-1px) !important;
        }
        
        .copilotKitInputTextarea::placeholder {
          color: #9ca3af !important;
          font-size: 0.875rem !important;
        }
        
        /* 发送按钮样式 */
        .copilotKitInputButton {
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%) !important;
          color: white !important;
          border: none !important;
          border-radius: 0.75rem !important;
          padding: 0.75rem 1rem !important;
          font-size: 0.875rem !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
          box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2) !important;
          margin-left: 0.75rem !important;
        }
        
        .copilotKitInputButton:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3) !important;
        }
        
        .copilotKitInputButton:active {
          transform: translateY(0) !important;
        }
        
        .copilotKitInputButton:disabled {
          opacity: 0.6 !important;
          cursor: not-allowed !important;
          transform: none !important;
          box-shadow: 0 2px 4px rgba(59, 130, 246, 0.1) !important;
        }
        
        /* 品牌标识样式 */
        .poweredBy {
          color: #9ca3af !important;
          font-size: 0.75rem !important;
          background: #f9fafb !important;
          border-top: 1px solid #f3f4f6 !important;
        }
        
        /* 分隔线居中 */
        .copilotKitChat hr,
        .copilotKitChat div[class*="divider"],
        .copilotKitChat div[class*="separator"] {
          margin: 3rem 3rem !important;
          width: 60% !important;
          border-color: #e5e7eb !important;
        }
        
        /* 响应式设计 */
        @media (max-width: 768px) {
          .user-message-bubble {
            margin-right: 0.75rem !important;
            max-width: 280px !important;
          }
          
          .ai-message-bubble {
            margin-left: 0.75rem !important;
            max-width: 300px !important;
          }
          
          .copilotKitMessages {
            padding: 1rem !important;
          }
        }
        
        /* 加载状态动画 */
        .copilotKitTyping {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 0.5rem 0;
        }
        
        .copilotKitTyping::after {
          content: '';
          display: inline-block;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #94a3b8;
          animation: typingDot 1.4s ease-in-out infinite both;
        }
        
        @keyframes typingDot {
          0%, 80%, 100% {
            transform: scale(0);
            opacity: 0.5;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
      
      <CopilotChat
        labels={{
          title: "Goal Mate AI助手",
          initial: "你好！我是你的AI助手，可以帮你管理目标、制定计划、跟踪进度。\n\n试试说：\n• 我想看看有什么轻松的任务可以做\n• 帮我创建一个读书目标\n• 更新我的学习进度",
          placeholder: "输入你的问题或指令...",
        }}
        className="h-full w-full"
      />
    </div>
  );
} 