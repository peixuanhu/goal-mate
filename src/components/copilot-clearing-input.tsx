"use client";

/**
 * CopilotKit-style input with reliable clear-after-send (flushSync).
 * Push-to-talk omitted (not used in Goal Mate); can revert to package Input if needed.
 */

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { InputProps } from "@copilotkit/react-ui";
import { useChatContext } from "@copilotkit/react-ui";
import { useCopilotContext } from "@copilotkit/react-core";

const MAX_NEWLINES = 6;

const AutoResizingTextarea = forwardRef<
  HTMLTextAreaElement,
  {
    maxRows?: number;
    placeholder?: string;
    value: string;
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    autoFocus?: boolean;
  }
>(({ maxRows = 1, placeholder, value, onChange, onKeyDown, autoFocus }, ref) => {
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [maxHeight, setMaxHeight] = useState<number>(0);

  useImperativeHandle(ref, () => internalTextareaRef.current as HTMLTextAreaElement);

  useEffect(() => {
    const textareaStyle = internalTextareaRef.current;
    if (textareaStyle) {
      textareaStyle.style.height = "auto";
      const singleRowHeight = textareaStyle.scrollHeight;
      setMaxHeight(singleRowHeight * maxRows);
      if (autoFocus) {
        textareaStyle.focus();
      }
    }
  }, [maxRows, autoFocus]);

  useEffect(() => {
    const textareaStyle = internalTextareaRef.current;
    if (textareaStyle) {
      textareaStyle.style.height = "auto";
      textareaStyle.style.height = `${Math.min(textareaStyle.scrollHeight, maxHeight)}px`;
    }
  }, [value, maxHeight]);

  return (
    <textarea
      ref={internalTextareaRef}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      autoComplete="off"
      name="goal-mate-copilot-chat"
      spellCheck={true}
      style={{
        overflow: "auto",
        resize: "none",
        maxHeight: `${maxHeight}px`,
      }}
      rows={1}
    />
  );
});
AutoResizingTextarea.displayName = "AutoResizingTextarea";

function PoweredByLine({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div>
      <p className="poweredBy poweredBy-goal-mate text-center text-[12px] text-muted-foreground py-1">
        Powered by CopilotKit
      </p>
    </div>
  );
}

export function CopilotClearingInput({
  inProgress,
  onSend,
  onStop,
  onUpload,
}: InputProps) {
  const context = useChatContext();
  const copilotContext = useCopilotContext();
  const showPoweredBy = !copilotContext.copilotApiConfig?.publicApiKey;

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleDivClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    if (target.tagName === "TEXTAREA") return;
    textareaRef.current?.focus();
  };

  const [text, setText] = useState("");

  // 暴露 send 方法供外部调用
  useEffect(() => {
    (window as any).__copilotSend = (message: string) => {
      if (!inProgress && message.trim()) {
        flushSync(() => {
          setText(message);
        });
        setTimeout(() => {
          flushSync(() => {
            setText("");
          });
          onSend(message);
          textareaRef.current?.focus();
        }, 50);
      }
    };
    
    return () => {
      delete (window as any).__copilotSend;
    };
  }, [inProgress, onSend]);

  const send = () => {
    if (inProgress) return;
    const payload = text;
    flushSync(() => {
      setText("");
    });
    onSend(payload);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.style.height = "auto";
      }
    });
    textareaRef.current?.focus();
  };

  const canSend = () => {
    const interruptEvent = copilotContext.langGraphInterruptAction?.event;
    const interruptInProgress =
      interruptEvent?.name === "LangGraphInterruptEvent" && !interruptEvent?.response;

    return (
      (inProgress || (!inProgress && text.trim().length > 0)) && !interruptInProgress
    );
  };

  const sendDisabled = !canSend();

  return (
    <div className={`copilotKitInputContainer ${showPoweredBy ? "poweredByContainer" : ""}`}>
      <div className="copilotKitInput" onClick={handleDivClick}>
        <AutoResizingTextarea
          ref={textareaRef}
          placeholder={context.labels.placeholder}
          autoFocus={false}
          maxRows={MAX_NEWLINES}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSend()) {
                send();
              }
            }
          }}
        />
        <div className="copilotKitInputControls">
          {onUpload && (
            <button type="button" onClick={onUpload} className="copilotKitInputControlButton">
              {context.icons.uploadIcon}
            </button>
          )}
          <div style={{ flexGrow: 1 }} />
          <button
            type="button"
            disabled={sendDisabled}
            onClick={inProgress ? onStop : send}
            data-copilotkit-in-progress={inProgress}
            data-test-id={inProgress ? "copilot-chat-request-in-progress" : "copilot-chat-ready"}
            className="copilotKitInputControlButton"
          >
            {inProgress ? context.icons.stopIcon : context.icons.sendIcon}
          </button>
        </div>
      </div>
      <PoweredByLine show={showPoweredBy} />
    </div>
  );
}
