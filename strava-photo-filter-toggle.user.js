// ==UserScript==
// @name         Strava Dashboard - Photo Filter Toggle with Persistence
// @version      5.6
// @description  Adds filter buttons to hide posts without photos and/or virtual activities on Strava Dashboard. State persists between reloads.
// @author       https://www.strava.com/athletes/5931245
// @match        https://www.strava.com/dashboard*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/rrokot/strava-hide-posts-without-photos/main/strava-photo-filter-toggle.meta.js
// @downloadURL  https://raw.githubusercontent.com/rrokot/strava-hide-posts-without-photos/main/strava-photo-filter-toggle.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const FEED_CONTAINER_SELECTOR = '.feature-feed';
    const FEED_ENTRY_SELECTOR = 'div[id^="feed-entry-"]';
    const FILTER_FORM_SELECTOR = 'form.uRdSO2YS';
    const FILTER_WRAPPER_ID = 'strava-feed-filter-toggles';
    const STYLE_ELEMENT_ID = 'strava-feed-filter-styles';
    const PHOTO_SELECTOR = '[data-testid="photo"]';
    const VIRTUAL_TAG_SELECTOR = 'div[data-testid="tag"]';
    const VIRTUAL_ENTRY_ATTRIBUTE = 'data-strava-virtual-entry';
    const BUTTON_ACTIVE_COLOR = '#fc5200';
    const BUTTON_INACTIVE_COLOR = '#888';

    // Filter definitions
    const FILTERS = [
        {
            id: 'photo',
            title: 'Hide posts without photos',
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
        }
    ];

    // Runtime state
    let rootObserver = null;
    let feedObserver = null;
    let feedContainer = null;
    const filterState = {};
    const filterUi = {};
    const trackedEntries = new Map();
    const hiddenCounts = {
        photo: 0,
        virtual: 0
    };

    // Style and state helpers
    function ensureStyles() {
        if (document.getElementById(STYLE_ELEMENT_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ELEMENT_ID;
        style.textContent = `
            body.${getFilterConfig('photo').bodyClass} ${FEED_CONTAINER_SELECTOR} ${FEED_ENTRY_SELECTOR}:not(:has(${PHOTO_SELECTOR})) {
                display: none !important;
            }

            body.${getFilterConfig('virtual').bodyClass} ${FEED_CONTAINER_SELECTOR} ${FEED_ENTRY_SELECTOR}[${VIRTUAL_ENTRY_ATTRIBUTE}="true"] {
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

    function refreshBadges() {
        FILTERS.forEach(filter => {
            const count = filterState[filter.id] ? hiddenCounts[filter.id] : 0;
            updateBadge(filterUi[filter.id]?.badge, count);
        });
    }

    function applyFilterClasses() {
        if (!document.body) {
            return;
        }

        FILTERS.forEach(filter => {
            document.body.classList.toggle(filter.bodyClass, filterState[filter.id]);
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

    function isVirtualActivity(entry) {
        const tag = entry.querySelector(VIRTUAL_TAG_SELECTOR);
        return !!tag && tag.textContent.trim().toLowerCase() === 'virtual';
    }

    function analyzeEntry(entry) {
        return {
            hasPhoto: !!entry.querySelector(PHOTO_SELECTOR),
            isVirtual: isVirtualActivity(entry)
        };
    }

    function setVirtualEntryAttribute(entry, isVirtual) {
        if (isVirtual) {
            entry.setAttribute(VIRTUAL_ENTRY_ATTRIBUTE, 'true');
            return;
        }

        entry.removeAttribute(VIRTUAL_ENTRY_ATTRIBUTE);
    }

    // Track only the delta for entries that were added or changed, so badges stay cheap.
    function updateTrackedEntry(entry) {
        const nextState = analyzeEntry(entry);
        const previousState = trackedEntries.get(entry);

        if (!previousState) {
            if (!nextState.hasPhoto) {
                hiddenCounts.photo += 1;
            }
            if (nextState.isVirtual) {
                hiddenCounts.virtual += 1;
            }
        } else {
            if (previousState.hasPhoto !== nextState.hasPhoto) {
                hiddenCounts.photo += nextState.hasPhoto ? -1 : 1;
            }
            if (previousState.isVirtual !== nextState.isVirtual) {
                hiddenCounts.virtual += nextState.isVirtual ? 1 : -1;
            }
        }

        trackedEntries.set(entry, nextState);
        setVirtualEntryAttribute(entry, nextState.isVirtual);
    }

    function removeTrackedEntry(entry) {
        const previousState = trackedEntries.get(entry);
        if (!previousState) {
            return;
        }

        if (!previousState.hasPhoto) {
            hiddenCounts.photo = Math.max(0, hiddenCounts.photo - 1);
        }
        if (previousState.isVirtual) {
            hiddenCounts.virtual = Math.max(0, hiddenCounts.virtual - 1);
        }

        trackedEntries.delete(entry);
        entry.removeAttribute(VIRTUAL_ENTRY_ATTRIBUTE);
    }

    function clearTrackedEntries() {
        trackedEntries.forEach((_, entry) => {
            entry.removeAttribute(VIRTUAL_ENTRY_ATTRIBUTE);
        });
        trackedEntries.clear();
        hiddenCounts.photo = 0;
        hiddenCounts.virtual = 0;
    }

    function indexFeedEntries() {
        clearTrackedEntries();

        if (!feedContainer) {
            refreshBadges();
            return;
        }

        feedContainer.querySelectorAll(FEED_ENTRY_SELECTOR).forEach(updateTrackedEntry);
        refreshBadges();
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

    function insertButtons(targetForm) {
        if (document.getElementById(FILTER_WRAPPER_ID)) {
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.id = FILTER_WRAPPER_ID;
        wrapper.style.cssText = 'display:flex; align-items:center; margin-left:10px; flex-shrink:0; gap:6px;';

        FILTERS.forEach(filter => {
            filterUi[filter.id] = createFilterButton(filter);
            wrapper.appendChild(filterUi[filter.id].button);
        });

        targetForm.appendChild(wrapper);
        syncFilterUi();
    }

    function mountFilterButtonsIfNeeded() {
        const filterForm = document.querySelector(FILTER_FORM_SELECTOR);
        if (filterForm) {
            insertButtons(filterForm);
        }
    }

    // Bootstrap
    function nodeTouchesBootstrapTargets(node) {
        if (!isElement(node)) {
            return false;
        }

        return node.matches(FILTER_FORM_SELECTOR)
            || node.matches(FEED_CONTAINER_SELECTOR)
            || !!node.querySelector(FILTER_FORM_SELECTOR)
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
            refreshFeedContainer();
        });

        rootObserver.observe(document.body, { childList: true, subtree: true });
    }

    function initialize() {
        loadFilterState();
        ensureStyles();
        applyFilterClasses();
        mountFilterButtonsIfNeeded();
        refreshFeedContainer();
        startRootObserver();
        syncFilterUi();
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
