// ==UserScript==
// @name         Strava Dashboard - Photo Filter Toggle with Persistence
// @namespace    https://www.strava.com/athletes/5931245
// @version      3.0
// @description  Adds a small SVG icon button with tooltip to hide/show posts without photos on Strava Dashboard. State persists between reloads.
// @author       https://www.strava.com/athletes/5931245
// @match        https://www.strava.com/dashboard*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let observer = null;
    let observerActive = false;
    let filterEnabled = true;
    let toggleButton = null;
    const storageKey = 'stravaPhotoFilterEnabled';

    function hidePostsWithoutPhotos() {
        document.querySelectorAll('div[id^="feed-entry-"]').forEach(entry => {
            const hasPhoto = entry.querySelector('div[data-testid="photo"]');
            if (!hasPhoto) {
                entry.style.display = 'none';
            }
        });
    }

    function showAllPosts() {
        document.querySelectorAll('div[id^="feed-entry-"]').forEach(entry => {
            entry.style.display = '';
        });
    }

    function applyFilter() {
        hidePostsWithoutPhotos();
        if (!observerActive) {
            observer = new MutationObserver(hidePostsWithoutPhotos);
            observer.observe(document.body, { childList: true, subtree: true });
            observerActive = true;
        }
    }

    function disableFilter() {
        if (observer && observerActive) {
            observer.disconnect();
            observerActive = false;
        }
        showAllPosts();
    }

    function updateButtonStyle() {
        toggleButton.style.backgroundColor = filterEnabled ? '#fc5200' : '#888';
    }

    function toggleFilter() {
        filterEnabled = !filterEnabled;
        localStorage.setItem(storageKey, filterEnabled ? 'true' : 'false');
        if (filterEnabled) {
            applyFilter();
        } else {
            disableFilter();
        }
        updateButtonStyle();
    }

    function insertButton(targetForm) {
        const buttonWrapper = document.createElement('div');
        buttonWrapper.style.display = 'flex';
        buttonWrapper.style.alignItems = 'center';
        buttonWrapper.style.marginLeft = '10px';
        buttonWrapper.style.flexShrink = '0';

        toggleButton = document.createElement('button');
        toggleButton.title = 'Hide posts without photos';
        toggleButton.style.width = '32px';
        toggleButton.style.height = '32px';
        toggleButton.style.padding = '4px';
        toggleButton.style.color = 'white';
        toggleButton.style.border = 'none';
        toggleButton.style.borderRadius = '4px';
        toggleButton.style.cursor = 'pointer';
        toggleButton.style.display = 'flex';
        toggleButton.style.alignItems = 'center';
        toggleButton.style.justifyContent = 'center';
        toggleButton.style.fontSize = '14px';
        toggleButton.style.lineHeight = '1';
        toggleButton.style.whiteSpace = 'nowrap';

        toggleButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="white">
                <path d="M12 5c-3.86 0-7 3.14-7 7s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7zm0-2c1.1 0 2 .9 2 2h3.17C18.6 5 19 5.4 19 5.83V7h1c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V9c0-1.1.9-2 2-2h1V5.83C5 5.4 5.4 5 5.83 5H9c0-1.1.9-2 2-2zm0 5c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/>
            </svg>
        `;

        toggleButton.addEventListener('click', (e) => {
            e.preventDefault();
            toggleFilter();
        });

        buttonWrapper.appendChild(toggleButton);
        targetForm.appendChild(buttonWrapper);
        updateButtonStyle();
    }

    function waitForFilterForm() {
        const target = document.body;
        const config = { childList: true, subtree: true };

        const formObserver = new MutationObserver((mutations, obs) => {
            const form = document.querySelector('form.uRdSO2YS');
            if (form && !document.body.contains(toggleButton)) {
                insertButton(form);
                const savedState = localStorage.getItem(storageKey);
                filterEnabled = savedState !== 'false';
                if (filterEnabled) {
                    applyFilter();
                } else {
                    disableFilter();
                }
                updateButtonStyle();
                obs.disconnect();
            }
        });

        formObserver.observe(target, config);
    }

    // Initialize
    waitForFilterForm();
})();
