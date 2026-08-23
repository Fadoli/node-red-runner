# Flow editor UI next steps

This is the prioritized backlog for the custom flow editor. Keep changes
small, testable, and compatible with the incremental deployment API.

## P0 — make editing dependable

- [ ] **Render real Node-RED edit forms**
  - Use parsed `editor.htmlPath`, `editor.defaults`, credentials metadata, and
    typed inputs instead of exposing only generic property controls.
  - Acceptance: function, inject, debug, change, and delay nodes can be
    configured without editing raw JSON; invalid values are shown inline.
- [ ] **Add browser interaction tests**
  - Cover marquee selection, shift selection, group movement, fast dragging,
    port-to-port wiring, wire deletion, Delete in inspector fields, and undo.
  - Use the project’s existing test style; do not add a test framework.
- [ ] **Fix metadata parsing edge cases**
  - Parse nested/default object values safely and preserve arrays and typed
    defaults. Add a fixture-based test for Node-RED core HTML.

## P1 — navigation and flow structure

- [ ] **Canvas navigation**
  - Add middle-button/space pan, fit-to-flow, zoom controls, and a minimap.
- [ ] **Subflow editor**
  - Open subflow templates as nested tabs with breadcrumbs and visible
    subflow input/output ports.
- [ ] **Flow tab management**
  - Add, rename, duplicate, reorder, and delete tabs with conflict-safe
    deployment mutations.
- [ ] **Port-aware wiring validation**
  - Respect discovered input/output counts, reject invalid targets, support
    output-specific wire paths, and show a clear reason for rejected drops.

## P1 — deployment and recovery

- [ ] **Deployment preview**
  - Show changed, restarted, added, removed, and rewired nodes before deploy.
- [ ] **Validation diagnostics**
  - Render compiler diagnostics on the affected node and in the Inspector.
- [ ] **Deployment history**
  - Expose revision, author/time, impact, and rollback for recent deployments.

## P2 — runtime debugging

- [ ] **Debug message inspector**
  - Make Debug sidebar entries expandable with structured payload viewing,
    copy, filtering, and per-node filtering.
- [ ] **Context viewer improvements**
  - Show editable node/flow/global values, refresh state, and persistence
    indicators without exposing secrets.
- [ ] **Message tracing**
  - Highlight the path of a selected runtime message across wires.
- [ ] **Runtime controls**
  - Add safe inject/send controls and clear status/error indicators.

## P2 — visual refinement

- [ ] **Palette quality**
  - Use parsed icons, localized labels, searchable categories, favorites, and
    recently used nodes.
- [ ] **Accessible contrast and keyboard navigation**
  - Verify focus states, high-contrast colors, ARIA labels, and shortcuts.
- [ ] **Layout helpers**
  - Add align/distribute, snap-grid settings, group labels, comments, and
    copy/paste/duplicate.

## Definition of done

Each item should include focused node tests where backend behavior changes,
`node --check` for browser/server JavaScript, a manual UI verification note,
and a full `node --test` run before it is marked complete.
