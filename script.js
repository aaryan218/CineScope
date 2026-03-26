/**
 * CineScope – script.js
 * Vanilla JS movie search app using the OMDb API.
 *
 * Features:
 *  - Debounced search with live suggestions dropdown
 *  - Responsive movie grid with poster / title / year
 *  - Full movie detail modal (plot, ratings, cast, etc.)
 *  - Add/remove favorites stored in localStorage
 *  - Pagination (10 results per page from OMDb)
 *  - Dark/light theme toggle (persisted in localStorage)
 *  - Loading skeleton + error handling
 */

'use strict';

/* ─────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────── */

/**
 * Replace the value below with your own OMDb API key.
 * Get a free key at https://www.omdbapi.com/apikey.aspx
 *
 * The key is embedded in the client-side bundle intentionally
 * (OMDb free keys have low rate limits and are meant for demo use).
 */
const API_KEY  = 'trilogy';          // ← replace with your OMDb API key
const API_BASE = `https://www.omdbapi.com/`;

const DEBOUNCE_DELAY    = 350;  // ms – search debounce
const SUGGESTION_LIMIT  = 5;   // max suggestion items shown
const STORAGE_KEY_FAVS  = 'cinescope_favorites';
const STORAGE_KEY_THEME = 'cinescope_theme';

/* ─────────────────────────────────────────────
   DOM REFERENCES
───────────────────────────────────────────── */
const html            = document.documentElement;
const searchInput     = document.getElementById('search-input');
const clearBtn        = document.getElementById('clear-btn');
const suggestionsList = document.getElementById('suggestions');
const statusBar       = document.getElementById('status-bar');
const statusMsg       = document.getElementById('status-msg');
const loadingGrid     = document.getElementById('loading-grid');
const sectionHeader   = document.getElementById('section-header');
const sectionTitle    = document.getElementById('section-title');
const resultCount     = document.getElementById('result-count');
const moviesGrid      = document.getElementById('movies-grid');
const emptyState      = document.getElementById('empty-state');
const pagination      = document.getElementById('pagination');
const btnPrev         = document.getElementById('btn-prev');
const btnNext         = document.getElementById('btn-next');
const pageInfo        = document.getElementById('page-info');
const themeToggle     = document.getElementById('theme-toggle');
const themeIcon       = document.getElementById('theme-icon');
const btnHome         = document.getElementById('btn-home');
const btnFavorites    = document.getElementById('btn-favorites');
const favCount        = document.getElementById('fav-count');
const logoLink        = document.getElementById('logo-link');
const modalOverlay    = document.getElementById('modal-overlay');
const modalClose      = document.getElementById('modal-close');
const modalLoading    = document.getElementById('modal-loading');
const modalBody       = document.getElementById('modal-body');
const modalPoster     = document.getElementById('modal-poster');
const modalBadges     = document.getElementById('modal-badges');
const modalTitle      = document.getElementById('modal-title');
const modalMeta       = document.getElementById('modal-meta');
const modalPlot       = document.getElementById('modal-plot');
const modalRatings    = document.getElementById('modal-ratings');
const modalDetails    = document.getElementById('modal-details');
const modalFavBtn     = document.getElementById('modal-fav-btn');
const modalFavLabel   = document.getElementById('modal-fav-label');
const toast           = document.getElementById('toast');

/* ─────────────────────────────────────────────
   STATE
───────────────────────────────────────────── */
let currentQuery    = '';      // current search term
let currentPage     = 1;       // current OMDb page (1-based)
let totalResults    = 0;       // total results from OMDb
let currentImdbId   = null;    // imdbID of the open modal
let currentModalMovie = null;  // full movie object for the open modal (used by fav button)
let viewMode        = 'search';// 'search' | 'favorites'
let debounceTimer   = null;    // debounce handle
let suggestTimer    = null;    // suggestion debounce handle
let favorites       = loadFavorites();

/* ─────────────────────────────────────────────
   UTILITY HELPERS
───────────────────────────────────────────── */

/**
 * Debounce – returns a function that fires `fn` after `delay` ms of inactivity.
 * @param {Function} fn
 * @param {number}   delay
 */
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Show a brief toast notification at the bottom of the screen.
 * @param {string} message
 */
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

/** Sanitise a string for safe insertion as text content (not innerHTML). */
function safe(str) {
  return str ?? 'N/A';
}

