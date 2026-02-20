import { requireSession } from "@/lib/auth-server";
import { getProviderList } from "@/lib/ai/providers";

/** GET /api/ai/providers — List available AI providers */
export async function GET() {
  try {
    await requireSession();
    const providers = getProviderList().map((p) => ({
      id: p.id,
      defaultModel: p.defaultModel,
      configured: p.envKey ? !!process.env[p.envKey] : true,
    }));
    return Response.json({ providers });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
