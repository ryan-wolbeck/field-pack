import type { BinderEntry, BinderType } from "../types/models";
import { createId, nowIso } from "../utils/id";

type TemplateEntry = Omit<BinderEntry, "id" | "binderId" | "createdAt" | "updatedAt">;

const templates: Record<BinderType, TemplateEntry[]> = {
  "trip-plan": [
    {
      type: "overview",
      title: "Trip Overview",
      body: "Destination:\nDates:\nRoute:\nPermits:\nWeather notes:\nKnown risks:\nCheck-in plan:\nExit plan:",
      tags: ["plan"],
    },
    {
      type: "checklist",
      title: "Packing Checklist",
      body: "- Shelter\n- Sleep system\n- Food\n- Water treatment\n- Navigation\n- First aid\n- Repair kit\n- Communication\n- Permits and IDs",
      tags: ["packing"],
    },
    {
      type: "risk-check",
      title: "Risk And Contingency Notes",
      body: "Weather threshold:\nWater level threshold:\nMedical concerns:\nBailout routes:\nNearest help:\nWho has the route:",
      tags: ["safety"],
    },
    {
      type: "individual-log",
      title: "Individual Log Template",
      body: "Person:\nDay/date:\nCondition or status:\nHighlights:\nConcerns:\nFollow-up:",
      tags: ["individual-log"],
    },
  ],
  "trail-notes": [
    {
      type: "note",
      title: "Trail Conditions",
      body: "Trailhead:\nDistance:\nElevation:\nConditions:\nWater sources:\nHazards:\nBlowdowns or closures:\nNotes:",
      tags: ["trail"],
    },
    {
      type: "waypoint",
      title: "Useful Waypoint",
      body: "What is here:\nWhy it matters:\nNavigation notes:",
      tags: ["waypoint"],
    },
  ],
  "fish-log": [
    {
      type: "log",
      title: "Fishing Log Entry",
      body: "Water:\nSpecies:\nBait or lure:\nDepth:\nWater temp:\nWeather:\nConditions:\nCatch notes:",
      tags: ["fish"],
    },
    {
      type: "pattern",
      title: "Pattern Notes",
      body: "What worked:\nWhat did not:\nTime of day:\nStructure:\nRepeat next time:",
      tags: ["pattern"],
    },
    {
      type: "individual-log",
      title: "Partner Log Template",
      body: "Person:\nWater:\nWhat they used:\nCatch notes:\nObservations:",
      tags: ["individual-log"],
    },
  ],
  "ready-kit": [
    {
      type: "inventory",
      title: "Kit Inventory",
      body: "- Item:\n  Quantity:\n  Expiration:\n  Location:\n  Notes:",
      tags: ["inventory"],
    },
    {
      type: "maintenance",
      title: "Maintenance Schedule",
      body: "Battery checks:\nWater rotation:\nFood rotation:\nMedication expiration:\nSeasonal swap:",
      tags: ["maintenance"],
    },
  ],
  "field-steward": [
    {
      type: "stewardship-log",
      title: "Stewardship Log",
      body: "Site:\nWork completed:\nPeople involved:\nTools used:\nFollow-up needed:\nObservations:",
      tags: ["stewardship"],
    },
    {
      type: "issue",
      title: "Site Issue",
      body: "Issue:\nLocation:\nSeverity:\nPhoto reference:\nWho to notify:\nNext action:",
      tags: ["issue"],
    },
  ],
  general: [
    {
      type: "note",
      title: "First Note",
      body: "Use this binder for field notes, plans, lists, and durable reference information.",
      tags: ["note"],
    },
  ],
};

export function createTemplateEntries(binderId: string, type: BinderType): BinderEntry[] {
  const timestamp = nowIso();

  return templates[type].map((entry) => ({
    ...entry,
    id: createId("entry"),
    binderId,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}
