const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#0f172a',
    titleBarStyle: 'default'
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('load-frames', async () => {
  const framesDir = path.join(process.cwd(), 'frames');
  const metadataPath = path.join(framesDir, '.metadata.json');

  try {
    const files = fs.readdirSync(framesDir)
      .filter(f => f.endsWith('.png'))
      .sort()
      .map(f => ({
        name: f,
        path: path.join(framesDir, f),
        pageBreak: false
      }));

    // Load page breaks from metadata if it exists
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      if (metadata.pageBreaks) {
        metadata.pageBreaks.forEach(idx => {
          if (files[idx]) {
            files[idx].pageBreak = true;
          }
        });
      }
    }

    return files;
  } catch (err) {
    return [];
  }
});

ipcMain.handle('save-frames', async (event, frames, cropValues) => {
  const framesDir = path.join(process.cwd(), 'frames');
  const tempDir = path.join(framesDir, 'temp_rename');
  const metadataPath = path.join(framesDir, '.metadata.json');

  console.log('Starting save operation with', frames.length, 'frames');
  console.log('Crop values:', cropValues);

  try {
    // Create temp directory
    console.log('Creating temp directory...');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Copy files with new names
    console.log('Copying files...');
    frames.forEach((frame, idx) => {
      const oldPath = path.join(framesDir, frame.name);
      const newName = `frame_${String(idx).padStart(6, '0')}.png`;
      const newPath = path.join(tempDir, newName);
      fs.copyFileSync(oldPath, newPath);
    });

    // Remove old files
    console.log('Removing old files...');
    const oldFiles = fs.readdirSync(framesDir)
      .filter(f => f.startsWith('frame_') && f.endsWith('.png'));
    oldFiles.forEach(f => {
      fs.unlinkSync(path.join(framesDir, f));
    });

    // Move new files back
    console.log('Moving new files back...');
    const newFiles = fs.readdirSync(tempDir);
    newFiles.forEach(f => {
      fs.renameSync(
        path.join(tempDir, f),
        path.join(framesDir, f)
      );
    });

    // Remove temp directory
    console.log('Removing temp directory...');
    fs.rmdirSync(tempDir);

    // Extract page break indices and save metadata
    const pageBreaks = frames
      .map((frame, idx) => frame.pageBreak ? idx : null)
      .filter(idx => idx !== null);

    console.log('Saving metadata with page breaks:', pageBreaks);
    fs.writeFileSync(metadataPath, JSON.stringify({ pageBreaks }, null, 2));

    // Generate PDF using Python
    console.log('Generating PDF...');
    return new Promise((resolve, reject) => {
      const pageBreaksStr = JSON.stringify(pageBreaks);
      const cropStr = JSON.stringify(cropValues);
      const pythonCode = `from scraper import create_pdf; import json; page_breaks = json.loads('${pageBreaksStr}'); crop = json.loads('${cropStr}'); create_pdf('frames', 'output.pdf', 'portrait', page_breaks, crop); print('PDF created successfully')`;
      console.log('Spawning Python process with page breaks:', pageBreaks, 'crop:', cropValues);

      const child = spawn('uv', ['run', 'python', '-u', '-c', pythonCode], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        const str = data.toString().trim();
        console.log('Python stdout:', str);
        output += str;

        // Send progress to renderer
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('pdf-progress', str);
        }
      });

      child.stderr.on('data', (data) => {
        const str = data.toString();
        console.log('Python stderr:', str);
        errorOutput += str;
      });

      child.on('close', (code) => {
        console.log('Python process closed with code', code);
        if (code === 0) {
          resolve({ success: true, message: `PDF created with ${frames.length} frames` });
        } else {
          reject(new Error(`Python script failed (code ${code}): ${errorOutput}`));
        }
      });

      child.on('error', (err) => {
        console.error('Python process error:', err);
        reject(err);
      });

      // Add timeout (5 minutes)
      setTimeout(() => {
        console.log('Python process timeout after 5 minutes');
        child.kill();
        reject(new Error('PDF generation timed out after 5 minutes'));
      }, 300000);
    });
  } catch (err) {
    console.error('Save operation failed:', err);
    throw new Error(`Failed to save: ${err.message}`);
  }
});

ipcMain.handle('preview-pdf', async (event, frames, cropValues) => {
  const framesDir = path.join(process.cwd(), 'frames');
  const previewPdf = path.join(process.cwd(), 'preview.pdf');
  const metadataPath = path.join(framesDir, '.metadata.json');

  console.log('Generating preview PDF with', frames.length, 'frames');
  console.log('Crop values:', cropValues);

  try {
    // Load page breaks from metadata if available
    let pageBreaks = [];
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      pageBreaks = metadata.pageBreaks || [];
    }

    // Map frame indices to match current frame order
    const frameIndices = frames.map((frame, idx) => {
      if (frame.pageBreak) {
        return idx;
      }
      return null;
    }).filter(idx => idx !== null);

    // Use current frame page breaks if they exist
    const currentPageBreaks = frameIndices.length > 0 ? frameIndices : pageBreaks;

    return new Promise((resolve, reject) => {
      const pageBreaksStr = JSON.stringify(currentPageBreaks);
      const cropStr = JSON.stringify(cropValues);
      const pythonCode = `from scraper import create_pdf; import json; page_breaks = json.loads('${pageBreaksStr}'); crop = json.loads('${cropStr}'); create_pdf('frames', 'preview.pdf', 'portrait', page_breaks, crop, preview_only=True); print('Preview PDF created')`;
      console.log('Spawning Python process for preview');

      const child = spawn('uv', ['run', 'python', '-u', '-c', pythonCode], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        const str = data.toString().trim();
        console.log('Python stdout:', str);
        output += str;

        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('pdf-progress', str);
        }
      });

      child.stderr.on('data', (data) => {
        const str = data.toString();
        console.log('Python stderr:', str);
        errorOutput += str;
      });

      child.on('close', async (code) => {
        console.log('Python process closed with code', code);
        if (code === 0) {
          // Open the preview PDF
          await shell.openPath(previewPdf);
          resolve({ success: true, message: 'Preview PDF generated' });
        } else {
          reject(new Error(`Python script failed (code ${code}): ${errorOutput}`));
        }
      });

      child.on('error', (err) => {
        console.error('Python process error:', err);
        reject(err);
      });

      setTimeout(() => {
        console.log('Python process timeout after 5 minutes');
        child.kill();
        reject(new Error('PDF generation timed out after 5 minutes'));
      }, 300000);
    });
  } catch (err) {
    console.error('Preview operation failed:', err);
    throw new Error(`Failed to generate preview: ${err.message}`);
  }
});

ipcMain.handle('delete-frames', async (event, framesToDelete) => {
  const framesDir = path.join(process.cwd(), 'frames');
  try {
    framesToDelete.forEach(frameName => {
      const framePath = path.join(framesDir, frameName);
      if (fs.existsSync(framePath)) {
        fs.unlinkSync(framePath);
      }
    });
    return { success: true };
  } catch (err) {
    throw new Error(`Failed to delete: ${err.message}`);
  }
});
