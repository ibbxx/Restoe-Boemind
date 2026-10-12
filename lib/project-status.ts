export function statusTone(status: string): "positive" | "neutral" | "caution" | "negative" {
  switch (status) {
    case "ACTIVE": return "positive";
    case "COMPLETED": return "neutral";
    case "ON_HOLD": return "caution";
    case "CANCELLED": return "negative";
    default: return "neutral";
  }
}
