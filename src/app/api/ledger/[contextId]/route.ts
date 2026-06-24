import { ledger } from "@/lib/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events feed of claim events for a context — the live collapse feed. Each accepted claim
 * arrives as an event; the UI renders it as an identity node settling into place.
 */
export async function GET(request: Request, { params }: { params: Promise<{ contextId: string }> }) {
  const { contextId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let open = true;
      const send = (data: unknown) => {
        if (open) controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      send({ type: "hello", contextId, distinct: ledger.distinctCount(contextId) });

      const unsubscribe = ledger.subscribe(contextId, (event) => send({ type: "event", ...event }));
      const heartbeat = setInterval(() => {
        if (open) controller.enqueue(encoder.encode(": ping\n\n"));
      }, 15_000);

      const cleanup = () => {
        if (!open) return;
        open = false;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
