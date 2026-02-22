import type { FlagDef, FlagCategoryDef } from "./types.ts";
import { FLAGS, FLAG_CATEGORIES } from "./flags.ts";

// ==============================================================================
// @ai-git/meta — Utilities
// ==============================================================================

/**
 * Get a random tip based on available flags.
 * Used by the welcome screen to show helpful hints.
 */
export function getRandomTip(): { flag: string; description: string } {
  // Only include flags that have meaningful tips (exclude info flags)
  const tippableFlags = Object.values(FLAGS).filter((f) => f.category !== "info") as FlagDef[];

  const randomFlag = tippableFlags[Math.floor(Math.random() * tippableFlags.length)];

  // Defensive fallback — currently unreachable since FLAGS always has non-info
  // entries, but guards against future changes that might empty the list.
  if (!randomFlag) {
    return { flag: "--help", description: "Show help" };
  }

  return {
    flag: randomFlag.long,
    description: randomFlag.description,
  };
}

/**
 * Get flags grouped by category, ordered by category order.
 * Returns an array of { category, flags } objects.
 */
export function getFlagsByCategory(): {
  category: FlagCategoryDef;
  flags: FlagDef[];
}[] {
  const allFlags = Object.values(FLAGS) as FlagDef[];

  return FLAG_CATEGORIES.slice()
    .sort((a, b) => a.order - b.order)
    .map((category) => ({
      category,
      flags: allFlags.filter((f) => f.category === category.key),
    }));
}
