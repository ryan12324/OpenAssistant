export async function GET() {
  const ragUrl = process.env.RAG_SERVER_URL || "http://localhost:8020";

  try {
    const res = await fetch(`${ragUrl}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({
      status: "error",
      lightrag: false,
      rag_anything: false,
      message: "RAG server unreachable",
    });
  }
}
