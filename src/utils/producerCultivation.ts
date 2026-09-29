export const produceCategories = ["livestock", "crops", "aquaculture"] as const;
export type CultivatedProduce = { name: string; category: typeof produceCategories[number]; farmingCapacityKg: number };

export function parseCultivatedProduce(input: unknown): CultivatedProduce[] {
  let value = input;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { throw new Error("Produce cultivated must be a valid list"); }
  }
  if (!Array.isArray(value) || !value.length) throw new Error("Add at least one cultivated produce");
  const seen = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || typeof entry.name !== "string" || !entry.name.trim() || entry.name.trim().length > 100 ||
        !produceCategories.includes(entry.category) || typeof entry.farmingCapacityKg !== "number" ||
        !Number.isFinite(entry.farmingCapacityKg) || entry.farmingCapacityKg <= 0) {
      throw new Error("Each produce needs a name, category, and farming capacity greater than zero in kg");
    }
    const name = entry.name.trim().replace(/\s+/g, " ");
    const key = `${entry.category}:${name.toLowerCase()}`;
    if (seen.has(key)) throw new Error("Enter each produce only once per category");
    seen.add(key);
    return { name, category: entry.category, farmingCapacityKg: entry.farmingCapacityKg };
  });
}

export function acreage(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const match = String(value).trim().match(/^(\d*\.?\d+)\s*(acres?|hectares?|ha)$/i);
  if (!match) return null;
  const acres = Number(match[1]) * (/^(hectare|ha)/i.test(match[2] ?? "") ? 2.4710538147 : 1);
  return Number.isFinite(acres) && acres > 0 ? acres : null;
}

export function cultivationAnalytics(producers: { farmSize?: unknown; produceCultivated?: unknown; cropsGrown?: unknown }[]) {
  let totalAcreage = 0;
  let missingAcreageCount = 0;
  let missingCapacityCount = 0;
  const totals = new Map<string, CultivatedProduce>();
  for (const producer of producers) {
    const acres = acreage(producer.farmSize);
    if (acres === null) missingAcreageCount++; else totalAcreage += acres;
    const entries = Array.isArray(producer.produceCultivated) ? producer.produceCultivated : [];
    if (!entries.length) missingCapacityCount++;
    for (const entry of entries) {
      let produce: CultivatedProduce;
      try { produce = parseCultivatedProduce([entry])[0]!; } catch { missingCapacityCount++; continue; }
      const key = `${produce.category}:${produce.name.toLowerCase()}`;
      const current = totals.get(key);
      if (current) current.farmingCapacityKg += produce.farmingCapacityKg;
      else totals.set(key, { ...produce, name: produce.name.toLowerCase() });
    }
  }
  return { totalAcreage, missingAcreageCount, missingCapacityCount,
    capacityByProduce: [...totals.values()].sort((a, b) => b.farmingCapacityKg - a.farmingCapacityKg || a.name.localeCompare(b.name)) };
}
