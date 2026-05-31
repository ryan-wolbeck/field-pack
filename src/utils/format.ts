import type { BinderType } from "../types/models";

export const binderTypeLabels: Record<BinderType, string> = {
  "trip-plan": "Trip Plan",
  "trail-notes": "Trail Notes",
  "fish-log": "Fish Log",
  "ready-kit": "Ready Kit",
  "field-steward": "Field Steward",
  general: "General Binder",
};

export function formatDate(value?: string): string {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function joinTags(tags: string[]): string {
  return tags.join(", ");
}
