import { getLLMClient } from "@/lib/llm/client";
import { memoryManager } from "@/lib/agent/memory";
import { relationshipManager } from "@/db/relationship-repository";
import { Agent } from "@/lib/agent/agent";
import { AgentIdentity } from "@/lib/types";
import { EraPack } from "@/lib/era-pack/loader";
import { rumorEngine } from "./rumor-engine";
import { World } from "./world";

export interface DialogueContext {
  world: World;
  speaker: Agent;
  listener: Agent;
  topic?: string;
  location?: string;
  timeOfDay: string;
  currentTick: number;
  eraPack?: EraPack | null;
}

export interface DialogueResult {
  speakerText: string;
  listenerResponse: string;
  emotionalTone: "friendly" | "neutral" | "hostile" | "excited" | "sad";
  relationshipImpact: number; // -10 to 10
}

export class DialogueSystem {
  // Generate a conversation between two agents
  async generateDialogue(context: DialogueContext): Promise<DialogueResult> {
    const llm = getLLMClient();

    // Get relationship info
    const relationship = await relationshipManager.getRelationship(
      context.speaker.id,
      context.listener.id
    );

    // Get relevant memories for both agents
    const speakerMemories = await memoryManager.retrieveRelevant(
      context.speaker.id,
      `What do I know about ${context.listener.identity.name}? What should I talk about?`,
      3
    );

    const listenerMemories = await memoryManager.retrieveRelevant(
      context.listener.id,
      `What do I know about ${context.speaker.identity.name}?`,
      3
    );

    // Build system prompt with era constraints
    let systemPrompt = this.buildDialoguePrompt(context, relationship);

    const speakerPrompt = `You are ${context.speaker.identity.name}, ${context.speaker.identity.age} years old, a ${context.speaker.identity.occupation}.
Character: ${context.speaker.identity.personality.traits.join(", ")}
Values: ${context.speaker.identity.personality.values.join(", ")}
Background: ${context.speaker.identity.backstory || "Unknown"}

[Relevant memories]
${speakerMemories.map((m) => `- ${m.content}`).join("\n") || "No specific memories"}

[Current situation]
Time: ${context.timeOfDay}
Location: ${context.location || "Unknown"}
Speaking to: ${context.listener.identity.name}, a ${context.listener.identity.occupation}
${relationship ? `Relationship: ${relationship.label} (affinity: ${relationship.affinity})` : "You've just met"}

${context.topic ? `Topic to discuss: ${context.topic}` : "Start a casual conversation"}

Respond with JSON:
{
  "text": "what you say (1-2 sentences, in character)",
  "emotion": "friendly|neutral|hostile|excited|sad",
  "relationshipImpact": number (-10 to 10)
}`;

    try {
      const speakerResponse = await llm.generateJSON<{
        text: string;
        emotion: "friendly" | "neutral" | "hostile" | "excited" | "sad";
        relationshipImpact: number;
      }>(speakerPrompt, systemPrompt);

      // Generate listener response
      const listenerPrompt = `You are ${context.listener.identity.name}, ${context.listener.identity.age} years old, a ${context.listener.identity.occupation}.
Character: ${context.listener.identity.personality.traits.join(", ")}
Values: ${context.listener.identity.personality.values.join(", ")}
Background: ${context.listener.identity.backstory || "Unknown"}

[Relevant memories]
${listenerMemories.map((m) => `- ${m.content}`).join("\n") || "No specific memories"}

[Current situation]
Time: ${context.timeOfDay}
Location: ${context.location || "Unknown"}
${context.speaker.identity.name} just said to you: "${speakerResponse.text}"

${relationship ? `Relationship: ${relationship.label} (affinity: ${relationship.affinity})` : "You've just met"}

Respond with JSON:
{
  "text": "your response (1-2 sentences, in character)",
  "emotion": "friendly|neutral|hostile|excited|sad",
  "relationshipImpact": number (-10 to 10)
}`;

      const listenerResponse = await llm.generateJSON<{
        text: string;
        emotion: "friendly" | "neutral" | "hostile" | "excited" | "sad";
        relationshipImpact: number;
      }>(listenerPrompt, systemPrompt);

      // Record the conversation in memories
      await this.recordDialogue(context, speakerResponse.text, listenerResponse.text);

      // H2: Propagate slang during conversation
      try {
        await this.propagateVocab(
          context.speaker.id,
          context.listener.id,
          speakerResponse.text,
          context.currentTick
        );
      } catch (e) {
        // Vocab propagation is optional
      }

      // Update relationship based on interaction
      const avgImpact = (speakerResponse.relationshipImpact + listenerResponse.relationshipImpact) / 2;
      if (avgImpact > 0) {
        await relationshipManager.recordPositiveInteraction(
          context.speaker.id,
          context.listener.id,
          `Conversation about ${context.topic || "various topics"}`,
          avgImpact / 10,
          context.currentTick
        );
      } else if (avgImpact < 0) {
        await relationshipManager.recordNegativeInteraction(
          context.speaker.id,
          context.listener.id,
          `Tense conversation about ${context.topic || "various topics"}`,
          Math.abs(avgImpact) / 10,
          context.currentTick
        );
      }

      // F3: Try to spread rumors during conversation
      try {
        const spreadResult = await rumorEngine.trySpreadRumor(
          context.world,
          context.speaker,
          context.listener,
          context.topic
        );
        if (spreadResult?.distorted) {
          console.log(`[Rumor] ${context.speaker.identity.name} told ${context.listener.identity.name} a distorted rumor${spreadResult.content ? ` about ${spreadResult.content.substring(0, 50)}` : ""}...`);
        } else if (spreadResult) {
          console.log(`[Rumor] ${context.speaker.identity.name} told ${context.listener.identity.name} a rumor`);
        }
      } catch (e) {
        // Rumor spread is optional, don't fail dialogue
        console.error("[Dialogue] Rumor spread failed:", e);
      }

      return {
        speakerText: speakerResponse.text,
        listenerResponse: listenerResponse.text,
        emotionalTone: speakerResponse.emotion,
        relationshipImpact: avgImpact,
      };
    } catch (error) {
      console.error("[Dialogue] Failed to generate dialogue:", error);

      // Fallback response
      return {
        speakerText: "Hello there! Nice to meet you.",
        listenerResponse: "Hello! Nice to meet you too.",
        emotionalTone: "neutral",
        relationshipImpact: 0,
      };
    }
  }

