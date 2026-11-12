export async function register() {
  // Only the real production server (not `next build`, not `next dev`).
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { checkProductionEnv } = await import("@/lib/env-check");
    checkProductionEnv();
  }
}
