# Unliked Posts Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Strava feed toggle that shows posts the current user has not liked yet by hiding already-liked feed entries.

**Architecture:** Keep the existing single-file userscript structure and extend its `FILTERS` array with a third filter. Add a tiny Node test harness that reads the userscript, checks for unresolved conflict markers, executes the userscript in test mode, and verifies the exported entry-analysis helper against fake feed entries.

**Tech Stack:** Tampermonkey userscript JavaScript, browser DOM APIs, Node.js built-in `node:test` and `assert`.

---

## File Structure

- Modify `strava-photo-filter-toggle.user.js`: resolve merge-conflict markers, add `unliked` filter config, liked-entry attribute, liked-state detection helper, count tracking, and a test-only helper export.
- Modify `strava-photo-filter-toggle.meta.js`: bump metadata version and description if the user script version changes.
- Modify `README.md`: mention the new unliked-posts toggle.
- Create `tests/unliked-filter.test.js`: local regression tests for conflict marker cleanup and liked-entry analysis.

### Task 1: Add Local Tests

**Files:**
- Create: `tests/unliked-filter.test.js`

- [ ] **Step 1: Write the failing conflict-marker test**

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const scriptPath = path.join(__dirname, '..', 'strava-photo-filter-toggle.user.js');

function readScript() {
    return fs.readFileSync(scriptPath, 'utf8');
}

