import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export const subtleScrollbarClass =
  "[&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
