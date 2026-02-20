export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  /** The AI tool definition passed to the LLM */
  parameters: SkillParameter[];
  /** Execute the skill with the given arguments */
  execute: (args: Record<string, unknown>, context: SkillContext) => Promise<SkillResult>;
}

export interface SkillParameter {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required?: boolean;
}

export interface SkillContext {
  userId: string;
  conversationId: string;
}

export interface SkillResult {
  success: boolean;
  output: string;
  data?: unknown;
}

export type SkillCategory =
  | "memory"
  | "web"
  | "productivity"
  | "code"
  | "system"
  | "communication";
