import { execFile } from "node:child_process";
import { mkdir, appendFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

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
 *   `aap-analyst-update-topic-list`, which is responsible for extracting the
 *   Topic List block and updating `$PLANROOT/analyst/current/topics`.
 */

const dir = path.join(process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local", "state"), "opencode");
const messageFile = path.join(dir, "topic-list-message.jsonl");
const execFileAsync = promisify(execFile);

/**
 * Local helper.
 *
 * Intended effect:
 * Append a JSON record to the Topic List debug file under XDG state.
 */
async function writeMessageFile(payload) {
  await mkdir(dir, { recursive: true });
  await appendFile(messageFile, JSON.stringify(payload, null, 2) + "\n");
}

/**
 * Local helper.
 *
 * Intended effect:
 * Record the full assistant message text for debugging, then hand that exact
 * text to the bash helper `aap-analyst-update-topic-list`. The bash helper is
 * responsible for extracting the Topic List block and updating the topics file
 * under PLANROOT.
 */
async function updateTopicList(text, agent) {
  await writeMessageFile({ text });

  let result;
  try {
    result = await execFileAsync(
      "bash",
      ["-lc", 'aap-analyst-update-topic-list "$TOPIC_LIST_TEXT"'],
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

  await writeMessageFile({
    bash: {
      code: 0,
      stdout: result.stdout,
      stderr: result.stderr,
    },
  });
}

/**
 * Plugin API entry point.
 *
 * This function is called by opencode when the plugin is loaded. It returns
 * the hook callbacks that opencode should invoke later.
 */
export const TopicListPlugin = async () => {
  return {
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

      if (/(^|\n)Topic List\n[1-9]/.test(text)) {
        await updateTopicList(text, event.properties.part.agent ?? process.env.AICLI_MODE ?? "");
      }
    },
  };
};
