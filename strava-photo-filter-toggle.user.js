// ==UserScript==
// @name         Strava Dashboard - Photo Filter Toggle with Persistence
// @version      5.3
// @description  Adds filter buttons to hide posts without photos and/or virtual activities on Strava Dashboard. State persists between reloads.
// @author       https://www.strava.com/athletes/5931245
// @match        https://www.strava.com/dashboard*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/rrokot/strava-hide-posts-without-photos/main/strava-photo-filter-toggle.meta.js
// @downloadURL  https://raw.githubusercontent.com/rrokot/strava-hide-posts-without-photos/main/strava-photo-filter-toggle.user.js
// ==/UserScript==

(function() {
    'use strict';

    const FEED_ENTRY_SELECTOR = 'div[id^="feed-entry-"]';
    const FILTER_FORM_SELECTOR = 'form.uRdSO2YS';
    const FILTER_WRAPPER_ID = 'strava-feed-filter-toggles';
    const BUTTON_ACTIVE_COLOR = '#fc5200';
    const BUTTON_INACTIVE_COLOR = '#888';

    const FILTERS = [
        {
            id: 'photo',
            title: 'Hide posts without photos',
            storageKey: 'stravaPhotoFilterEnabled',
            defaultEnabled: true,
            matches(entry) {
                return !entry.querySelector('div[data-testid="photo"]');
            },
            icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="white">
                <path d="M12 5c-3.86 0-7 3.14-7 7s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7zm0-2c1.1 0 2 .9 2 2h3.17C18.6 5 19 5.4 19 5.83V7h1c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V9c0-1.1.9-2 2-2h1V5.83C5 5.4 5.4 5 5.83 5H9c0-1.1.9-2 2-2zm0 5c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/>
            </svg>`
        },
        {
            id: 'virtual',
            title: 'Hide virtual activities',
            storageKey: 'stravaVirtualFilterEnabled',
            defaultEnabled: false,
            matches(entry) {
                const tag = entry.querySelector('div[data-testid="tag"]');
                return !!tag && tag.textContent.trim().toLowerCase() === 'virtual';
            },
            icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="white">
                <path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7l-2 3v1h8v-1l-2-3h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H3V4h18v12z"/>
            </svg>`
        }
    ];

    let observer = null;
    let scheduledFilterFrame = null;
    const filterState = {};
    const filterUi = {};

    loadFilterState();

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

    function anyFilterActive() {
        return FILTERS.some(filter => filterState[filter.id]);
    }

    function applyFilters() {
        const hiddenCounts = {};

        FILTERS.forEach(filter => {
            hiddenCounts[filter.id] = 0;
        });

        document.querySelectorAll(FEED_ENTRY_SELECTOR).forEach(entry => {
            let shouldHide = false;

            FILTERS.forEach(filter => {
                if (filterState[filter.id] && filter.matches(entry)) {
                    hiddenCounts[filter.id]++;
                    shouldHide = true;
                }
            });

            entry.style.display = shouldHide ? 'none' : '';
        });

        FILTERS.forEach(filter => {
            updateBadge(filterUi[filter.id]?.badge, filterState[filter.id] ? hiddenCounts[filter.id] : 0);
        });
    }

    function cancelScheduledApply() {
        if (scheduledFilterFrame !== null) {
            cancelAnimationFrame(scheduledFilterFrame);
            scheduledFilterFrame = null;
        }
    }

    function scheduleApplyFilters() {
        if (scheduledFilterFrame !== null) {
            return;
        }

        scheduledFilterFrame = requestAnimationFrame(() => {
            scheduledFilterFrame = null;
            if (anyFilterActive()) {
                applyFilters();
            }
        });
    }

    function showAllPosts() {
        document.querySelectorAll(FEED_ENTRY_SELECTOR).forEach(entry => {
            entry.style.display = '';
        });

        FILTERS.forEach(filter => {
            updateBadge(filterUi[filter.id]?.badge, 0);
        });
    }

    function syncFilters() {
        if (anyFilterActive()) {
            applyFilters();
            return;
        }

        cancelScheduledApply();
        showAllPosts();
    }

    function isElement(node) {
        return node && node.nodeType === Node.ELEMENT_NODE;
    }

    function nodeTouchesFeed(node) {
        if (!isElement(node)) {
            return false;
        }

        return node.matches(FEED_ENTRY_SELECTOR)
            || !!node.querySelector(FEED_ENTRY_SELECTOR)
            || !!node.closest(FEED_ENTRY_SELECTOR);
    }

    function mutationsTouchFeed(mutations) {
        return mutations.some(mutation => {
            if (nodeTouchesFeed(mutation.target)) {
                return true;
            }

            return [...mutation.addedNodes, ...mutation.removedNodes].some(nodeTouchesFeed);
        });
    }

    function startObserver() {
        if (observer) {
            return;
        }

        observer = new MutationObserver((mutations) => {
            if (!anyFilterActive()) {
                return;
            }

            if (mutationsTouchFeed(mutations)) {
                scheduleApplyFilters();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function toggleFilter(filter) {
        filterState[filter.id] = !filterState[filter.id];
        localStorage.setItem(filter.storageKey, filterState[filter.id] ? 'true' : 'false');
        updateButtonStyle(filterUi[filter.id]?.button, filterState[filter.id]);
        syncFilters();
    }

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
    }

    function initializeUi(targetForm) {
        insertButtons(targetForm);
        syncFilters();
        startObserver();
    }

    function waitForFilterForm() {
        const existingForm = document.querySelector(FILTER_FORM_SELECTOR);
        if (existingForm) {
            initializeUi(existingForm);
            return;
        }

        const formObserver = new MutationObserver((mutations, obs) => {
            const form = document.querySelector(FILTER_FORM_SELECTOR);
            if (form && !document.getElementById(FILTER_WRAPPER_ID)) {
                initializeUi(form);
                obs.disconnect();
            }
        });

        formObserver.observe(document.body, { childList: true, subtree: true });
    }

    window.addEventListener('beforeunload', () => {
        if (observer) {
            observer.disconnect();
            observer = null;
        }

        cancelScheduledApply();
    });

    waitForFilterForm();
})();
