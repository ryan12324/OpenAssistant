import { memoryManager } from "@/lib/rag/memory";
import type { SkillDefinition } from "../types";

export const saveMemory: SkillDefinition = {
  id: "save_memory",
  name: "Save Memory",
  description:
    "Save important information, facts, or user preferences to long-term memory for future recall.",
  category: "memory",
  parameters: [
    {
      name: "content",
      type: "string",
      description: "The information to remember",
      required: true,
    },
    {
      name: "tags",
      type: "string",
      description: "Comma-separated tags for categorization",
    },
    {
      name: "memory_type",
      type: "string",
      description: "Type: short_term, long_term, or episodic",
    },
  ],
  async execute(args, context) {
    const tags = args.tags
      ? (args.tags as string).split(",").map((t) => t.trim())
      : undefined;
    const memoryType =
      (args.memory_type as "short_term" | "long_term" | "episodic") ||
      "long_term";

    const id = await memoryManager.store({
      userId: context.userId,
      content: args.content as string,
      type: memoryType,
      tags,
    });

    return {
      success: true,
      output: `Memory saved successfully (ID: ${id}, type: ${memoryType}).`,
      data: { id, memoryType },
    };
  },
};

export const recallMemory: SkillDefinition = {
  id: "recall_memory",
  name: "Recall Memory",
  description:
    "Search through stored memories to find relevant information about the user or past conversations.",
  category: "memory",
  parameters: [
    {
      name: "query",
      type: "string",
      description: "What to search for in memories",
      required: true,
    },
    {
      name: "memory_type",
      type: "string",
      description: "Filter by type: short_term, long_term, or episodic",
    },
  ],
  async execute(args, context) {
    const result = await memoryManager.recall({
      userId: context.userId,
      query: args.query as string,
      type: args.memory_type as "short_term" | "long_term" | "episodic" | undefined,
    });

    return {
      success: true,
      output: result || "No relevant memories found.",
      data: { query: args.query },
    };
  },
};

export const ingestDocument: SkillDefinition = {
  id: "ingest_document",
  name: "Ingest Document",
  description:
    "Add a document or large text to the knowledge base for future retrieval and reference.",
  category: "memory",
  parameters: [
    {
      name: "content",
      type: "string",
      description: "The document content to ingest",
      required: true,
    },
    {
      name: "title",
      type: "string",
      description: "Title or label for the document",
    },
  ],
  async execute(args, context) {
    const docId = await memoryManager.ingestDocument({
      userId: context.userId,
      content: args.content as string,
      title: args.title as string | undefined,
    });

    return {
      success: true,
      output: `Document ingested into knowledge base (ID: ${docId}).`,
      data: { docId },
    };
  },
};

export const memorySkills = [saveMemory, recallMemory, ingestDocument];
