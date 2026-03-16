import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * opencode plugin: override selected prompt text from configurable files and
 * log the resulting model input snapshot.
 *
 * Goal:
 * - Replace the live `system` prompt, when present, with the contents of
 *   `$XDG_CONFIG_HOME/opencode/prompts/system.txt`.
 * - Replace the live `params.options.instructions` prompt, when present, with
 *   the contents of
 *   `$XDG_CONFIG_HOME/opencode/prompts/params.options.instructions.txt`.
 * - Leave the original values untouched when the corresponding override file is
 *   missing.
 * - Write a pretty-printed snapshot of the assembled model input to
 *   `$XDG_STATE_HOME/opencode/model-input.jsonl`.
 *
 * The replacements are applied to the live hook outputs so that opencode uses
 * the replacement text as if it had been produced natively. The log is then written
 * mainly as a way to inspect and verify the resulting request shape.
 */
const dir = path.join(
  process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local", "state"),
  "opencode",
);
const file = path.join(dir, "model-input.jsonl");
const promptDir = path.join(
  process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
  "opencode",
  "prompts",
);
const systemFile = path.join(promptDir, "system.txt");
const instructionsFile = path.join(
  promptDir,
  "params.options.instructions.txt",
);

/**
 * Local snapshot accumulator.
 *
 * The plugin receives different pieces of the eventual request in separate hook
 * callbacks. This object gathers those pieces until the final hook runs, at
 * which point the full snapshot is written to disk.
 */
let last = {};

/**
 * Local helper.
 *
 * Reads an optional prompt override file from disk.
 *
 * Missing files are treated as "override disabled" rather than as an error, so
 * the plugin only changes fields for which an explicit replacement file exists.
 */
async function prompt(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

/**
 * Local helper.
 *
 * Convert the accumulated snapshot into something that `JSON.stringify` can
 * always serialize. This preserves ordinary scalars and objects while turning
 * values like `Error`, `Map`, `Set`, `Date`, `URL`, and circular references into
 * stable JSON-friendly representations.
 */
function scrub(value, seen = new WeakSet(), depth = 0) {
  if (value === null || value === undefined) return value;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function")
    return `[function ${value.name || "anonymous"}]`;
  if (value instanceof URL) return value.href;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: scrub(value.cause, seen, depth + 1),
    };
  }
  if (depth >= 16) return "[max-depth]";
  if (Array.isArray(value))
    return value.map((item) => scrub(item, seen, depth + 1));
  if (value instanceof Map) {
    return Array.from(value.entries()).map(([key, item]) => [
      scrub(key, seen, depth + 1),
      scrub(item, seen, depth + 1),
    ]);
  }
  if (value instanceof Set)
    return Array.from(value.values()).map((item) =>
      scrub(item, seen, depth + 1),
    );
  if (typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        scrub(item, seen, depth + 1),
      ]),
    );
  }
  return String(value);
}

/**
 * Local helper.
 *
 * Write the accumulated model input snapshot to disk as a pretty printed json file.
 */
async function flush() {
  await mkdir(dir, { recursive: true });
  await writeFile(file, JSON.stringify(scrub(last), null, 2) + "\n");
}

/**
 * Local helper.
 *
 * Merge a partial snapshot fragment into the accumulated request state.
 *
 * Options:
 * - `reset`: start a fresh snapshot instead of merging into the previous one
 * - `flush`: immediately write the resulting snapshot to disk
 */
async function write(data, options = {}) {
  last = options.reset
    ? data
    : {
        ...last,
        ...data,
      };
  last.time = new Date().toISOString();
  if (options.flush) {
    await flush();
  }
}

/**
 * Local helper.
 *
 * Derive the current session ID and most relevant user message ID from the
 * message list seen in `experimental.chat.messages.transform`. This establishes
 * the identity of the request snapshot before later hooks add system, params,
 * and headers data.
 */
function session(messages) {
  const last = [...messages]
    .reverse()
    .find((item) => item.info?.role === "user");
  return {
    sessionID: last?.info?.sessionID ?? messages[0]?.info?.sessionID,
    messageID: last?.info?.id,
  };
}

/**
 * Plugin API entry point.
 *
 * This function is called by opencode when the plugin is loaded. It returns the
 * hook callbacks that opencode should invoke while assembling a model request.
 *
 * Registers prompt-replacement hooks and a best-effort model-input logger that
 * records the final accumulated snapshot after the last relevant hook fires.
 */
export const PromptOverridesPlugin = async () => {
  return {
    /**
     * Plugin API hook.
     *
     * This function is called by opencode during
     * `experimental.chat.messages.transform`.
     *
     * Starts a new accumulated snapshot for the current request using the message
     * list that opencode is about to send, and captures the session/message
     * identity that later hook fragments belong to.
     */
    "experimental.chat.messages.transform": async (_input, output) => {
      const meta = session(output.messages);
      await write(
        {
          kind: "snapshot",
          ...meta,
          count: output.messages.length,
          messages: output.messages,
        },
        { reset: true },
      );
    },

    /**
     * Plugin API hook.
     *
     * This function is called by opencode during
     * `experimental.chat.system.transform` with the live mutable `system` array.
     *
     * Replaces the live `system` prompt with the contents of `system.txt`, when
     * that file exists, so the replacement is what opencode actually sends to
     * the model. The resulting system prompt is then merged into the accumulated
     * snapshot.
     */
    "experimental.chat.system.transform": async (input, output) => {
      const text = await prompt(systemFile);
      if (text !== undefined) {
        output.system.length = 0;
        output.system.push(text);
      }
      await write(
        {
          kind: "snapshot",
          sessionID: input.sessionID,
          model: input.model,
          system: output.system,
        },
        {
          reset:
            input.sessionID === undefined || last.sessionID !== input.sessionID,
          flush: input.sessionID === undefined,
        },
      );
    },

    /**
     * Plugin API hook.
     *
     * This function is called by opencode during `chat.params` with the live
     * mutable params object.
     *
     * Replaces the live `params.options.instructions` prompt with the contents of
     * `params.options.instructions.txt`, when that file exists and the field is
     * present for the current provider/model path. The resulting params object is
     * then merged into the accumulated snapshot.
     */
    "chat.params": async (input, output) => {
      const text = await prompt(instructionsFile);
      if (
        text !== undefined &&
        output.options &&
        typeof output.options.instructions === "string"
      ) {
        output.options.instructions = text;
      }
      await write({
        kind: "snapshot",
        sessionID: input.sessionID,
        messageID: input.message?.id,
        agent: input.agent,
        model: input.model,
        provider: input.provider,
        message: input.message,
        params: output,
      });
    },

    /**
     * Plugin API hook.
     *
     * This function is called by opencode during `chat.headers` after the other
     * relevant request-assembly hooks have run.
     *
     * Adds the request headers to the accumulated snapshot and then flushes the
     * whole snapshot once to `model-input.jsonl`.
     */
    "chat.headers": async (input, output) => {
      await write(
        {
          kind: "snapshot",
          sessionID: input.sessionID,
          messageID: input.message?.id,
          agent: input.agent,
          model: input.model,
          provider: input.provider,
          message: input.message,
          headers: output.headers,
        },
        { flush: true },
      );
    },
  };
};
