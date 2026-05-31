import Dexie, { type Table } from "dexie";
import type {
  AppExport,
  Binder,
  BinderEntry,
  BinderExport,
  BinderType,
  BinderWithCounts,
  Participant,
} from "../types/models";
import { createTemplateEntries } from "../templates/binderTemplates";
import { createId, nowIso } from "../utils/id";

class FieldPackDatabase extends Dexie {
  binders!: Table<Binder, string>;
  entries!: Table<BinderEntry, string>;
  participants!: Table<Participant, string>;

  constructor() {
    super("field-pack");
    this.version(1).stores({
      binders: "id, name, type, createdAt, updatedAt",
      entries: "id, binderId, title, type, createdAt, updatedAt, *tags",
      participants: "id, binderId, name, createdAt, updatedAt",
    });
  }
}

export const db = new FieldPackDatabase();

type CreateBinderInput = {
  name: string;
  type: BinderType;
  description?: string;
};

export async function createBinder(input: CreateBinderInput): Promise<Binder> {
  const timestamp = nowIso();
  const binder: Binder = {
    id: createId("binder"),
    name: input.name.trim(),
    type: input.type,
    description: input.description?.trim() || undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const entries = createTemplateEntries(binder.id, binder.type);

  await db.transaction("rw", db.binders, db.entries, async () => {
    await db.binders.add(binder);
    await db.entries.bulkAdd(entries);
  });

  return binder;
}

export async function updateBinder(binder: Binder): Promise<void> {
  await db.binders.put({ ...binder, updatedAt: nowIso() });
}

export async function deleteBinder(id: string): Promise<void> {
  await db.transaction("rw", db.binders, db.entries, db.participants, async () => {
    await db.binders.delete(id);
    await db.entries.where("binderId").equals(id).delete();
    await db.participants.where("binderId").equals(id).delete();
  });
}

export async function listBinders(): Promise<BinderWithCounts[]> {
  const binders = await db.binders.orderBy("updatedAt").reverse().toArray();
  const rows = await Promise.all(
    binders.map(async (binder) => ({
      ...binder,
      entryCount: await db.entries.where("binderId").equals(binder.id).count(),
      participantCount: await db.participants.where("binderId").equals(binder.id).count(),
    }))
  );
  return rows;
}

export async function getBinder(id: string): Promise<Binder | undefined> {
  return db.binders.get(id);
}

export async function createEntry(
  input: Omit<BinderEntry, "id" | "createdAt" | "updatedAt">
): Promise<BinderEntry> {
  const timestamp = nowIso();
  const entry: BinderEntry = {
    ...input,
    id: createId("entry"),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.transaction("rw", db.entries, db.binders, async () => {
    await db.entries.add(entry);
    await touchBinder(input.binderId);
  });

  return entry;
}

export async function updateEntry(entry: BinderEntry): Promise<void> {
  await db.transaction("rw", db.entries, db.binders, async () => {
    await db.entries.put({ ...entry, updatedAt: nowIso() });
    await touchBinder(entry.binderId);
  });
}

export async function deleteEntry(id: string): Promise<void> {
  const entry = await db.entries.get(id);
  if (!entry) {
    return;
  }

  await db.transaction("rw", db.entries, db.binders, async () => {
    await db.entries.delete(id);
    await touchBinder(entry.binderId);
  });
}

export async function listEntriesForBinder(
  binderId: string,
  sortBy: "updatedAt" | "createdAt" = "updatedAt"
): Promise<BinderEntry[]> {
  const entries = await db.entries.where("binderId").equals(binderId).toArray();
  return entries.sort((a, b) => b[sortBy].localeCompare(a[sortBy]));
}

export async function searchEntries(binderId: string, query: string): Promise<BinderEntry[]> {
  const needle = query.trim().toLowerCase();
  const entries = await listEntriesForBinder(binderId);
  if (!needle) {
    return entries;
  }

  return entries.filter((entry) =>
    [entry.title, entry.body, entry.locationName, entry.tags.join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(needle)
  );
}

export async function createParticipant(
  input: Omit<Participant, "id" | "createdAt" | "updatedAt">
): Promise<Participant> {
  const timestamp = nowIso();
  const participant: Participant = {
    ...input,
    id: createId("participant"),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.transaction("rw", db.participants, db.binders, async () => {
    await db.participants.add(participant);
    await touchBinder(input.binderId);
  });

  return participant;
}

export async function updateParticipant(participant: Participant): Promise<void> {
  await db.transaction("rw", db.participants, db.binders, async () => {
    await db.participants.put({ ...participant, updatedAt: nowIso() });
    await touchBinder(participant.binderId);
  });
}

export async function deleteParticipant(id: string): Promise<void> {
  const participant = await db.participants.get(id);
  if (!participant) {
    return;
  }

  await db.transaction("rw", db.participants, db.binders, async () => {
    await db.participants.delete(id);
    await touchBinder(participant.binderId);
  });
}

export async function listParticipantsForBinder(binderId: string): Promise<Participant[]> {
  return db.participants.where("binderId").equals(binderId).sortBy("name");
}

export async function exportAllData(): Promise<AppExport> {
  return {
    schemaVersion: "field-pack-v1",
    exportedAt: nowIso(),
    binders: await db.binders.toArray(),
    entries: await db.entries.toArray(),
    participants: await db.participants.toArray(),
  };
}

export async function exportBinder(binderId: string): Promise<BinderExport> {
  const binder = await getBinder(binderId);
  if (!binder) {
    throw new Error("Binder not found.");
  }

  return {
    schemaVersion: "field-pack-binder-v1",
    exportedAt: nowIso(),
    binder,
    entries: await db.entries.where("binderId").equals(binderId).toArray(),
    participants: await db.participants.where("binderId").equals(binderId).toArray(),
  };
}

export async function importData(data: AppExport): Promise<number> {
  if (data.schemaVersion !== "field-pack-v1") {
    throw new Error("Unsupported Field Pack data file.");
  }

  let imported = 0;
  for (const binder of data.binders) {
    await importBinder({
      schemaVersion: "field-pack-binder-v1",
      exportedAt: data.exportedAt,
      binder,
      entries: data.entries.filter((entry) => entry.binderId === binder.id),
      participants: data.participants.filter((participant) => participant.binderId === binder.id),
    });
    imported += 1;
  }

  return imported;
}

export async function importBinder(data: BinderExport): Promise<Binder> {
  if (data.schemaVersion !== "field-pack-binder-v1") {
    throw new Error("Unsupported Field Pack binder file.");
  }

  const timestamp = nowIso();
  const oldBinderId = data.binder.id;
  const newBinderId = createId("binder");
  const existingNames = new Set((await db.binders.toArray()).map((binder) => binder.name));
  const binderName = existingNames.has(data.binder.name)
    ? `${data.binder.name} Imported ${new Date().toLocaleDateString()}`
    : data.binder.name;
  const binder: Binder = {
    ...data.binder,
    id: newBinderId,
    name: binderName,
    importedAt: timestamp,
  };

  const entries = data.entries.map((entry) => ({
    ...entry,
    id: createId("entry"),
    binderId: newBinderId,
    importedAt: timestamp,
  }));

  const participants = data.participants.map((participant) => ({
    ...participant,
    id: createId("participant"),
    binderId: newBinderId,
    importedAt: timestamp,
  }));

  await db.transaction("rw", db.binders, db.entries, db.participants, async () => {
    await db.binders.add(binder);
    if (entries.length > 0) {
      await db.entries.bulkAdd(entries);
    }
    if (participants.length > 0) {
      await db.participants.bulkAdd(participants);
    }
  });

  if (oldBinderId === newBinderId) {
    throw new Error("Could not import binder.");
  }

  return binder;
}

async function touchBinder(binderId: string): Promise<void> {
  const binder = await db.binders.get(binderId);
  if (binder) {
    await db.binders.put({ ...binder, updatedAt: nowIso() });
  }
}
