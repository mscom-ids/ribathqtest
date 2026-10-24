# Separate leadership portal

Principals and vice-principals now enter `/leadership`. The `/staff` portal is
mentor-only; old leadership bookmarks under `/staff` redirect to equivalent
leadership routes (including query parameters). Admin login stays `/admin`.

The leadership layout owns a fixed Leadership Portal identity, navigation,
signed-in profile. Its overview is implemented in
`src/components/leadership/LeadershipDashboard.tsx`. It does not mount the mentor
dashboard, staff layout, mentor clock, or role-dependent dashboard switch.

The leadership leaderboard has an opaque, stationary dialog with a short opacity
transition. Its header uses opaque surfaces, without forced 3D layers,
overflow clipping decorations, retained slide transforms, or background blur.
The month and mentor selectors use the shared glass picker. Photo-led leaders
and rounded ranking rows show actual earned points, including zero-point students.
Students appear only once: featured leaders are not repeated in the lower list.
Equal two-decimal totals use competition ranks (90,90,90,89 = 1,1,1,4).
All ties at the top-three-rank boundary are featured and every joint first gets
the same gold treatment. Portraits come from the active student roster; missing
or failed images fall back to initials. No movement arrows are invented without
historical ranking data. Leadership alone uses a compact blue/indigo title card
containing the month and mentor controls, one framed podium panel with individual
muted gold/silver/bronze cards, and right-edge laurel place frames through rank 10.
The mentor portal retains its existing champion-card leaderboard unchanged.
Every opening defaults to all students; choosing a Hifz mentor passes `mentor_id`
to the existing monthly-report endpoint and re-ranks that roster only.

Attendance, leave forms, reports, chat, finance, discipline, student details, and
Hifz entry remain shared feature modules, rendered inside the leadership layout.
They do not bring StaffLayout with them. This avoids duplicating data and scoring
logic. Backend authorization remains unchanged.

On screens narrower than 768px, navigation moves to a safe-area-aware bottom bar
(Overview, Attendance, Leaves, Reports, More). The opaque More panel contains the
remaining tools. Tablets and desktops keep navigation on the same header row,
with horizontal touch scrolling when the links do not fit.

Both Outside count controls open an anchored, read-only presence list, loaded only
on demand from `/leaves/outside-students`. Names/classes/admission numbers are
searchable, duplicate leave rows are collapsed to people, and failures have a retry
state rather than appearing as an empty list. No return or attendance mutation is
performed. The endpoint retains its existing server-side presence cache.

Mentor Focus has been removed from leadership. `/leadership/mentor` redirects to
the overview for old bookmarks. The shell clears obsolete focus context before
fetching any child data. Leaderboard filtering never issues a delegation token.
Overview snapshots are keyed by the signed-in leader ID.

## Verification

### iPad-first overview

Navigation uses fixed breakpoints, not content wrapping: phones below 768px use
the bottom bar; tablets and desktops from 768px use one scrollable header row.
No backdrop filters or transformed ancestors are added.

The overview retains student progress, outside presence, Mentor Focus and points.
It retains class filtering and direct student progress access. Duplicate quick
actions and the mentor workspace panel have been removed. Primary actions and
search inputs have 44px minimum touch targets; the student directory uses full width.

- `node scripts/test-leadership-routing.cjs` tests roles, bookmarks, and focus scope.
- `node scripts/test-leaderboard-ranking.cjs` tests ties, two-decimal precision,
  shared winner labels, zero scores and non-mutating competition ranking.
- `node scripts/test-leadership-portal.cjs` tests the real routes on tablet, phone,
  and laptop Chromium layouts. Run a separate Next server on localhost:3020 first;
  optionally set `LEADERSHIP_TEST_ORIGIN` and `PLAYWRIGHT_MODULE`. All API responses
  are mocked and synthetic routing cookies are restricted to a local origin.
- `npx tsc --noEmit` and a production build check all route entry points.

Emulation does not reproduce a physical iPad GPU compositor. The affected device
must be checked after deploying these changes before declaring that specific
flicker resolved.
