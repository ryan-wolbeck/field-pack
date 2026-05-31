import type { BinderEntry, Participant } from "../types/models";

function cell(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function rowsToCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(cell).join(","), ...rows.map((row) => row.map(cell).join(","))].join("\n");
}

export function entriesToCsv(entries: BinderEntry[]): string {
  return `${rowsToCsv(
    ["id", "type", "participantId", "title", "date", "locationName", "latitude", "longitude", "tags", "body", "createdAt", "updatedAt"],
    entries.map((entry) => [
      entry.id,
      entry.type,
      typeof entry.metadata?.participantId === "string" ? entry.metadata.participantId : "",
      entry.title,
      entry.date,
      entry.locationName,
      entry.latitude,
      entry.longitude,
      entry.tags.join("; "),
      entry.body,
      entry.createdAt,
      entry.updatedAt,
    ])
  )}\n`;
}

export function participantsToCsv(participants: Participant[]): string {
  return `${rowsToCsv(
    ["id", "name", "role", "email", "phone", "emergencyContactName", "emergencyContactPhone", "notes", "createdAt", "updatedAt"],
    participants.map((participant) => [
      participant.id,
      participant.name,
      participant.role,
      participant.email,
      participant.phone,
      participant.emergencyContactName,
      participant.emergencyContactPhone,
      participant.notes,
      participant.createdAt,
      participant.updatedAt,
    ])
  )}\n`;
}