/**
 * Escape HTML special characters to prevent XSS when inserting
 * user-controlled data into innerHTML / HTML attributes.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Clamp a number between min and max. */
function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

/* ─────────────────────────────────────────────
   THEME
───────────────────────────────────────────── */

/** Apply stored or system-preferred theme on load. */
function initTheme() {
  const stored = localStorage.getItem(STORAGE_KEY_THEME);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = stored ?? (prefersDark ? 'dark' : 'light');
  setTheme(theme);
}

/**
 * Set the active theme and update the toggle icon.
 * @param {'dark'|'light'} theme
 */
function setTheme(theme) {
  html.setAttribute('data-theme', theme);
  themeIcon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
  localStorage.setItem(STORAGE_KEY_THEME, theme);
}

themeToggle.addEventListener('click', () => {
  const isDark = html.getAttribute('data-theme') === 'dark';
  setTheme(isDark ? 'light' : 'dark');
});

/* ─────────────────────────────────────────────
   FAVORITES (localStorage)
───────────────────────────────────────────── */

/** Load favorites from localStorage, returning an array of movie objects. */
function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_FAVS)) ?? [];
  } catch {
    return [];
  }
}

/** Persist the favorites array to localStorage. */
function saveFavorites() {
  localStorage.setItem(STORAGE_KEY_FAVS, JSON.stringify(favorites));
}

/**
 * Check whether a movie (by imdbID) is in favorites.
 * @param {string} imdbID
 */
function isFavorite(imdbID) {
  return favorites.some(f => f.imdbID === imdbID);
}

/**
 * Toggle a movie in/out of favorites.
 * @param {object} movie – minimal movie object { imdbID, Title, Year, Poster, Type }
 */
function toggleFavorite(movie) {
  if (isFavorite(movie.imdbID)) {
    favorites = favorites.filter(f => f.imdbID !== movie.imdbID);
    showToast(`"${movie.Title}" removed from favorites`);
  } else {
    favorites.push(movie);
    showToast(`"${movie.Title}" added to favorites`);
  }
  saveFavorites();
  updateFavCount();
  syncFavButtons(movie.imdbID);

  // If we're in favorites view, refresh the grid
  if (viewMode === 'favorites') {
    renderFavorites();
  }
}

/** Update the badge count on the Favorites nav button. */
function updateFavCount() {
  const count = favorites.length;
  favCount.textContent = count;
  favCount.hidden = count === 0;
}

/**
 * Sync all visible favorite buttons (card overlay + modal) for a given imdbID.
 * @param {string} imdbID
 */
function syncFavButtons(imdbID) {
  const isFav = isFavorite(imdbID);

  // Card overlay buttons
  document.querySelectorAll(`.card-fav-btn[data-id="${imdbID}"]`).forEach(btn => {
    btn.classList.toggle('is-fav', isFav);
    btn.querySelector('span').textContent = isFav ? 'Saved' : 'Favorite';
  });

  // Modal fav button
  if (currentImdbId === imdbID) {
    modalFavBtn.classList.toggle('is-fav', isFav);
    modalFavLabel.textContent = isFav ? 'Remove Favorite' : 'Add to Favorites';
  }
}

/* ─────────────────────────────────────────────
   API
───────────────────────────────────────────── */

/**
 * Build an OMDb API URL.
 * @param {object} params – query parameters
 */
function buildUrl(params) {
  const url = new URL(API_BASE);
  url.searchParams.set('apikey', API_KEY);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

/**
 * Search movies by title, returning paginated results.
 * @param {string} query
 * @param {number} page
 */
async function searchMovies(query, page = 1) {
  const url = buildUrl({ s: query, type: 'movie', page });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.Response === 'False') throw new Error(data.Error ?? 'Unknown error');
  return data; // { Search: [...], totalResults, Response }
}

/**
 * Fetch full movie details by imdbID.
 * @param {string} imdbID
 */
async function getMovieDetails(imdbID) {
  const url = buildUrl({ i: imdbID, plot: 'full' });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.Response === 'False') throw new Error(data.Error ?? 'Unknown error');
  return data;
}

/**
 * Fetch suggestions (search results without full details).
 * @param {string} query
 */
async function fetchSuggestions(query) {
  const url = buildUrl({ s: query, page: 1 });
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  if (data.Response === 'False') return [];
  return (data.Search ?? []).slice(0, SUGGESTION_LIMIT);
}

