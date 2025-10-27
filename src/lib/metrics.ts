// src/lib/metrics.ts
// No-op metrics ingestor to satisfy optional import in dev.

export async function ingestMetric(_event: unknown): Promise<void> {
  // intentionally empty
}

export default { ingestMetric };


