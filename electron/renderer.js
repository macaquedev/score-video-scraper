let frames = [];
let selectedIndices = new Set();
let lastClicked = null;

// Load frames on startup
document.addEventListener('DOMContentLoaded', async () => {
  await loadFrames();
  setupEventListeners();
  setupProgressListener();
});

function setupProgressListener() {
  window.electronAPI.onPdfProgress((message) => {
    const messageEl = document.getElementById('loading-message');
    const detailEl = document.getElementById('loading-detail');

    if (messageEl && detailEl) {
      // Update the detail text with the latest progress
      detailEl.textContent = message;
    }
  });
}

async function loadFrames() {
  try {
    frames = await window.electronAPI.loadFrames();
    renderFrames();
    updateInfoLabel();
  } catch (err) {
    console.error('Failed to load frames:', err);
  }
}

function renderFrames() {
  const container = document.getElementById('frames-container');
  container.innerHTML = '';

  frames.forEach((frame, index) => {
    const card = document.createElement('div');
    card.className = 'frame-card bg-slate-800 rounded-xl p-6 border-2 border-slate-700 cursor-pointer';
    card.dataset.index = index;

    card.innerHTML = `
      <div class="flex items-start gap-6">
        <div class="flex-shrink-0">
          <img src="file://${frame.path}" alt="Frame ${index}" class="thumbnail rounded-lg">
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="text-xl font-bold text-white mb-2">Frame ${index}</h3>
          <p class="text-slate-400 text-sm truncate">${frame.name}</p>
          <div class="mt-4 flex items-center gap-2">
            <span class="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-xs font-medium">
              Index: ${index}
            </span>
          </div>
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => handleFrameClick(index, e));
    container.appendChild(card);
  });

  updateSelection();
}

function handleFrameClick(index, event) {
  if (event.shiftKey && lastClicked !== null) {
    // Range selection
    const start = Math.min(lastClicked, index);
    const end = Math.max(lastClicked, index);
    selectedIndices.clear();
    for (let i = start; i <= end; i++) {
      selectedIndices.add(i);
    }
  } else if (event.ctrlKey || event.metaKey) {
    // Toggle selection
    if (selectedIndices.has(index)) {
      selectedIndices.delete(index);
    } else {
      selectedIndices.add(index);
    }
  } else {
    // Single selection
    selectedIndices.clear();
    selectedIndices.add(index);
  }

  lastClicked = index;
  updateSelection();
  updateInfoLabel();
}

function updateSelection() {
  const cards = document.querySelectorAll('.frame-card');
  cards.forEach((card, index) => {
    if (selectedIndices.has(index)) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });
}

function updateInfoLabel() {
  const label = document.getElementById('info-label');
  if (selectedIndices.size > 0) {
    label.textContent = `Total: ${frames.length} | Selected: ${selectedIndices.size}`;
  } else {
    label.textContent = `Total frames: ${frames.length}`;
  }
}

function setupEventListeners() {
  // Move Up
  document.getElementById('move-up-btn').addEventListener('click', () => {
    if (selectedIndices.size !== 1) return;

    const index = Array.from(selectedIndices)[0];
    if (index === 0) return;

    [frames[index], frames[index - 1]] = [frames[index - 1], frames[index]];
    selectedIndices.clear();
    selectedIndices.add(index - 1);
    lastClicked = index - 1;
    renderFrames();
  });

  // Move Down
  document.getElementById('move-down-btn').addEventListener('click', () => {
    if (selectedIndices.size !== 1) return;

    const index = Array.from(selectedIndices)[0];
    if (index >= frames.length - 1) return;

    [frames[index], frames[index + 1]] = [frames[index + 1], frames[index]];
    selectedIndices.clear();
    selectedIndices.add(index + 1);
    lastClicked = index + 1;
    renderFrames();
  });

  // Delete
  document.getElementById('delete-btn').addEventListener('click', async () => {
    if (selectedIndices.size === 0) return;

    const indicesToDelete = Array.from(selectedIndices).sort((a, b) => b - a);
    const framesToDelete = indicesToDelete.map(i => frames[i].name);

    try {
      showLoading(true);
      await window.electronAPI.deleteFrames(framesToDelete);

      indicesToDelete.forEach(index => {
        frames.splice(index, 1);
      });

      selectedIndices.clear();
      lastClicked = null;
      renderFrames();
    } catch (err) {
      alert(`Failed to delete frames: ${err.message}`);
    } finally {
      showLoading(false);
    }
  });

  // Save & Create PDF
  document.getElementById('save-btn').addEventListener('click', async () => {
    try {
      showLoading(true, 'Saving frames and generating PDF...', null);

      const result = await window.electronAPI.saveFrames(frames);

      showLoading(false);
      alert(result.message);
      window.close();
    } catch (err) {
      showLoading(false);
      alert(`Failed to save: ${err.message}`);
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateUp(e.shiftKey);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateDown(e.shiftKey);
    } else if (e.key === 'Delete') {
      document.getElementById('delete-btn').click();
    }
  });
}

function navigateUp(shiftKey) {
  if (frames.length === 0) return;

  let target;
  if (selectedIndices.size === 0) {
    target = frames.length - 1;
  } else {
    target = Math.min(...selectedIndices) - 1;
    if (target < 0) return;
  }

  if (shiftKey && lastClicked !== null) {
    const start = Math.min(lastClicked, target);
    const end = Math.max(lastClicked, target);
    selectedIndices.clear();
    for (let i = start; i <= end; i++) {
      selectedIndices.add(i);
    }
  } else {
    selectedIndices.clear();
    selectedIndices.add(target);
    lastClicked = target;
  }

  updateSelection();
  updateInfoLabel();
  scrollToFrame(target);
}

function navigateDown(shiftKey) {
  if (frames.length === 0) return;

  let target;
  if (selectedIndices.size === 0) {
    target = 0;
  } else {
    target = Math.max(...selectedIndices) + 1;
    if (target >= frames.length) return;
  }

  if (shiftKey && lastClicked !== null) {
    const start = Math.min(lastClicked, target);
    const end = Math.max(lastClicked, target);
    selectedIndices.clear();
    for (let i = start; i <= end; i++) {
      selectedIndices.add(i);
    }
  } else {
    selectedIndices.clear();
    selectedIndices.add(target);
    lastClicked = target;
  }

  updateSelection();
  updateInfoLabel();
  scrollToFrame(target);
}

function scrollToFrame(index) {
  const cards = document.querySelectorAll('.frame-card');
  if (cards[index]) {
    cards[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function showLoading(show, message = 'Processing...', progress = null) {
  const loading = document.getElementById('loading');
  const messageEl = document.getElementById('loading-message');
  const progressBar = document.getElementById('progress-bar');
  const detailEl = document.getElementById('loading-detail');

  loading.classList.toggle('hidden', !show);

  if (show) {
    messageEl.textContent = message;
    if (progress !== null) {
      progressBar.style.width = `${progress}%`;
      detailEl.textContent = `${progress}%`;
    } else {
      // Indeterminate progress - show full bar with animation
      progressBar.style.width = '100%';
      detailEl.textContent = 'This may take a minute...';
    }
  }
}
