import { requireSession } from "@/lib/auth-server";
import { skillRegistry } from "@/lib/skills/registry";
import { getLogger } from "@/lib/logger";

const log = getLogger("api.skills");

export async function GET() {
  try {
    log.info("Listing available skills");
    await requireSession();

    const skills = skillRegistry.getAll().map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      parameters: skill.parameters,
    }));

    log.debug("Skills retrieved", { count: skills.length });
    return Response.json({ skills });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
