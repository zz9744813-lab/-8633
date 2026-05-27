import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import { z } from "zod";

const EraPackSchema = z.object({
  id: z.string(),
  name: z.string(),
  yearStart: z.number(),
  calendar: z.string(),
  narrativeIntensity: z.number().min(0).max(1).default(0.3),
  description: z.string(),
  worldPrompt: z.string(),
  occupations: z.array(z.object({
    id: z.string(),
    name: z.string(),
    workplace: z.string(),
    description: z.string(),
    initialSkills: z.record(z.number()).default({}),
    dailyProduces: z.record(z.number()).default({}),
    dailyNeeds: z.record(z.number()).default({}),
  })),
  buildingTypes: z.array(z.object({
    id: z.string(),
    name: z.string(),
    visual: z.string(),
    type: z.string(),
  })),
  clothingPalette: z.object({
    male: z.array(z.string()),
    female: z.array(z.string()),
    forbidden: z.array(z.string()),
  }),
  dialogueStyle: z.string(),
  languages: z.array(z.string()),
  forbiddenConcepts: z.array(z.string()),
  startingConditions: z.object({
    population: z.number(),
    season: z.string(),
    hour: z.number(),
    weather: z.string(),
  }),
  agentGeneration: z.object({
    namePool: z.object({
      male: z.array(z.array(z.string())),
      female: z.array(z.array(z.string())),
    }),
    personalityTemplates: z.array(z.array(z.string())),
  }),
  illnesses: z.array(z.object({
    name: z.string(),
    severityRange: z.array(z.number()).length(2),
  })).default([
    { name: "风寒", severityRange: [0.2, 0.5] },
    { name: "疫病", severityRange: [0.6, 0.9] },
    { name: "旧伤复发", severityRange: [0.3, 0.6] },
  ]),
});

export type EraPack = z.infer<typeof EraPackSchema>;

const ERA_PACKS_DIR = join(process.cwd(), "era-packs");

export async function loadEraPack(id: string): Promise<EraPack | null> {
  try {
    const filePath = join(ERA_PACKS_DIR, `${id}.yaml`);
    const content = readFileSync(filePath, "utf-8");
    const data = yaml.load(content);
    return EraPackSchema.parse(data);
  } catch (error) {
    console.error(`Failed to load era pack ${id}:`, error);
    return null;
  }
}

export function listEraPacks(): string[] {
  try {
    const files = readdirSync(ERA_PACKS_DIR);
    return files
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => f.replace(".yaml", ""));
  } catch {
    return [];
  }
}

export function getWorldPrompt(eraPack: EraPack): string {
  return eraPack.worldPrompt;
}

export function getDialogueStyle(eraPack: EraPack): string {
  return eraPack.dialogueStyle;
}

export function generateAgentIdentity(eraPack: EraPack): {
  name: string;
  age: number;
  gender: "male" | "female";
  occupation: (typeof eraPack.occupations)[number];
  personality: string[];
} {
  const gender = Math.random() > 0.5 ? "male" : "female";
  const namePool = eraPack.agentGeneration.namePool[gender];

  // Generate name
  const firstNames = namePool[0];
  const lastNames = namePool[1];
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const name = `${firstName} ${lastName}`;

  // Generate age (weighted towards working age)
  const ageRoll = Math.random();
  let age: number;
  if (ageRoll < 0.1) {
    age = Math.floor(Math.random() * 15) + 5; // Child
  } else if (ageRoll < 0.8) {
    age = Math.floor(Math.random() * 40) + 20; // Adult
  } else {
    age = Math.floor(Math.random() * 30) + 60; // Elder
  }

  // Select occupation (adults only)
  let occupation = eraPack.occupations[0];
  if (age >= 16) {
    occupation = eraPack.occupations[Math.floor(Math.random() * eraPack.occupations.length)];
  }

  // Select personality
  const templates = eraPack.agentGeneration.personalityTemplates;
  const template = templates[Math.floor(Math.random() * templates.length)];
  const personality = [...template];

  return { name, age, gender, occupation, personality };
}

export function validateEraPack(eraPack: EraPack): string[] {
  const errors: string[] = [];

  // Check for forbidden concepts in world prompt
  for (const concept of eraPack.forbiddenConcepts) {
    if (eraPack.worldPrompt.toLowerCase().includes(concept.toLowerCase())) {
      errors.push(`World prompt contains forbidden concept: ${concept}`);
    }
  }

  // Validate occupations have valid workplaces
  const buildingIds = new Set(eraPack.buildingTypes.map((b) => b.id));
  for (const occ of eraPack.occupations) {
    if (!buildingIds.has(occ.workplace) && occ.workplace !== "farm") {
      errors.push(`Occupation ${occ.id} has unknown workplace: ${occ.workplace}`);
    }
  }

  return errors;
}

export function lintEraOutput(text: string, eraPack: EraPack): {
  ok: boolean; violations: string[];
} {
  const violations: string[] = [];
  for (const word of eraPack.forbiddenConcepts ?? []) {
    if (text.includes(word)) violations.push(word);
  }
  return { ok: violations.length === 0, violations };
}
