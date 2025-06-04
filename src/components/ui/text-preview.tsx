"use client"

import { useState, useRef, useEffect } from 'react'
import { Button } from "./button"
import { Card, CardContent } from "./card"

interface TextPreviewProps {
  text: string
  maxLength?: number
  className?: string
  truncateLines?: number
}

export function TextPreview({ 
  text, 
  maxLength = 100, 
  className = "",
  truncateLines = 2
}: TextPreviewProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0, showAbove: false })
  const [copied, setCopied] = useState(false)
  const targetRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 改进截断逻辑 - 只要文本存在且长度超过maxLength就显示hover
  const shouldTruncate = text && text.length > maxLength
  const displayText = shouldTruncate ? text.substring(0, maxLength) + '...' : text

  const handleMouseEnter = (e: React.MouseEvent) => {
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
      const tooltipHeight = 250 // 估算气泡高度
      const tooltipWidth = 400
      const spaceAbove = rect.top
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceRight = window.innerWidth - rect.left
      
      // 决定气泡显示在上方还是下方
      const showAbove = spaceBelow < tooltipHeight && spaceAbove > tooltipHeight
      
      // 决定水平位置
      let leftPosition = rect.left
      if (spaceRight < tooltipWidth) {
        leftPosition = window.innerWidth - tooltipWidth - 20
      }
      
      setTooltipPosition({
        top: showAbove ? rect.top : rect.bottom + 10,
        left: Math.max(10, leftPosition), // 确保不超出左边界
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
      if (urlRegex.test(part)) {
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
          className={`break-words ${shouldTruncate ? 'line-clamp-' + truncateLines : ''}`}
          style={{
            display: shouldTruncate ? '-webkit-box' : 'block',
            WebkitLineClamp: shouldTruncate ? truncateLines : 'unset',
            WebkitBoxOrient: shouldTruncate ? 'vertical' : 'unset',
            overflow: shouldTruncate ? 'hidden' : 'visible'
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
          className="fixed z-50 max-w-md min-w-80"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            transform: tooltipPosition.showAbove ? 'translateY(-100%)' : 'translateY(0)'
          }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        >
          <Card className="shadow-xl border-2 bg-white dark:bg-gray-900">
            <CardContent className="p-4">
              <div className="max-h-48 overflow-y-auto text-sm break-words whitespace-pre-wrap">
                {renderTextWithLinks(text)}
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  className="text-xs h-7 flex-shrink-0"
                >
                  {copied ? '✓ 已复制!' : '📋 复制'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowTooltip(false)}
                  className="text-xs h-7 flex-shrink-0"
                >
                  ✕ 关闭
                </Button>
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center ml-auto">
                  {text.length} 字符
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
} 