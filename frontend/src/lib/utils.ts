type Primitive = string | number | boolean | null | undefined;
type ClassDictionary = Record<string, boolean | null | undefined>;
type ClassArray = ClassValue[];
export type ClassValue = Primitive | ClassDictionary | ClassArray;

function normalizeClassValue(value: ClassValue): string[] {
  if (!value) return [];
  if (typeof value === "string" || typeof value === "number") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeClassValue(item));
  }
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([className]) => className);
  }
  return [];
}

export function cn(...inputs: ClassValue[]) {
  return inputs
    .flatMap((input) => normalizeClassValue(input))
    .join(" ")
    .trim();
}
