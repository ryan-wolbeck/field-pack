import { describe, expect, it } from "vitest";
import { entriesToCsv, participantsToCsv } from "./csv";
import { binderToGeoJson, binderToGpx } from "./geo";
import { binderToMarkdown } from "./markdown";
import { createImportPreview, parseFieldPackImport } from "../import/preview";
import type { BinderExport } from "../types/models";

const binderExport: BinderExport = {
  schemaVersion: "field-pack-binder-v1",
  exportedAt: "2026-05-30T00:00:00.000Z",
  binder: {
    id: "binder_1",
    name: "Boundary Waters",
    type: "trip-plan",
    createdAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
  },
  entries: [
    {
      id: "entry_1",
      binderId: "binder_1",
      type: "waypoint",
      title: "Portage",
      body: "Rocky landing",
      tags: ["route"],
      latitude: 47.9,
      longitude: -91.8,
      createdAt: "2026-05-30T00:00:00.000Z",
      updatedAt: "2026-05-30T00:00:00.000Z",
    },
  ],
  participants: [
    {
      id: "participant_1",
      binderId: "binder_1",
      name: "Ryan",
      role: "Trip Lead",
      phone: "555-0100",
      emergencyContactName: "Caitlin",
      createdAt: "2026-05-30T00:00:00.000Z",
      updatedAt: "2026-05-30T00:00:00.000Z",
    },
  ],
};

describe("portable exports", () => {
  it("renders readable markdown", () => {
    expect(binderToMarkdown(binderExport)).toContain("# Boundary Waters");
    expect(binderToMarkdown(binderExport)).toContain("Ryan - Trip Lead");
  });

  it("renders CSV for entries and participants", () => {
    expect(entriesToCsv(binderExport.entries)).toContain('"Portage"');
    expect(participantsToCsv(binderExport.participants)).toContain('"Ryan"');
  });

  it("renders GeoJSON and GPX waypoints", () => {
    expect(JSON.parse(binderToGeoJson(binderExport)).features).toHaveLength(1);
    expect(binderToGpx(binderExport)).toContain('<wpt lat="47.9" lon="-91.8">');
  });
});

describe("import preview", () => {
  it("summarizes binder files and sensitive fields", () => {
    const parsed = parseFieldPackImport(JSON.stringify(binderExport));
    const preview = createImportPreview(parsed);
    expect(preview.binderCount).toBe(1);
    expect(preview.entryCount).toBe(1);
    expect(preview.sensitiveFields).toContain("phone numbers");
    expect(preview.sensitiveFields).toContain("emergency contacts");
  });
});
