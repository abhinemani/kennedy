// Shared by every route that calls a model, because all of them are on a clock.
/**
 * Runs `work` with a deadline the caller cannot overrun.
 *
 * Aborting the signal asks the client to stop; racing a timer makes sure we stop waiting
 * either way. Without the race, a client that ignores its abort signal holds the page for as
 * long as it likes, and the budget is a suggestion rather than a limit.
 */
export async function withDeadline<T>(
  timeoutMs: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const expired = new Promise<{ ok: false }>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ ok: false });
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      work(controller.signal).then((value) => ({ ok: true as const, value })),
      expired,
    ]);
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}
