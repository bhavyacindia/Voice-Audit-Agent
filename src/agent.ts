import "dotenv/config";
import { fileURLToPath } from "node:url";
import { ServerOptions, cli, defineAgent, inference, voice } from "@livekit/agents";
import * as cartesia from "@livekit/agents-plugin-cartesia";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as silero from "@livekit/agents-plugin-silero";
import { askCloudflare, type ChatMessage, type ToolName } from "./cloudflare.js";
import { getContact, markResolved, recordIssue } from "./db.js";

type Stage = "awaiting_resolution" | "awaiting_issue" | "finished";
type ToolResult = { done: true } | { done: false; result: string; fallback: string };

const agent = defineAgent({
  entry: async (context) => {
    const contactId = process.env.VOICE_AUDIT_CONTACT_ID;
    if (!contactId) throw new Error("Set VOICE_AUDIT_CONTACT_ID to a Contact ID from the dashboard.");
    const selectedContactId = contactId;
    const contact = await getContact(contactId);
    if (!contact) throw new Error("The selected Contact was not found.");

    const cartesiaKey = process.env.CARTESIA_API_KEY;
    const voiceId = process.env.CARTESIA_VOICE_ID;
    if (!cartesiaKey || !voiceId) throw new Error("Set CARTESIA_API_KEY and CARTESIA_VOICE_ID in .env.");
    const speed = Number(process.env.CARTESIA_SPEED || 1);
    const volume = Number(process.env.CARTESIA_VOLUME || 1);
    if (!Number.isFinite(speed) || speed < 0.6 || speed > 1.5) throw new Error("CARTESIA_SPEED must be between 0.6 and 1.5.");
    if (!Number.isFinite(volume) || volume < 0.5 || volume > 2) throw new Error("CARTESIA_VOLUME must be between 0.5 and 2.");

    const cartesiaTts = new cartesia.TTS({
      model: "sonic-3",
      voice: voiceId,
      apiKey: cartesiaKey,
      language: "en",
      speed,
      volume,
      emotion: process.env.CARTESIA_EMOTION ? [process.env.CARTESIA_EMOTION] : undefined,
    });
    cartesiaTts.prewarm();
    context.addShutdownCallback(() => cartesiaTts.close());

    const session = new voice.AgentSession({
      stt: new deepgram.STT({ model: "nova-3", language: "en" }),
      tts: cartesiaTts,
      vad: await silero.VAD.load({ forceCPU: true, minSilenceDuration: 350 }),
      turnHandling: {
        turnDetection: new inference.TurnDetector({ version: "v1" }),
        endpointing: { minDelay: 400, maxDelay: 1800 },
      },
    });
    let stage: Stage = "awaiting_resolution";
    const history: ChatMessage[] = [];
    const instructions = `You are a helpful, concise voice assistant.
Speak only in English. Keep replies to one or two short sentences.
Your job is to find out if the caller's existing query is resolved. If not, ask what the issue was and save their description.
You may answer a brief greeting, then return to the resolution question. For unrelated requests, politely say you can only help with query resolution.
Call markResolved only when the caller clearly confirms resolution. Call askForIssue when they say it is not resolved.
Call recordIssue only after they describe the issue. Never invent issue details or claim a database change before a tool succeeds. Don't mention tools to the caller.`;

    async function useTool(name: string, transcript: string): Promise<ToolResult> {
      if (name === "markResolved" && stage !== "finished") {
        if (!await markResolved(selectedContactId)) throw new Error("Contact not found.");
        stage = "finished";
        return { done: true };
      }
      if (name === "askForIssue" && stage === "awaiting_resolution") {
        stage = "awaiting_issue";
        return {
          done: false,
          result: "The caller said the query is not resolved. Ask them to describe the issue.",
          fallback: "What was the issue? Please describe it.",
        };
      }
      if (name === "recordIssue" && stage === "awaiting_issue") {
        if (transcript.length > 1000) return {
          done: false,
          result: "The description is too long. Ask for 1,000 characters or fewer.",
          fallback: "Please shorten the issue description.",
        };
        await recordIssue(selectedContactId, transcript);
        stage = "finished";
        return { done: true };
      }
      return {
        done: false,
        result: "That action is not allowed at this step. Continue the resolution conversation.",
        fallback: "Could you clarify that for me?",
      };
    }

    function finishSession() {
      try {
        const speech = session.say("Thank you for your response.", { allowInterruptions: false });
        void speech.waitForPlayout()
          .catch((error) => console.error("Final speech failed:", error))
          .finally(() => context.shutdown("voice audit status recorded"));
      } catch (error) {
        console.error("Final speech could not start:", error);
        context.shutdown("voice audit status recorded");
      }
    }

    const resolutionAgent = voice.Agent.create({
      instructions,
      onUserTurnCompleted: async (_context, _chatContext, message) => {
        const transcript = message.rawTextContent?.trim();
        if (!transcript || stage === "finished") return;

        try {
          const userMessage: ChatMessage = { role: "user", content: transcript };
          const tools: ToolName[] = stage === "awaiting_resolution"
            ? ["markResolved", "askForIssue"]
            : ["markResolved", "recordIssue"];
          const messages: ChatMessage[] = [
            { role: "system", content: `${instructions}\nCurrent step: ${stage}.` },
            ...history,
            userMessage,
          ];
          const first = await askCloudflare(messages, tools);
          const calls = first.tool_calls ?? [];
          if (calls.length > 1) throw new Error("The model requested multiple actions at once.");

          let reply = first.content?.trim() || "";
          if (calls.length === 1) {
            const call = calls[0]!;
            const tool = await useTool(call.function.name, transcript);
            if (tool.done) {
              finishSession();
              return;
            }
            try {
              const followUp = await askCloudflare([
                ...messages,
                first,
                { role: "tool", tool_call_id: call.id, content: tool.result },
              ]);
              reply = followUp.content?.trim() || tool.fallback;
            } catch (error) {
              console.warn("Cloudflare follow-up failed:", error);
              reply = tool.fallback;
            }
          }

          if (!reply) throw new Error("Cloudflare returned an empty reply.");
          history.push(userMessage, { role: "assistant", content: reply });
          session.say(reply, { allowInterruptions: true });
        } catch (error) {
          console.error("Voice audit could not respond:", error);
          session.say("Sorry, I had trouble responding. Could you please say that again?", { allowInterruptions: true });
        }
      },
    });

    await session.start({
      agent: resolutionAgent,
      room: context.room,
    });
    await session.say(`Hi ${contact.name}. Is your query resolved? Please say yes or no.`, { allowInterruptions: true }).waitForPlayout();
  },
});

export default agent;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName: "voice-audit-agent" }));
}
