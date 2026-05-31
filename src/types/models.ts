export type BinderType =
  | "trip-plan"
  | "trail-notes"
  | "fish-log"
  | "ready-kit"
  | "field-steward"
  | "general";

export type Binder = {
  id: string;
  name: string;
  type: BinderType;
  description?: string;
  createdAt: string;
  updatedAt: string;
  importedAt?: string;
};

export type BinderEntry = {
  id: string;
  binderId: string;
  type: string;
  title: string;
  body: string;
  tags: string[];
  date?: string;
  locationName?: string;
  latitude?: number;
  longitude?: number;
  attachmentNotes?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  importedAt?: string;
};

export type Participant = {
  id: string;
  binderId: string;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  notes?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  createdAt: string;
  updatedAt: string;
  importedAt?: string;
};

export type LocalProfile = {
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  notes?: string;
  updatedAt?: string;
};

export type BinderWithCounts = Binder & {
  entryCount: number;
  participantCount: number;
};

export type AppExport = {
  schemaVersion: "field-pack-v1";
  exportedAt: string;
  binders: Binder[];
  entries: BinderEntry[];
  participants: Participant[];
};

export type BinderExport = {
  schemaVersion: "field-pack-binder-v1";
  exportedAt: string;
  binder: Binder;
  entries: BinderEntry[];
  participants: Participant[];
};
