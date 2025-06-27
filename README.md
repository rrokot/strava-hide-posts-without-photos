# Strava Hide Posts Without Photos

A small Tampermonkey / Userscript that adds a toggle button to your Strava Dashboard.  
When enabled, it automatically hides all feed posts that don't contain any photos (map-only activities will be hidden).

---

## Features

- Toggle button appears next to the feed filter dropdown (e.g., "Following" / "All")
- Persistent filter state (remembers ON/OFF after page reloads)
- Uses a small SVG camera icon with a tooltip for clean UI integration
- Works with infinite scroll and dynamically loaded feed items

---

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or any compatible userscript manager) in your browser.
2. Download and install the script from this repository:  
   [strava-hide-posts-without-photos.user.js](./strava-hide-posts-without-photos.user.js)
3. Reload your Strava Dashboard:  
   [https://www.strava.com/dashboard](https://www.strava.com/dashboard)

---

## How it works

- By default, the filter is **enabled**.
- The small camera icon button (🖼️) next to the feed dropdown toggles the filter.
- The button color indicates the state:
  - **Orange (#fc5200)** = Filter ON (hiding posts without photos)
  - **Gray (#888888)** = Filter OFF (showing all posts)

Hover over the button to see the tooltip:  
**"Hide posts without photos"**

---

## Author

Created by [https://www.strava.com/athletes/5931245](https://www.strava.com/athletes/5931245)

---

## License

MIT License
