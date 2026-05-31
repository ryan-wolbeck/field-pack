import type { AppExport, BinderExport, BinderType } from "../types/models";

export type ImportPreview = {
  kind: "all" | "binder";
  schemaVersion: string;
  binderCount: number;
  entryCount: number;
  participantCount: number;
  binderNames: string[];
  binderTypes: BinderType[];
  sensitiveFields: string[];
  exportedAt?: string;
};

export function parseFieldPackImport(text: string): AppExport | BinderExport {
  const parsed = JSON.parse(text) as AppExport | BinderExport;
  if (parsed.schemaVersion !== "field-pack-v1" && parsed.schemaVersion !== "field-pack-binder-v1") {
    throw new Error("Unsupported Field Pack JSON file.");
  }
  return parsed;
}

export function createImportPreview(data: AppExport | BinderExport): ImportPreview {
  if (data.schemaVersion === "field-pack-v1") {
    return {
      kind: "all",
      schemaVersion: data.schemaVersion,
      binderCount: data.binders.length,
      entryCount: data.entries.length,
      participantCount: data.participants.length,
      binderNames: data.binders.map((binder) => binder.name),
      binderTypes: Array.from(new Set(data.binders.map((binder) => binder.type))),
      sensitiveFields: collectSensitiveFields(data.participants),
      exportedAt: data.exportedAt,
    };
  }

  return {
    kind: "binder",
    schemaVersion: data.schemaVersion,
    binderCount: 1,
    entryCount: data.entries.length,
    participantCount: data.participants.length,
    binderNames: [data.binder.name],
    binderTypes: [data.binder.type],
    sensitiveFields: collectSensitiveFields(data.participants),
    exportedAt: data.exportedAt,
  };
}

function collectSensitiveFields(participants: AppExport["participants"]): string[] {
  const fields = new Set<string>();
  participants.forEach((participant) => {
    if (participant.email) fields.add("emails");
    if (participant.phone) fields.add("phone numbers");
    if (participant.emergencyContactName || participant.emergencyContactPhone) fields.add("emergency contacts");
    if (participant.notes) fields.add("participant notes");
  });
  return Array.from(fields);
}
