"use client"

import { useState, useRef, useEffect } from 'react'
import { Button } from "./button"
import { Card, CardContent } from "./card"
import { Copy, X, Check } from "lucide-react"

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
          className="fixed z-50 max-w-sm min-w-72"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            transform: tooltipPosition.showAbove ? 'translateY(-100%)' : 'translateY(0)'
          }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        >
          <Card className="shadow-2xl border-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-xl overflow-hidden">
            {/* 顶部装饰条 */}
            <div className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />
            <CardContent className="p-0">
              {/* 内容区域 */}
              <div className="px-4 py-3">
                <div className="max-h-40 overflow-y-auto text-sm text-gray-700 dark:text-gray-200 break-words whitespace-pre-wrap leading-relaxed scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                  {renderTextWithLinks(text)}
                </div>
              </div>
              
              {/* 底部操作栏 */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50/80 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCopy}
                    className={`h-7 px-2.5 text-xs font-medium transition-all duration-200 rounded-lg ${
                      copied 
                        ? 'text-green-600 bg-green-50 hover:bg-green-100 dark:text-green-400 dark:bg-green-900/20' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1.5" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1.5" />
                        复制
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowTooltip(false)}
                    className="h-7 px-2.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-all duration-200 rounded-lg"
                  >
                    <X className="w-3.5 h-3.5 mr-1.5" />
                    关闭
                  </Button>
                </div>
                <div className="text-[11px] text-gray-400 dark:text-gray-500 font-medium tabular-nums">
                  {text.length} 字符
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* 箭头指示器 */}
          <div 
            className={`absolute left-6 w-3 h-3 bg-white dark:bg-gray-900 transform rotate-45 ${
              tooltipPosition.showAbove 
                ? 'bottom-0 translate-y-1/2 border-r border-b border-gray-200 dark:border-gray-700' 
                : '-top-1.5 -translate-y-1/2 border-l border-t border-gray-200 dark:border-gray-700'
            }`}
            style={{
              boxShadow: tooltipPosition.showAbove 
                ? '2px 2px 4px rgba(0,0,0,0.05)' 
                : '-2px -2px 4px rgba(0,0,0,0.05)'
            }}
          />
        </div>
      )}
    </>
  )
} 