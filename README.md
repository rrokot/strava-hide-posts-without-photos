# Strava Hide Posts Without Photos

A small Tampermonkey / Userscript that adds a toggle button to your Strava Dashboard.  
When enabled, it automatically hides all feed posts that don't contain any photos (map-only activities will be hidden).

---

## Screenshot

![Screenshot](./Screenshot.png)

---

## Features

- Toggle button appears next to the feed filter dropdown (e.g., "Following" / "All")
- Persistent filter state (remembers ON/OFF after page reloads)
- Small camera icon button with tooltip for clean UI integration
- Works with infinite scroll and dynamically loaded feed items

---

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Click to install the userscript: [**Install Strava Photo Filter**](https://raw.githubusercontent.com/rrokot/strava-hide-posts-without-photos/main/strava-photo-filter-toggle.user.js)


---

## How it works

- By default, the filter is **enabled**.
- The camera icon button toggles the filter ON/OFF.
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
