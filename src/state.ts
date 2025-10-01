// src/state.ts

import fs from "fs/promises";
import path from "path";
import url from "url";
import type { StateStructure } from "./types.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export async function loadState(stateFile: string): Promise<StateStructure> {
  try {
    const p = path.isAbsolute(stateFile) ? stateFile : path.join(__dirname, "..", stateFile);
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return { feeds: {} };
  }
}

export async function saveState(state: StateStructure, stateFile: string): Promise<void> {
  const p = path.isAbsolute(stateFile) ? stateFile : path.join(__dirname, "..", stateFile);
  await fs.writeFile(p, JSON.stringify(state, null, 2), "utf8");
}

