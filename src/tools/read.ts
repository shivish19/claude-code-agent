import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Tool } from "../types.ts";

const MAX_CHARS = 20_000;
const DEFAULT_LIMIT = 500; // lines

export const readTool: Tool = {
  name: "read",
  description:
    "Read a text file and return its contents. Large files are truncated; use offset and limit to read further chunks.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file, relative to the current folder",
      },
      offset: {
        type: "number",
        description: "Line number to start from (1-based). Default 1.",
      },
      limit: {
        type: "number",
        description: `Max number of lines to return. Default ${DEFAULT_LIMIT}.`,
      },
    },
    required: ["path"],
  },
  async execute(args) {
    const text = await readFile(resolve(process.cwd(), String(args.path)), "utf8");
    const lines = text.split("\n");

    const start = Math.max(1, Number(args.offset ?? 1));
    const limit = Math.max(1, Number(args.limit ?? DEFAULT_LIMIT));
    const slice = lines.slice(start - 1, start - 1 + limit);

    let out = slice.join("\n");
    let truncated = start - 1 + limit < lines.length;

    if (out.length > MAX_CHARS) {
      out = out.slice(0, MAX_CHARS);
      truncated = true;
    }

    if (truncated) {
      out += `\n\n[truncated: showing lines ${start}-${start + slice.length - 1} of ${lines.length}. Call read again with a larger offset to continue.]`;
    }
    return out;
  },
};