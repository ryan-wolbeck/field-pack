# Field Pack

Field Pack is a local-first, offline-capable, installable PWA for practical outdoor and field-use binders. It is designed for trip plans, trail notes, fish logs, ready kits, cabin or property notes, stewardship logs, and general field reference.

The MVP is intentionally a backendless static web app. It can be hosted on GitHub Pages, Cloudflare Pages, Netlify, Vercel static hosting, or any static file server. There is no server, login system, hosted database, cloud sync, payment system, analytics, tracking, or hosted AI layer.

## Why Local-First

Field Pack stores user data locally in the browser with IndexedDB. The app remains useful without an account or internet connection after the first load. User data belongs to the user and stays on the device unless the user explicitly exports a file and shares it.

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Static Deployment

Field Pack builds to static assets in `dist/`.

### Cloudflare Pages

1. Connect the repository to Cloudflare Pages.
2. Set the build command to `npm run build`.
3. Set the output directory to `dist`.
4. Deploy.

### GitHub Pages

1. Run `npm run build`.
2. Publish the `dist/` directory with your preferred GitHub Pages workflow.
3. Ensure the site is served over HTTPS so the PWA service worker can run.

## Data Storage

Field Pack uses Dexie.js on top of IndexedDB. The local database is named `field-pack` and contains:

- `binders`
- `entries`
- `participants`

The service worker caches only the app shell and static assets. It does not cache user data. User data remains in IndexedDB.

## Export and Import

Field Pack supports JSON export/import for portability and backups.

Full app export:

```json
{
  "schemaVersion": "field-pack-v1",
  "exportedAt": "2026-05-30T00:00:00.000Z",
  "binders": [],
  "entries": [],
  "participants": []
}
```

Single binder export:

```json
{
  "schemaVersion": "field-pack-binder-v1",
  "exportedAt": "2026-05-30T00:00:00.000Z",
  "binder": {},
  "entries": [],
  "participants": []
}
```

Markdown export is also available for a readable copy of a binder.

## File-Based Sharing

Sharing is intentionally file-based:

1. Create a binder.
2. Add trip details, checklist items, notes, and participants.
3. Export the binder as JSON.
4. Send the file by text, email, AirDrop, shared drive, or another file transfer method.
5. The recipient opens Field Pack and imports the JSON file.
6. The recipient now has their own local copy.

The MVP does not merge changes between users and does not provide real-time collaboration.

## MVP Scope

Included:

- Installable PWA shell
- Offline app shell caching
- Local IndexedDB persistence
- Dashboard
- Create, edit, and delete binders
- Create, edit, search, sort, tag, and delete entries
- Add, edit, and remove participants
- Full JSON export/import
- Single-binder JSON export/import
- Markdown export
- CSV export for entries and participants
- GeoJSON and GPX export for geotagged entries
- Import preview with sensitive participant-field warning
- Printable binder view
- Autosaved editor drafts
- Offline/install status indicators
- Plain-text summary copy
- About and privacy page

Intentionally out of scope:

- Server backend
- User authentication
- Hosted database
- Cloud sync
- Real-time multiplayer collaboration
- AI API calls
- Paid features
- Analytics or tracking
- External account dependency

## Future Roadmap

- Cloud sync
- Shared binders
- Real-time collaboration
- Team or volunteer organization mode
- AI summaries
- GPX import/export
- GeoJSON export
- Photo attachments
- Printable PDFs
- Map integrations
- Optional hosted backup
- Plugin and template ecosystem
- Conflict detection and merge support for imported binder updates
