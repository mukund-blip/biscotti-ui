import { scoutAnswer, streamPlan } from "@/demos/streaming-response-data";

/**
 * GET /api/stream — streams Scout's canned answer as UTF-8 text with model-like token timing.
 *
 * Query params:
 *   speed=0.25…4   playback multiplier (default 1)
 *   fail=1         drop the connection partway through (the client sees a stream error)
 *
 * Reading `request.url` makes this handler dynamic, so it is never prerendered or cached.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const speed = Math.min(4, Math.max(0.25, Number(params.get("speed")) || 1));
  const fail = params.get("fail") === "1";
  const plan = streamPlan(scoutAnswer);
  const failAt = Math.floor(plan.length * 0.55);
  const encoder = new TextEncoder();
  let cancelled = false;

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms);
      request.signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
    });

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (let i = 0; i < plan.length; i++) {
        await sleep(plan[i].delay / speed);
        if (cancelled || request.signal.aborted) return;
        if (fail && i === failAt) {
          controller.error(new Error("Upstream connection reset"));
          return;
        }
        controller.enqueue(encoder.encode(plan[i].text));
      }
      controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // no-transform stops compression layers from buffering chunks; X-Accel-Buffering does the same for nginx.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