/* ─────────────────────────────────────────────
   UI STATE HELPERS
───────────────────────────────────────────── */

/** Hide all content areas. */
function hideAll() {
  statusBar.hidden   = true;
  loadingGrid.hidden = true;
  sectionHeader.hidden = true;
  pagination.hidden  = true;
  emptyState.hidden  = true;
  moviesGrid.innerHTML = '';
}

/** Show the skeleton loading grid. */
function showLoading() {
  hideAll();
  loadingGrid.hidden = false;
}

/**
 * Show an error message in the status bar.
 * @param {string} message
 */
function showError(message) {
  hideAll();
  statusMsg.textContent = message;
  statusBar.hidden = false;
  emptyState.hidden = false;
}

/** Show the welcome / empty state. */
function showEmpty() {
  hideAll();
  emptyState.hidden = false;
}

/* ─────────────────────────────────────────────
   CARD RENDERING
───────────────────────────────────────────── */

/**
 * Build the poster URL or a placeholder element.
 * @param {object} movie
 */
function buildPosterHTML(movie) {
  const hasImage = movie.Poster && movie.Poster !== 'N/A';
  if (hasImage) {
    return `<img
      class="card-poster"
      src="${escapeHtml(movie.Poster)}"
      alt="${escapeHtml(movie.Title)} poster"
      loading="lazy"
    />`;
  }
  return placeholderHTML(movie.Title);
}

function placeholderHTML(title) {
  return `<div class="card-poster-placeholder">
    <i class="fa-solid fa-film"></i>
    <span>${escapeHtml(title)}</span>
  </div>`;
}

/**
 * Create and return a movie card element.
 * @param {object} movie – OMDb search result item
 */
function createMovieCard(movie) {
  const { imdbID, Title, Year, Poster, Type } = movie;
  const fav = isFavorite(imdbID);

  const article = document.createElement('article');
  article.className = 'movie-card';
  article.setAttribute('role', 'listitem');
  article.setAttribute('tabindex', '0');
  article.setAttribute('aria-label', `${Title} (${Year})`);
  article.dataset.id = imdbID;

  article.innerHTML = `
    <div class="card-poster-wrapper">
      ${buildPosterHTML(movie)}
      <div class="card-overlay">
        <button
          class="card-fav-btn ${fav ? 'is-fav' : ''}"
          data-id="${escapeHtml(imdbID)}"
          data-title="${escapeHtml(Title)}"
          data-year="${escapeHtml(Year)}"
          data-poster="${escapeHtml((Poster && Poster !== 'N/A') ? Poster : '')}"
          data-type="${escapeHtml(Type)}"
          aria-label="${fav ? 'Remove from favorites' : 'Add to favorites'}"
        >
          <i class="fa-solid fa-heart"></i>
          <span>${fav ? 'Saved' : 'Favorite'}</span>
        </button>
      </div>
    </div>
    <div class="card-body">
      <div class="card-type">${escapeHtml(Type ?? 'movie')}</div>
      <div class="card-title">${escapeHtml(Title)}</div>
      <div class="card-year"><i class="fa-regular fa-calendar"></i> ${escapeHtml(Year)}</div>
    </div>
  `;

  // Open detail modal on click (but not when clicking the fav button)
  article.addEventListener('click', e => {
    if (e.target.closest('.card-fav-btn')) return;
    openModal(imdbID);
  });

  // Replace broken poster images with placeholder
  const cardImg = article.querySelector('.card-poster');
  if (cardImg) {
    cardImg.addEventListener('error', () => {
      const wrapper = cardImg.closest('.card-poster-wrapper');
      if (wrapper) wrapper.innerHTML = placeholderHTML(Title);
    });
  }

  article.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openModal(imdbID);
    }
  });

  // Favorite button click handler
  const favBtn = article.querySelector('.card-fav-btn');
  favBtn.addEventListener('click', e => {
    e.stopPropagation();
    toggleFavorite({ imdbID, Title, Year, Poster, Type });
  });

  return article;
}

/**
 * Render a list of movie objects into the grid.
 * @param {object[]} movies
 */
function renderMovies(movies) {
  moviesGrid.innerHTML = '';
  movies.forEach(m => moviesGrid.appendChild(createMovieCard(m)));
}

/* ─────────────────────────────────────────────
   SEARCH
───────────────────────────────────────────── */

