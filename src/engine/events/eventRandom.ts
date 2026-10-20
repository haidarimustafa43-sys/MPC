import type { EventMode } from "../../domain/scenario";
import { createRandom } from "../../utils/random";

/** Small stable string hash (FNV-1a) used to derive per-event random streams. */
export const hashString = (text: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

/**
 * Returns the probability roll for one event in one period.
 * - fixed: every team gets the same roll (depends only on the scenario);
 * - seeded: reproducible per team (depends on the game's random seed);
 * - random: varies between runs (the caller supplies fresh entropy).
 * Each event and period has its own stream, so adding an event to a scenario
 * does not change the rolls of the others.
 */
export const eventRoll = (
  mode: EventMode,
  scenarioId: string,
  randomSeed: number,
  entropy: number,
): ((eventId: string, period: number) => number) => {
  const base = mode === "fixed" ? scenarioId : mode === "seeded" ? `seed:${randomSeed}` : `random:${entropy}`;
  return (eventId, period) => createRandom(hashString(`${base}|${eventId}|${period}`))();
};
