export const stagesByCategory = {
  crops: ["preparation", "land-clearing", "planting", "growing", "harvesting"],
  livestock: ["preparation", "stocking", "rearing", "ready-for-sale"],
  aquaculture: ["pond-preparation", "stocking", "growing", "harvesting"],
} as const;

export type FarmCategory = keyof typeof stagesByCategory;
export type ProductionStage = (typeof stagesByCategory)[FarmCategory][number];
export const productionStages = [...new Set(Object.values(stagesByCategory).flat())];
export const fulfillmentStages = ["harvesting", "ready-for-sale"];

// Translate existing records without changing the progress of an existing farm.
export function normalizeStage(stage: string, category: string): ProductionStage {
  if (stage === "accepting-investments") return category === "aquaculture" ? "pond-preparation" : "preparation";
  if (category === "livestock") {
    stage = ({ "land-clearing": "preparation", planting: "stocking", growing: "rearing", harvesting: "ready-for-sale" } as Record<string, string>)[stage] ?? stage;
  }
  if (category === "aquaculture") {
    stage = ({ preparation: "pond-preparation", "land-clearing": "pond-preparation", planting: "stocking" } as Record<string, string>)[stage] ?? stage;
  }
  return productionStages.includes(stage as ProductionStage) ? stage as ProductionStage : "preparation";
}
