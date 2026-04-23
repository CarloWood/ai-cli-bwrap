import { mkdir, appendFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
 * - Update `$PLANROOT/analyst/current/topics` whenever a Topic List is found.
 */

const dir = path.join(process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local", "state"), "opencode");
const messageFile = path.join(dir, "topic-list-message.jsonl");

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
 * Extract only the Topic List block from a larger assistant reply.
 *
 * Rules used for now:
 * - Ignore any leading text before the first `Topic List\n[1-9]` match.
 * - Stop at the first blank line after the list, or at end of text.
 */
function extractTopicList(text) {
  const match = text.match(/(?:^|\n)(Topic List\n[1-9][\s\S]*?)(?:\n\n|$)/);
  return match?.[1];
}

/**
 * Local helper.
 *
 * Intended effect:
 * Persist the extracted Topic List to the current analyst topics file under
 * PLANROOT and also append a debug record to XDG state.
 */
async function updateTopicList(text) {
  const topicList = extractTopicList(text);

  await writeMessageFile({ text, topicList });
  if (!topicList) return;

  const planroot = process.env.PLANROOT;
  if (!planroot) return;

  const topicsPath = path.join(planroot, "analyst", "current", "topics");
  await mkdir(path.dirname(topicsPath), { recursive: true });
  await writeFile(topicsPath, topicList.endsWith("\n") ? topicList : topicList + "\n");
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
        await updateTopicList(text);
      }
    },
  };
};
