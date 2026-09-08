export const dynamic = "force-dynamic";

export async function GET() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    return Response.json(
      { error: "NEXT_PUBLIC_API_URL is not configured" },
      { status: 500 }
    );
  }

  return Response.json({ apiUrl });
}