/**
 * Execute a search and render results.
 * @param {string}  query
 * @param {number}  page
 * @param {boolean} resetPage – whether to reset to page 1
 */
async function performSearch(query, page = 1, resetPage = true) {
  const q = query.trim();
  if (!q) { showEmpty(); return; }

  if (resetPage) {
    currentPage = 1;
    page = 1;
  }

  currentQuery = q;
  viewMode = 'search';
  btnHome.classList.add('active');
  btnFavorites.classList.remove('active');

  showLoading();
  closeSuggestions();

  try {
    const data = await searchMovies(q, page);
    totalResults = parseInt(data.totalResults, 10) || 0;
    const movies  = data.Search ?? [];
    const totalPages = Math.ceil(totalResults / 10);

    // Render section header
    sectionTitle.textContent = `Results for "${q}"`;
    resultCount.textContent  = `${totalResults.toLocaleString()} titles found`;
    sectionHeader.hidden = false;

    loadingGrid.hidden = true;
    renderMovies(movies);

    // Pagination
    currentPage = page;
    renderPagination(page, totalPages);
  } catch (err) {
    showError(err.message === 'Movie not found!'
      ? `No results found for "${q}". Try a different title.`
      : `Could not load results: ${err.message}`
    );
  }
}

/* ─────────────────────────────────────────────
   PAGINATION
───────────────────────────────────────────── */

/**
 * Render the pagination bar.
 * @param {number} page      – current page (1-based)
 * @param {number} totalPages
 */
function renderPagination(page, totalPages) {
  if (totalPages <= 1) {
    pagination.hidden = true;
    return;
  }
  pagination.hidden = false;
  btnPrev.disabled  = page <= 1;
  btnNext.disabled  = page >= totalPages;
  pageInfo.textContent = `Page ${page} of ${totalPages}`;
}

