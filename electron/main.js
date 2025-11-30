const { app, BrowserWindow, ipcMain } = require('electron');
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
  try {
    const files = fs.readdirSync(framesDir)
      .filter(f => f.endsWith('.png'))
      .sort()
      .map(f => ({
        name: f,
        path: path.join(framesDir, f)
      }));
    return files;
  } catch (err) {
    return [];
  }
});

ipcMain.handle('save-frames', async (event, frames) => {
  const framesDir = path.join(process.cwd(), 'frames');
  const tempDir = path.join(framesDir, 'temp_rename');

  console.log('Starting save operation with', frames.length, 'frames');

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

    // Generate PDF using Python
    console.log('Generating PDF...');
    return new Promise((resolve, reject) => {
      const pythonCode = `from scraper import create_pdf; create_pdf('frames', 'output.pdf', 'portrait'); print('PDF created successfully')`;
      console.log('Spawning Python process:', 'uv run python -c', pythonCode.substring(0, 50) + '...');

      const child = spawn('uv', ['run', 'python', '-c', pythonCode], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        const str = data.toString();
        console.log('Python stdout:', str);
        output += str;
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
