"use client"

import { CopilotChat } from "@copilotkit/react-ui"
import { ChevronDown, HelpCircle, Sparkles } from "lucide-react"
import React, { useEffect, useRef, useState } from "react"

import { CopilotClearingInput } from "./copilot-clearing-input"
import styles from "./chat-wrapper.module.css"

const PRESET_QUESTIONS = [
  "给我推荐3个适合现在开始做的任务",
  "根据我的读书计划，给我推荐几本书",
  "帮我分析本周的任务完成情况",
  "为我制定一个下周的学习计划",
]

export function ChatWrapper() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [showPrompts, setShowPrompts] = useState(true)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    const messages = rootRef.current?.querySelector(".copilotKitMessagesContainer")
    if (!messages) return

    const hidePromptsAfterUserMessage = () => {
      if (messages.querySelector(".copilotKitUserMessage")) setShowPrompts(false)
    }

    hidePromptsAfterUserMessage()
    const observer = new MutationObserver(hidePromptsAfterUserMessage)
    observer.observe(messages, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [mounted])

  function sendPreset(question: string) {
    if (window.__copilotSend) {
      window.__copilotSend(question)
      setShowPrompts(false)
    }
  }

  if (!mounted || typeof navigator === "undefined") {
    return (
      <div className={styles.loading} role="status">
        <Sparkles aria-hidden="true" className="h-5 w-5 animate-pulse text-violet-500" />
        <span>正在准备 AI 助手…</span>
      </div>
    )
  }

  return (
    <div className={styles.root} data-testid="goal-mate-chat" ref={rootRef} suppressHydrationWarning>
      {showPrompts ? (
        <section aria-label="快速提问" className={styles.prompts}>
          <div className={styles.promptHeader}>
            <span className={styles.promptTitle}>
              <HelpCircle aria-hidden="true" className="h-4 w-4 text-violet-500" />
              快速提问
            </span>
            <button className={styles.promptToggle} onClick={() => setShowPrompts(false)} type="button">
              收起
            </button>
          </div>
          <div className={styles.promptScroller}>
            {PRESET_QUESTIONS.map(question => (
              <button className={styles.promptChip} key={question} onClick={() => sendPreset(question)} type="button">
                {question}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className={styles.collapsedPrompts}>
          <button className={styles.promptToggle} onClick={() => setShowPrompts(true)} type="button">
            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
            显示快速提问
          </button>
        </div>
      )}

      <div className={styles.chat}>
        <CopilotChat
          className="h-full w-full"
          Input={CopilotClearingInput}
          labels={{
            title: "Goal Mate AI 助手",
            initial: "你好，我会结合你的目标和计划，帮你找到清晰、可执行的下一步。\n\n你可以从上面的快速问题开始，也可以直接告诉我现在最想推进的事情。",
            placeholder: "问问目标、计划或下一步…",
          }}
        />
      </div>
    </div>
  )
}
