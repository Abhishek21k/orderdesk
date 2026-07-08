import { runImport } from "@/lib/import";
import type { ImportSummary } from "@/lib/types";

// Import touches the DB and reads an uploaded file, so it must run on the
// Node runtime and never be cached/prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json(
        { error: "no_file", message: "Upload a CSV file as 'file'." },
        { status: 400 }
      );
    }
    const content = Buffer.from(await file.arrayBuffer());

    const summary: ImportSummary = await runImport(content, file.name || null);
    return Response.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: "import_failed", message },
      { status: 500 }
    );
  }
}
