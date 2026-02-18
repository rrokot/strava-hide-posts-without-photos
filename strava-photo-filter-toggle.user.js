// ==UserScript==
// @name         Strava Dashboard - Photo Filter Toggle with Persistence
// @version      5.0
// @description  Adds filter buttons to hide posts without photos and/or virtual activities on Strava Dashboard. State persists between reloads.
// @author       https://www.strava.com/athletes/5931245
// @match        https://www.strava.com/dashboard*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/rrokot/strava-hide-posts-without-photos/main/strava-photo-filter-toggle.meta.js
// @downloadURL  https://raw.githubusercontent.com/rrokot/strava-hide-posts-without-photos/main/strava-photo-filter-toggle.user.js
// ==/UserScript==

(function() {
    'use strict';

    let observer = null;
    let observerActive = false;
    let debounceTimer = null;
    const DEBOUNCE_MS = 150;

    // Filter states
    let photoFilterEnabled = true;
    let virtualFilterEnabled = false;
    const photoStorageKey = 'stravaPhotoFilterEnabled';
    const virtualStorageKey = 'stravaVirtualFilterEnabled';

    // UI elements
    let photoButton = null;
    let virtualButton = null;
    let photoCounter = null;
    let virtualCounter = null;

    function updateBadge(badge, count) {
        if (badge) {
            badge.textContent = count > 0 ? count : '';
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    }

    function isVirtualActivity(entry) {
        const tag = entry.querySelector('div[data-testid="tag"]');
        return tag && tag.textContent.trim().toLowerCase() === 'virtual';
    }

    function applyFilters() {
        let photoHidden = 0;
        let virtualHidden = 0;
        document.querySelectorAll('div[id^="feed-entry-"]').forEach(entry => {
            let shouldHide = false;

            if (photoFilterEnabled) {
                const hasPhoto = entry.querySelector('div[data-testid="photo"]');
                if (!hasPhoto) {
                    shouldHide = true;
                    photoHidden++;
                }
            }

            if (virtualFilterEnabled && isVirtualActivity(entry)) {
                shouldHide = true;
                virtualHidden++;
            }

            entry.style.display = shouldHide ? 'none' : '';
        });
        updateBadge(photoCounter, photoFilterEnabled ? photoHidden : 0);
        updateBadge(virtualCounter, virtualFilterEnabled ? virtualHidden : 0);
    }

    function applyFiltersDebounced() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(applyFilters, DEBOUNCE_MS);
    }

    function showAllPosts() {
        document.querySelectorAll('div[id^="feed-entry-"]').forEach(entry => {
            entry.style.display = '';
        });
        updateBadge(photoCounter, 0);
        updateBadge(virtualCounter, 0);
    }

    function getFeedContainer() {
        const firstEntry = document.querySelector('div[id^="feed-entry-"]');
        return firstEntry ? firstEntry.parentElement : null;
    }

    function anyFilterActive() {
        return photoFilterEnabled || virtualFilterEnabled;
    }

    function startObserver() {
        if (!observerActive) {
            const feedContainer = getFeedContainer();
            const target = feedContainer || document.body;
            observer = new MutationObserver(applyFiltersDebounced);
            observer.observe(target, { childList: true, subtree: true });
            observerActive = true;
        }
    }

    function stopObserver() {
        if (observer && observerActive) {
            observer.disconnect();
            observer = null;
            observerActive = false;
        }
        clearTimeout(debounceTimer);
    }

    function syncFilters() {
        if (anyFilterActive()) {
            applyFilters();
            startObserver();
        } else {
            stopObserver();
            showAllPosts();
        }
    }

    function updateButtonStyle(button, enabled) {
        button.style.backgroundColor = enabled ? '#fc5200' : '#888';
    }

    function togglePhotoFilter() {
        photoFilterEnabled = !photoFilterEnabled;
        localStorage.setItem(photoStorageKey, photoFilterEnabled ? 'true' : 'false');
        updateButtonStyle(photoButton, photoFilterEnabled);
        syncFilters();
    }

    function toggleVirtualFilter() {
        virtualFilterEnabled = !virtualFilterEnabled;
        localStorage.setItem(virtualStorageKey, virtualFilterEnabled ? 'true' : 'false');
        updateButtonStyle(virtualButton, virtualFilterEnabled);
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

    function createFilterButton(title, svgHTML, onClick) {
        const button = document.createElement('button');
        button.title = title;
        button.style.cssText = `
            width: 32px; height: 32px; padding: 4px;
            color: white; border: none; border-radius: 4px;
            cursor: pointer; display: flex; align-items: center;
            justify-content: center; font-size: 14px; line-height: 1;
            white-space: nowrap; position: relative;
        `;
        button.innerHTML = svgHTML;

        const badge = createBadge();
        button.appendChild(badge);

        button.addEventListener('click', (e) => {
            e.preventDefault();
            onClick();
        });

        return { button, badge };
    }

    function insertButtons(targetForm) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; align-items:center; margin-left:10px; flex-shrink:0; gap:6px;';

        // Photo filter button (camera icon)
        const photo = createFilterButton(
            'Hide posts without photos',
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="white">
                <path d="M12 5c-3.86 0-7 3.14-7 7s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7zm0-2c1.1 0 2 .9 2 2h3.17C18.6 5 19 5.4 19 5.83V7h1c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V9c0-1.1.9-2 2-2h1V5.83C5 5.4 5.4 5 5.83 5H9c0-1.1.9-2 2-2zm0 5c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/>
            </svg>`,
            togglePhotoFilter
        );
        photoButton = photo.button;
        photoCounter = photo.badge;

        // Virtual filter button (monitor/indoor icon)
        const virtual = createFilterButton(
            'Hide virtual activities',
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="white">
                <path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7l-2 3v1h8v-1l-2-3h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H3V4h18v12z"/>
            </svg>`,
            toggleVirtualFilter
        );
        virtualButton = virtual.button;
        virtualCounter = virtual.badge;

        wrapper.appendChild(photoButton);
        wrapper.appendChild(virtualButton);
        targetForm.appendChild(wrapper);

        updateButtonStyle(photoButton, photoFilterEnabled);
        updateButtonStyle(virtualButton, virtualFilterEnabled);
    }

    function waitForFilterForm() {
        const target = document.body;
        const config = { childList: true, subtree: true };

        const formObserver = new MutationObserver((mutations, obs) => {
            const form = document.querySelector('form.uRdSO2YS');
            if (form && !document.body.contains(photoButton)) {
                insertButtons(form);

                const savedPhoto = localStorage.getItem(photoStorageKey);
                photoFilterEnabled = savedPhoto !== 'false';

                const savedVirtual = localStorage.getItem(virtualStorageKey);
                virtualFilterEnabled = savedVirtual === 'true';

                updateButtonStyle(photoButton, photoFilterEnabled);
                updateButtonStyle(virtualButton, virtualFilterEnabled);
                syncFilters();

                obs.disconnect();
            }
        });

        formObserver.observe(target, config);
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (observer) {
            observer.disconnect();
            observer = null;
            observerActive = false;
        }
        clearTimeout(debounceTimer);
    });

    // Initialize
    waitForFilterForm();
})();