btnPrev.addEventListener('click', () => {
  if (currentPage > 1) {
    performSearch(currentQuery, currentPage - 1, false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

btnNext.addEventListener('click', () => {
  const totalPages = Math.ceil(totalResults / 10);
  if (currentPage < totalPages) {
    performSearch(currentQuery, currentPage + 1, false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

/* ─────────────────────────────────────────────
   SUGGESTIONS DROPDOWN
───────────────────────────────────────────── */

const debouncedSuggest = debounce(async (query) => {
  if (query.length < 2) { closeSuggestions(); return; }
  const results = await fetchSuggestions(query);
  renderSuggestions(results, query);
}, DEBOUNCE_DELAY);

/**
 * Render suggestions into the dropdown list.
 * @param {object[]} results
 * @param {string}   query   – used to highlight matching text
 */
function renderSuggestions(results, query) {
  if (!results.length) { closeSuggestions(); return; }

  suggestionsList.innerHTML = '';
  results.forEach(movie => {
    const li = document.createElement('li');
    li.className = 'suggestion-item';
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');

    const posterSrc = movie.Poster && movie.Poster !== 'N/A' ? escapeHtml(movie.Poster) : '';
    li.innerHTML = `
      <img src="${posterSrc}" alt="${escapeHtml(movie.Title)}" />
      <div>
        <div class="sug-title">${highlightMatch(movie.Title, query)}</div>
        <div class="sug-year">${escapeHtml(movie.Year)} · ${escapeHtml(movie.Type)}</div>
      </div>
    `;

    li.addEventListener('mousedown', e => {
      e.preventDefault(); // keep focus on input
      searchInput.value = movie.Title;
      closeSuggestions();
      performSearch(movie.Title);
    });

    // Hide broken poster images gracefully
    const img = li.querySelector('img');
    if (img) img.addEventListener('error', () => { img.style.display = 'none'; });

    suggestionsList.appendChild(li);
  });

  suggestionsList.hidden = false;
}

/**
 * Wrap matching portion of text in a <strong> tag.
 * Text is HTML-escaped before insertion to prevent XSS.
 * @param {string} text
 * @param {string} query
 */
function highlightMatch(text, query) {
  const escaped = escapeHtml(text);
  const escapedQuery = escapeHtml(query);
  const idx = escaped.toLowerCase().indexOf(escapedQuery.toLowerCase());
  if (idx === -1) return escaped;
  return (
    escaped.slice(0, idx) +
    `<strong>${escaped.slice(idx, idx + escapedQuery.length)}</strong>` +
    escaped.slice(idx + escapedQuery.length)
  );
}

/** Hide and empty the suggestions dropdown. */
function closeSuggestions() {
  suggestionsList.hidden = true;
  suggestionsList.innerHTML = '';
}

/* ─────────────────────────────────────────────
   MODAL
───────────────────────────────────────────── */

/**
 * Open the detail modal and fetch full info for the given imdbID.
 * @param {string} imdbID
 */
async function openModal(imdbID) {
  currentImdbId = imdbID;
  modalOverlay.hidden = false;
  document.body.style.overflow = 'hidden';

  // Show spinner, hide content
  modalLoading.hidden = false;
  modalBody.hidden    = true;

  try {
    const movie = await getMovieDetails(imdbID);
    currentModalMovie = movie;
    renderModal(movie);
  } catch (err) {
    closeModal();
    showToast(`Failed to load movie details: ${err.message}`);
  }
}

/** Close the detail modal. */
function closeModal() {
  modalOverlay.hidden = true;
  document.body.style.overflow = '';
  currentImdbId = null;
  currentModalMovie = null;
}

/**
 * Populate the modal with full movie details.
 * @param {object} movie – full OMDb movie object
 */
function renderModal(movie) {
  const isFav = isFavorite(movie.imdbID);

  // Poster
  if (movie.Poster && movie.Poster !== 'N/A') {
    modalPoster.src = movie.Poster;
    modalPoster.alt = `${movie.Title} poster`;
    modalPoster.style.display = 'block';
  } else {
    modalPoster.style.display = 'none';
  }

  // Badges
  modalBadges.innerHTML = `
    <span class="badge badge-type">${escapeHtml(movie.Type ?? 'movie')}</span>
    ${movie.Rated && movie.Rated !== 'N/A'
      ? `<span class="badge badge-rated">${escapeHtml(movie.Rated)}</span>`
      : ''}
  `;

  // Title & meta
  modalTitle.textContent = movie.Title;
  modalMeta.innerHTML = [
    movie.Year        !== 'N/A' ? `<span><i class="fa-regular fa-calendar"></i> ${escapeHtml(movie.Year)}</span>`     : '',
    movie.Runtime     !== 'N/A' ? `<span><i class="fa-regular fa-clock"></i> ${escapeHtml(movie.Runtime)}</span>`     : '',
    movie.Genre       !== 'N/A' ? `<span><i class="fa-solid fa-tag"></i> ${escapeHtml(movie.Genre)}</span>`           : '',
    movie.Country     !== 'N/A' ? `<span><i class="fa-solid fa-earth-americas"></i> ${escapeHtml(movie.Country)}</span>` : '',
  ].filter(Boolean).join('');

  // Plot
  modalPlot.textContent = movie.Plot !== 'N/A' ? movie.Plot : 'No plot available.';

  // Ratings
  const ratingConfig = {
    'Internet Movie Database': { icon: 'fa-solid fa-star',  cls: 'rating-imdb',  label: 'IMDb' },
    'Rotten Tomatoes':         { icon: 'fa-solid fa-lemon', cls: 'rating-rt',    label: 'Rotten Tomatoes' },
    'Metacritic':              { icon: 'fa-solid fa-m',     cls: 'rating-meta',  label: 'Metacritic' },
  };

  const ratingsHTML = (movie.Ratings ?? []).map(r => {
    const cfg = ratingConfig[r.Source] ?? { icon: 'fa-solid fa-star', cls: '', label: escapeHtml(r.Source) };
    return `<div class="rating-pill ${cfg.cls}">
      <i class="${cfg.icon}"></i>
      <span>${cfg.label}: ${escapeHtml(r.Value)}</span>
    </div>`;
  }).join('');
  modalRatings.innerHTML = ratingsHTML;

  // Detail rows
  const detailFields = [
    { label: 'Director',  value: movie.Director },
    { label: 'Writer',    value: movie.Writer   },
    { label: 'Actors',    value: movie.Actors   },
    { label: 'Language',  value: movie.Language },
    { label: 'Released',  value: movie.Released },
    { label: 'Box Office',value: movie.BoxOffice },
    { label: 'Awards',    value: movie.Awards   },
    { label: 'IMDb ID',   value: movie.imdbID   },
  ];
  modalDetails.innerHTML = detailFields
    .filter(d => d.value && d.value !== 'N/A')
    .map(d => `
      <div class="detail-row">
        <span class="detail-label">${escapeHtml(d.label)}</span>
        <span class="detail-value">${escapeHtml(d.value)}</span>
      </div>
    `).join('');

  // Fav button state
  modalFavBtn.classList.toggle('is-fav', isFav);
  modalFavLabel.textContent = isFav ? 'Remove Favorite' : 'Add to Favorites';

  // Show modal content
  modalLoading.hidden = true;
  modalBody.hidden    = false;
}

/* Modal event listeners */
modalClose.addEventListener('click', closeModal);

modalOverlay.addEventListener('click', e => {
  // Close when clicking the backdrop (not the modal content)
  if (e.target === modalOverlay) closeModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !modalOverlay.hidden) closeModal();
});

modalFavBtn.addEventListener('click', () => {
  if (!currentImdbId || !currentModalMovie) return;
  const { imdbID, Title, Year, Poster, Type } = currentModalMovie;
  toggleFavorite({ imdbID, Title, Year, Poster, Type });
});

/* ─────────────────────────────────────────────
   FAVORITES VIEW
───────────────────────────────────────────── */

/** Render the favorites grid. */
function renderFavorites() {
  hideAll();
  viewMode = 'favorites';

  if (!favorites.length) {
    sectionTitle.textContent = 'Your Favorites';
    resultCount.textContent  = '0 saved';
    sectionHeader.hidden = false;
    emptyState.hidden = false;
    emptyState.querySelector('h2').textContent = 'No Favorites Yet';
    emptyState.querySelector('p').textContent  =
      'Heart a movie or show to save it here.';
    return;
  }

  // Reset empty-state text (may have been changed)
  emptyState.querySelector('h2').textContent = 'Start Your Search';
  emptyState.querySelector('p').textContent  =
    'Type a movie or show title above to explore the world of cinema.';

  sectionTitle.textContent = 'Your Favorites';
  resultCount.textContent  = `${favorites.length} saved`;
  sectionHeader.hidden = false;

  renderMovies(favorites);
}

/* ─────────────────────────────────────────────
   SEARCH INPUT HANDLING
───────────────────────────────────────────── */

const debouncedSearch = debounce((query) => {
  if (query.trim()) performSearch(query);
  else showEmpty();
}, DEBOUNCE_DELAY);

searchInput.addEventListener('input', () => {
  const val = searchInput.value;
  clearBtn.hidden = val.length === 0;

  // Trigger debounced search
  debouncedSearch(val);

  // Trigger suggestions
  debouncedSuggest(val);
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    clearTimeout(debounceTimer);
    closeSuggestions();
    performSearch(searchInput.value);
  }
  if (e.key === 'Escape') closeSuggestions();
});

searchInput.addEventListener('blur', () => {
  // Delay so mousedown on suggestion fires first
  setTimeout(closeSuggestions, 150);
});

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearBtn.hidden = true;
  closeSuggestions();
  showEmpty();
  searchInput.focus();
});

/* ─────────────────────────────────────────────
   NAVIGATION BUTTONS
───────────────────────────────────────────── */

btnHome.addEventListener('click', () => {
  btnHome.classList.add('active');
  btnFavorites.classList.remove('active');

  if (currentQuery) {
    viewMode = 'search';
    performSearch(currentQuery, currentPage, false);
  } else {
    showEmpty();
  }
});

btnFavorites.addEventListener('click', () => {
  btnFavorites.classList.add('active');
  btnHome.classList.remove('active');
  renderFavorites();
});

logoLink.addEventListener('click', e => {
  e.preventDefault();
  searchInput.value = '';
  clearBtn.hidden = true;
  currentQuery = '';
  currentPage  = 1;
  btnHome.classList.add('active');
  btnFavorites.classList.remove('active');
  showEmpty();
  searchInput.focus();
});

/* ─────────────────────────────────────────────
   INIT
───────────────────────────────────────────── */

/** Bootstrap the app. */
function init() {
  initTheme();
  updateFavCount();

  // Warn if using the placeholder API key
  if (API_KEY === 'trilogy' || API_KEY === '' || API_KEY === 'YOUR_KEY') {
    statusMsg.textContent =
      'No OMDb API key set. Replace the API_KEY in script.js with your free key from omdbapi.com.';
    statusBar.hidden = false;
  }

  showEmpty();
  searchInput.focus();
}

init();
