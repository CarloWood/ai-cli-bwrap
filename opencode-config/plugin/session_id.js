import { readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

/**
 * opencode plugin: publish the session ID and working directory to sockettapd.
 *
 * Goal:
 * - Wait until opencode has created a real `ses_*` session ID for the current chat.
 * - Read the sockettap configuration from the user's opencode TUI config.
 * - Construct the UNIX socket path as `<exec_socket_path>/$CODEX_MODE.sock`.
 * - Connect to that socket and send the same payload shape used by the
 *   `SocketTap.session()` implementation on this branch.
 * - Send the notification only once per session.
 *
 * Why this exists:
 * The session ID is not known when opencode first starts. It only becomes
 * available once opencode has created the first chat message for a session.
 * This plugin hooks into that moment and performs the external notification.
 */
const waits = [0, 50, 150, 500];

/**
 * Local guard that makes this plugin effectively one-shot per session ID.
 * There is no plugin API to unregister a hook after it has fired, so the
 * plugin remembers which sessions it has already reported and ignores later
 * callbacks for the same session.
 */
const sent = new Set();
const home = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");

/**
 * Local helper.
 *
 * Intended effect:
 * Escape the session ID and working directory so they are safe to embed in the
 * sockettap payload format used by the current branch.
 */
function escape(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Local helper.
 *
 * Intended effect:
 * Build the exact payload that sockettapd expects for a session notification on
 * this branch: the session ID and current working directory wrapped in the same
 * `<config-session>` structure used by `src/util/sockettap.ts`.
 */
function payload(sessionID, cwd) {
  return [
    "<config-session>",
    `  <session-id>${escape(sessionID)}</session-id>`,
    `  <cwd>${escape(cwd)}</cwd>`,
    "</config-session>",
    "",
  ].join("\n");
}

/**
 * Local helper.
 *
 * Intended effect:
 * Resolve which TUI configuration file to read.
 *
 * If opencode was started with `OPENCODE_TUI_CONFIG`, that file wins. Otherwise
 * the plugin uses the normal global config location under `$XDG_CONFIG_HOME`.
 */
function configFile() {
  return (
    process.env.OPENCODE_TUI_CONFIG ?? path.join(home, "opencode", "tui.json")
  );
}

/**
 * Local helper.
 *
 * Intended effect:
 * Construct the full path to the sockettapd UNIX socket.
 *
 * The base directory is read from `exec_socket_path` in `tui.json`. The final
 * filename is derived from `$CODEX_MODE`, giving:
 *
 *   <exec_socket_path>/$CODEX_MODE.sock
 *
 * If the configuration file, setting, or environment variable is missing, the
 * plugin returns `undefined` and silently does nothing.
 */
async function socketPath() {
  const mode = process.env.CODEX_MODE;
  if (!mode) return;
  const text = await readFile(configFile(), "utf8").catch((error) => {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return;
    }
    throw error;
  });
  if (!text) return;
  const data = JSON.parse(text);
  const dir =
    typeof data.exec_socket_path === "string"
      ? data.exec_socket_path
      : typeof data.tui?.exec_socket_path === "string"
        ? data.tui.exec_socket_path
        : undefined;
  if (!dir) return;
  return path.join(dir, `${mode}.sock`);
}

/**
 * Local helper.
 *
 * Intended effect:
 * Open the UNIX socket, write the prepared payload to it, and close the
 * connection once the data has been flushed.
 *
 * Return value:
 * - `undefined` on success
 * - the connection error object on failure
 */
async function write(file, body) {
  return await new Promise((resolve) => {
    const socket = createConnection(file);
    socket.once("connect", () => {
      socket.end(body);
    });
    socket.once("close", () => resolve(undefined));
    socket.once("error", (error) => {
      socket.destroy();
      resolve(error);
    });
  });
}

/**
 * Local helper.
 *
 * Intended effect:
 * Write the Session ID and current working directory to sockettapd.
 *
 * This mirrors the retry behavior from the in-repo `SocketTap.session()`
 * implementation so that a socket listener that starts slightly later still has
 * a chance to receive the notification.
 */
async function notify(sessionID, cwd) {
  const file = await socketPath();
  if (!file) return false;
  const body = payload(sessionID, cwd);

  for (const wait of waits) {
    if (wait) await sleep(wait);
    const error = await write(file, body);
    if (!error) return true;
  }

  return false;
}

/**
 * Plugin API entry point.
 *
 * This function is called by opencode when the plugin is loaded. It receives the
 * static plugin context for the current opencode process and returns the hook
 * callbacks that opencode should invoke later.
 *
 * Intended effect:
 * Capture the process working directory for this opencode instance and register
 * a hook that will report the first real session ID as soon as opencode has one.
 */
export const SessionIdPlugin = async (input) => {
  const cwd = path.resolve(input.directory);

  return {
    /**
     * Plugin API hook.
     *
     * This function is called by opencode for `chat.message`, i.e. once a chat
     * message object has been created and therefore a concrete `sessionID` is
     * available.
     *
     * Intended effect:
     * Notify sockettapd exactly once for each session, then suppress all later
     * notifications for that same `ses_*` value.
     */
    "chat.message": async (ctx) => {
      if (sent.has(ctx.sessionID)) return;
      const ok = await notify(ctx.sessionID, cwd);
      if (!ok) return;
      sent.add(ctx.sessionID);
    },
  };
};
