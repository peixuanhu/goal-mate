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

function focusInsideModal(
  modal: HTMLElement,
  initialFocus: HTMLElement | null,
  loading: boolean,
): void {
  if (loading) {
    modal.focus()
    return
  }
  const usableInitialFocus = initialFocus
    && modal.contains(initialFocus)
    && !initialFocus.matches(":disabled")
    ? initialFocus
    : null
  const target = usableInitialFocus ?? focusableElements(modal)[0] ?? modal
  target.focus()
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
  const modalRef = useRef<HTMLElement>(null)
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
    const currentModal = modalRef.current
    if (!currentModal) return
    const modal: HTMLElement = currentModal
    const trigger = triggerRef.current
    const saved = inertBackground(modal)
    focusInsideModal(modal, initialFocusRef.current, loadingRef.current)

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        if (!loadingRef.current) closeRef.current()
        return
      }
      if (event.key !== "Tab") return

      const focusable = focusableElements(modal)
      if (focusable.length === 0) {
        event.preventDefault()
        modal.focus()
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

    function handleFocusIn(event: FocusEvent) {
      if (!(event.target instanceof Node) || modal.contains(event.target)) return
      focusInsideModal(modal, initialFocusRef.current, loadingRef.current)
    }

    document.addEventListener("keydown", handleKeyDown, true)
    document.addEventListener("focusin", handleFocusIn, true)

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true)
      document.removeEventListener("focusin", handleFocusIn, true)
      restoreBackground(saved)
      if (trigger?.isConnected) trigger.focus()
    }
  }, [initialFocusRef])

  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return
    const active = document.activeElement
    if (
      !modal.contains(active)
      || (active instanceof HTMLElement && active.matches(":disabled"))
    ) {
      focusInsideModal(modal, initialFocusRef.current, loading)
    }
  }, [initialFocusRef, loading])

  return { modalRef }
}
