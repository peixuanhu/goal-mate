"use client"

import * as React from "react"
import { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import { Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"

interface MarkdownPreviewProps {
  content: string
  className?: string
  maxLines?: number
  showToggle?: boolean
}

export function MarkdownPreview({ 
  content, 
  className,
  maxLines = 3,
  showToggle = true
}: MarkdownPreviewProps) {
  const [showRendered, setShowRendered] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  if (!content) {
    return <span className="text-gray-400 dark:text-gray-600 italic">-</span>
  }

  const lines = content.split('\n')
  const shouldTruncate = lines.length > maxLines && !isExpanded
  const displayContent = shouldTruncate 
    ? lines.slice(0, maxLines).join('\n') + '\n...'
    : content

  return (
    <div className={cn("relative", className)}>
      {showToggle && (
        <div className="absolute top-0 right-0 z-10">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowRendered(!showRendered)}
            className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
            title={showRendered ? "Show raw text" : "Show rendered markdown"}
          >
            {showRendered ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </Button>
        </div>
      )}
      
      {showRendered ? (
        <div 
          className={cn(
            "prose prose-sm dark:prose-invert max-w-none",
            "prose-headings:font-semibold prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-headings:text-sm",
            "prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:my-1",
            "prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-a:text-xs",
            "prose-strong:text-gray-900 dark:prose-strong:text-gray-100",
            "prose-code:text-pink-600 dark:prose-code:text-pink-400 prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[10px]",
            "prose-pre:bg-gray-900 dark:prose-pre:bg-gray-950 prose-pre:text-gray-100 prose-pre:p-2 prose-pre:rounded prose-pre:text-xs prose-pre:my-1",
            "prose-blockquote:border-l-4 prose-blockquote:border-gray-300 dark:prose-blockquote:border-gray-600 prose-blockquote:pl-4 prose-blockquote:py-1 prose-blockquote:italic prose-blockquote:text-gray-600 dark:prose-blockquote:text-gray-400 prose-blockquote:my-2 prose-blockquote:bg-gray-50 dark:prose-blockquote:bg-gray-800/50 prose-blockquote:rounded-r",
            "prose-ul:list-disc prose-ul:pl-4 prose-ol:list-decimal prose-ol:pl-4 prose-li:my-0",
            "prose-li:marker:text-gray-400",
            "prose-table:border-collapse prose-table:w-full prose-table:text-xs",
            "prose-th:border prose-th:border-gray-200 dark:prose-th:border-gray-700 prose-th:p-1 prose-th:bg-gray-50 dark:prose-th:bg-gray-800 prose-th:font-semibold",
            "prose-td:border prose-td:border-gray-200 dark:prose-td:border-gray-700 prose-td:p-1",
            "prose-hr:border-gray-200 dark:prose-hr:border-gray-700"
          )}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {displayContent}
          </ReactMarkdown>
        </div>
      ) : (
        <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-mono text-xs leading-relaxed">
          {displayContent}
        </div>
      )}
      
      {lines.length > maxLines && showToggle && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-6 px-2 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 mt-1"
        >
          {isExpanded ? "收起" : `展开全部 (${lines.length} 行)`}
        </Button>
      )}
    </div>
  )
}

export default MarkdownPreview
