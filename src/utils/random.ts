/**
 * Seeded pseudo-random generator (mulberry32). The seed is stored in the game
 * state so that a "seeded" scenario gives each team a reproducible sequence.
 */
export const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Random seed for a new game; not used in tests, which always pass a seed. */
export const newSeed = (): number => Math.floor(Math.random() * 2 ** 31);
