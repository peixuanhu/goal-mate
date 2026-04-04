"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Edit3, Eye, Maximize2, Minimize2 } from "lucide-react"

// Dynamically import MDEditor to avoid SSR issues
const MDEditor = dynamic(
  () => import("@uiw/react-md-editor").then((mod) => mod.default),
  { ssr: false }
)

interface WysiwygEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  minHeight?: number
  label?: string
  id?: string
  required?: boolean
  disabled?: boolean
}

export function WysiwygEditor({
  value,
  onChange,
  placeholder = "Enter markdown text...",
  className,
  minHeight = 900,
  label,
  id,
  required,
  disabled,
}: WysiwygEditorProps) {
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const [previewMode, setPreviewMode] = React.useState<"edit" | "preview" | "live">("live")

  const handleChange = (val: string | undefined) => {
    onChange(val || "")
  }

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
          "rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-950 flex flex-col",
          isFullscreen && "fixed inset-0 z-50 rounded-none"
        )}
      >
        {/* Custom Toolbar */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 px-2 py-1">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPreviewMode("live")}
              className={cn(
                "h-8 px-2 gap-1.5 text-xs",
                previewMode === "live" && "bg-gray-200 dark:bg-gray-700"
              )}
            >
              <Edit3 className="h-3.5 w-3.5" />
              实时编辑
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPreviewMode("preview")}
              className={cn(
                "h-8 px-2 gap-1.5 text-xs",
                previewMode === "preview" && "bg-gray-200 dark:bg-gray-700"
              )}
            >
              <Eye className="h-3.5 w-3.5" />
              仅预览
            </Button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-gray-800"
            title={isFullscreen ? "退出全屏" : "全屏"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-auto" data-color-mode="light">
          <MDEditor
            value={value}
            onChange={handleChange}
            preview={previewMode}
            hideToolbar={true}
            height={isFullscreen ? "calc(100vh - 100px)" : minHeight}
            textareaProps={{
              placeholder,
              disabled,
            }}
            className={cn(
              "border-0 !bg-transparent",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-4">
            <span>{value.length} 字符</span>
            <span>{value.split(/\s+/).filter(Boolean).length} 词</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">支持 Markdown</span>
            <span className="text-gray-300 dark:text-gray-700">|</span>
            <span className="text-blue-600 dark:text-blue-400 font-medium">
              {previewMode === "live" ? "实时编辑模式" : "预览模式"}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WysiwygEditor
