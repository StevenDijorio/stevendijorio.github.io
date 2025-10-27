// src/lib/metrics-queue.ts
// No-op queue for metrics; satisfies type resolution in dev.

export async function enqueueMetric(_event: unknown): Promise<void> {
  // intentionally empty
}

export default { enqueueMetric };


