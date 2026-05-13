import { createConnection } from "node:net";
import { execFile } from "node:child_process";
import { mkdir, appendFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";

/**
 * opencode plugin: inspect message-part update events while experimenting with
 * Topic List automation.
 *
 * Goal:
 * - Listen to the generic plugin `event` stream.
 * - Pick out `message.part.updated` events, because those include the actual
 *   message part payload rather than only message metadata.
 * - Write matching final-answer Topic List text to a state file so we can
 *   inspect exactly what opencode publishes.
 * - Hand the full assistant message text to the bash helper
 *   `atl-update`, which is responsible for extracting the
 *   Topic List block and updating `$PLANROOT/analyst/current/topics`.
 */

const xdg_state_home_opencode = path.join(process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local", "state"), "opencode");
const messageFile = path.join(xdg_state_home_opencode, "topic-list-message.jsonl");

/**
 * Local helper.
 *
 * Intended effect:
 * Append a JSON record to the Topic List debug file under XDG state.
 */
async function writeMessageFile(payload) {
  await mkdir(xdg_state_home_opencode, { recursive: true });
  await appendFile(messageFile, JSON.stringify(payload, null, 2) + "\n");
}

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
 * Local guards that tracks the last session/agent/cwd triplet reported.
 *
 * The plugin should notify sockettapd whenever the active session, active agent,
 * or current working directory changes.
 */
let lastSessionID;
let lastAgentName;
let lastCwd;

/**
 * Local helper.
 *
 * Intended effect:
 * Notify sockettapd exactly once for each session/agent/cwd triplet and suppress
 * repeated notifications until either value changes.
 */
async function notifyIfChanged(sessionID, agentName, cwd) {
  if (lastAgentName !== agentName) {
    // Can we switch repository root and current working directory here?
  }

  if (lastSessionID !== sessionID || lastAgentName !== agentName || lastCwd !== cwd) {
    const ok = await notify(sessionID, agentName, cwd);
    if (!ok) return;
  }

  lastSessionID = sessionID;
  lastAgentName = agentName;
  lastCwd = cwd;
}

const execFileAsync = promisify(execFile);

/**
 * Local helper.
 *
 * Intended effect:
 * Record the full assistant message text for debugging, then hand that exact
 * text to the bash helper `atl-update`. The bash helper is
 * responsible for extracting the Topic List block and updating the topics file
 * under PLANROOT.
 */
async function updateTopicList(text, agent) {
  /* For debugging:
  await writeMessageFile({ text });
  */

  let result;
  try {
    result = await execFileAsync(
      "bash",
      ["-lc", 'atl-update "$TOPIC_LIST_TEXT"'],
      {
        env: {
          ...process.env,
          AICLI_MODE: agent,
          TOPIC_LIST_TEXT: text,
        },
      },
    );
  } catch (error) {
    await writeMessageFile({
      bash: {
        code: error.code,
        stdout: error.stdout,
        stderr: error.stderr,
        error: String(error),
      },
    });
    throw error;
  }

  /*
  await writeMessageFile({
    bash: {
      code: 0,
      stdout: result.stdout,
      stderr: result.stderr,
    },
  });
  */
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
export const AAPSupportPlugin = async (pluginInput) => {
  const cwd = path.resolve(pluginInput.directory);
  const agentShellCalls = new Set();

  return {
    /**
     * Plugin API hook.
     *
     * This function is called by opencode before an agent tool executes. We
     * record bash tool call IDs so the later `shell.env` hook can distinguish
     * agent-initiated shell commands from user-initiated `!` shell commands
     * and only inject the environment variable for the latter.
     */
    async "tool.execute.before"(input) {
      if (input.tool === "bash") {
        agentShellCalls.add(input.callID)
      }
    },

    /**
     * Plugin API hook.
     *
     * This function is called by opencode before spawning a shell-backed tool
     * or terminal session.
     *
     * Intended effect:
     * Set `AICLI_MODE` for new child processes to the currently active agent
     * and notify sockettapd if the session/agent pair changed since the last
     * notification.
     *
     * If this is a user shell command, set OPENCODE_IS_USER_COMMAND to some
     * secret.
     */
    "shell.env": async (input, output) => {
      // `input.agent` is only present when opencode includes the CW07-directory-as-function-of-agent branch.
      // Some invocations don't pass sessionID or agent; we should ignore those.
      if (!input.sessionID || !input.agent) return;

      await notifyIfChanged(input.sessionID, input.agent, cwd);
      output.env.AICLI_MODE = input.agent;

      // If this is an agent bash tool call, then exit early.
      if (input.callID && agentShellCalls.has(input.callID)) {
        agentShellCalls.delete(input.callID);
        return;
      }
      // This applies to user `!` shell commands, not agent bash tool calls.
      output.env.OPENCODE_IS_USER_COMMAND = "AI agent: NEVER set the environment variable OPENCODE_IS_USER_COMMAND!";
    },

    /**
     * Plugin API hook.
     *
     * This function is called by opencode for `chat.message`, i.e. once a chat
     * message object has been created and therefore a concrete `sessionID` is
     * available.
     *
     * Intended effect:
     * Notify sockettapd whenever the current session/agent pair changes.
     */
    "chat.message": async (ctx) => {
      await notifyIfChanged(ctx.sessionID, ctx.agent, cwd);
    },

    /**
     * Plugin API hook.
     *
     * This function is called by opencode for every bus event exposed to
     * plugins. We only care about `message.part.updated`.
     *
     * Available data for this event:
     * - `event.type`
     * - `event.properties.sessionID`
     * - `event.properties.part`
     * - `event.properties.time`
     */
    event: async ({ event }) => {
      if (event.type !== "message.part.updated") return;

      const text = event.properties.part.text ?? "";
      if (text === "") return;

      const phase = event.properties.part.metadata?.openai?.phase ?? "";
      if (phase !== "final_answer") return;

      /* For debugging:
      await writeMessageFile({ part: event.properties.part });
      */

      if (/(^|\n)Topic List:?\n[1-9]/.test(text)) {
        await updateTopicList(text, lastAgentName ?? process.env.AICLI_MODE);
      }
    },
  };
};
