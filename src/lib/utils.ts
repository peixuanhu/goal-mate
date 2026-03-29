import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Trigger a refresh event for the quadrant sidebar
 * Call this function after updating a plan or adding progress
 */
export function refreshQuadrantSidebar() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('quadrant-refresh'));
  }
}
