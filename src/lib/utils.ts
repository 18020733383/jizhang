import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function maskText(value: unknown, fallbackLength = 4) {
  const text = String(value ?? '');
  const length = Math.max(fallbackLength, Array.from(text).length || fallbackLength);
  return '*'.repeat(length);
}
