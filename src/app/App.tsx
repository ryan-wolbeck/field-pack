import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createBinder,
  createEntry,
  createParticipant,
  deleteBinder,
  deleteEntry,
  deleteParticipant,
  exportAllData,
  exportBinder,
  getBinder,
  importBinder,
  importData,
  listBinders,
  listEntriesForBinder,
  listParticipantsForBinder,
  updateBinder,
  updateEntry,
  updateParticipant,
} from "../storage/db";
import type { AppExport, Binder, BinderEntry, BinderExport, BinderType, BinderWithCounts, Participant } from "../types/models";
import { binderTypeLabels, formatDate, joinTags, splitTags } from "../utils/format";
import { binderToMarkdown, createTripSummary } from "../export/markdown";
import { downloadTextFile, slugify } from "../export/download";
import { entriesToCsv, participantsToCsv } from "../export/csv";
import { binderToGeoJson, binderToGpx } from "../export/geo";
import { printBinder } from "../export/print";
import { createImportPreview, parseFieldPackImport, type ImportPreview } from "../import/preview";
import { clearLocalProfile, getLocalProfile, saveLocalProfile } from "../storage/profile";

type View =
  | { name: "dashboard" }
  | { name: "binder"; binderId: string; tab?: BinderTab }
  | { name: "profile" }
  | { name: "about" }
  | { name: "install" }
  | { name: "import" };

type InstallState = "android-ready" | "ios" | "hidden";

function useInstallPrompt(): { state: InstallState; install: () => void; dismiss: () => void } {
  const [state, setState] = useState<InstallState>(() => {
    if (localStorage.getItem("field-pack-install-dismissed")) return "hidden";
    if (window.matchMedia("(display-mode: standalone)").matches) return "hidden";
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua) && !("standalone" in navigator && (navigator as { standalone?: boolean }).standalone)) {
      return "ios";
    }
    return "hidden";
  });

  const promptRef = useRef<{ prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as unknown as typeof promptRef.current;
      if (!localStorage.getItem("field-pack-install-dismissed")) {
        setState("android-ready");
      }
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    const handler = () => setState("hidden");
    window.addEventListener("appinstalled", handler);
    return () => window.removeEventListener("appinstalled", handler);
  }, []);

  const install = useCallback(async () => {
    if (!promptRef.current) return;
    await promptRef.current.prompt();
    const { outcome } = await promptRef.current.userChoice;
    if (outcome === "accepted") setState("hidden");
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem("field-pack-install-dismissed", "1");
    setState("hidden");
  }, []);

  return { state, install, dismiss };
}

type BinderTab = "entries" | "participants" | "share";
type Notice = { type: "success" | "error"; text: string } | null;

const binderTypes: BinderType[] = [
  "trip-plan",
  "trail-notes",
  "fish-log",
  "ready-kit",
  "field-steward",
  "general",
];

const binderTypeDescriptions: Record<BinderType, string> = {
  "trip-plan": "A shared trip binder for route plans, checklists, group notes, participants, and individual trip logs.",
  "trail-notes": "A place to keep trail conditions, waypoints, route notes, and observations over time.",
  "fish-log": "A fishing binder for catch notes, patterns, water conditions, partners, and individual outing logs.",
  "ready-kit": "A durable kit binder for inventory, maintenance, family members, and readiness notes.",
  "field-steward": "A stewardship binder for sites, volunteers, work logs, issues, and follow-up tasks.",
  general: "A flexible binder for field notes that do not fit another category.",
};

type EntryDraft = Omit<BinderEntry, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  tagsText: string;
  participantId: string;
};

const emptyEntry = (
  binderId: string,
  overrides: Partial<Omit<BinderEntry, "id" | "createdAt" | "updatedAt">> = {}
): Omit<BinderEntry, "id" | "createdAt" | "updatedAt"> => ({
  binderId,
  type: "note",
  title: "",
  body: "",
  tags: [],
  ...overrides,
});

function getEntryParticipantId(entry: Pick<BinderEntry, "metadata">): string {
  return typeof entry.metadata?.participantId === "string" ? entry.metadata.participantId : "";
}

function participantName(participants: Participant[], participantId: string): string {
  return participants.find((participant) => participant.id === participantId)?.name || "Unassigned";
}

function isSharedPack(binder: Pick<Binder, "type"> & { participantCount?: number }): boolean {
  return binder.type === "trip-plan" || binder.type === "fish-log" || binder.type === "field-steward" || Boolean(binder.participantCount);
}

function draftKey(kind: "entry" | "participant", id: string): string {
  return `field-pack-draft:${kind}:${id}`;
}

