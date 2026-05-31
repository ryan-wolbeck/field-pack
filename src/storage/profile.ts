import type { LocalProfile } from "../types/models";
import { nowIso } from "../utils/id";

const PROFILE_KEY = "field-pack-local-profile";

export function getLocalProfile(): LocalProfile | null {
  try {
    const stored = localStorage.getItem(PROFILE_KEY);
    return stored ? (JSON.parse(stored) as LocalProfile) : null;
  } catch {
    return null;
  }
}

export function saveLocalProfile(profile: LocalProfile): LocalProfile {
  const next = { ...profile, updatedAt: nowIso() };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  return next;
}

export function clearLocalProfile(): void {
  localStorage.removeItem(PROFILE_KEY);
}
