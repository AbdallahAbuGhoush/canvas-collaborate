# Canvas Collaborate

# System Design Interview Platform - MVP Product Requirements Document




## 1. Overview

A real-time collaborative system design interviewing tool designed for desktop web browsers. It allows interviewers and candidates to interact on an infinite shared canvas using system design components, freeform drawing, and text. 




## 2. Non-Goals for MVP

*   **Built-in Audio/Video:** Handled via external tools (Zoom, Meet).

*   **Built-in Text Chat:** Handled via external tools.

*   **Historical Playback:** Canvases are saved, but stroke-by-stroke playback is excluded.

*   **Mobile/Tablet Support:** Strictly optimized for desktop web browsers.

*   **Hidden Layers/Private Notes:** Everything on the canvas is visible to all participants.

*   **Custom Image Uploads:** Fixed component palette is sufficient for MVP.




## 3. User Roles & Permissions

*   **Owner (Interviewer):** Requires an authenticated account. Has full administrative control. Can create/end sessions, generate/revoke links, pre-populate canvases, clear the canvas, lock/unlock candidate editing, remove participants, and duplicate sessions as templates.

*   **Additional Interviewer:** Authenticated. Can edit the canvas alongside the owner, but lacks administrative powers (cannot lock canvas, end session, etc.).

*   **Observer:** Authenticated. View-only access to the session.

*   **Candidate:** Can join as a guest (no account required) or authenticated. Can edit the canvas (place, move, text, draw) when unlocked. Subordinate to the Owner.




## 4. Core Canvas Features

*   **Infinite Canvas:** Users can pan and scroll endlessly in any direction.

*   **Component Palette:** Fixed, built-in system design icons (queues, databases, LLMs, services/rectangles).

*   **Connectors:** Smart arrows that automatically snap to shapes and dynamically follow them when moved.

*   **Text Integration:** Support for typing text directly inside shapes and as standalone text blocks.

*   **Freeform Drawing:** Pen tool with customizable colors, line thickness, and an eraser.

*   **Multi-select:** Users can drag a selection box to highlight, group, and move multiple objects simultaneously.

*   **Keyboard Shortcuts:** Standard operations supported (Ctrl+C, Ctrl+V, Delete).

*   **Undo/Redo:** Standard undo/redo functionality for local canvas actions.




## 5. Collaboration & Session Management

*   **Capacity:** Up to 10 concurrent participants per session.

*   **Real-Time Presence:** Live cursors with participant name tags moving around the canvas.

*   **Preparation:** Interviewers can pre-populate the canvas and set a problem statement before candidates join.

*   **Templates:** Setups can be reused as templates via a session duplication mechanism.

*   **Data Persistence:** Final canvases are saved and viewable in the platform's dashboard. Raw JSON export of the canvas document is supported.




---




## 6. Recommended Architecture




### 6.1 Client

*   **Tech Stack:** TypeScript single-page web application.

*   **Rendering:** Canvas rendering layer using an established diagramming library or a custom SVG/canvas hybrid.

*   **State:** Local collaboration document for optimistic editing.

*   **Network:** WebSocket connection for persistent operations and presence; HTTPS REST/RPC for session/account management.




### 6.2 Backend Services

*   **Web/API Service:** Authentication, sessions, participants, links, permissions, dashboard APIs.

*   **Collaboration Gateway:** WebSocket connections, room membership, validation, operation fan-out, presence, rate limiting.

*   **Persistence Worker:** Batches operation writes and generates snapshots.

*   **Export Worker:** Creates image/PDF/JSON exports.




### 6.3 Storage

*   **Relational Database:** Users, sessions, memberships, invite tokens, audit events.

*   **Blob Storage:** Durable object storage for canvas snapshots and exports.

*   **Operation Store:** Durable operation store (relational or log-oriented database).

*   **In-Memory Store:** Ephemeral room presence, connection routing, pub/sub across gateway instances.




### 6.4 Horizontal Scaling

*   Web/API instances are stateless.

*   WebSocket instances share room events through pub/sub or room-affine routing.

*   Persistent operation sequence or CRDT update identifiers prevent duplicate application.

*   Snapshot compaction runs asynchronously and never blocks live editing.




---




## 7. Data Model




*   **User:** `id`, `email`, `display_name`, `organization_id` (nullable), `created_at`

*   **InterviewSession:** `id`, `owner_user_id`, `title`, `prompt`, `state`, `candidate_editing_enabled`, `scheduled_at`, `started_at`, `ended_at`, `created_at`, `updated_at`

*   **SessionMembership:** `session_id`, `user_id` or `guest_participant_id`, `role`, `created_at`

*   **GuestLink:** `id`, `session_id`, `token_hash`, `role_granted`, `expires_at`, `max_uses`, `revoked_at`, `created_at` (Only a cryptographic hash of the bearer token is stored).

