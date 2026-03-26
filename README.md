# CineScope 🎬

A modern, responsive movie search web application built with vanilla HTML, CSS, and JavaScript, powered by the [OMDb API](https://www.omdbapi.com/).

## Features

- **Debounced search** with a live suggestions dropdown – reduces API calls while typing
- **Responsive movie grid** showing poster, title, and year
- **Full movie detail modal** – plot, IMDb/RT/Metacritic ratings, director, cast, box-office, and more
- **Favorites** – add/remove movies; persisted in `localStorage`
- **Pagination** – 10 results per page, navigable forward and back
- **Dark / Light theme toggle** – remembered across sessions
- **Skeleton loading cards** and graceful error handling
- Fully accessible (keyboard navigation, ARIA labels, focus management)

## Project Structure

```
CineScope/
├── index.html   – Semantic HTML layout (header, hero/search, results grid, modal)
├── style.css    – CSS custom properties, responsive grid, animations, dark/light themes
└── script.js    – All app logic (API calls, search, favorites, modal, theme, pagination)
```

## Getting Started

1. **Get a free OMDb API key** at <https://www.omdbapi.com/apikey.aspx>
2. Open `script.js` and replace the placeholder on this line:
   ```js
   const API_KEY = 'trilogy'; // ← replace with your OMDb API key
   ```
3. Open `index.html` in any modern browser – no build step required.

## Usage

| Action | How |
|---|---|
| Search movies | Type in the search bar (results appear after a short debounce) |
| View details | Click any movie card |
| Add to favorites | Click the ♥ button on a card or inside the detail modal |
| View favorites | Click **Favorites** in the header nav |
| Switch theme | Click the moon/sun icon in the header |

## Tech Stack

- **HTML5** – semantic markup, ARIA roles
- **CSS3** – custom properties, CSS Grid, animations, `backdrop-filter`
- **Vanilla JavaScript (ES2020)** – `async/await`, `localStorage`, `URLSearchParams`
- **OMDb API** – movie data
- **Font Awesome 6** – icons (loaded via CDN)
