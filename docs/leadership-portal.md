# Separate leadership portal

Principals and vice-principals now enter `/leadership`. The `/staff` portal is
mentor-only; old leadership bookmarks under `/staff` redirect to equivalent
leadership routes (including query parameters). Admin login stays `/admin`.

The leadership layout owns a fixed Leadership Portal identity, navigation,
signed-in profile, and Mentor Focus banner. Its overview is implemented in
`src/components/leadership/LeadershipDashboard.tsx`. It does not mount the mentor
dashboard, staff layout, mentor clock, or role-dependent dashboard switch.

The leadership leaderboard has an opaque, stationary dialog with a short opacity
transition. Its header uses a normal sRGB gradient, without forced 3D layers,
overflow clipping decorations, retained slide transforms, or background blur.
The month selector still uses the shared glass picker.

Attendance, leave forms, reports, chat, finance, discipline, student details, and
Hifz entry remain shared feature modules, rendered inside the leadership layout.
They do not bring StaffLayout with them. This avoids duplicating data and scoring
logic. Backend authorization remains unchanged.

On screens narrower than 1024px, navigation moves to a safe-area-aware bottom bar
(Overview, Attendance, Leaves, Reports, More). The opaque More panel contains the
remaining tools and the focused class when applicable. Desktop keeps top navigation.

Both Outside count controls open an anchored, read-only presence list, loaded only
on demand from `/leaves/outside-students`. Names/classes/admission numbers are
searchable, duplicate leave rows are collapsed to people, and failures have a retry
state rather than appearing as an empty list. No return or attendance mutation is
performed. The endpoint retains its existing server-side presence cache.

Mentor Focus is an explicit `/leadership/mentor` workflow, reusing the mentor class
component, not the mentor layout. Entering/exiting focus invalidates cached data;
returning to the overview clears the delegation context before fetching data.
Overview snapshots are keyed by the signed-in leader ID.

## Verification

- `node scripts/test-leadership-routing.cjs` tests roles, bookmarks, and focus scope.
- `node scripts/test-leadership-portal.cjs` tests the real routes on tablet, phone,
  and laptop Chromium layouts. Run a separate Next server on localhost:3020 first;
  optionally set `LEADERSHIP_TEST_ORIGIN` and `PLAYWRIGHT_MODULE`. All API responses
  are mocked and synthetic routing cookies are restricted to a local origin.
- `npx tsc --noEmit` and a production build check all route entry points.

Emulation does not reproduce a physical iPad GPU compositor. The affected device
must be checked after deploying these changes before declaring that specific
flicker resolved.
