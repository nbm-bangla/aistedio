import type { StudioDocument } from "./types";

export const bn = (value: number) => value.toLocaleString("bn-BD");
export const wordCount = (text: string) => text.trim() ? text.trim().split(/\s+/u).length : 0;
export const characterCount = (text: string) => Array.from(text).length;
export const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

export function readingTime(text: string, speed = 1): string {
  const seconds = Math.ceil((wordCount(text) / (135 * speed)) * 60);
  if (seconds < 60) return `${bn(Math.max(1, seconds))} সেকেন্ড`;
  return `${bn(Math.floor(seconds / 60))} মিনিট${seconds % 60 ? ` ${bn(seconds % 60)} সেকেন্ড` : ""}`;
}

export function translationProgress(doc: StudioDocument): number {
  if (doc.kind === "audio") return 0;
  if (!doc.segments.length) return doc.translationStatus === "complete" ? 100 : 0;
  return Math.round((doc.segments.filter((segment) => segment.status === "complete").length / doc.segments.length) * 100);
}

export function shortDate(date: string): string {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "এইমাত্র";
  return value.toLocaleDateString("bn-BD", { day: "numeric", month: "short" });
}
