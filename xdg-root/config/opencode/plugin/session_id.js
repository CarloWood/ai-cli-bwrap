import { createConnection } from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

/**
 * opencode plugin: publish session metadata to sockettapd and mirror the
 * active agent into `AICLI_MODE` for future child shells.
 *
 * Goal:
 * - Wait until opencode has created a real `ses_*` session ID for the current chat.
 * - Construct the UNIX socket path as `$PLANROOT/$REPOBASE.sock`.
 * - Connect to that socket and send the same payload shape used by the
 *   `SocketTap.session()` implementation on this branch.
 * - Send the notification every time session ID or agent name change.
 * - Keep `AICLI_MODE` in sync with the active agent for commands started after
 *   the change.
 *
 * Why this exists:
 * The session ID is not known when opencode first starts. It only becomes
 * available once opencode has created the first chat message for a session.
 * This plugin hooks into that moment, performs the external notification, and
 * updates the shell environment presented to future child processes.
 */
const waits = [0, 50, 150, 500];

/**
 * Local guard that tracks the last session/agent pair reported.
 *
 * The plugin should notify sockettapd whenever the active session changes, the
 * active agent changes, or both.
 */
let lastSentKey;

function pairKey(sessionID, agentName) {
  return `${sessionID}\0${agentName}`;
}

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
 * this branch: the session ID, agent name, and current working directory wrapped
 * in the same `<config-session>` structure used by `src/util/sockettap.ts`.
 */
function payload(sessionID, agentName, cwd) {
  return [
    "<config-session>",
    `  <session-id>${escape(sessionID)}</session-id>`,
    `  <agent>${escape(agentName)}</agent>`,
    `  <cwd>${escape(cwd)}</cwd>`,
    "</config-session>",
    "",
  ].join("\n");
}

/**
 * Local helper.
 *
 * Intended effect:
 * Construct the full path to the sockettapd UNIX socket.
 *
 * The base directory is read from the environment variable PLANROOT.
 * The final filename is derived from REPOBASE, giving:
 *
 *   $PLANROOT/$REPOBASE.sock
 *
 * Any slash characters in REPOBASE are replaced with underscores.
 * If an environment variable is missing or empty, the plugin returns
 * `undefined` and silently does nothing.
 */
function socketPath() {
  const planroot = process.env.PLANROOT;
  if (!planroot) return;

  const repobase = process.env.REPOBASE?.replaceAll("/", "_");
  if (!repobase) return;

  return path.join(planroot, `${repobase}.sock`);
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
 * Write the session ID, agent name, and current working directory to
 * sockettapd.
 *
 * This mirrors the retry behavior from the in-repo `SocketTap.session()`
 * implementation so that a socket listener that starts slightly later still has
 * a chance to receive the notification.
 */
async function notify(sessionID, agentName, cwd) {
  const file = await socketPath();
  if (!file) return false;
  const body = payload(sessionID, agentName, cwd);

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
 * hooks that report the first real session ID as soon as opencode has one and
 * expose the current agent as `AICLI_MODE` to future child shells.
 */
export const SessionIdPlugin = async (input) => {
  const cwd = path.resolve(input.directory);

  return {
    /**
     * Plugin API hook.
     *
     * This function is called by opencode before spawning a shell-backed tool
     * or terminal session.
     *
     * Intended effect:
     * Set `AICLI_MODE` for new child processes to the currently active agent.
     */
    "shell.env": async (ctx, output) => {
      output.env.AICLI_MODE = ctx.agent;
    },

    /**
     * Plugin API hook.
     *
     * This function is called by opencode for `chat.message`, i.e. once a chat
     * message object has been created and therefore a concrete `sessionID` is
     * available.
     *
     * Intended effect:
     * Notify sockettapd whenever the current session/agent pair changes, then
     * suppress repeated notifications until that pair changes again.
     */
    "chat.message": async (ctx) => {
      const key = pairKey(ctx.sessionID, ctx.agent);
      if (lastSentKey === key) return;
      const ok = await notify(ctx.sessionID, ctx.agent, cwd);
      if (!ok) return;
      lastSentKey = key;
    },
  };
};
