"use client"
import * as React from "react"
import { cn } from "@/lib/utils"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

export interface ComboboxProps {
  options: string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function Combobox({ options, value, onChange, placeholder, className }: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [input, setInput] = React.useState("")
  const filtered = React.useMemo(() =>
    options.filter(opt => opt.toLowerCase().includes(input.toLowerCase())),
    [input, options]
  )
  React.useEffect(() => {
    if (!open) setInput("")
  }, [open])
  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        className={cn("flex w-full items-center justify-between border rounded-md px-3 py-2 text-sm bg-background", value ? "text-foreground" : "text-muted-foreground")}
        onClick={() => setOpen(o => !o)}
        tabIndex={0}
      >
        <span className="truncate">{value || placeholder || "请选择"}</span>
        <ChevronDownIcon className="size-4 ml-2 opacity-50" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md">
          <input
            className="w-full px-3 py-2 text-sm border-b outline-none"
            placeholder={placeholder || "输入或选择..."}
            value={input}
            autoFocus
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                if (input && !options.includes(input)) {
                  onChange(input)
                  setOpen(false)
                }
              }
            }}
          />
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && input ? (
              <div
                className="px-3 py-2 text-sm cursor-pointer hover:bg-accent"
                onMouseDown={() => { onChange(input); setOpen(false) }}
              >
                新建标签 " {input} "
              </div>
            ) : filtered.map(opt => (
              <div
                key={opt}
                className={cn("flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-accent", value === opt && "bg-accent")}
                onMouseDown={() => { onChange(opt); setOpen(false) }}
              >
                {opt}
                {value === opt && <CheckIcon className="size-4 ml-auto text-primary" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
} 