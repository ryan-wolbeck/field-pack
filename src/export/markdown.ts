import type { BinderExport } from "../types/models";
import { binderTypeLabels, formatDate } from "../utils/format";

export function binderToMarkdown(data: BinderExport): string {
  const lines: string[] = [
    `# ${data.binder.name}`,
    `Type: ${binderTypeLabels[data.binder.type]}  `,
    `Exported: ${formatDate(data.exportedAt)}`,
    "",
  ];

  if (data.binder.description) {
    lines.push(data.binder.description, "");
  }

  lines.push("## Participants");
  if (data.participants.length === 0) {
    lines.push("- None");
  } else {
    data.participants.forEach((participant) => {
      const role = participant.role ? ` - ${participant.role}` : "";
      lines.push(`- ${participant.name}${role}`);
    });
  }

  lines.push("");

  data.entries.forEach((entry) => {
    lines.push(`## ${entry.title}`);
    const participantId = typeof entry.metadata?.participantId === "string" ? entry.metadata.participantId : "";
    const participant = data.participants.find((person) => person.id === participantId);
    if (participant) {
      lines.push(`Person: ${participant.name}  `);
    }
    if (entry.tags.length > 0) {
      lines.push(`Tags: ${entry.tags.join(", ")}  `);
    }
    if (entry.date) {
      lines.push(`Date: ${entry.date}  `);
    }
    if (entry.locationName) {
      lines.push(`Location: ${entry.locationName}  `);
    }
    lines.push("", entry.body || "_No body text._", "");
  });

  return `${lines.join("\n").trim()}\n`;
}

export function createTripSummary(data: BinderExport): string {
  const participantText =
    data.participants.length > 0
      ? data.participants.map((participant) => participant.name).join(", ")
      : "No participants listed";

  const datedEntries = data.entries.filter((entry) => entry.date);
  const dateText =
    datedEntries.length > 0
      ? Array.from(new Set(datedEntries.map((entry) => entry.date))).join(", ")
      : "No dates listed";

  return `${data.binder.name}\nType: ${binderTypeLabels[data.binder.type]}\nDates: ${dateText}\nParticipants: ${participantText}\nEntries: ${data.entries.length}`;
}