*   **Participant:** `id`, `session_id`, `user_id` (nullable), `display_name`, `role`, `joined_at`, `left_at`

*   **CanvasDocument:** `id`, `session_id`, `schema_version`, `latest_snapshot_id`, `latest_operation_cursor`, `updated_at`

*   **CanvasSnapshot:** `id`, `canvas_document_id`, `operation_cursor`, `storage_key`, `checksum`, `created_at`

*   **CanvasOperation:** `id`, `canvas_document_id`, `actor_id`, `client_operation_id`, `payload`, `server_received_at`




---




## 8. API Surface




### 8.1 HTTP Endpoints

| Method | Endpoint | Purpose |

| --- | --- | --- |

| POST | `/v1/sessions` | Create a session |

| GET | `/v1/sessions` | List owned or invited sessions |

| GET | `/v1/sessions/{id}` | Read session metadata |

| PATCH | `/v1/sessions/{id}` | Update prompt, title, or controls |

| POST | `/v1/sessions/{id}/start` | Start a session |

| POST | `/v1/sessions/{id}/end` | End a session |

| POST | `/v1/sessions/{id}/guest-links` | Create or rotate a guest link |

| DELETE | `/v1/sessions/{id}/guest-links/{linkId}` | Revoke a guest link |

| POST | `/v1/join/{token}` | Validate token and create guest participation |

| GET | `/v1/sessions/{id}/canvas` | Obtain snapshot and collaboration credentials |

| POST | `/v1/sessions/{id}/duplicate` | Duplicate as a new draft |




### 8.2 WebSocket Messages

*   **Client to server:** `join_room`, `document_update`, `presence_update`, `ping`

*   **Server to client:** `room_joined`, `document_update`, `presence_snapshot`, `presence_update`, `permission_changed`, `session_ended`, `error`, `pong`




---




## 9. Security & Privacy Requirements

*   Guest tokens must contain at least 128 bits of cryptographic entropy.

*   Tokens must be transmitted only over HTTPS, excluded from logs, and stored only as hashes.

*   Session and canvas access must be authorized server-side for every API and socket action.

*   Use short-lived collaboration credentials after the initial guest-link exchange.

*   Rate-limit join attempts, session creation, WebSocket connections, and document updates.

*   Validate operation size, object count, text length, and supported element types.

*   Sanitize all user-provided text before HTML rendering or export.

*   Encrypt data in transit and at rest.

*   Record audit events for session actions (creation, link rotation, participant removal, permission changes, end).

*   Avoid recording private interview content in product analytics.




---




## 10. Performance & Reliability Targets




| Metric | MVP Target |

| --- | --- |

| Canvas usable after join | p95 under 3 seconds (normal document) |

| Remote operation propagation | p95 under 250 ms in-region (excluding user network) |

| Reconnect after brief network loss | p95 under 5 seconds |

| Concurrent participants per room | 10 |

| Typical supported canvas | 2,000 elements & 10,000 freehand points without lag |

| Monthly service availability | 99.9% after GA |

| Confirmed-operation durability | No acknowledged update lost after single-instance failure |




---




## 11. MVP Acceptance Criteria

1.  An authenticated interviewer can create a session and copy a candidate link.

2.  Two guest candidates and two authenticated interviewers can join the same session concurrently.

3.  All four participants see component creation, movement, resizing, deletion, text edits, connections, and freehand strokes converge to the same state.

4.  Simultaneous edits to different objects do not overwrite one another.

5.  A participant who loses connectivity for 15 seconds reconnects and converges without manually reloading.

6.  Refreshing the browser restores the latest confirmed canvas state.

7.  The owner can lock candidate editing; rejected attempts are reflected clearly in the UI.

8.  Revoking a candidate link prevents new joins without disconnecting current participants unless explicitly removed.

9.  Ending a session makes it read-only for candidates and creates a final saved snapshot.

10. A candidate cannot access another session by manipulating identifiers.

11. The canvas remains interactive at the typical-canvas limit on supported browsers.

12. Critical user flows meet keyboard and screen-reader requirements.




---




## 12. Delivery Phases

*   **Phase 1 — Canvas foundation:** Single-user canvas, component palette, connectors, text, freehand, selection, pan/zoom, local undo/redo, schema versioning.

*   **Phase 2 — Live collaboration:** WS gateway, multi-user sync, presence, cursors, reconnect, autosave, snapshot compaction.

*   **Phase 3 — Interview workflow:** Authentication, dashboard, links, lobby, roles, permissions, lock/end flows, audit, retention.

*   **Phase 4 — Production readiness:** Browser/accessibility verification, load testing, abuse limits, incident runbooks, optional initial export functionality.

so I want to create an application that will be the frontend for this and I already want to start thinking about creating the backend so right now  for the backend I want you to just mock the calls to the backend then later I will implement backend my self

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/02b9fcaa-c7eb-5b0d-8a48-27341a13d8b4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
