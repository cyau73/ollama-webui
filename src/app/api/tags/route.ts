//app/api/tags/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  console.log("ROUTE_URL", process.env.NEXT_PUBLIC_OLLAMA_URL);
  const OLLAMA_URL = process.env.NEXT_PUBLIC_OLLAMA_URL || "http://localhost:11434";
  const res = await fetch(
    OLLAMA_URL + "/api/tags"
  );
  console.log("ROUTE_URL_API_TAG", OLLAMA_URL + "/api/tags");
  return new Response(res.body, res);
}