  // H2: Propagate slang from speaker to listener based on dialogue text
  private async propagateVocab(
    speakerId: string,
    listenerId: string,
    dialogueText: string,
    tick: number
  ): Promise<void> {
    try {
      const { lexiconRepo } = await import("@/db/lexicon-repository");
      const speakerWords = await lexiconRepo.getAgentWords(speakerId);
      for (const w of speakerWords) {
        if (dialogueText.includes(w.word) && Math.random() < 0.7) {
          await lexiconRepo.learnWord(listenerId, w.lexiconId, speakerId, tick);
          await lexiconRepo.recordUsage(speakerId, w.lexiconId);
        }
      }
    } catch (e) {
      // Lexicon tables may not exist yet
    }
  }

  // Build system prompt with era constraints
  private buildDialoguePrompt(
    context: DialogueContext,
    relationship: { label?: string; affinity: number } | null
  ): string {
    let prompt = "You are roleplaying as a character in a simulation. Stay in character at all times.";

    if (context.eraPack) {
      prompt += `\n\n${context.eraPack.worldPrompt}\n\n【对话风格约束】\n${context.eraPack.dialogueStyle}\n\n【绝对禁止提及】\n${context.eraPack.forbiddenConcepts.join("、")}`;
    }

    prompt += "\n\nRespond naturally and concisely. Use your character's voice and perspective.";

    return prompt;
  }

  // Record dialogue as memories for both agents
  private async recordDialogue(
    context: DialogueContext,
    speakerText: string,
    listenerResponse: string
  ): Promise<void> {
    // Record for speaker
    await memoryManager.addMemory({
      agentId: context.speaker.id,
      type: "dialogue",
      content: `Said to ${context.listener.identity.name}: "${speakerText}" They replied: "${listenerResponse}"`,
      importance: 0.5,
      tick: context.currentTick,
      relatedAgentIds: [context.listener.id],
      locationId: context.location,
    });

    // Record for listener
    await memoryManager.addMemory({
      agentId: context.listener.id,
      type: "dialogue",
      content: `${context.speaker.identity.name} said to me: "${speakerText}" I replied: "${listenerResponse}"`,
      importance: 0.5,
      tick: context.currentTick,
      relatedAgentIds: [context.speaker.id],
      locationId: context.location,
    });
  }

  // Generate internal monologue for an agent
  async generateMonologue(
    agent: Agent,
    situation: string,
    currentTick: number
  ): Promise<string> {
    const llm = getLLMClient();

    // Get recent memories
    const memories = await memoryManager.getSTM(agent.id, currentTick, 5);

    const prompt = `You are ${agent.identity.name}, ${agent.identity.age} years old, a ${agent.identity.occupation}.
Character: ${agent.identity.personality.traits.join(", ")}
Values: ${agent.identity.personality.values.join(", ")}

[Recent memories]
${memories.map((m) => `- ${m.content}`).join("\n") || "Nothing in particular"}

[Current situation]
${situation}

What's going through your mind right now? Respond with a brief internal thought (1 sentence).`;

    try {
      const thought = await llm.generateText(prompt, "You are generating an internal monologue. Be introspective and character-appropriate.");
      return thought.trim();
    } catch (error) {
      console.error("[Dialogue] Failed to generate monologue:", error);
      return "I'm thinking about what to do next.";
    }
  }
}

// Global instance
export const dialogueSystem = new DialogueSystem();
