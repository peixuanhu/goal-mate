"use client"

import { useState, useRef, useEffect } from 'react'
import { Button } from "./button"
import { Copy, X, Check } from "lucide-react"

interface TextPreviewProps {
  text: string
  maxLength?: number
  className?: string
  truncateLines?: number
  forceClamp?: boolean
}

export function TextPreview({ 
  text, 
  maxLength = 100, 
  className = "",
  truncateLines = 2,
  forceClamp = false
}: TextPreviewProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0, width: 400, showAbove: false })
  const [copied, setCopied] = useState(false)
  const targetRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 改进截断逻辑 - 只要文本存在且长度超过maxLength就显示hover
  const shouldTruncate = text && text.length > maxLength
  const shouldClamp = forceClamp || shouldTruncate
  const displayText = shouldTruncate ? text.substring(0, maxLength) + '...' : text

  const handleMouseEnter = () => {
    // 清除所有延迟
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current)
      showTimeoutRef.current = null
    }
    
    // 只要有文本内容就可以hover，不仅仅是截断的
    if (!text || text.length === 0) return
    
    // 增加进入延迟，减少误触发
    showTimeoutRef.current = setTimeout(() => {
      if (!targetRef.current) return // 确保元素仍然存在
      
      const rect = targetRef.current.getBoundingClientRect()
      const tooltipHeight = Math.min(window.innerHeight * 0.6, 384)
      const tooltipWidth = Math.min(460, window.innerWidth - 32)
      const spaceAbove = rect.top
      const spaceBelow = window.innerHeight - rect.bottom
      
      // 决定气泡显示在上方还是下方
      const showAbove = spaceBelow < tooltipHeight && spaceAbove > tooltipHeight
      
      // 决定水平位置
      const preferredLeft = rect.left + rect.width / 2 - tooltipWidth / 2
      const leftPosition = Math.min(
        Math.max(16, preferredLeft),
        window.innerWidth - tooltipWidth - 16
      )
      
      setTooltipPosition({
        top: showAbove ? rect.top : rect.bottom + 10,
        left: leftPosition,
        width: tooltipWidth,
        showAbove: showAbove
      })
      setShowTooltip(true)
      showTimeoutRef.current = null
    }, 300) // 添加300ms延迟
  }

  const handleMouseLeave = () => {
    // 清除显示延迟
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current)
      showTimeoutRef.current = null
    }
    
    // 减少延迟时间，给用户足够时间移动到气泡框但不会太久
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false)
    }, 500) // 从800ms减少到500ms
  }

  const handleTooltipMouseEnter = () => {
    // 鼠标进入气泡框时清除隐藏延迟
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    setShowTooltip(true)
  }

  const handleTooltipMouseLeave = () => {
    // 鼠标离开气泡框时添加较短延迟
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false)
    }, 200) // 从300ms减少到200ms
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  // 检测并处理链接
  const renderTextWithLinks = (text: string) => {
    if (!text) return null
    
    // URL 正则表达式 - 改进版本
    const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g
    const parts = text.split(urlRegex)
    
    return parts.map((part, index) => {
      if (/^https?:\/\/[^\s<>"{}|\\^`[\]]+$/.test(part)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-700 underline break-all inline"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        )
      }
      return <span key={index}>{part}</span>
    })
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node) &&
          targetRef.current && !targetRef.current.contains(event.target as Node)) {
        setShowTooltip(false)
      }
    }

    if (showTooltip) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      // 清理所有定时器
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
      if (showTimeoutRef.current) {
        clearTimeout(showTimeoutRef.current)
      }
    }
  }, [showTooltip])

  if (!text || text.trim() === '') {
    return <span className={`text-gray-400 dark:text-gray-500 ${className}`}>暂无内容</span>
  }

  return (
    <>
      <div
        ref={targetRef}
        className={`relative cursor-pointer ${className} hover:bg-gray-50 dark:hover:bg-gray-800 rounded p-1 transition-colors`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div 
          className={`break-words ${shouldClamp ? 'line-clamp-' + truncateLines : ''}`}
          style={{
            display: shouldClamp ? '-webkit-box' : 'block',
            WebkitLineClamp: shouldClamp ? truncateLines : 'unset',
            WebkitBoxOrient: shouldClamp ? 'vertical' : 'unset',
            overflow: shouldClamp ? 'hidden' : 'visible'
          }}
        >
          {renderTextWithLinks(displayText)}
        </div>
        {shouldTruncate && (
          <span className="text-blue-500 text-xs ml-1 hover:text-blue-700 inline-block">
            ···
          </span>
        )}
      </div>

      {/* 气泡框 */}
      {showTooltip && (
        <div
          ref={tooltipRef}
          role="dialog"
          aria-label="完整描述"
          className="fixed z-50"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            width: tooltipPosition.width,
            transform: tooltipPosition.showAbove ? 'translateY(-100%)' : 'translateY(0)'
          }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        >
          <div className="overflow-hidden rounded-lg border border-gray-200/80 bg-white/[0.98] shadow-[0_18px_50px_rgba(15,23,42,0.18)] ring-1 ring-black/5 backdrop-blur-md dark:border-gray-700/80 dark:bg-gray-950/[0.98] dark:shadow-[0_18px_50px_rgba(0,0,0,0.42)]">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">完整描述</div>
                <div className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{text.length} 字符</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleCopy}
                  className={`h-8 w-8 p-0 transition-colors ${
                    copied
                      ? 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                  }`}
                  aria-label={copied ? "已复制" : "复制完整描述"}
                  title={copied ? "已复制" : "复制"}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowTooltip(false)}
                  className="h-8 w-8 p-0 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  aria-label="关闭完整描述"
                  title="关闭"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="max-h-[min(60vh,24rem)] overflow-y-auto px-4 py-3 text-sm leading-6 text-gray-700 dark:text-gray-200">
              <div className="break-words whitespace-pre-wrap">
                {renderTextWithLinks(text)}
              </div>
            </div>
          </div>
          
          {/* 箭头指示器 */}
          <div 
            className={`absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-gray-200/80 bg-white dark:border-gray-700/80 dark:bg-gray-950 ${
              tooltipPosition.showAbove 
                ? 'bottom-0 translate-y-1/2 border-r border-b'
                : 'top-0 -translate-y-1/2 border-l border-t'
            }`}
          />
        </div>
      )}
    </>
  )
}