function readDraft<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? ({ ...fallback, ...JSON.parse(stored) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveDraft(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function clearDraft(key: string): void {
  localStorage.removeItem(key);
}

const emptyParticipant = (binderId: string): Omit<Participant, "id" | "createdAt" | "updatedAt"> => ({
  binderId,
  name: "",
});

export function App() {
  const [view, setView] = useState<View>({ name: "dashboard" });
  const [binders, setBinders] = useState<BinderWithCounts[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [profileVersion, setProfileVersion] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const refreshBinders = useCallback(async () => {
    setBinders(await listBinders());
  }, []);

  useEffect(() => {
    refreshBinders();
  }, [refreshBinders]);

  const showNotice = (next: Notice) => {
    setNotice(next);
    window.setTimeout(() => setNotice(null), 5200);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <button className="brand" onClick={() => setView({ name: "dashboard" })}>
          <img className="brand-logo" src="brand/field-pack-logo.png" alt="" />
          <span>
            <strong>Field Pack</strong>
            <small>Local field binders</small>
          </span>
        </button>
        <button
          className="sidebar-toggle"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
        >
          {sidebarCollapsed ? ">" : "<"}
        </button>
        <nav className="side-nav" aria-label="Main navigation">
          <button className={view.name === "dashboard" ? "active" : ""} onClick={() => setView({ name: "dashboard" })}>
            <span>Packs</span>
          </button>
          <button className={view.name === "profile" ? "active" : ""} onClick={() => setView({ name: "profile" })}>
            <span>Profile</span>
          </button>
          <button className={view.name === "import" ? "active" : ""} onClick={() => setView({ name: "import" })}>
            <span>Import</span>
          </button>
          <button className={view.name === "install" ? "active" : ""} onClick={() => setView({ name: "install" })}>
            <span>Install</span>
          </button>
          <button className={view.name === "about" ? "active" : ""} onClick={() => setView({ name: "about" })}>
            <span>Privacy</span>
          </button>
        </nav>
        {view.name === "binder" && (
          <div className="side-section">
            <p>Binder</p>
            <button
              className={(view.tab ?? "entries") === "entries" ? "active" : ""}
              onClick={() => setView({ name: "binder", binderId: view.binderId, tab: "entries" })}
            >
              <span>Notes</span>
            </button>
            <button
              className={(view.tab ?? "entries") === "participants" ? "active" : ""}
              onClick={() => setView({ name: "binder", binderId: view.binderId, tab: "participants" })}
            >
              <span>People</span>
            </button>
            <button
              className={(view.tab ?? "entries") === "share" ? "active" : ""}
              onClick={() => setView({ name: "binder", binderId: view.binderId, tab: "share" })}
            >
              <span>Share / Export</span>
            </button>
          </div>
        )}
      </aside>

      {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}

      <main>
        {view.name === "dashboard" && (
          <Dashboard
            binders={binders}
            onOpen={(binderId, tab = "entries") => setView({ name: "binder", binderId, tab })}
            onCreated={(binder) => {
              refreshBinders();
              setView({ name: "binder", binderId: binder.id });
              showNotice({ type: "success", text: "Binder created with starter entries." });
            }}
            onDelete={async (binderId) => {
              if (confirm("Delete this binder and all of its entries and participants?")) {
                await deleteBinder(binderId);
                await refreshBinders();
                showNotice({ type: "success", text: "Binder deleted." });
              }
            }}
            onProfile={() => setView({ name: "profile" })}
          />
        )}
        {view.name === "binder" && (
          <BinderDetail
            binderId={view.binderId}
            tab={view.tab ?? "entries"}
            setTab={(tab) => setView({ name: "binder", binderId: view.binderId, tab })}
            onBack={() => {
              refreshBinders();
              setView({ name: "dashboard" });
            }}
            onChanged={refreshBinders}
            showNotice={showNotice}
            profileVersion={profileVersion}
          />
        )}
        {view.name === "profile" && (
          <ProfilePage
            onSaved={() => {
              setProfileVersion((version) => version + 1);
              showNotice({ type: "success", text: "Local profile saved on this device." });
            }}
            onCleared={() => {
              setProfileVersion((version) => version + 1);
              showNotice({ type: "success", text: "Local profile cleared." });
            }}
          />
        )}
        {view.name === "import" && (
          <ImportPage
            showNotice={showNotice}
            onImported={(binderId) => {
              refreshBinders();
              setView(binderId ? { name: "binder", binderId } : { name: "dashboard" });
            }}
          />
        )}
        {view.name === "install" && <InstallPage />}
        {view.name === "about" && <AboutPage />}
      </main>
    </div>
  );
}

function InstallBanner({ state, install, dismiss }: { state: InstallState; install: () => void; dismiss: () => void }) {
  if (state === "hidden") return null;

  if (state === "android-ready") {
    return (
      <div className="install-banner">
        <div className="install-banner-text">
          <strong>Install Field Pack</strong>
          <span>Add to your home screen for offline use — no app store needed.</span>
        </div>
        <div className="install-banner-actions">
          <button className="primary" onClick={install}>Install App</button>
          <button onClick={dismiss}>Not Now</button>
        </div>
      </div>
    );
  }

  return (
    <div className="install-banner">
      <div className="install-banner-text">
        <strong>Install for offline use</strong>
        <span>
          On iPhone or iPad: tap the{" "}
          <span className="install-icon-inline" aria-label="Share icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 1v9M5 4l3-3 3 3M3 7v7h10V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>{" "}
          Share button in Safari, then tap <strong>Add to Home Screen</strong>.
        </span>
      </div>
      <button className="install-banner-dismiss" onClick={dismiss} aria-label="Dismiss install prompt">✕</button>
    </div>
  );
}

function Dashboard({
  binders,
  onOpen,
  onCreated,
  onDelete,
  onProfile,
}: {
  binders: BinderWithCounts[];
  onOpen: (binderId: string, tab?: BinderTab) => void;
  onCreated: (binder: Binder) => void;
  onDelete: (binderId: string) => void;
  onProfile: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<BinderType>("trip-plan");
  const [description, setDescription] = useState("");
  const profile = getLocalProfile();
  const sharedPacks = binders.filter(isSharedPack);
  const otherBinders = binders.filter((binder) => !isSharedPack(binder));
  const { state: installState, install, dismiss } = useInstallPrompt();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    const binder = await createBinder({ name, type, description });
    setName("");
    setDescription("");
    onCreated(binder);
  }

  return (
    <section className="dashboard-layout">
      <InstallBanner state={installState} install={install} dismiss={dismiss} />
      <div className="dashboard-hero">
        <div>
          <div className="hero-logo-tile">
            <img className="hero-logo" src="brand/field-pack-logo.png" alt="Field Pack" />
          </div>
          <p className="eyebrow">Local field binders</p>
          <h1>Shared packs and field notes in one offline place.</h1>
          <p>
            Trips, fishing outings, and stewardship projects are shared packs: add people first, then keep notes for the whole pack or for one person.
          </p>
        </div>
        {!profile && (
          <div className="profile-prompt">
            <strong>Optional local profile</strong>
            <span>Add yourself to trips quickly without creating an account.</span>
            <button onClick={onProfile}>Set Up Profile</button>
          </div>
        )}
      </div>

      <form className="quick-create" onSubmit={submit}>
        <div>
          <h2>New Binder</h2>
          <p>{binderTypeDescriptions[type]}</p>
        </div>
        <label>
          Type
          <select value={type} onChange={(event) => setType(event.target.value as BinderType)}>
            {binderTypes.map((binderType) => (
              <option value={binderType} key={binderType}>
                {binderTypeLabels[binderType]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Boundary Waters trip" />
        </label>
        <label>
          Description
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional short note" />
        </label>
        <button className="primary" type="submit">
          Create
        </button>
      </form>

      <section>
        <div className="section-heading">
          <h2>Shared Packs</h2>
          <span>{sharedPacks.length} trip or group pack{sharedPacks.length === 1 ? "" : "s"}</span>
        </div>
        {sharedPacks.length === 0 ? (
          <div className="empty-state">Create a Trip Plan, Fish Log, or Field Steward pack to manage people and shared notes.</div>
        ) : (
          <BinderGrid binders={sharedPacks} onOpen={onOpen} onDelete={onDelete} />
        )}
      </section>

      {otherBinders.length > 0 && (
        <section>
          <div className="section-heading">
            <h2>Solo Binders</h2>
            <span>{otherBinders.length} saved locally</span>
          </div>
          <BinderGrid binders={otherBinders} onOpen={onOpen} onDelete={onDelete} />
        </section>
      )}
    </section>
  );
}

function BinderGrid({
  binders,
  onOpen,
  onDelete,
}: {
  binders: BinderWithCounts[];
  onOpen: (binderId: string, tab?: BinderTab) => void;
  onDelete: (binderId: string) => void;
}) {
  return (
    <div className="binder-grid">
      {binders.map((binder) => (
        <article className="binder-card" key={binder.id}>
          <div>
            <p className="eyebrow">{binderTypeLabels[binder.type]}</p>
            <h3>{binder.name}</h3>
            <p>{binder.description || binderTypeDescriptions[binder.type]}</p>
          </div>
          <dl className="stats">
            <div>
              <dt>Notes</dt>
              <dd>{binder.entryCount}</dd>
            </div>
            <div>
              <dt>People</dt>
              <dd>{binder.participantCount}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{formatDate(binder.updatedAt)}</dd>
            </div>
          </dl>
          <div className="row-actions">
            <button className="primary" onClick={() => onOpen(binder.id)}>
              Open
            </button>
            {isSharedPack(binder) && (
              <button onClick={() => onOpen(binder.id, "participants")}>Add People</button>
            )}
            <button onClick={() => onDelete(binder.id)}>Delete</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function BinderDetail({
  binderId,
  tab,
  setTab,
  onBack,
  onChanged,
  showNotice,
  profileVersion,
}: {
  binderId: string;
  tab: BinderTab;
  setTab: (tab: BinderTab) => void;
  onBack: () => void;
  onChanged: () => void;
  showNotice: (notice: Notice) => void;
  profileVersion: number;
}) {
  const [binder, setBinder] = useState<Binder | null>(null);
  const [entries, setEntries] = useState<BinderEntry[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"updatedAt" | "createdAt">("updatedAt");

  const refresh = useCallback(async () => {
    const current = await getBinder(binderId);
    if (!current) {
      setBinder(null);
      return;
    }
    setBinder(current);
    setEntries(await listEntriesForBinder(binderId, sortBy));
    setParticipants(await listParticipantsForBinder(binderId));
  }, [binderId, sortBy]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return entries;
    }
    return entries.filter((entry) =>
      [entry.title, entry.body, entry.locationName, entry.tags.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [entries, query]);

  if (!binder) {
    return (
      <section className="panel">
        <h1>Binder not found</h1>
        <button onClick={onBack}>Back to dashboard</button>
      </section>
    );
  }

  return (
    <section className="detail-layout">
      <button className="text-button" onClick={onBack}>
        Back to dashboard
      </button>
      <div className="detail-header">
        <div>
          <p className="eyebrow">{binderTypeLabels[binder.type]}</p>
          <h1>{binder.name}</h1>
          <p>{binder.description || binderTypeDescriptions[binder.type]}</p>
          <div className="concept-row" aria-label="Binder structure">
            <span>Binder</span>
            <span>People</span>
            <span>Entries can belong to the group or a person</span>
          </div>
        </div>
        <div className="header-actions">
          <button className="primary" onClick={() => setTab("participants")}>Add People</button>
          <button onClick={() => setTab("entries")}>Add Note</button>
          <EditBinderForm
            binder={binder}
            onSaved={async (next) => {
              await updateBinder(next);
              await refresh();
              await onChanged();
              showNotice({ type: "success", text: "Binder details saved." });
            }}
          />
        </div>
      </div>

      {tab === "entries" && (
        <EntriesPanel
          binderId={binder.id}
          entries={filteredEntries}
          participants={participants}
          onPeople={() => setTab("participants")}
          query={query}
          sortBy={sortBy}
          setQuery={setQuery}
          setSortBy={setSortBy}
          onSaved={async () => {
            await refresh();
            await onChanged();
            showNotice({ type: "success", text: "Entry saved." });
          }}
          onDelete={async (entryId) => {
            if (confirm("Delete this entry?")) {
              await deleteEntry(entryId);
              await refresh();
              await onChanged();
              showNotice({ type: "success", text: "Entry deleted." });
            }
          }}
        />
      )}

      {tab === "participants" && (
        <ParticipantsPanel
          binder={binder}
          binderId={binder.id}
          participants={participants}
          entries={entries}
          onSaved={async () => {
            await refresh();
            await onChanged();
            showNotice({ type: "success", text: "Participant saved." });
          }}
          onDelete={async (participantId) => {
            if (confirm("Remove this participant?")) {
              await deleteParticipant(participantId);
              await refresh();
              await onChanged();
              showNotice({ type: "success", text: "Participant removed." });
            }
          }}
          onCreateLog={async (participant) => {
            await createEntry(
              emptyEntry(binder.id, {
                type: "individual-log",
                title: `${participant.name} Log`,
                body: `Person: ${participant.name}\nRole: ${participant.role || ""}\n\nNotes:`,
                tags: ["individual-log"],
                metadata: { participantId: participant.id },
              })
            );
            await refresh();
            await onChanged();
            setTab("entries");
            showNotice({ type: "success", text: `Started an individual log for ${participant.name}.` });
          }}
          onAddProfile={async () => {
            const profile = getLocalProfile();
            if (!profile?.name) {
              showNotice({ type: "error", text: "Set up your local profile first." });
              return;
            }
            const exists = participants.some((participant) => participant.name.toLowerCase() === profile.name.toLowerCase());
            if (exists) {
              showNotice({ type: "error", text: `${profile.name} is already listed in this binder.` });
              return;
            }
            await createParticipant({
              binderId: binder.id,
              name: profile.name,
              role: profile.role || "Participant",
              email: profile.email,
              phone: profile.phone,
              emergencyContactName: profile.emergencyContactName,
              emergencyContactPhone: profile.emergencyContactPhone,
              notes: profile.notes,
            });
            await refresh();
            await onChanged();
            showNotice({ type: "success", text: `Added ${profile.name} from your local profile.` });
          }}
          hasProfile={Boolean(getLocalProfile()?.name)}
          profileVersion={profileVersion}
        />
      )}

      {tab === "share" && (
        <SharePanel
          binder={binder}
          showNotice={showNotice}
          onImported={async () => {
            await refresh();
            await onChanged();
          }}
        />
      )}
    </section>
  );
}

function EditBinderForm({ binder, onSaved }: { binder: Binder; onSaved: (binder: Binder) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(binder.name);
  const [description, setDescription] = useState(binder.description || "");

  if (!editing) {
    return <button onClick={() => setEditing(true)}>Edit Binder</button>;
  }

  return (
    <form
      className="compact-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSaved({ ...binder, name, description });
        setEditing(false);
      }}
    >
      <input value={name} onChange={(event) => setName(event.target.value)} required />
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      <div className="row-actions">
        <button className="primary" type="submit">
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EntriesPanel({
  binderId,
  entries,
  participants,
  onPeople,
  query,
  sortBy,
  setQuery,
  setSortBy,
  onSaved,
  onDelete,
}: {
  binderId: string;
  entries: BinderEntry[];
  participants: Participant[];
  onPeople: () => void;
  query: string;
  sortBy: "updatedAt" | "createdAt";
  setQuery: (query: string) => void;
  setSortBy: (sortBy: "updatedAt" | "createdAt") => void;
  onSaved: () => void;
  onDelete: (entryId: string) => void;
}) {
  const [editing, setEditing] = useState<BinderEntry | "new" | null>(null);
  const [personFilter, setPersonFilter] = useState("all");
  const visibleEntries = useMemo(() => {
    if (personFilter === "all") {
      return entries;
    }
    if (personFilter === "unassigned") {
      return entries.filter((entry) => !getEntryParticipantId(entry));
    }
    return entries.filter((entry) => getEntryParticipantId(entry) === personFilter);
  }, [entries, personFilter]);

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Notes</h2>
          <p>Notes can stay shared with the pack or be assigned to one person.</p>
        </div>
        <button className="primary" onClick={() => setEditing("new")}>New Entry</button>
      </div>
      {participants.length === 0 && (
        <div className="workflow-callout">
          <strong>Add people to this pack</strong>
          <span>People make trip packs useful. Add trip members, fishing partners, volunteers, or family members, then assign notes to them when needed.</span>
          <button onClick={onPeople}>Add People</button>
        </div>
      )}
      <div className="toolbar">
        <input placeholder="Search entries, tags, or locations" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select value={personFilter} onChange={(event) => setPersonFilter(event.target.value)}>
          <option value="all">All entries</option>
          <option value="unassigned">Shared entries</option>
          {participants.map((participant) => (
            <option value={participant.id} key={participant.id}>
              {participant.name}'s entries
            </option>
          ))}
        </select>
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value as "updatedAt" | "createdAt")}>
          <option value="updatedAt">Sort by updated</option>
          <option value="createdAt">Sort by created</option>
        </select>
      </div>
      {editing && (
        <EntryForm
          entry={editing === "new" ? emptyEntry(binderId) : editing}
          participants={participants}
          onCancel={() => setEditing(null)}
          onSave={async (entry) => {
            if ("id" in entry) {
              await updateEntry(entry);
            } else {
              await createEntry(entry);
            }
            setEditing(null);
            onSaved();
          }}
        />
      )}
      <div className="list">
        {visibleEntries.map((entry) => (
          <article className="entry-card" key={entry.id}>
            <div>
              <h3>{entry.title}</h3>
              <p className="person-line">
                {getEntryParticipantId(entry)
                  ? participantName(participants, getEntryParticipantId(entry))
                  : "Shared entry"}
              </p>
              <p>{entry.body.slice(0, 220) || "No body text."}</p>
              <div className="tag-row">
                {entry.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </div>
            <dl className="stats compact">
              <div>
                <dt>Date</dt>
                <dd>{entry.date || "None"}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDate(entry.updatedAt)}</dd>
              </div>
            </dl>
            <div className="row-actions">
              <button onClick={() => setEditing(entry)}>Edit</button>
              <button onClick={() => onDelete(entry.id)}>Delete</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function EntryForm({
  entry,
  participants,
  onSave,
  onCancel,
}: {
  entry: BinderEntry | Omit<BinderEntry, "id" | "createdAt" | "updatedAt">;
  participants: Participant[];
  onSave: (entry: BinderEntry | Omit<BinderEntry, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
}) {
  const key = draftKey("entry", "id" in entry ? entry.id : `new-${entry.binderId}`);
  const [draft, setDraft] = useState<EntryDraft>(() =>
    readDraft(key, { ...entry, tagsText: joinTags(entry.tags), participantId: getEntryParticipantId(entry) })
  );

  useEffect(() => {
    saveDraft(key, draft);
  }, [draft, key]);

  async function useCurrentLocation() {
    if (!("geolocation" in navigator)) {
      alert("GPS location is not available in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft({
          ...draft,
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          metadata: {
            ...(draft.metadata || {}),
            gpsAccuracyMeters: Math.round(position.coords.accuracy),
            gpsCapturedAt: new Date(position.timestamp).toISOString(),
          },
        });
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied."
            : error.code === error.POSITION_UNAVAILABLE
              ? "Current location is unavailable."
              : "Getting current location timed out.";
        alert(message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  }

  return (
    <form
      className="editor"
      onSubmit={(event) => {
        event.preventDefault();
        const latitude = draft.latitude === undefined || Number.isNaN(Number(draft.latitude)) ? undefined : Number(draft.latitude);
        const longitude = draft.longitude === undefined || Number.isNaN(Number(draft.longitude)) ? undefined : Number(draft.longitude);
        const { tagsText, participantId, ...entryFields } = draft;
        const metadata = { ...(entryFields.metadata || {}) };
        if (participantId) {
          metadata.participantId = participantId;
        } else {
          delete metadata.participantId;
        }
        clearDraft(key);
        onSave({
          ...entryFields,
          latitude,
          longitude,
          tags: splitTags(tagsText),
          metadata,
        });
      }}
    >
      <div className="form-grid">
        <label>
          Title
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required />
        </label>
        <label>
          Owner
          <select value={draft.participantId} onChange={(event) => setDraft({ ...draft, participantId: event.target.value, type: event.target.value ? "individual-log" : draft.type })}>
            <option value="">Shared with the whole binder</option>
            {participants.map((participant) => (
              <option value={participant.id} key={participant.id}>
                {participant.name}
              </option>
            ))}
          </select>
          <span className="field-help">Leave this shared, or choose a person when the note belongs to one participant.</span>
        </label>
        <label>
          Entry type
          <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>
            <option value="note">Note</option>
            <option value="individual-log">Personal log</option>
            <option value="checklist">Checklist</option>
            <option value="overview">Overview</option>
            <option value="waypoint">Waypoint</option>
            <option value="log">Field log</option>
          </select>
        </label>
        <label>
          Date
          <input type="date" value={draft.date || ""} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
        </label>
        <label>
          Tags
          <input value={draft.tagsText} onChange={(event) => setDraft({ ...draft, tagsText: event.target.value })} placeholder="packing, route, food" />
        </label>
        <label>
          Location name
          <input value={draft.locationName || ""} onChange={(event) => setDraft({ ...draft, locationName: event.target.value })} />
        </label>
        <label>
          Latitude
          <input type="number" step="any" value={draft.latitude ?? ""} onChange={(event) => setDraft({ ...draft, latitude: event.target.value === "" ? undefined : Number(event.target.value) })} />
        </label>
        <label>
          Longitude
          <input type="number" step="any" value={draft.longitude ?? ""} onChange={(event) => setDraft({ ...draft, longitude: event.target.value === "" ? undefined : Number(event.target.value) })} />
        </label>
      </div>
      <div className="gps-row">
        <button type="button" onClick={useCurrentLocation}>
          Use Current GPS
        </button>
        <span>
          Fills latitude and longitude from this device. Permission is requested by the browser,
          and the location is only saved locally with this entry.
        </span>
      </div>
      {typeof draft.metadata?.gpsAccuracyMeters === "number" && (
        <p className="microcopy">
          GPS accuracy: about {draft.metadata.gpsAccuracyMeters} meters
          {typeof draft.metadata.gpsCapturedAt === "string" ? `, captured ${formatDate(draft.metadata.gpsCapturedAt)}` : ""}.
        </p>
      )}
      <label>
        Body
        <textarea className="large-textarea" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
      </label>
      <label>
        Attachment notes
        <textarea value={draft.attachmentNotes || ""} onChange={(event) => setDraft({ ...draft, attachmentNotes: event.target.value })} placeholder="Reference local filenames, permit numbers, photo names, or paper documents. Binary attachment storage can be added later." />
      </label>
      <p className="microcopy">Draft changes autosave in this browser until you save or clear the editor.</p>
      <div className="row-actions">
        <button className="primary" type="submit">
          Save Entry
        </button>
        <button type="button" onClick={() => { clearDraft(key); onCancel(); }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ParticipantsPanel({
  binder,
  binderId,
  participants,
  entries,
  onSaved,
  onDelete,
  onCreateLog,
  onAddProfile,
  hasProfile,
  profileVersion,
}: {
  binder: Binder;
  binderId: string;
  participants: Participant[];
  entries: BinderEntry[];
  onSaved: () => void;
  onDelete: (participantId: string) => void;
  onCreateLog: (participant: Participant) => void;
  onAddProfile: () => void;
  hasProfile: boolean;
  profileVersion: number;
}) {
  const [editing, setEditing] = useState<Participant | "new" | null>(null);
  const profile = useMemo(() => getLocalProfile(), [profileVersion]);

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>People</h2>
          <p>Add the people tied to {binder.name}. They are local records inside this pack, not accounts.</p>
        </div>
        <div className="row-actions">
          {hasProfile && (
            <button onClick={onAddProfile}>Add Me From Profile</button>
          )}
          <button className="primary" onClick={() => setEditing("new")}>
            Add Person
          </button>
        </div>
      </div>
      {profile && (
        <p className="microcopy">Your local profile is {profile.name}. It is not an account and is only stored on this device.</p>
      )}
      {editing && (
        <ParticipantForm
          participant={editing === "new" ? emptyParticipant(binderId) : editing}
          onCancel={() => setEditing(null)}
          onSave={async (participant) => {
            if ("id" in participant) {
              await updateParticipant(participant);
            } else {
              await createParticipant(participant);
            }
            setEditing(null);
            onSaved();
          }}
        />
      )}
      <div className="list">
        {participants.length === 0 && (
          <div className="empty-state">
            <strong>No people yet.</strong>
            <p>Add trip members, fishing partners, volunteers, or family members here. After that, notes can be shared with the pack or assigned to a specific person.</p>
            <button className="primary" onClick={() => setEditing("new")}>Add First Person</button>
          </div>
        )}
        {participants.map((participant) => (
          <article className="entry-card" key={participant.id}>
            <div>
              <h3>{participant.name}</h3>
              <p>{participant.role || "No role listed"}</p>
              <p>{participant.notes}</p>
            </div>
            <dl className="stats compact">
              <div>
                <dt>Logs</dt>
                <dd>{entries.filter((entry) => getEntryParticipantId(entry) === participant.id).length}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{participant.email || "None"}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{participant.phone || "None"}</dd>
              </div>
            </dl>
            <div className="row-actions">
              <button className="primary" onClick={() => onCreateLog(participant)}>
                Add Individual Log
              </button>
              <button onClick={() => setEditing(participant)}>Edit</button>
              <button onClick={() => onDelete(participant.id)}>Remove</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ParticipantForm({
  participant,
  onSave,
  onCancel,
}: {
  participant: Participant | Omit<Participant, "id" | "createdAt" | "updatedAt">;
  onSave: (participant: Participant | Omit<Participant, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
}) {
  const key = draftKey("participant", "id" in participant ? participant.id : `new-${participant.binderId}`);
  const [draft, setDraft] = useState(() => readDraft(key, participant));

  useEffect(() => {
    saveDraft(key, draft);
  }, [draft, key]);

  return (
    <form
      className="editor"
      onSubmit={(event) => {
        event.preventDefault();
        clearDraft(key);
        onSave(draft);
      }}
    >
      <div className="form-grid">
        <label>
          Name
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
        </label>
        <label>
          Role
          <input value={draft.role || ""} onChange={(event) => setDraft({ ...draft, role: event.target.value })} />
        </label>
        <label>
          Email
          <input type="email" value={draft.email || ""} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
        </label>
        <label>
          Phone
          <input value={draft.phone || ""} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
        </label>
        <label>
          Emergency contact
          <input value={draft.emergencyContactName || ""} onChange={(event) => setDraft({ ...draft, emergencyContactName: event.target.value })} />
        </label>
        <label>
          Emergency phone
          <input value={draft.emergencyContactPhone || ""} onChange={(event) => setDraft({ ...draft, emergencyContactPhone: event.target.value })} />
        </label>
      </div>
      <label>
        Notes
        <textarea value={draft.notes || ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
      </label>
      <div className="row-actions">
        <button className="primary" type="submit">
          Save Person
        </button>
        <button type="button" onClick={() => { clearDraft(key); onCancel(); }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function SharePanel({
  binder,
  showNotice,
  onImported,
}: {
  binder: Binder;
  showNotice: (notice: Notice) => void;
  onImported: () => void;
}) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [pendingImport, setPendingImport] = useState<AppExport | BinderExport | null>(null);

  async function getBinderExport() {
    return exportBinder(binder.id);
  }

  async function previewImport(file: File) {
    const text = await file.text();
    const data = parseFieldPackImport(text);
    setPendingImport(data);
    setPreview(createImportPreview(data));
  }

  async function confirmImport() {
    if (!pendingImport) {
      return;
    }
    if (pendingImport.schemaVersion === "field-pack-v1") {
      const count = await importData(pendingImport);
      await onImported();
      showNotice({ type: "success", text: `Imported ${count} binder${count === 1 ? "" : "s"} as local copies.` });
    } else {
      const imported = await importBinder(pendingImport);
      await onImported();
      showNotice({ type: "success", text: `Imported "${imported.name}" as a local copy.` });
    }
    setPendingImport(null);
    setPreview(null);
  }

  async function validatedJson(data: AppExport | BinderExport): Promise<string> {
    const text = JSON.stringify(data, null, 2);
    parseFieldPackImport(text);
    return text;
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Share / Export</h2>
          <p>
            Field Pack shares by file. Export, send, and import separate local copies.
          </p>
        </div>
        <button
          onClick={async () => {
            const data = await getBinderExport();
            printBinder(data);
          }}
        >
          Print Binder
        </button>
      </div>
      <div className="privacy-callout">
        Binder files can include names, phones, emergency contacts, notes, routes, locations,
        and other personal field details. Check the file before sending it.
      </div>
      <div className="action-grid">
        <button
          className="primary"
          onClick={async () => {
            const data = await getBinderExport();
            downloadTextFile(`${slugify(binder.name)}.field-pack-binder.json`, await validatedJson(data), "application/json");
          }}
        >
          Export Binder JSON
        </button>
        <button
          onClick={async () => {
            const data = await exportAllData();
            downloadTextFile("field-pack-backup.json", await validatedJson(data), "application/json");
          }}
        >
          Export All Data JSON
        </button>
        <button
          onClick={async () => {
            const data = await getBinderExport();
            downloadTextFile(`${slugify(binder.name)}.md`, binderToMarkdown(data), "text/markdown");
          }}
        >
          Export Markdown
        </button>
        <button
          onClick={async () => {
            const data = await getBinderExport();
            await navigator.clipboard.writeText(createTripSummary(data));
            showNotice({ type: "success", text: "Plain-text summary copied." });
          }}
        >
          Copy Summary
        </button>
        <button
          onClick={async () => {
            const data = await getBinderExport();
            downloadTextFile(`${slugify(binder.name)}-entries.csv`, entriesToCsv(data.entries), "text/csv");
          }}
        >
          Export Entries CSV
        </button>
        <button
          onClick={async () => {
            const data = await getBinderExport();
            downloadTextFile(`${slugify(binder.name)}-participants.csv`, participantsToCsv(data.participants), "text/csv");
          }}
        >
          Export People CSV
        </button>
        <button
          onClick={async () => {
            const data = await getBinderExport();
            downloadTextFile(`${slugify(binder.name)}.geojson`, binderToGeoJson(data), "application/geo+json");
          }}
        >
          Export GeoJSON
        </button>
        <button
          onClick={async () => {
            const data = await getBinderExport();
            downloadTextFile(`${slugify(binder.name)}.gpx`, binderToGpx(data), "application/gpx+xml");
          }}
        >
          Export GPX
        </button>
      </div>
      <label className="file-import">
        Preview And Import JSON
        <input
          type="file"
          accept="application/json,.json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }
            try {
              await previewImport(file);
            } catch (error) {
              showNotice({ type: "error", text: error instanceof Error ? error.message : "Import failed." });
            } finally {
              event.currentTarget.value = "";
            }
          }}
        />
      </label>
      {preview && (
        <ImportPreviewCard
          preview={preview}
          onCancel={() => {
            setPreview(null);
            setPendingImport(null);
          }}
          onConfirm={confirmImport}
        />
      )}
    </section>
  );
}

function ImportPage({
  showNotice,
  onImported,
}: {
  showNotice: (notice: Notice) => void;
  onImported: (binderId?: string) => void;
}) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [pendingImport, setPendingImport] = useState<AppExport | BinderExport | null>(null);

  async function previewFile(file: File) {
    const text = await file.text();
    const parsed = parseFieldPackImport(text);
    setPendingImport(parsed);
    setPreview(createImportPreview(parsed));
  }

  async function confirmImport() {
    if (!pendingImport) {
      return;
    }
    if (pendingImport.schemaVersion === "field-pack-v1") {
      const count = await importData(pendingImport);
      showNotice({ type: "success", text: `Imported ${count} binder${count === 1 ? "" : "s"}.` });
      onImported();
      return;
    }
    const binder = await importBinder(pendingImport);
    showNotice({ type: "success", text: `Imported "${binder.name}" as a local copy.` });
    onImported(binder.id);
  }

  return (
    <section className="panel narrow">
      <h1>Import</h1>
      <p>Import a full Field Pack backup or a single binder JSON file. Imported binders become separate local copies.</p>
      <label className="file-import large">
        Choose JSON File
        <input
          type="file"
          accept="application/json,.json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }
            try {
              await previewFile(file);
            } catch (error) {
              showNotice({ type: "error", text: error instanceof Error ? error.message : "Import failed." });
            } finally {
              event.currentTarget.value = "";
            }
          }}
        />
      </label>
      {preview && (
        <ImportPreviewCard
          preview={preview}
          onCancel={() => {
            setPreview(null);
            setPendingImport(null);
          }}
          onConfirm={confirmImport}
        />
      )}
    </section>
  );
}

function ImportPreviewCard({
  preview,
  onCancel,
  onConfirm,
}: {
  preview: ImportPreview;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <article className="import-preview">
      <div>
        <p className="eyebrow">Import Preview</p>
        <h3>{preview.kind === "all" ? "Full Field Pack backup" : preview.binderNames[0]}</h3>
        <p>
          {preview.binderCount} binder{preview.binderCount === 1 ? "" : "s"}, {preview.entryCount} entries,
          {" "}
          {preview.participantCount} participant{preview.participantCount === 1 ? "" : "s"}.
        </p>
      </div>
      <dl className="stats">
        <div>
          <dt>Schema</dt>
          <dd>{preview.schemaVersion}</dd>
        </div>
        <div>
          <dt>Exported</dt>
          <dd>{formatDate(preview.exportedAt)}</dd>
        </div>
        <div>
          <dt>Types</dt>
          <dd>{preview.binderTypes.map((type) => binderTypeLabels[type]).join(", ")}</dd>
        </div>
      </dl>
      {preview.sensitiveFields.length > 0 && (
        <div className="privacy-callout">
          Contains participant {preview.sensitiveFields.join(", ")}. Import only files you trust.
        </div>
      )}
      <div className="row-actions">
        <button className="primary" onClick={onConfirm}>
          Import Local Copy
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </article>
  );
}

function ProfilePage({
  onSaved,
  onCleared,
}: {
  onSaved: () => void;
  onCleared: () => void;
}) {
  const [draft, setDraft] = useState(
    () =>
      getLocalProfile() || {
        name: "",
        role: "",
        email: "",
        phone: "",
        emergencyContactName: "",
        emergencyContactPhone: "",
        notes: "",
      }
  );

  return (
    <section className="panel narrow">
      <p className="eyebrow">Local profile</p>
      <h1>Profile Setup</h1>
      <p>
        This is not an account. It is a local convenience profile stored only in this browser,
        useful for adding yourself to trip participants and individual logs.
      </p>
      <form
        className="editor"
        onSubmit={(event) => {
          event.preventDefault();
          saveLocalProfile({
            name: draft.name.trim(),
            role: draft.role?.trim() || undefined,
            email: draft.email?.trim() || undefined,
            phone: draft.phone?.trim() || undefined,
            emergencyContactName: draft.emergencyContactName?.trim() || undefined,
            emergencyContactPhone: draft.emergencyContactPhone?.trim() || undefined,
            notes: draft.notes?.trim() || undefined,
          });
          onSaved();
        }}
      >
        <div className="form-grid">
          <label>
            Your name
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
          </label>
          <label>
            Usual role
            <input value={draft.role || ""} onChange={(event) => setDraft({ ...draft, role: event.target.value })} placeholder="Trip lead, angler, volunteer" />
          </label>
          <label>
            Email
            <input type="email" value={draft.email || ""} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
          </label>
          <label>
            Phone
            <input value={draft.phone || ""} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
          </label>
          <label>
            Emergency contact
            <input value={draft.emergencyContactName || ""} onChange={(event) => setDraft({ ...draft, emergencyContactName: event.target.value })} />
          </label>
          <label>
            Emergency phone
            <input value={draft.emergencyContactPhone || ""} onChange={(event) => setDraft({ ...draft, emergencyContactPhone: event.target.value })} />
          </label>
        </div>
        <label>
          Notes
          <textarea value={draft.notes || ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Optional allergies, constraints, gear notes, or availability." />
        </label>
        <div className="privacy-callout">
          Profile details stay local unless you add yourself to a binder and export that binder.
        </div>
        <div className="row-actions">
          <button className="primary" type="submit">
            Save Local Profile
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("Clear the local profile from this browser?")) {
                clearLocalProfile();
                setDraft({
                  name: "",
                  role: "",
                  email: "",
                  phone: "",
                  emergencyContactName: "",
                  emergencyContactPhone: "",
                  notes: "",
                });
                onCleared();
              }
            }}
          >
            Clear Profile
          </button>
        </div>
      </form>
    </section>
  );
}

function InstallPage() {
  const { state, install, dismiss } = useInstallPrompt();
  return (
    <section className="panel narrow readable">
      <h1>Install Field Pack</h1>
      <p>
        Field Pack works offline after the first load. Installing it to your home screen gives
        you a full-screen app that opens instantly with no browser chrome.
      </p>
      {state === "android-ready" && (
        <div className="install-banner" style={{ marginBottom: "1rem" }}>
          <div className="install-banner-text">
            <strong>Ready to install</strong>
            <span>Your browser supports one-tap install.</span>
          </div>
          <div className="install-banner-actions">
            <button className="primary" onClick={install}>Install App</button>
            <button onClick={dismiss}>Not Now</button>
          </div>
        </div>
      )}
      <h2>iPhone / iPad</h2>
      <p>
        Open Field Pack in <strong>Safari</strong>. Tap the{" "}
        <span className="install-icon-inline" aria-label="Share icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 1v9M5 4l3-3 3 3M3 7v7h10V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>{" "}
        <strong>Share</strong> button at the bottom of the screen, scroll down in the sheet, and tap{" "}
        <strong>Add to Home Screen</strong>. Field Pack will appear as an app icon on your home screen
        and open full-screen without browser controls.
      </p>
      <h2>Android</h2>
      <p>
        Open Field Pack in <strong>Chrome</strong>. Tap the three-dot menu (⋮) in the top-right corner
        and choose <strong>Add to Home Screen</strong> or <strong>Install app</strong>. A banner may
        also appear automatically at the bottom of Chrome — tap <strong>Install</strong> there instead.
      </p>
      <h2>Desktop (Chrome or Edge)</h2>
      <p>
        Look for an install icon in the address bar — it looks like a screen with a small download
        arrow. Click it, then click <strong>Install</strong>. You can also open the browser menu and
        choose <strong>Install Field Pack</strong>.
      </p>
      <h2>After installing</h2>
      <p>
        Your data stays on your device. Once installed, Field Pack loads from cache and works fully
        offline. Export a binder JSON file as a manual backup before switching browsers or devices.
      </p>
    </section>
  );
}

function AboutPage() {
  return (
    <section className="panel narrow readable">
      <h1>Privacy</h1>
      <p>
        Field Pack is a local-first, backendless PWA. It does not use accounts, analytics,
        hosted databases, cloud sync, payment systems, tracking, or AI services.
      </p>
      <p>
        The optional profile is local-only — a convenience for adding yourself to binder
        participant lists, not a login identity.
      </p>
      <p>
        Your binders, entries, and participant records are stored in this browser using
        IndexedDB. No data is uploaded anywhere by Field Pack. After the first load, the app
        shell is cached so the app works offline.
      </p>
      <p>
        Sharing happens by file. When you export a binder, that file may include participant
        names, contact details, emergency contacts, notes, trip plans, and locations.
        Anyone who receives and imports the file gets their own local copy.
      </p>
      <p>
        You decide what to export and who to share it with. You are also responsible for
        exporting backups if you want to move data between browsers or devices.
      </p>
    </section>
  );
}
