/**
 * Research service — handles crafting research points and recipe discovery.
 */
import { RECIPES, type Recipe } from "@game/shared";
import type { Player } from "@game/shared";

export const RESEARCH_COST = 100; // research points to discover one recipe
export const RESEARCH_RATE = 10;   // points earned per hour elapsed

export class Research {
  /** Grant research points based on hours elapsed (called on login). */
  grantResearchPoints(player: Player, hoursElapsed: number) {
    player.researchPoints = Math.min(
      (player.researchPoints ?? 0) + Math.floor(hoursElapsed * RESEARCH_RATE),
      999
    );
  }

  /**
   * Attempt to discover a random undiscovered recipe via research.
   * Returns the discovered recipe, or null if none available / insufficient points.
   */
  attemptDiscovery(player: Player): Recipe | null {
    const undiscovered = RECIPES.filter(
      (r) => !r.discovered && r.discoveryMethod === "research"
    );
    if (undiscovered.length === 0) return null;
    if ((player.researchPoints ?? 0) < RESEARCH_COST) return null;

    player.researchPoints -= RESEARCH_COST;
    const found = undiscovered[Math.floor(Math.random() * undiscovered.length)];
    found.discovered = true;
    return found;
  }
}