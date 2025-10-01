// src/logger.ts

let currentLogLevel: "quiet" | "normal" | "verbose" = "normal";

export function setLogLevel(level: "quiet" | "normal" | "verbose"): void {
  currentLogLevel = level;
}

export function log(message: string, level: "info" | "warn" | "error" = "info"): void {
  if (currentLogLevel === "quiet" && level !== "error") return;

  if (level === "error") {
    console.error(message);
  } else if (level === "warn") {
    console.warn(message);
  } else {
    console.log(message);
  }
}

export function verbose(message: string): void {
  if (currentLogLevel === "verbose") {
    console.log(`[DEBUG] ${message}`);
  }
}

export function always(message: string): void {
  console.log(message);
}