test('userscript has no unresolved merge conflict markers', () => {
    const source = readScript();

    assert.equal(source.includes('<<<<<<<'), false);
    assert.equal(source.includes('======='), false);
    assert.equal(source.includes('>>>>>>>'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unliked-filter.test.js`

Expected: FAIL because `strava-photo-filter-toggle.user.js` currently contains unresolved merge conflict markers.

- [ ] **Step 3: Add the failing liked-entry analysis test**

Append this test support and assertions to `tests/unliked-filter.test.js`:

```javascript
const vm = require('node:vm');

class FakeElement {
    constructor({ selectors = {}, textContent = '', attributes = {}, classes = [] } = {}) {
        this.nodeType = 1;
        this.textContent = textContent;
        this.attributes = new Map(Object.entries(attributes));
        this.classList = {
            contains: (name) => classes.includes(name)
        };
        this.selectors = selectors;
    }

    querySelector(selector) {
        return this.selectors[selector] || null;
    }

    querySelectorAll() {
        return [];
    }

    getAttribute(name) {
        return this.attributes.has(name) ? this.attributes.get(name) : null;
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    removeAttribute(name) {
        this.attributes.delete(name);
    }
}

function loadTestApi() {
    const body = new FakeElement();
    body.classList = { toggle() {}, contains() { return false; } };
    const document = {
        body,
        head: { appendChild() {} },
        createElement: () => new FakeElement(),
        getElementById: () => null,
        querySelector: () => null
    };
    const window = {
        __STRAVA_FEED_FILTERS_TEST__: true,
        addEventListener() {}
    };

    vm.runInNewContext(readScript(), {
        document,
        window,
        localStorage: { getItem: () => null, setItem() {} },
        MutationObserver: class { observe() {} disconnect() {} },
        Node: { ELEMENT_NODE: 1 },
        console
    });

    return window.__stravaFeedFiltersTestApi;
}

test('analyzeEntry marks entries liked by me from pressed kudos button state', () => {
    const api = loadTestApi();
    const kudosButton = new FakeElement({
        attributes: {
            'aria-pressed': 'true',
            'aria-label': 'Kudos'
        }
    });
    const entry = new FakeElement({
        selectors: {
            '[data-testid="photo"], [data-testid="video"]': new FakeElement(),
            '[data-testid="kudos_button"], button[aria-label*="Kudos"], button[title*="Kudos"]': kudosButton
        }
    });

    assert.equal(api.analyzeEntry(entry).likedByMe, true);
});

test('analyzeEntry keeps unliked entries visible when kudos button is not pressed', () => {
    const api = loadTestApi();
    const kudosButton = new FakeElement({
        attributes: {
            'aria-pressed': 'false',
            'aria-label': 'Give Kudos'
        }
    });
    const entry = new FakeElement({
        selectors: {
            '[data-testid="kudos_button"], button[aria-label*="Kudos"], button[title*="Kudos"]': kudosButton
        }
    });

    assert.equal(api.analyzeEntry(entry).likedByMe, false);
});
```

- [ ] **Step 4: Run test to verify it fails for missing API/feature**

Run: `node --test tests/unliked-filter.test.js`

Expected: FAIL until the userscript resolves the conflict and exposes `window.__stravaFeedFiltersTestApi.analyzeEntry` in test mode.

### Task 2: Implement The Userscript Filter

**Files:**
- Modify: `strava-photo-filter-toggle.user.js`

- [ ] **Step 1: Resolve merge-conflict markers**

Keep the newer multi-filter implementation, including `FILTERS`, `createFilterButton(filter)`, and incremental badge tracking. Remove the stale single-button implementation between `=======` and `>>>>>>> theirs`.

- [ ] **Step 2: Add constants and hidden count state**

Add:

```javascript
const KUDOS_BUTTON_SELECTOR = '[data-testid="kudos_button"], button[aria-label*="Kudos"], button[title*="Kudos"]';
const LIKED_ENTRY_ATTRIBUTE = 'data-strava-liked-entry';
```

Add `unliked: 0` to `hiddenCounts`.

- [ ] **Step 3: Add `unliked` filter config**

Add a third item to `FILTERS`:

```javascript
{
    id: 'unliked',
    title: 'Show posts I have not liked yet',
    storageKey: 'stravaUnlikedFilterEnabled',
    defaultEnabled: false,
    bodyClass: 'strava-show-unliked',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="17" height="17" fill="white">
        <path d="M12.1 21.35l-1.1-1C5.4 15.24 2 12.14 2 8.35 2 5.25 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.08C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.25 22 8.35c0 3.79-3.4 6.89-9 12l-.9 1zM7.5 5C5.56 5 4 6.43 4 8.35c0 2.74 2.54 5.16 8 10.13 5.46-4.97 8-7.39 8-10.13C20 6.43 18.44 5 16.5 5c-1.54 0-3.04.99-3.57 2.36h-1.86C10.54 5.99 9.04 5 7.5 5z"/>
    </svg>`
}
```

- [ ] **Step 4: Add CSS rule**

Add a rule to `ensureStyles()`:

```javascript
body.${getFilterConfig('unliked').bodyClass} ${FEED_CONTAINER_SELECTOR} ${FEED_ENTRY_SELECTOR}[${LIKED_ENTRY_ATTRIBUTE}="true"] {
    display: none !important;
}
```

- [ ] **Step 5: Add liked-state helpers**

Add:

```javascript
function normalizeText(value) {
    return (value || '').trim().toLowerCase();
}

function isPressed(button) {
    return normalizeText(button.getAttribute('aria-pressed')) === 'true'
        || normalizeText(button.getAttribute('aria-checked')) === 'true'
        || button.classList.contains('active')
        || button.classList.contains('selected');
}

function isLikedByMe(entry) {
    const kudosButton = entry.querySelector(KUDOS_BUTTON_SELECTOR);
    if (!kudosButton) {
        return false;
    }

    return isPressed(kudosButton);
}

function setLikedEntryAttribute(entry, likedByMe) {
    if (likedByMe) {
        entry.setAttribute(LIKED_ENTRY_ATTRIBUTE, 'true');
        return;
    }

    entry.removeAttribute(LIKED_ENTRY_ATTRIBUTE);
}
```

- [ ] **Step 6: Track `likedByMe` in entry analysis**

Update `analyzeEntry(entry)` to include:

```javascript
likedByMe: isLikedByMe(entry)
```

Update `updateTrackedEntry(entry)` and `removeTrackedEntry(entry)` so `hiddenCounts.unliked` increments for liked entries and adjusts when `likedByMe` changes.

Call `setLikedEntryAttribute(entry, nextState.likedByMe)` after `setVirtualEntryAttribute`.

Remove `LIKED_ENTRY_ATTRIBUTE` in `removeTrackedEntry()` and `clearTrackedEntries()`.

- [ ] **Step 7: Expose a test API in test mode**

Before `initialize()` add:

```javascript
if (window.__STRAVA_FEED_FILTERS_TEST__) {
    window.__stravaFeedFiltersTestApi = {
        analyzeEntry,
        isLikedByMe
    };
    return;
}
```

- [ ] **Step 8: Run tests to verify green**

Run: `node --test tests/unliked-filter.test.js`

Expected: PASS.

### Task 3: Update Metadata And Documentation

**Files:**
- Modify: `strava-photo-filter-toggle.user.js`
- Modify: `strava-photo-filter-toggle.meta.js`
- Modify: `README.md`

- [ ] **Step 1: Bump userscript metadata**

Set `@version` to `5.11` in both metadata files.

Set `@description` to:

```text
Hide posts without photos or videos, virtual activities, and posts you already liked in your Strava feed.
```

- [ ] **Step 2: Update README summary**

Change the first sentence to mention unliked posts:

```markdown
Tampermonkey userscript for Strava that hides posts without photos or videos, virtual activities, and posts you already liked.
```

- [ ] **Step 3: Run syntax and test verification**

Run: `node --check strava-photo-filter-toggle.user.js`

Expected: exit code 0.

Run: `node --test tests/unliked-filter.test.js`

Expected: PASS.

### Task 4: Final Review

**Files:**
- Review: all changed files

- [ ] **Step 1: Check for conflict markers**

Run: `rg -n "<<<<<<<|=======|>>>>>>>" strava-photo-filter-toggle.user.js`

Expected: no matches.

- [ ] **Step 2: Check diff**

Run: `git diff -- strava-photo-filter-toggle.user.js strava-photo-filter-toggle.meta.js README.md tests/unliked-filter.test.js`

Expected: diff contains only the unliked filter, test harness, metadata, README, and conflict cleanup.

- [ ] **Step 3: Commit implementation**

Run:

```bash
git add strava-photo-filter-toggle.user.js strava-photo-filter-toggle.meta.js README.md tests/unliked-filter.test.js docs/superpowers/plans/2026-05-18-unliked-posts-filter.md
git commit -m "Add unliked posts feed filter"
```

