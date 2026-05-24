// ==UserScript==
// @name         Strava Feed Filters
// @version      5.43
// @description  Hide posts without photos or videos, virtual activities, posts you already liked, and your own posts in your Strava feed. Adds a Following/My Activity toggle.
// @author       https://www.strava.com/athletes/5931245
// @match        https://www.strava.com/dashboard*
// @grant        none
// @icon         https://raw.githubusercontent.com/rrokot/strava-hide-posts-without-photos/main/icon-64.png
// @updateURL    https://raw.githubusercontent.com/rrokot/strava-hide-posts-without-photos/main/strava-photo-filter-toggle.meta.js
// @downloadURL  https://raw.githubusercontent.com/rrokot/strava-hide-posts-without-photos/main/strava-photo-filter-toggle.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const FEED_CONTAINER_SELECTOR = '.feature-feed';
    const FEED_ENTRY_SELECTOR = '[data-testid="web-feed-entry"]';
    const FEED_FILTER_INPUT_ID = 'feedFilter';
    const FILTER_WRAPPER_ID = 'strava-feed-filter-toggles';
    const FILTER_CONTROL_ROW_ID = 'strava-feed-filter-controls-row';
    const FEED_TYPE_TOGGLE_ID = 'strava-feed-type-toggle';
    const DROPDOWN_REVEAL_ID = 'strava-feed-dropdown-reveal';
    const STYLE_ELEMENT_ID = 'strava-feed-filter-styles';
    const MEDIA_SELECTOR = '[data-testid="photo"], [data-testid="video"]';
    const ACTIVITY_TAG_SELECTOR = '[data-testid="tag"]';
    const UNFILLED_KUDOS_SELECTOR = 'svg[data-testid="unfilled_kudos"]';
    const OWNER_LINK_SELECTOR = '[data-testid="owners-name"], [data-testid="owner-avatar"]';
    const ME_LINK_SELECTOR = 'header a[href*="/athletes/"], nav a[href*="/athletes/"]';
    const ATHLETE_HREF_PATTERN = /\/athletes\/(\d+)/;
    const NO_MEDIA_ENTRY_ATTRIBUTE = 'data-strava-no-media-entry';
    const VIRTUAL_ENTRY_ATTRIBUTE = 'data-strava-virtual-entry';
    const LIKED_ENTRY_ATTRIBUTE = 'data-strava-liked-entry';
    const MINE_ENTRY_ATTRIBUTE = 'data-strava-mine-entry';
    const BUTTON_ACTIVE_COLOR = '#fc5200';
    const BUTTON_INACTIVE_COLOR = '#888';

    // Feed-type toggle replaces Strava's react-select dropdown. Switching reloads the
    // dashboard since Strava's React tree doesn't react to pushState/popstate alone.
    const FEED_TYPES = [
        { id: 'following', label: 'Following', url: '/dashboard' },
        { id: 'my_activity', label: 'My Activity', url: '/dashboard?feed_type=my_activity' }
    ];

    // Filter definitions
    const FILTERS = [
        {
            id: 'photo',
            title: 'Hide posts without photos or videos',
            storageKey: 'stravaPhotoFilterEnabled',
            defaultEnabled: true,
            bodyClass: 'strava-hide-no-photo',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="white">
                <path d="M12 5c-3.86 0-7 3.14-7 7s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7zm0-2c1.1 0 2 .9 2 2h3.17C18.6 5 19 5.4 19 5.83V7h1c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V9c0-1.1.9-2 2-2h1V5.83C5 5.4 5.4 5 5.83 5H9c0-1.1.9-2 2-2zm0 5c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/>
            </svg>`
        },
        {
            id: 'virtual',
            title: 'Hide virtual activities',
            storageKey: 'stravaVirtualFilterEnabled',
            defaultEnabled: false,
            bodyClass: 'strava-hide-virtual',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none">
                <text x="12" y="15" text-anchor="middle" font-size="9" font-weight="700" font-family="Arial, sans-serif" fill="white">VR</text>
            </svg>`
        },
        {
            id: 'unliked',
            title: 'Show posts I have not liked yet',
            storageKey: 'stravaUnlikedFilterEnabled',
            defaultEnabled: false,
            bodyClass: 'strava-show-unliked',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="17" height="17" fill="white">
                <path d="M12.1 21.35l-1.1-1C5.4 15.24 2 12.14 2 8.35 2 5.25 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.08C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.25 22 8.35c0 3.79-3.4 6.89-9 12l-.9 1zM7.5 5C5.56 5 4 6.43 4 8.35c0 2.74 2.54 5.16 8 10.13 5.46-4.97 8-7.39 8-10.13C20 6.43 18.44 5 16.5 5c-1.54 0-3.04.99-3.57 2.36h-1.86C10.54 5.99 9.04 5 7.5 5z"/>
            </svg>`
        },
        {
            id: 'mine',
            title: 'Hide my own posts',
            storageKey: 'stravaMineFilterEnabled',
            defaultEnabled: false,
            bodyClass: 'strava-hide-mine',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none">
                <text x="12" y="15" text-anchor="middle" font-size="9" font-weight="700" font-family="Arial, sans-serif" fill="white">ME</text>
            </svg>`
        }
    ];

    // Runtime state
    let rootObserver = null;
    let feedObserver = null;
    let feedContainer = null;
    let myAthleteId = null;
    const filterState = {};
    const filterUi = {};
    const trackedEntries = new Map();
    const hiddenCounts = {
        photo: 0,
        virtual: 0,
        unliked: 0,
        mine: 0
    };

    // Style and state helpers
    function ensureStyles() {
        if (document.getElementById(STYLE_ELEMENT_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ELEMENT_ID;
        style.textContent = `
            body.${getFilterConfig('photo').bodyClass} ${FEED_CONTAINER_SELECTOR} ${FEED_ENTRY_SELECTOR}[${NO_MEDIA_ENTRY_ATTRIBUTE}="true"] {
                display: none !important;
            }

            body.${getFilterConfig('virtual').bodyClass} ${FEED_CONTAINER_SELECTOR} ${FEED_ENTRY_SELECTOR}[${VIRTUAL_ENTRY_ATTRIBUTE}="true"] {
                display: none !important;
            }

            body.${getFilterConfig('unliked').bodyClass} ${FEED_CONTAINER_SELECTOR} ${FEED_ENTRY_SELECTOR}[${LIKED_ENTRY_ATTRIBUTE}="true"] {
                display: none !important;
            }

            body.${getFilterConfig('mine').bodyClass} ${FEED_CONTAINER_SELECTOR} ${FEED_ENTRY_SELECTOR}[${MINE_ENTRY_ATTRIBUTE}="true"] {
                display: none !important;
            }

            a[href*="/gift"] img {
                display: none !important;
            }
        `;

        document.head.appendChild(style);
    }

    function getFilterConfig(filterId) {
        return FILTERS.find(filter => filter.id === filterId);
    }

    function loadFilterState() {
        FILTERS.forEach(filter => {
            const savedValue = localStorage.getItem(filter.storageKey);
            filterState[filter.id] = savedValue === null ? filter.defaultEnabled : savedValue === 'true';
        });
    }

    function updateBadge(badge, count) {
        if (badge) {
            badge.textContent = count > 0 ? count : '';
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    }

    function updateButtonStyle(button, enabled) {
        if (button) {
            button.style.backgroundColor = enabled ? BUTTON_ACTIVE_COLOR : BUTTON_INACTIVE_COLOR;
        }
    }

    function getCurrentFeedType() {
        return new URLSearchParams(window.location.search).get('feed_type') === 'my_activity'
            ? 'my_activity'
            : 'following';
    }

    // Own activities expose a "View Kudos" button, which the liked-detection treats
    // as liked — so the unliked and mine filters would hide every entry on the My Activity feed.
    function isMyActivitiesFeedSelected() {
        return getCurrentFeedType() === 'my_activity';
    }

    function isFilterApplicable(filter) {
        if (!filterState[filter.id]) {
            return false;
        }
        if ((filter.id === 'unliked' || filter.id === 'mine') && isMyActivitiesFeedSelected()) {
            return false;
        }
        return true;
    }

    function extractAthleteId(href) {
        return href?.match(ATHLETE_HREF_PATTERN)?.[1] || null;
    }

    // Returns true the first time the id becomes known so the caller can re-index entries
    // that were tracked before the header was rendered.
    function resolveMyAthleteIdIfPossible() {
        if (myAthleteId) {
            return false;
        }
        for (const link of document.querySelectorAll(ME_LINK_SELECTOR)) {
            const id = extractAthleteId(link.getAttribute('href'));
            if (id) {
                myAthleteId = id;
                return true;
            }
        }
        return false;
    }

    function getMyAthleteId() {
        return myAthleteId;
    }

    function refreshBadges() {
        FILTERS.forEach(filter => {
            const count = isFilterApplicable(filter) ? hiddenCounts[filter.id] : 0;
            updateBadge(filterUi[filter.id]?.badge, count);
        });
    }

    function applyFilterClasses() {
        if (!document.body) {
            return;
        }

        FILTERS.forEach(filter => {
            document.body.classList.toggle(filter.bodyClass, isFilterApplicable(filter));
        });
    }

    function syncFilterUi() {
        FILTERS.forEach(filter => {
            updateButtonStyle(filterUi[filter.id]?.button, filterState[filter.id]);
        });
        refreshBadges();
    }

    function toggleFilter(filter) {
        filterState[filter.id] = !filterState[filter.id];
        localStorage.setItem(filter.storageKey, filterState[filter.id] ? 'true' : 'false');
        applyFilterClasses();
        syncFilterUi();
    }

    // Feed entry tracking
    function isElement(node) {
        return node && node.nodeType === Node.ELEMENT_NODE;
    }

    // [data-testid="tag"] holds the activity-type tag (e.g. "Virtual"). It might be
    // technical and never localized, but we match locale-specific roots just in case.
    const VIRTUAL_ACTIVITY_TOKENS = [
        'virtual',     // en, es, pt
        'virtuel',     // fr, da
        'virtuale',    // it
        'virtuell',    // de, sv, no
        'virtueel',    // nl
        'virtuaali',   // fi
        'wirtualn',    // pl
        'virtuáln',    // cs
        'виртуальн',   // ru
        'віртуальн',   // uk
        'バーチャル',  // ja
        '가상',        // ko
        '虚拟',        // zh-cn
        '虛擬',        // zh-tw
        'sanal'        // tr
    ];

    function isVirtualActivity(entry) {
        const tag = normalizeText(entry.querySelector(ACTIVITY_TAG_SELECTOR)?.textContent);
        return !!tag && VIRTUAL_ACTIVITY_TOKENS.some(token => tag.includes(token));
    }

    function normalizeText(value) {
        return (value || '').trim().toLowerCase();
    }

    function isLikedByMe(entry) {
        return !entry.querySelector(UNFILLED_KUDOS_SELECTOR);
    }

    function isMyPost(entry) {
        const myId = getMyAthleteId();
        if (!myId) {
            return false;
        }
        const ownerLink = entry.querySelector(OWNER_LINK_SELECTOR);
        return extractAthleteId(ownerLink?.getAttribute('href')) === myId;
    }

    function analyzeEntry(entry) {
        return {
            hasMedia: !!entry.querySelector(MEDIA_SELECTOR),
            isVirtual: isVirtualActivity(entry),
            likedByMe: isLikedByMe(entry),
            mine: isMyPost(entry)
        };
    }

    function setNoMediaEntryAttribute(entry, hasMedia) {
        if (!hasMedia) {
            entry.setAttribute(NO_MEDIA_ENTRY_ATTRIBUTE, 'true');
            return;
        }

        entry.removeAttribute(NO_MEDIA_ENTRY_ATTRIBUTE);
    }

    function setVirtualEntryAttribute(entry, isVirtual) {
        if (isVirtual) {
            entry.setAttribute(VIRTUAL_ENTRY_ATTRIBUTE, 'true');
            return;
        }

        entry.removeAttribute(VIRTUAL_ENTRY_ATTRIBUTE);
    }

    function setLikedEntryAttribute(entry, likedByMe) {
        if (likedByMe) {
            entry.setAttribute(LIKED_ENTRY_ATTRIBUTE, 'true');
            return;
        }

        entry.removeAttribute(LIKED_ENTRY_ATTRIBUTE);
    }

    function setMineEntryAttribute(entry, mine) {
        if (mine) {
            entry.setAttribute(MINE_ENTRY_ATTRIBUTE, 'true');
            return;
        }

        entry.removeAttribute(MINE_ENTRY_ATTRIBUTE);
    }

    // Track only the delta for entries that were added or changed, so badges stay cheap.
    function updateTrackedEntry(entry) {
        const nextState = analyzeEntry(entry);
        const previousState = trackedEntries.get(entry);

        if (!previousState) {
            if (!nextState.hasMedia) {
                hiddenCounts.photo += 1;
            }
            if (nextState.isVirtual) {
                hiddenCounts.virtual += 1;
            }
            if (nextState.likedByMe) {
                hiddenCounts.unliked += 1;
            }
            if (nextState.mine) {
                hiddenCounts.mine += 1;
            }
        } else {
            if (previousState.hasMedia !== nextState.hasMedia) {
                hiddenCounts.photo += nextState.hasMedia ? -1 : 1;
            }
            if (previousState.isVirtual !== nextState.isVirtual) {
                hiddenCounts.virtual += nextState.isVirtual ? 1 : -1;
            }
            if (previousState.likedByMe !== nextState.likedByMe) {
                hiddenCounts.unliked += nextState.likedByMe ? 1 : -1;
            }
            if (previousState.mine !== nextState.mine) {
                hiddenCounts.mine += nextState.mine ? 1 : -1;
            }
        }

        trackedEntries.set(entry, nextState);
        setNoMediaEntryAttribute(entry, nextState.hasMedia);
        setVirtualEntryAttribute(entry, nextState.isVirtual);
        setLikedEntryAttribute(entry, nextState.likedByMe);
        setMineEntryAttribute(entry, nextState.mine);
    }

    function removeTrackedEntry(entry) {
        const previousState = trackedEntries.get(entry);
        if (!previousState) {
            return;
        }

        if (!previousState.hasMedia) {
            hiddenCounts.photo = Math.max(0, hiddenCounts.photo - 1);
        }
        if (previousState.isVirtual) {
            hiddenCounts.virtual = Math.max(0, hiddenCounts.virtual - 1);
        }
        if (previousState.likedByMe) {
            hiddenCounts.unliked = Math.max(0, hiddenCounts.unliked - 1);
        }
        if (previousState.mine) {
            hiddenCounts.mine = Math.max(0, hiddenCounts.mine - 1);
        }

        trackedEntries.delete(entry);
        entry.removeAttribute(NO_MEDIA_ENTRY_ATTRIBUTE);
        entry.removeAttribute(VIRTUAL_ENTRY_ATTRIBUTE);
        entry.removeAttribute(LIKED_ENTRY_ATTRIBUTE);
        entry.removeAttribute(MINE_ENTRY_ATTRIBUTE);
    }

    function clearTrackedEntries() {
        trackedEntries.forEach((_, entry) => {
            entry.removeAttribute(NO_MEDIA_ENTRY_ATTRIBUTE);
            entry.removeAttribute(VIRTUAL_ENTRY_ATTRIBUTE);
            entry.removeAttribute(LIKED_ENTRY_ATTRIBUTE);
            entry.removeAttribute(MINE_ENTRY_ATTRIBUTE);
        });
        trackedEntries.clear();
        hiddenCounts.photo = 0;
        hiddenCounts.virtual = 0;
        hiddenCounts.unliked = 0;
        hiddenCounts.mine = 0;
    }

    function indexFeedEntries() {
        clearTrackedEntries();

        if (!feedContainer) {
            refreshBadges();
            return;
        }

        feedContainer.querySelectorAll(FEED_ENTRY_SELECTOR).forEach(updateTrackedEntry);
        refreshBadges();
        const targetForm = getRevealTargetForm();
        if (targetForm) {
            ensureRevealCloned(targetForm);
        }
    }

    function collectClosestEntry(node, result) {
        if (!isElement(node)) {
            return;
        }

        const closestEntry = node.closest(FEED_ENTRY_SELECTOR);
        if (closestEntry) {
            result.add(closestEntry);
        }
    }

    function collectEntriesFromNode(node, result) {
        if (!isElement(node)) {
            return;
        }

        if (node.matches(FEED_ENTRY_SELECTOR)) {
            result.add(node);
        }

        node.querySelectorAll(FEED_ENTRY_SELECTOR).forEach(entry => {
            result.add(entry);
        });

        collectClosestEntry(node, result);
    }

    // Feed mutations are processed incrementally instead of rescanning the whole feed.
    function processFeedMutations(mutations) {
        const affectedEntries = new Set();

        mutations.forEach(mutation => {
            collectClosestEntry(mutation.target, affectedEntries);
            mutation.addedNodes.forEach(node => collectEntriesFromNode(node, affectedEntries));
            mutation.removedNodes.forEach(node => collectEntriesFromNode(node, affectedEntries));
        });

        affectedEntries.forEach(entry => {
            if (feedContainer && entry.isConnected && feedContainer.contains(entry)) {
                updateTrackedEntry(entry);
            } else {
                removeTrackedEntry(entry);
            }
        });

        refreshBadges();
        const targetForm = getRevealTargetForm();
        if (targetForm) {
            ensureRevealCloned(targetForm);
        }
    }

    function disconnectFeedObserver() {
        if (feedObserver) {
            feedObserver.disconnect();
            feedObserver = null;
        }
    }

    function connectFeedObserver() {
        if (!feedContainer || feedObserver) {
            return;
        }

        feedObserver = new MutationObserver(processFeedMutations);
        feedObserver.observe(feedContainer, { childList: true, subtree: true });
    }

    function refreshFeedContainer() {
        const nextFeedContainer = document.querySelector(FEED_CONTAINER_SELECTOR);

        if (nextFeedContainer === feedContainer) {
            return;
        }

        disconnectFeedObserver();
        clearTrackedEntries();
        feedContainer = nextFeedContainer;

        if (!feedContainer) {
            refreshBadges();
            return;
        }

        connectFeedObserver();
        indexFeedEntries();
    }

    // UI
    function createBadge() {
        const badge = document.createElement('span');
        badge.style.cssText = `
            position: absolute;
            top: -6px;
            right: -6px;
            background: #e03e1a;
            color: white;
            font-size: 10px;
            font-weight: bold;
            min-width: 16px;
            height: 16px;
            border-radius: 8px;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 0 3px;
            line-height: 1;
        `;
        return badge;
    }

    function createFilterButton(filter) {
        const button = document.createElement('button');
        button.type = 'button';
        button.title = filter.title;
        button.style.cssText = `
            width: 32px; height: 32px; padding: 4px;
            color: white; border: none; border-radius: 4px;
            cursor: pointer; display: flex; align-items: center;
            justify-content: center; font-size: 14px; line-height: 1;
            white-space: nowrap; position: relative;
        `;
        button.innerHTML = filter.icon;

        const badge = createBadge();
        button.appendChild(badge);
        updateButtonStyle(button, filterState[filter.id]);

        button.addEventListener('click', (event) => {
            event.preventDefault();
            toggleFilter(filter);
        });

        return { button, badge };
    }

    function switchFeedType(feedTypeId) {
        if (getCurrentFeedType() === feedTypeId) {
            return;
        }
        const target = FEED_TYPES.find(type => type.id === feedTypeId);
        if (target) {
            window.location.href = target.url;
        }
    }

    // Copies the computed style from a real Strava nav-link so the toggle inherits the
    // current theme without hardcoding colors, fonts, or paddings.
    const NAV_LINK_STYLE_PROPERTIES = [
        'color', 'fontSize', 'fontWeight', 'lineHeight', 'fontFamily',
        'padding', 'letterSpacing'
    ];

    function findInactiveNavLink() {
        const currentPath = window.location.pathname;
        const links = document.querySelectorAll('.global-nav a.nav-link, .nav-bar a.nav-link');
        for (const link of links) {
            if (link.pathname && link.pathname !== currentPath) {
                return link;
            }
        }
        return null;
    }

    function applyNavLinkStyleFromComputed(target, computed) {
        if (!computed) {
            return;
        }
        NAV_LINK_STYLE_PROPERTIES.forEach(prop => {
            target.style[prop] = computed[prop];
        });
        target.style.textDecoration = 'none';
    }

    function getNavLinkComputedStyle() {
        const reference = findInactiveNavLink();
        return reference ? getComputedStyle(reference) : null;
    }

    function createFeedTypeToggle() {
        const container = document.createElement('div');
        container.id = FEED_TYPE_TOGGLE_ID;
        container.style.cssText = 'display:inline-flex; gap:8px; flex-shrink:0;';

        FEED_TYPES.forEach(feedType => {
            const tab = document.createElement('a');
            tab.href = feedType.url;
            tab.textContent = feedType.label;
            tab.dataset.feedType = feedType.id;
            tab.style.cursor = 'pointer';
            tab.style.borderBottom = '2px solid transparent';
            tab.addEventListener('click', (event) => {
                event.preventDefault();
                switchFeedType(feedType.id);
            });
            container.appendChild(tab);
        });

        applyFeedTypeToggleState(container);
        return container;
    }

    function applyFeedTypeToggleState(container) {
        const current = getCurrentFeedType();
        const navLinkStyle = getNavLinkComputedStyle();
        container.querySelectorAll('[data-feed-type]').forEach(tab => {
            applyNavLinkStyleFromComputed(tab, navLinkStyle);
            const active = tab.dataset.feedType === current;
            tab.style.borderBottomColor = active ? BUTTON_ACTIVE_COLOR : 'transparent';
            if (active) {
                tab.style.fontWeight = '700';
                tab.style.color = '#000';
            }
        });
    }

    function insertButtons(targetForm) {
        if (document.getElementById(FILTER_WRAPPER_ID)) {
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.id = FILTER_WRAPPER_ID;
        wrapper.style.cssText = 'display:flex; align-items:center; flex-shrink:0; gap:5px;';

        FILTERS.forEach(filter => {
            filterUi[filter.id] = createFilterButton(filter);
            wrapper.appendChild(filterUi[filter.id].button);
        });

        const controlsRow = document.createElement('div');
        controlsRow.id = FILTER_CONTROL_ROW_ID;
        controlsRow.style.cssText = 'display:flex; align-items:center; flex-wrap:nowrap; gap:10px; width:max-content; max-width:100%;';

        targetForm.style.flexShrink = '0';
        targetForm.style.display = 'none';
        targetForm.parentNode.insertBefore(controlsRow, targetForm);
        controlsRow.appendChild(createFeedTypeToggle());
        controlsRow.appendChild(createDropdownReveal(targetForm));
        controlsRow.appendChild(targetForm);
        controlsRow.appendChild(wrapper);
        syncFilterUi();
    }

    function findShareDropdownButton() {
        for (const btn of document.querySelectorAll('button[aria-haspopup="menu"]')) {
            if (btn.id === DROPDOWN_REVEAL_ID) {
                continue; // Skip our own placeholder so we don't clone ourselves.
            }
            const svg = btn.querySelector('svg[viewBox="0 0 16 16"]');
            if (svg && /^M14\.384/.test(svg.querySelector('path')?.getAttribute('d') || '')) {
                return btn;
            }
        }
        return null;
    }

    function makeRevealClickHandler(button, targetForm) {
        return (event) => {
            event.preventDefault();
            event.stopPropagation();
            const hidden = targetForm.style.display === 'none';
            targetForm.style.display = hidden ? '' : 'none';
            button.setAttribute('aria-expanded', String(hidden));
        };
    }

    function ensureRevealCloned(targetForm) {
        const button = document.getElementById(DROPDOWN_REVEAL_ID);
        if (!button || button.dataset.cloned === 'true') {
            return;
        }
        const reference = findShareDropdownButton();
        if (!reference) {
            return;
        }
        const clone = reference.cloneNode(true);
        clone.id = DROPDOWN_REVEAL_ID;
        clone.removeAttribute('aria-controls');
        clone.setAttribute('aria-expanded', 'false');
        clone.title = 'Show more feed sources';
        clone.dataset.cloned = 'true';
        clone.style.flexShrink = '0';
        clone.addEventListener('click', makeRevealClickHandler(clone, targetForm));
        button.replaceWith(clone);
    }

    function createDropdownReveal(targetForm) {
        // Fallback placeholder used until Strava's reference share button is rendered.
        // ensureRevealCloned() swaps this for a true clone once entries appear.
        const button = document.createElement('button');
        button.id = DROPDOWN_REVEAL_ID;
        button.type = 'button';
        button.title = 'Show more feed sources';
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
        button.style.cssText = `
            background:transparent; border:none; cursor:pointer;
            padding:2px 4px; line-height:0; flex-shrink:0;
            display:inline-flex; align-items:center; justify-content:center;
        `;
        button.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14.384 5.5L8.796 11.09c-.44.44-1.152.44-1.591 0L1.616 5.5l.884-.884 5.5 5.5 5.5-5.5z"/></svg>';
        button.addEventListener('click', makeRevealClickHandler(button, targetForm));
        return button;
    }

    function getRevealTargetForm() {
        return document.getElementById(FEED_FILTER_INPUT_ID)?.closest('form') || null;
    }

    function findFilterForm() {
        return document.getElementById(FEED_FILTER_INPUT_ID)?.closest('form') || null;
    }

    function mountFilterButtonsIfNeeded() {
        const filterForm = findFilterForm();
        if (filterForm) {
            insertButtons(filterForm);
        }
    }

    function restyleGiftLink() {
        document.querySelectorAll('a[href*="/gift"].btn-primary').forEach(link => {
            link.classList.remove('btn', 'btn-sm', 'btn-primary', 'experiment');
            link.classList.add('nav-link');
        });
    }

    // Bootstrap
    function nodeTouchesBootstrapTargets(node) {
        if (!isElement(node)) {
            return false;
        }

        return node.id === FEED_FILTER_INPUT_ID
            || node.matches(FEED_CONTAINER_SELECTOR)
            || !!node.querySelector(`#${FEED_FILTER_INPUT_ID}`)
            || !!node.querySelector(FEED_CONTAINER_SELECTOR);
    }

    function mutationsTouchBootstrapTargets(mutations) {
        return mutations.some(mutation => {
            if (nodeTouchesBootstrapTargets(mutation.target)) {
                return true;
            }

            return [...mutation.addedNodes, ...mutation.removedNodes].some(nodeTouchesBootstrapTargets);
        });
    }

    // Root observer only reattaches UI/feed wiring when Strava replaces major containers.
    function startRootObserver() {
        if (rootObserver) {
            return;
        }

        rootObserver = new MutationObserver((mutations) => {
            if (!mutationsTouchBootstrapTargets(mutations)) {
                return;
            }

            mountFilterButtonsIfNeeded();
            restyleGiftLink();
            const idJustResolved = resolveMyAthleteIdIfPossible();
            refreshFeedContainer();
            if (idJustResolved) {
                trackedEntries.forEach((_, entry) => updateTrackedEntry(entry));
            }
            applyFilterClasses();
            refreshBadges();
        });

        rootObserver.observe(document.body, { childList: true, subtree: true });
    }

    // Strava swaps feeds via the History API without a full reload, so we patch it to
    // dispatch a synthetic event that lets us re-evaluate which filters apply.
    function patchHistoryForLocationEvents() {
        if (window.__stravaFeedFiltersHistoryPatched) {
            return;
        }
        window.__stravaFeedFiltersHistoryPatched = true;

        const dispatch = () => window.dispatchEvent(new Event('strava-feed-locationchange'));
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function() {
            const result = originalPushState.apply(this, arguments);
            dispatch();
            return result;
        };
        history.replaceState = function() {
            const result = originalReplaceState.apply(this, arguments);
            dispatch();
            return result;
        };
        window.addEventListener('popstate', dispatch);
    }

    function syncFeedTypeToggle() {
        const toggle = document.getElementById(FEED_TYPE_TOGGLE_ID);
        if (toggle) {
            applyFeedTypeToggleState(toggle);
        }
    }

    function handleLocationChange() {
        applyFilterClasses();
        refreshBadges();
        syncFeedTypeToggle();
    }

    function initialize() {
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', initialize, { once: true });
            return;
        }
        loadFilterState();
        ensureStyles();
        applyFilterClasses();
        mountFilterButtonsIfNeeded();
        restyleGiftLink();
        resolveMyAthleteIdIfPossible();
        refreshFeedContainer();
        startRootObserver();
        syncFilterUi();
        patchHistoryForLocationEvents();
        window.addEventListener('strava-feed-locationchange', handleLocationChange);
    }

    window.addEventListener('beforeunload', () => {
        disconnectFeedObserver();

        if (rootObserver) {
            rootObserver.disconnect();
            rootObserver = null;
        }
    });

    initialize();
})();
