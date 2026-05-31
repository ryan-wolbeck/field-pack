import type { BinderExport } from "../types/models";

export function binderToGeoJson(data: BinderExport): string {
  const features = data.entries
    .filter((entry) => typeof entry.latitude === "number" && typeof entry.longitude === "number")
    .map((entry) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [entry.longitude, entry.latitude],
      },
      properties: {
        id: entry.id,
        binderId: data.binder.id,
        binderName: data.binder.name,
        title: entry.title,
        type: entry.type,
        date: entry.date,
        locationName: entry.locationName,
        tags: entry.tags,
      },
    }));

  return `${JSON.stringify({ type: "FeatureCollection", features }, null, 2)}\n`;
}

export function binderToGpx(data: BinderExport): string {
  const points = data.entries
    .filter((entry) => typeof entry.latitude === "number" && typeof entry.longitude === "number")
    .map(
      (entry) => `  <wpt lat="${entry.latitude}" lon="${entry.longitude}">
    <name>${escapeXml(entry.title)}</name>
    ${entry.locationName ? `<desc>${escapeXml(entry.locationName)}</desc>` : ""}
    ${entry.date ? `<time>${escapeXml(entry.date)}</time>` : ""}
  </wpt>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Field Pack" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(data.binder.name)}</name>
  </metadata>
${points}
</gpx>
`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
