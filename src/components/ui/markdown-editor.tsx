"use client"

import * as React from "react"
import { useState, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Code,
  Link,
  Image,
  Heading1,
  Heading2,
  Heading3,
  CheckSquare,
  Eye,
  Edit3,
  Maximize2,
  Minimize2,
  Strikethrough,
  Table,
  Undo,
  Redo,
} from "lucide-react"

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  minHeight?: string
  maxHeight?: string
  label?: string
  id?: string
  required?: boolean
  disabled?: boolean
}

interface ToolbarButtonProps {
  onClick: () => void
  icon: React.ReactNode
  title: string
  disabled?: boolean
}

const ToolbarButton = ({ onClick, icon, title, disabled }: ToolbarButtonProps) => (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-gray-800"
  >
    {icon}
  </Button>
)

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Enter markdown text...",
  className,
  minHeight = "200px",
  maxHeight = "600px",
  label,
  id,
  required,
  disabled,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [activeTab, setActiveTab] = useState("write")
  const [history, setHistory] = useState<string[]>([value])
  const [historyIndex, setHistoryIndex] = useState(0)

  // Save to history for undo/redo
  const saveToHistory = useCallback((newValue: string) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push(newValue)
      if (newHistory.length > 50) newHistory.shift()
      return newHistory
    })
    setHistoryIndex(prev => Math.min(prev + 1, 49))
  }, [historyIndex])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    onChange(newValue)
    saveToHistory(newValue)
  }

  const insertText = (before: string, after: string = "") => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = value.substring(start, end)
    const newText = value.substring(0, start) + before + selectedText + after + value.substring(end)
    
    onChange(newText)
    saveToHistory(newText)

    // Restore focus and selection
    setTimeout(() => {
      textarea.focus()
      const newCursorPos = start + before.length + selectedText.length
      textarea.setSelectionRange(newCursorPos, newCursorPos)
    }, 0)
  }

  const insertHeading = (level: number) => {
    const prefix = "#".repeat(level) + " "
    insertText(prefix, "")
  }

  const insertList = (ordered: boolean) => {
    const prefix = ordered ? "1. " : "- "
    insertText(prefix, "")
  }

  const insertTaskList = () => {
    insertText("- [ ] ", "")
  }

  const insertQuote = () => {
    insertText("> ", "")
  }

  const insertCode = () => {
    insertText("```\n", "\n```")
  }

  const insertInlineCode = () => {
    insertText("`", "`")
  }

  const insertBold = () => {
    insertText("**", "**")
  }

  const insertItalic = () => {
    insertText("*", "*")
  }

  const insertStrikethrough = () => {
    insertText("~~", "~~")
  }

  const insertLink = () => {
    insertText("[", "](url)")
  }

  const insertImage = () => {
    insertText("![", "](image-url)")
  }

  const insertTable = () => {
    const tableTemplate = "| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |"
    insertText(tableTemplate, "")
  }

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      onChange(history[newIndex])
    }
  }

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      onChange(history[newIndex])
    }
  }

  const toolbarButtons = [
    { icon: <Undo className="h-4 w-4" />, onClick: handleUndo, title: "Undo (Ctrl+Z)" },
    { icon: <Redo className="h-4 w-4" />, onClick: handleRedo, title: "Redo (Ctrl+Y)" },
    { separator: true },
    { icon: <Heading1 className="h-4 w-4" />, onClick: () => insertHeading(1), title: "Heading 1" },
    { icon: <Heading2 className="h-4 w-4" />, onClick: () => insertHeading(2), title: "Heading 2" },
    { icon: <Heading3 className="h-4 w-4" />, onClick: () => insertHeading(3), title: "Heading 3" },
    { separator: true },
    { icon: <Bold className="h-4 w-4" />, onClick: insertBold, title: "Bold" },
    { icon: <Italic className="h-4 w-4" />, onClick: insertItalic, title: "Italic" },
    { icon: <Strikethrough className="h-4 w-4" />, onClick: insertStrikethrough, title: "Strikethrough" },
    { separator: true },
    { icon: <List className="h-4 w-4" />, onClick: () => insertList(false), title: "Bullet List" },
    { icon: <ListOrdered className="h-4 w-4" />, onClick: () => insertList(true), title: "Numbered List" },
    { icon: <CheckSquare className="h-4 w-4" />, onClick: insertTaskList, title: "Task List" },
    { separator: true },
    { icon: <Quote className="h-4 w-4" />, onClick: insertQuote, title: "Quote" },
    { icon: <Code className="h-4 w-4" />, onClick: insertCode, title: "Code Block" },
    { icon: <span className="text-xs font-mono font-bold">{`</>`}</span>, onClick: insertInlineCode, title: "Inline Code" },
    { separator: true },
    { icon: <Link className="h-4 w-4" />, onClick: insertLink, title: "Link" },
    { icon: <Image className="h-4 w-4" />, onClick: insertImage, title: "Image" },
    { icon: <Table className="h-4 w-4" />, onClick: insertTable, title: "Table" },
  ]

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label 
          htmlFor={id} 
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div
        className={cn(
          "rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-950",
          isFullscreen && "fixed inset-0 z-50 rounded-none"
        )}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 px-2">
            <TabsList className="h-10 bg-transparent">
              <TabsTrigger 
                value="write" 
                className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:shadow-sm gap-1.5"
              >
                <Edit3 className="h-4 w-4" />
                Write
              </TabsTrigger>
              <TabsTrigger 
                value="preview" 
                className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:shadow-sm gap-1.5"
              >
                <Eye className="h-4 w-4" />
                Preview
              </TabsTrigger>
            </TabsList>
            
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-gray-800"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-900/30 px-2 py-1">
            {toolbarButtons.map((btn, index) => 
              'separator' in btn ? (
                <div key={index} className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />
              ) : (
                <ToolbarButton
                  key={index}
                  onClick={btn.onClick}
                  icon={btn.icon}
                  title={btn.title}
                  disabled={disabled}
                />
              )
            )}
          </div>

          <TabsContent value="write" className="mt-0">
            <textarea
              ref={textareaRef}
              id={id}
              value={value}
              onChange={handleChange}
              placeholder={placeholder}
              disabled={disabled}
              required={required}
              className={cn(
                "w-full resize-y bg-transparent px-4 py-3 text-sm outline-none",
                "placeholder:text-gray-400 dark:placeholder:text-gray-600",
                "focus:ring-2 focus:ring-inset focus:ring-blue-500/20",
                "font-mono leading-relaxed"
              )}
              style={{ 
                minHeight: isFullscreen ? "calc(100vh - 200px)" : minHeight,
                maxHeight: isFullscreen ? "calc(100vh - 200px)" : maxHeight 
              }}
            />
          </TabsContent>

          <TabsContent value="preview" className="mt-0">
            <div 
              className={cn(
                "w-full overflow-auto px-4 py-3 prose prose-sm dark:prose-invert max-w-none",
                "prose-headings:font-semibold prose-headings:text-gray-900 dark:prose-headings:text-gray-100",
                "prose-p:text-gray-700 dark:prose-p:text-gray-300",
                "prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline",
                "prose-strong:text-gray-900 dark:prose-strong:text-gray-100",
                "prose-code:text-pink-600 dark:prose-code:text-pink-400 prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs",
                "prose-pre:bg-gray-900 dark:prose-pre:bg-gray-950 prose-pre:text-gray-100 prose-pre:p-4 prose-pre:rounded-lg",
                "prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-gray-600 dark:prose-blockquote:text-gray-400",
                "prose-ul:list-disc prose-ul:pl-5 prose-ol:list-decimal prose-ol:pl-5",
                "prose-li:marker:text-gray-400",
                "prose-table:border-collapse prose-table:w-full",
                "prose-th:border prose-th:border-gray-200 dark:prose-th:border-gray-700 prose-th:p-2 prose-th:bg-gray-50 dark:prose-th:bg-gray-800 prose-th:font-semibold",
                "prose-td:border prose-td:border-gray-200 dark:prose-td:border-gray-700 prose-td:p-2",
                "prose-hr:border-gray-200 dark:prose-hr:border-gray-700"
              )}
              style={{ 
                minHeight: isFullscreen ? "calc(100vh - 200px)" : minHeight,
                maxHeight: isFullscreen ? "calc(100vh - 200px)" : maxHeight 
              }}
            >
              {value ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {value}
                </ReactMarkdown>
              ) : (
                <div className="text-gray-400 dark:text-gray-600 italic">
                  Nothing to preview...
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-4">
            <span>{value.length} characters</span>
            <span>{value.split(/\s+/).filter(Boolean).length} words</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">Supports Markdown</span>
            <span className="text-gray-300 dark:text-gray-700">|</span>
            <span>GFM</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MarkdownEditor
