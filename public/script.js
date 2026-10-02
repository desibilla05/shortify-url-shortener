// ==========================================================================
//  SHORTIFY – script.js
//  Handles: URL validation, API call, UI update,
//           link statistics modal, smooth scroll reveals, & interactions
// ==========================================================================

// Tracks the short code of the most recently shortened URL
// so the Stats button knows which URL to fetch stats for
let _currentShortCode = null;

// --- Shorten URL ---
async function shortenURL() {
  const input      = document.getElementById('urlInput');
  const errorMsg   = document.getElementById('errorMsg');
  const resultBox  = document.getElementById('resultBox');
  const btnText    = document.getElementById('btnText');
  const btnSpinner = document.getElementById('btnSpinner');
  const copyMsg    = document.getElementById('copyMsg');

  const originalURL = input.value.trim();

  // Hide previous results / errors
  errorMsg.classList.add('hidden');
  resultBox.classList.add('hidden');
  if (copyMsg) copyMsg.classList.add('hidden');

  // --- Basic Validation ---
  if (!originalURL) {
    showError('Please enter a URL before shortening.');
    return;
  }

  // Check if URL looks valid (must start with http:// or https://)
  try {
    new URL(originalURL);
  } catch {
    showError('Invalid URL. Make sure it starts with http:// or https://');
    return;
  }

  // Show loading spinner
  btnText.classList.add('hidden');
  btnSpinner.classList.remove('hidden');

  try {
    // --- Call the backend API ---
    const response = await fetch('/shorten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalURL })
    });

    const data = await response.json();

    if (!response.ok) {
      showError(data.error || 'Something went wrong. Please try again.');
      return;
    }

    // --- Show the result ---
    const shortLink = document.getElementById('shortLink');
    shortLink.href = data.shortURL;
    shortLink.textContent = data.shortURL;

    // Extract and save the short code (last segment of the URL)
    _currentShortCode = data.shortURL.split('/').pop();

    resultBox.classList.remove('hidden');
    input.value = ''; // Clear the input

  } catch (err) {
    showError('Cannot connect to server. Is it running?');
  } finally {
    // Hide spinner, restore button text
    btnText.classList.remove('hidden');
    btnSpinner.classList.add('hidden');
  }
}

// --- Copy to Clipboard ---
async function copyURL() {
  const shortLink = document.getElementById('shortLink').textContent;
  const copyMsg   = document.getElementById('copyMsg');
  const copyBtn   = document.getElementById('copyBtn');

  try {
    await navigator.clipboard.writeText(shortLink);

    copyBtn.innerHTML = '✓ Copied!';
    if (copyMsg) copyMsg.classList.remove('hidden');

    // Reset after 2 seconds
    setTimeout(() => {
      copyBtn.innerHTML = '<span class="action-icon">📋</span> Copy';
      if (copyMsg) copyMsg.classList.add('hidden');
    }, 2000);

  } catch {
    alert('Could not copy. Please copy the link manually.');
  }
}

// --- Helper: Show Error Message ---
function showError(message) {
  const errorMsg = document.getElementById('errorMsg');
  errorMsg.textContent = message;
  errorMsg.classList.remove('hidden');
}

// --- Helper: Format ISO timestamp to readable local time ---
// Example: "2024-01-15T17:10:00.000Z" → "5:10 PM"
function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// --- Show Statistics Modal ---
async function showStats() {
  if (!_currentShortCode) return;

  const overlay      = document.getElementById('statsOverlay');
  const loading      = document.getElementById('statsLoading');
  const errorEl      = document.getElementById('statsError');
  const tableWrapper = document.getElementById('statsTableWrapper');
  const noClicks     = document.getElementById('statsNoClicks');
  const totalEl      = document.getElementById('statsTotalClicks');
  const tbody        = document.getElementById('statsTableBody');
  const linkEl       = document.getElementById('statsShortLink');

  // Reset state and open modal with smooth opacity
  overlay.style.opacity = '0';
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
  });

  loading.classList.remove('hidden');
  errorEl.classList.add('hidden');
  tableWrapper.classList.add('hidden');
  noClicks.classList.add('hidden');
  totalEl.textContent = '—';
  tbody.innerHTML = '';

  // Set the short URL in the modal header
  const shortURL = `${window.location.origin}/${_currentShortCode}`;
  linkEl.href        = shortURL;
  linkEl.textContent = shortURL;

  try {
    const response = await fetch(`/stats/${_currentShortCode}`);
    const data     = await response.json();

    if (!response.ok) {
      loading.classList.add('hidden');
      errorEl.textContent = data.error || 'Could not load statistics.';
      errorEl.classList.remove('hidden');
      return;
    }

    // Update total clicks count
    totalEl.textContent = data.totalClicks;
    loading.classList.add('hidden');

    if (data.clicks.length === 0) {
      noClicks.classList.remove('hidden');
    } else {
      // Build the clicks table rows
      data.clicks.forEach(click => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${formatTime(click.time)}</td>
          <td>${click.device}</td>
          <td>${click.referrer}</td>
        `;
        tbody.appendChild(tr);
      });
      tableWrapper.classList.remove('hidden');
    }

  } catch (err) {
    loading.classList.add('hidden');
    errorEl.textContent = 'Cannot connect to server.';
    errorEl.classList.remove('hidden');
  }
}

// --- Close Statistics Modal with Smooth Transition ---
function closeStats() {
  const overlay = document.getElementById('statsOverlay');
  if (!overlay) return;
  overlay.style.opacity = '0';
  setTimeout(() => {
    overlay.classList.add('hidden');
    overlay.style.opacity = '';
  }, 200);
}

// --- Close modal when clicking outside it (on the dark overlay) ---
function closeStatsOnOverlay(event) {
  if (event.target === document.getElementById('statsOverlay')) {
    closeStats();
  }
}

// --- Smoothly scroll and focus shortener input ---
function focusShortener(event) {
  if (event) event.preventDefault();
  const input = document.getElementById('urlInput');
  if (input) {
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => input.focus(), 400);
  }
}

// --- Handle Navbar Statistics Click ---
function handleNavStats(event) {
  if (event) event.preventDefault();
  if (_currentShortCode) {
    showStats();
  } else {
    focusShortener();
    showError('Shorten a URL first to view its statistics!');
  }
}

// --- Scroll Reveal Animations (IntersectionObserver) ---
function initScrollReveal() {
  const revealElements = document.querySelectorAll('.reveal');
  
  if (!('IntersectionObserver' in window)) {
    revealElements.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting || entry.intersectionRatio > 0) {
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.05,
    rootMargin: '0px 0px 150px 0px'
  });

  revealElements.forEach(el => {
    // If element is already in or near viewport, mark visible immediately
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight + 150) {
      el.classList.add('is-visible');
    } else {
      observer.observe(el);
    }
  });
}

// --- Initialize Event Listeners on DOM Load ---
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('urlInput');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') shortenURL();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeStats();
  });

  initScrollReveal();
});
