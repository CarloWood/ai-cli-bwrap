import { appendFile, mkdir } from "node:fs/promises";
import { createConnection } from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

/**
 * opencode plugin: publish the session ID, agent name and working directory to sockettapd.
 *
 * Goal:
 * - Wait until opencode has created a real `ses_*` session ID for the current chat.
 * - Construct the UNIX socket path as `$PLANROOT/$REPOBASE.sock`.
 * - Connect to that socket and send the same payload shape used by the
 *   `SocketTap.session()` implementation on this branch.
 * - Send the notification every time session ID or agent name change.
 *
 * Why this exists:
 * The session ID is not known when opencode first starts. It only becomes
 * available once opencode has created the first chat message for a session.
 * This plugin hooks into that moment and performs the external notification.
 */
const waits = [0, 50, 150, 500];
const stateHome = process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local", "state");
const logFile = path.join(stateHome, "opencode", "session_id.log");

/**
 * Local guard that tracks the last session/agent pair reported.
 *
 * The plugin should notify sockettapd whenever the active session changes, the
 * active agent changes, or both.
 */
let lastSentKey;
let debugSeq = 0;

function pairKey(sessionID, agentName) {
  return `${sessionID}\0${agentName ?? ""}`;
}

function describeError(error) {
  if (!error || typeof error !== "object") {
    return { message: String(error) };
  }

  return {
    name: "name" in error ? error.name : undefined,
    code: "code" in error ? error.code : undefined,
    message: "message" in error ? error.message : String(error),
    errno: "errno" in error ? error.errno : undefined,
    syscall: "syscall" in error ? error.syscall : undefined,
    path: "path" in error ? error.path : undefined,
    address: "address" in error ? error.address : undefined,
  };
}

async function debug(event, data = {}) {
  const entry = {
    time: new Date().toISOString(),
    pid: process.pid,
    seq: ++debugSeq,
    event,
    data,
  };

  try {
    await mkdir(path.dirname(logFile), { recursive: true });
    await appendFile(logFile, JSON.stringify(entry) + "\n");
  } catch (error) {
    console.error("[session_id] failed to write debug log", describeError(error));
  }
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
 * `undefined` and logs why.
 */
async function socketPath() {
  const planroot = process.env.PLANROOT;
  const repobaseRaw = process.env.REPOBASE;
  const repobase = repobaseRaw?.replaceAll("/", "_");

  await debug("socketPath.resolve", {
    PLANROOT: planroot,
    REPOBASE: repobaseRaw,
    normalizedREPOBASE: repobase,
  });

  if (!planroot) {
    await debug("socketPath.missing_PLANROOT");
    return;
  }

  if (!repobase) {
    await debug("socketPath.missing_REPOBASE");
    return;
  }

  const file = path.join(planroot, `${repobase}.sock`);
  await debug("socketPath.result", { file });
  return file;
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
  await debug("write.begin", { file, bytes: body.length, body });

  return await new Promise((resolve) => {
    let settled = false;
    const socket = createConnection(file);

    socket.once("connect", () => {
      void debug("write.connect", { file });
      socket.end(body);
    });

    socket.once("close", (hadError) => {
      void debug("write.close", { file, hadError });
      if (settled) return;
      settled = true;
      resolve(undefined);
    });

    socket.once("error", (error) => {
      void debug("write.error", { file, error: describeError(error) });
      socket.destroy();
      if (settled) return;
      settled = true;
      resolve(error);
    });
  });
}

/**
 * Local helper.
 *
 * Intended effect:
 * Write the Session ID, agent name, and current working directory to
 * sockettapd.
 *
 * This mirrors the retry behavior from the in-repo `SocketTap.session()`
 * implementation so that a socket listener that starts slightly later still has
 * a chance to receive the notification.
 */
async function notify(sessionID, agentName, cwd) {
  await debug("notify.begin", { sessionID, agentName, cwd });
  const file = await socketPath();
  if (!file) {
    await debug("notify.no_socket_path", { sessionID, agentName, cwd });
    return false;
  }

  const body = payload(sessionID, agentName, cwd);
  for (let attempt = 0; attempt < waits.length; ++attempt) {
    const wait = waits[attempt];
    await debug("notify.attempt", { attempt, wait, file, sessionID, agentName });
    if (wait) await sleep(wait);
    const error = await write(file, body);
    if (!error) {
      await debug("notify.success", { attempt, file, sessionID, agentName });
      return true;
    }
    await debug("notify.retry", { attempt, file, error: describeError(error) });
  }

  await debug("notify.failed", { file, sessionID, agentName });
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

  await debug("plugin.init", {
    inputDirectory: input.directory,
    cwd,
    PLANROOT: process.env.PLANROOT,
    REPOBASE: process.env.REPOBASE,
    XDG_STATE_HOME: process.env.XDG_STATE_HOME,
    logFile,
  });

  return {
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
      await debug("chat.message", {
        sessionID: ctx.sessionID,
        agent: ctx.agent,
        key,
        lastSentKey,
        cwd,
      });

      if (lastSentKey === key) {
        await debug("chat.message.skip_duplicate", { key, sessionID: ctx.sessionID, agent: ctx.agent });
        return;
      }

      try {
        const ok = await notify(ctx.sessionID, ctx.agent, cwd);
        await debug("chat.message.notify_result", { key, ok, sessionID: ctx.sessionID, agent: ctx.agent });
        if (!ok) return;
        lastSentKey = key;
        await debug("chat.message.update_lastSentKey", { lastSentKey });
      } catch (error) {
        await debug("chat.message.exception", {
          sessionID: ctx.sessionID,
          agent: ctx.agent,
          error: describeError(error),
        });
        throw error;
      }
    },
  };
};
