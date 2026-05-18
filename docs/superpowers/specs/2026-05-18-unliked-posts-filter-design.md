# Unliked Posts Filter Design

## Goal

Add a third Strava feed filter toggle that shows posts the current user has not liked yet. When enabled, entries already liked by the current user are hidden, while entries without the user's kudos remain visible.

## Current Context

The userscript already has a multi-filter architecture in `strava-photo-filter-toggle.user.js`:

- `FILTERS` defines each toggle, storage key, default state, body class, title, and icon.
- Filter state is persisted in `localStorage`.
- Body classes activate CSS rules that hide matching feed entries.
- Feed entries are incrementally analyzed and tracked through a `MutationObserver`.
- Badges show how many entries each active filter currently hides.

The file currently contains unresolved merge-conflict markers around an older single-button implementation. Implementation should resolve that conflict by preserving the newer multi-filter structure.

## Recommended Approach

Add a new `unliked` filter to the existing `FILTERS` array. This keeps the feature consistent with the existing photo/media and virtual activity filters.

The filter should:

- Use a dedicated storage key, such as `stravaUnlikedFilterEnabled`.
- Default to disabled.
- Add a body class, such as `strava-show-unliked`.
- Use a compact button icon that clearly suggests kudos/likes.
- Track a `likedByMe` boolean for each feed entry.
- Hide entries where `likedByMe` is true when the filter is enabled.
- Maintain a badge count for liked entries that would be hidden by this filter.

## Detection

The script should detect whether the current user has liked a feed entry by inspecting the entry's kudos/like button state. Prefer stable Strava attributes such as `aria-pressed`, `aria-label`, `title`, or active button classes when present. The detection should be isolated in a helper such as `isLikedByMe(entry)` so it can be adjusted if Strava changes its markup.

If the script cannot confidently identify a liked state for an entry, it should treat the entry as not liked. That failure mode keeps potentially useful posts visible.

## Data Flow

`analyzeEntry(entry)` should return:

- `hasMedia`
- `isVirtual`
- `likedByMe`

`updateTrackedEntry(entry)` should update `hiddenCounts.unliked` whenever `likedByMe` changes. A dedicated data attribute, such as `data-strava-liked-entry="true"`, should be set on liked entries and removed otherwise.

The stylesheet should include a rule that hides entries with that attribute when the `unliked` filter body class is active.

## UI

The UI remains a row of compact filter buttons appended to the Strava filter form. The new button should match the existing dimensions, active/inactive colors, badge behavior, and tooltip style.

Suggested tooltip: `Show posts I have not liked yet`.

## Testing And Verification

Because this is a small userscript without an existing automated test harness, implementation should add a focused local test harness if practical, or at minimum make the detection helper testable in isolation.

Verification should cover:

- The new filter persists independently in `localStorage`.
- Enabling the filter hides only entries already liked by the current user.
- Entries without the user's kudos remain visible.
- Existing media and virtual filters still work.
- Badge counts update when feed entries are added, removed, or when a like state changes.
- The unresolved conflict markers are removed from the userscript.

