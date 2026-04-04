"use client";

import { CopilotChat } from "@copilotkit/react-ui";
import { useEffect, useState } from "react";
import { CopilotClearingInput } from "./copilot-clearing-input";

// 预设问题列表
const PRESET_QUESTIONS = [
  "给我推荐3个适合现在开始做的任务",
  "根据我的读书计划，给我推荐几本书",
  "帮我分析本周的任务完成情况",
  "为我制定一个下周的学习计划"
];

export function ChatWrapper() {
  const [mounted, setMounted] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [showPrompts, setShowPrompts] = useState(true);
  const [hasSentMessage, setHasSentMessage] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsClient(typeof window !== 'undefined');
  }, []);

  // Monitor messages to detect when user has sent a message
  useEffect(() => {
    if (!mounted || !isClient) return;

    const observer = new MutationObserver(() => {
      const userMessages = document.querySelectorAll('.copilotKitUserMessage');
      if (userMessages.length > 0 && !hasSentMessage) {
        setHasSentMessage(true);
        setShowPrompts(false);
      }
    });

    const messagesContainer = document.querySelector(".copilotKitMessagesContainer");
    if (messagesContainer) {
      observer.observe(messagesContainer, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      observer.disconnect();
    };
  }, [mounted, isClient, hasSentMessage]);

  // 动态美化聊天消息的函数
  useEffect(() => {
    if (!mounted || !isClient) return;

    // 修复 hydration 错误的函数
    const fixHydrationIssues = () => {
      // 查找所有可能导致 hydration 错误的元素
      const problematicElements = document.querySelectorAll('p > div, p > pre, p > blockquote, p > ul, p > ol, p > table');
      
      problematicElements.forEach((element) => {
        const parent = element.parentElement;
        if (parent && parent.tagName.toLowerCase() === 'p') {
          // 为问题元素添加特殊样式类
          element.classList.add('markdown-block-fix');
          parent.classList.add('markdown-paragraph-fix');
        }
      });
    };

    fixHydrationIssues();

    const observer = new MutationObserver(() => {
      setTimeout(() => {
        fixHydrationIssues();
      }, 100);
    });

    const messagesContainer = document.querySelector(".copilotKitMessagesContainer");
    if (messagesContainer) {
      observer.observe(messagesContainer, {
        childList: true,
        subtree: true,
      });
    }

    const interval = setInterval(() => {
      fixHydrationIssues();
    }, 2000);

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

  // 处理预设问题点击 - 通过 CopilotClearingInput 暴露的方法
  const handlePresetQuestion = (question: string) => {
    // 使用 CopilotClearingInput 暴露的全局方法
    const copilotSend = (window as any).__copilotSend;
    if (copilotSend) {
      copilotSend(question);
    } else {
      console.error('Copilot send function not available');
    }
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden" suppressHydrationWarning>
      <style jsx global>{`
        /* 确保聊天容器的高度和滚动行为 */
        .copilotKitChat {
          height: 100% !important;
          display: flex !important;
          flex-direction: column !important;
          background: transparent;
          border: none;
          overflow: hidden !important;
          /* CopilotKit 默认样式依赖这些变量；未设置时用户气泡可能透明或异常 */
          --copilot-kit-primary-color: #2563eb;
          --copilot-kit-contrast-color: #ffffff;
          --copilot-kit-secondary-contrast-color: #1e293b;
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
        
        .copilotKitMessagesContainer {
          display: flex !important;
          flex-direction: column !important;
          gap: 1rem !important;
          width: 100% !important;
          align-items: stretch !important;
        }
        
        .copilotKitMessages footer.copilotKitMessagesFooter {
          width: 100% !important;
        }
        
        /* 气泡入场：只用 opacity + 位移，避免 scale 与 fill-mode:both 导致偶发停在 opacity:0 */
        .copilotKitUserMessage,
        .copilotKitAssistantMessage {
          animation: messageSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        
        @keyframes messageSlideIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @media (prefers-reduced-motion: reduce) {
          .copilotKitUserMessage,
          .copilotKitAssistantMessage {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
        
        /* 用户消息气泡：四角统一圆角，去掉伪元素尾巴，避免右下角缺口/尖角 */
        .copilotKitMessage.copilotKitUserMessage,
        .copilotKitUserMessage {
          align-self: flex-end !important;
          width: fit-content !important;
          max-width: min(420px, 88vw) !important;
          flex-shrink: 0 !important;
          margin-left: auto !important;
          margin-bottom: 0.25rem !important;
          padding: 0.75rem 1.1rem !important;
          border-radius: 1.125rem !important;
          background: linear-gradient(145deg, #3b82f6 0%, #2563eb 45%, #1d4ed8 100%) !important;
          color: #fff !important;
          font-size: 0.9rem !important;
          line-height: 1.55 !important;
          overflow-wrap: anywhere !important;
          word-break: break-word !important;
          white-space: normal !important;
          position: relative !important;
          overflow: visible !important;
          visibility: visible !important;
          opacity: 1 !important;
          box-shadow:
            0 4px 6px -1px rgba(37, 99, 235, 0.35),
            0 2px 4px -2px rgba(30, 64, 175, 0.25) !important;
          border: 1px solid rgba(255, 255, 255, 0.14) !important;
          box-decoration-break: clone !important;
          -webkit-box-decoration-break: clone !important;
        }
        
        /* 助手消息气泡 */
        .copilotKitMessage.copilotKitAssistantMessage,
        .copilotKitAssistantMessage {
          align-self: flex-start !important;
          width: fit-content !important;
          max-width: min(440px, 92vw) !important;
          flex-shrink: 0 !important;
          margin-right: auto !important;
          padding: 0.85rem 1.15rem !important;
          border-radius: 1.125rem !important;
          background: rgba(255, 255, 255, 0.92) !important;
          color: #1e293b !important;
          font-size: 0.9rem !important;
          line-height: 1.55 !important;
          overflow-wrap: anywhere !important;
          word-wrap: break-word !important;
          white-space: normal !important;
          position: relative !important;
          overflow: visible !important;
          border: 1px solid rgba(148, 163, 184, 0.35) !important;
          box-shadow:
            0 4px 6px -1px rgba(15, 23, 42, 0.06),
            0 2px 4px -2px rgba(15, 23, 42, 0.05),
            inset 0 1px 0 0 rgba(255, 255, 255, 0.8) !important;
          backdrop-filter: blur(8px) !important;
        }
        
        .dark .copilotKitAssistantMessage {
          background: rgba(30, 41, 59, 0.85) !important;
          color: #e2e8f0 !important;
          border-color: rgba(71, 85, 105, 0.5) !important;
          box-shadow:
            0 4px 6px -1px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 0 rgba(148, 163, 184, 0.08) !important;
        }
        
        /* 助手消息内操作按钮 */
        .copilotKitAssistantMessage .copilotKitMessageControls {
          display: flex !important;
          flex-wrap: wrap !important;
          gap: 0.35rem !important;
          margin-top: 0.65rem !important;
          padding-top: 0.5rem !important;
          border-top: 1px solid rgba(148, 163, 184, 0.25) !important;
        }
        
        .copilotKitAssistantMessage .copilotKitMessageControlButton {
          background: rgba(241, 245, 249, 0.9) !important;
          color: #475569 !important;
          border: 1px solid rgba(148, 163, 184, 0.4) !important;
          border-radius: 0.5rem !important;
          padding: 0.35rem 0.55rem !important;
          min-height: auto !important;
          font-size: 0 !important;
        }
        
        .copilotKitAssistantMessage .copilotKitMessageControlButton:hover {
          background: #e2e8f0 !important;
        }
        
        .dark .copilotKitAssistantMessage .copilotKitMessageControlButton {
          background: rgba(51, 65, 85, 0.8) !important;
          color: #cbd5e1 !important;
          border-color: rgba(71, 85, 105, 0.6) !important;
        }
        
        /* === Markdown 样式增强 === */
        
        /* 修复 hydration 错误 - 确保 p 元素内的 div 正确显示 */
        .copilotKitMarkdownElement p {
          display: block !important;
        }
        
        .copilotKitMarkdownElement p > div {
          display: block !important;
          margin: 0.5rem 0 !important;
        }
        
        /* 代码块容器修复 */
        .copilotKitCodeBlockContainer,
        .copilotKitCodeBlock {
          display: block !important;
          margin: 0.75rem 0 !important;
        }
        
        /* 工具栏按钮容器 */
        .copilotKitCodeBlockToolbarButtons {
          display: flex !important;
          justify-content: flex-end !important;
          margin-bottom: 0.5rem !important;
        }
        
        /* 全局修复 - 防止 div 在 p 内部导致的 hydration 错误 */
        .copilotKitMessages p {
          display: block !important;
          overflow: visible !important;
        }
        
        .copilotKitMessages p > * {
          display: inline !important;
        }
        
        .copilotKitMessages p > div,
        .copilotKitMessages p > pre,
        .copilotKitMessages p > blockquote,
        .copilotKitMessages p > ul,
        .copilotKitMessages p > ol,
        .copilotKitMessages p > table {
          display: block !important;
          margin: 0.5rem 0 !important;
        }
        
        /* 确保代码块正确渲染 */
        .copilotKitMessages code {
          display: inline !important;
        }
        
        .copilotKitMessages pre {
          display: block !important;
        }
        
        .copilotKitMessages pre code {
          display: block !important;
        }
        
        /* 修复特定的 CopilotKit 组件 */
        .copilotKit-markdown,
        .copilotKitMarkdown,
        .copilotKitMarkdownElement {
          display: block !important;
        }
        
        .copilotKit-markdown p,
        .copilotKitMarkdown p,
        .copilotKitMarkdownElement p {
          display: block !important;
          margin: 0.35rem 0 !important;
        }
        
        .copilotKit-markdown p:first-child,
        .copilotKitMarkdown p:first-child,
        .copilotKitMarkdownElement p:first-child {
          margin-top: 0 !important;
        }
        
        .copilotKit-markdown p:last-child,
        .copilotKitMarkdown p:last-child,
        .copilotKitMarkdownElement p:last-child {
          margin-bottom: 0 !important;
        }
        
        /* 强制所有嵌套元素正确显示 */
        .copilotKitMessages * {
          box-sizing: border-box !important;
        }
        
        /* Hydration 错误修复样式 */
        .markdown-paragraph-fix {
          display: block !important;
          overflow: visible !important;
        }
        
        .markdown-block-fix {
          display: block !important;
          margin: 0.5rem 0 !important;
          clear: both !important;
        }
        
        /* 特殊处理代码块 */
        .markdown-paragraph-fix > .markdown-block-fix[class*="code"],
        .markdown-paragraph-fix > .markdown-block-fix pre {
          background: #f9fafb !important;
          border: 1px solid #e5e7eb !important;
          border-radius: 0.5rem !important;
          padding: 1rem !important;
          font-family: 'Courier New', monospace !important;
        }
        
        /* 确保内联元素正确显示 */
        .markdown-paragraph-fix > span,
        .markdown-paragraph-fix > code:not(.markdown-block-fix),
        .markdown-paragraph-fix > strong,
        .markdown-paragraph-fix > em,
        .markdown-paragraph-fix > a {
          display: inline !important;
        }
        
        /* Markdown 标题样式 */
        .copilotKitAssistantMessage h1,
        .copilotKitAssistantMessage h2,
        .copilotKitAssistantMessage h3,
        .copilotKitAssistantMessage h4,
        .copilotKitAssistantMessage h5,
        .copilotKitAssistantMessage h6 {
          font-weight: 600 !important;
          margin: 0.2rem 0 0.15rem 0 !important;
          line-height: 1.4 !important;
          color: #1f2937 !important;
        }
        
        /* 消息中的第一个标题无顶部间距 */
        .copilotKitAssistantMessage h1:first-child,
        .copilotKitAssistantMessage h2:first-child,
        .copilotKitAssistantMessage h3:first-child,
        .copilotKitAssistantMessage h4:first-child,
        .copilotKitAssistantMessage h5:first-child,
        .copilotKitAssistantMessage h6:first-child {
          margin-top: 0 !important;
        }
        
        .copilotKitAssistantMessage h1 { font-size: 1.5rem !important; }
        .copilotKitAssistantMessage h2 { font-size: 1.3rem !important; }
        .copilotKitAssistantMessage h3 { font-size: 1.1rem !important; }
        .copilotKitAssistantMessage h4 { font-size: 1rem !important; }
        
        /* Markdown 列表样式 */
        .copilotKitAssistantMessage ul,
        .copilotKitAssistantMessage ol {
          margin: 0.2rem 0 !important;
          padding-left: 1.5rem !important;
        }
        
        .copilotKitAssistantMessage li {
          margin: 0.15rem 0 !important;
          line-height: 1.5 !important;
        }
        
        .copilotKitAssistantMessage ul li {
          list-style-type: disc !important;
        }
        
        .copilotKitAssistantMessage ol li {
          list-style-type: decimal !important;
        }
        
        /* Markdown 段落样式 */
        .copilotKitAssistantMessage p {
          margin: 0.1rem 0 !important;
          line-height: 1.5 !important;
        }
        
        /* 移除第一个段落的顶部间距 */
        .copilotKitAssistantMessage p:first-child {
          margin-top: 0 !important;
        }
        
        /* 移除最后一个段落的底部间距 */
        .copilotKitAssistantMessage p:last-child {
          margin-bottom: 0 !important;
        }
        
        /* Markdown 粗体和斜体 */
        .copilotKitAssistantMessage strong {
          font-weight: 600 !important;
          color: #1f2937 !important;
        }
        
        .copilotKitAssistantMessage em {
          font-style: italic !important;
        }
        
        /* Markdown 代码样式 */
        .copilotKitAssistantMessage code {
          background: #f3f4f6 !important;
          padding: 0.125rem 0.25rem !important;
          border-radius: 0.25rem !important;
          font-family: 'Courier New', monospace !important;
          font-size: 0.85rem !important;
          color: #dc2626 !important;
        }
        
        .copilotKitAssistantMessage pre {
          background: #f9fafb !important;
          border: 1px solid #e5e7eb !important;
          border-radius: 0.5rem !important;
          padding: 0.75rem !important;
          margin: 0.5rem 0 !important;
          overflow-x: auto !important;
        }
        
        .copilotKitAssistantMessage pre code {
          background: transparent !important;
          padding: 0 !important;
          color: #374151 !important;
        }
        
        /* Markdown 链接样式 */
        .copilotKitAssistantMessage a {
          color: #2563eb !important;
          text-decoration: underline !important;
        }
        
        .copilotKitAssistantMessage a:hover {
          color: #1d4ed8 !important;
        }
        
        /* Markdown 分割线 */
        .copilotKitAssistantMessage hr {
          border: none !important;
          border-top: 1px solid #e5e7eb !important;
          margin: 0.75rem 0 !important;
        }
        
        /* Markdown 引用块 */
        .copilotKitAssistantMessage blockquote {
          border-left: 4px solid #3b82f6 !important;
          background: #f8fafc !important;
          margin: 0.5rem 0 !important;
          padding: 0.5rem 0.75rem !important;
          font-style: italic !important;
        }
        
        /* Markdown 表格样式 */
        .copilotKitAssistantMessage table {
          border-collapse: collapse !important;
          width: 100% !important;
          margin: 0.35rem 0 !important;
          font-size: 0.875rem !important;
        }
        
        .copilotKitAssistantMessage th,
        .copilotKitAssistantMessage td {
          border: 1px solid #e5e7eb !important;
          padding: 0.5rem !important;
          text-align: left !important;
        }
        
        .copilotKitAssistantMessage th {
          background: #f9fafb !important;
          font-weight: 600 !important;
        }
        
        /* 特殊表情符号样式 */
        .copilotKitAssistantMessage h2:first-child {
          margin-top: 0 !important;
        }
        
        /* 强制覆盖任何默认样式 */
        .copilotKitMessages * {
          box-sizing: border-box;
        }
        
        /* 确保消息文本样式 */
        .copilotKitUserMessage p,
        .copilotKitAssistantMessage p,
        .copilotKitUserMessage span,
        .copilotKitAssistantMessage span {
          color: inherit !important;
        }
        
        /* 用户消息中的 markdown 样式（白色主题） */
        .copilotKitUserMessage h1,
        .copilotKitUserMessage h2,
        .copilotKitUserMessage h3,
        .copilotKitUserMessage h4,
        .copilotKitUserMessage h5,
        .copilotKitUserMessage h6,
        .copilotKitUserMessage strong {
          color: white !important;
        }
        
        .copilotKitUserMessage code {
          background: rgba(255, 255, 255, 0.2) !important;
          color: white !important;
        }
        
        .copilotKitUserMessage blockquote {
          border-left-color: rgba(255, 255, 255, 0.5) !important;
          background: rgba(255, 255, 255, 0.1) !important;
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
          .copilotKitMessage.copilotKitUserMessage,
          .copilotKitUserMessage {
            max-width: min(300px, 90vw) !important;
          }
          
          .copilotKitMessage.copilotKitAssistantMessage,
          .copilotKitAssistantMessage {
            max-width: min(320px, 92vw) !important;
          }
          
          .copilotKitMessages {
            padding: 0.875rem 0.75rem !important;
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
      
      {/* 预设问题区域 - 可折叠 */}
      {showPrompts && (
        <div className="px-4 py-3 bg-gradient-to-b from-gray-50 to-white border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">快速提问</span>
            </div>
            <button
              onClick={() => setShowPrompts(false)}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              收起
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESET_QUESTIONS.map((question, index) => (
              <button
                key={index}
                onClick={() => handlePresetQuestion(question)}
                className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-full hover:bg-blue-50 hover:border-blue-400 hover:text-blue-600 transition-all duration-200 shadow-sm hover:shadow text-gray-700 cursor-pointer"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 展开快速提问的按钮 */}
      {!showPrompts && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <button
            onClick={() => setShowPrompts(true)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            显示快速提问
          </button>
        </div>
      )}

      <CopilotChat
        labels={{
          title: "Goal Mate AI助手",
          initial: "你好！我是你的AI助手，可以帮你管理目标、制定计划、跟踪进度。\n\n**🎯 智能工作流程**：\n\n• \"我想了解《深入理解计算机系统》这本书\"\n\n• \"我想提高编程能力\"（创建目标）\n\n• \"我想读完CSAPP这本书\"（创建计划）",
          placeholder: "输入你问题或指令...",
        }}
        className="h-full w-full"
        Input={CopilotClearingInput}
      />
    </div>
  );
} 