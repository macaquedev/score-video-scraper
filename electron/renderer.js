let frames = [];
let selectedIndices = new Set();
let lastClicked = null;
let cropValues = { top: 0, bottom: 0, left: 0, right: 0 };

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

    const pageBreakBadge = frame.pageBreak ?
      '<span class="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-xs font-medium">📄 Page Break After</span>' : '';

    const cropStyle = getCropStyle();

    card.innerHTML = `
      <div class="flex items-start gap-6">
        <div class="flex-shrink-0 thumbnail-container">
          <img src="file://${frame.path}" alt="Frame ${index}" class="thumbnail rounded-lg" style="${cropStyle}">
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="text-xl font-bold text-white mb-2">Frame ${index}</h3>
          <p class="text-slate-400 text-sm truncate">${frame.name}</p>
          <div class="mt-4 flex items-center gap-2">
            <span class="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-xs font-medium">
              Index: ${index}
            </span>
            ${pageBreakBadge}
          </div>
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => handleFrameClick(index, e));
    container.appendChild(card);

    // Add page break divider if this frame has one
    if (frame.pageBreak) {
      const divider = document.createElement('div');
      divider.className = 'flex items-center gap-4 my-2';
      divider.innerHTML = `
        <div class="flex-1 h-px bg-gradient-to-r from-transparent via-purple-500 to-transparent"></div>
        <span class="text-purple-400 text-sm font-medium">📄 PAGE BREAK</span>
        <div class="flex-1 h-px bg-gradient-to-r from-purple-500 via-purple-500 to-transparent"></div>
      `;
      container.appendChild(divider);
    }
  });

  updateSelection();
}

function getCropStyle() {
  const { top, bottom, left, right } = cropValues;
  if (top === 0 && bottom === 0 && left === 0 && right === 0) {
    return '';
  }

  return `clip-path: inset(${top}px ${right}px ${bottom}px ${left}px);`;
}

function applyCropPreview() {
  const thumbnails = document.querySelectorAll('.thumbnail');
  const cropStyle = getCropStyle();
  thumbnails.forEach(img => {
    img.style.clipPath = cropStyle ? `inset(${cropValues.top}px ${cropValues.right}px ${cropValues.bottom}px ${cropValues.left}px)` : '';
  });
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

  // Toggle Page Break
  document.getElementById('page-break-btn').addEventListener('click', () => {
    if (selectedIndices.size === 0) return;

    // Toggle page break for all selected frames
    selectedIndices.forEach(index => {
      frames[index].pageBreak = !frames[index].pageBreak;
    });

    renderFrames();
  });

  // Save & Create PDF
  document.getElementById('save-btn').addEventListener('click', async () => {
    try {
      showLoading(true, 'Saving frames and generating PDF...', null);

      const result = await window.electronAPI.saveFrames(frames, cropValues);

      showLoading(false);
      alert(result.message);
      window.close();
    } catch (err) {
      showLoading(false);
      alert(`Failed to save: ${err.message}`);
    }
  });

  // Preview PDF
  document.getElementById('preview-pdf-btn').addEventListener('click', async () => {
    try {
      console.log('Generating preview with crop values:', cropValues);
      showLoading(true, 'Generating PDF preview...', null);

      const result = await window.electronAPI.previewPdf(frames, cropValues);

      showLoading(false);
      if (result.success) {
        alert('Preview PDF opened in your default viewer');
      }
    } catch (err) {
      showLoading(false);
      alert(`Failed to generate preview: ${err.message}`);
    }
  });

  // Toggle Crop Panel
  document.getElementById('toggle-crop-btn').addEventListener('click', () => {
    const panel = document.getElementById('crop-panel');
    panel.classList.toggle('hidden');
  });

  // Crop Sliders
  const cropInputs = ['top', 'bottom', 'left', 'right'];
  cropInputs.forEach(side => {
    const slider = document.getElementById(`crop-${side}`);
    const valueDisplay = document.getElementById(`crop-${side}-value`);

    slider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      cropValues[side] = value;
      valueDisplay.textContent = value;
      applyCropPreview();
    });
  });

  // Reset Crop
  document.getElementById('reset-crop-btn').addEventListener('click', () => {
    cropValues = { top: 0, bottom: 0, left: 0, right: 0 };
    cropInputs.forEach(side => {
      document.getElementById(`crop-${side}`).value = 0;
      document.getElementById(`crop-${side}-value`).textContent = 0;
    });
    applyCropPreview();
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
