export const COST_CATEGORIES = ["HPP", "PAJAK", "COST OF FUND", "OPERATIONAL", "ASSET", "COORDINATION", "RELATION", "RISK", "OTHER"] as const;
export const COST_CATEGORY_LABELS: Record<string, string> = {
  HPP: "HPP", PAJAK: "Pajak", "COST OF FUND": "Biaya pendanaan", OPERATIONAL: "Operasional", ASSET: "Aset",
  COORDINATION: "Koordinasi", RELATION: "Relasi", RISK: "Risiko", OTHER: "Lainnya",
};
