"use client"

import React, { useEffect, useRef } from "react"

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

type SavedInert = {
  element: HTMLElement
  hadAttribute: boolean
  value: string | null
}

function inertBackground(modal: HTMLElement): SavedInert[] {
  const saved: SavedInert[] = []
  let pathElement: Element = modal
  let parent = pathElement.parentElement

  while (parent && parent !== document.documentElement) {
    for (const sibling of parent.children) {
      if (sibling === pathElement || !(sibling instanceof HTMLElement)) continue
      saved.push({
        element: sibling,
        hadAttribute: sibling.hasAttribute("inert"),
        value: sibling.getAttribute("inert"),
      })
      sibling.setAttribute("inert", "")
    }
    pathElement = parent
    parent = parent.parentElement
  }

  return saved
}

function restoreBackground(saved: readonly SavedInert[]): void {
  for (const item of saved) {
    if (item.hadAttribute) item.element.setAttribute("inert", item.value ?? "")
    else item.element.removeAttribute("inert")
  }
}

function focusableElements(modal: HTMLElement): HTMLElement[] {
  return [...modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
    .filter(element => !element.hidden && !element.closest("[inert]"))
}

export function useModalAccessibility({
  initialFocusRef,
  loading,
  onClose,
}: {
  initialFocusRef: React.RefObject<HTMLElement | null>
  loading: boolean
  onClose: () => void
}) {
  const modalRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  )
  const loadingRef = useRef(loading)
  const closeRef = useRef(onClose)
  loadingRef.current = loading
  closeRef.current = onClose

  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return
    const trigger = triggerRef.current
    const saved = inertBackground(modal)
    initialFocusRef.current?.focus()

    return () => {
      restoreBackground(saved)
      if (trigger?.isConnected) trigger.focus()
    }
  }, [initialFocusRef])

  function onModalKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      if (!loadingRef.current) closeRef.current()
      return
    }
    if (event.key !== "Tab") return

    const modal = modalRef.current
    if (!modal) return
    const focusable = focusableElements(modal)
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || !modal.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || !modal.contains(active))) {
      event.preventDefault()
      first.focus()
    }
  }

  return { modalRef, onModalKeyDown }
}
