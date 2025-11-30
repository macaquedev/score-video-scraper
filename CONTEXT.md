# Project Context and Development History

This document contains a comprehensive summary of the project's development, decisions made, and current state. Reference this after conversation auto-compaction.

## Project Overview

**Goal**: YouTube video scraper for extracting unique frames from sheet music videos, with PDF generation and graphical editing capabilities.

**Tech Stack**: Python with uv package manager, OpenCV, yt-dlp, scikit-image, Pillow, ReportLab, Tkinter

## Key Technical Decisions

### 1. Frame Comparison Strategy
- **Initial approach**: Mean absolute difference (threshold=0.01)
- **Problem**: Produced 2040 frames with many duplicates due to compression artifacts
- **Solution**: Switched to SSIM (Structural Similarity Index) with threshold=0.95
- **Result**: Better perceptual similarity detection, reduced to ~139 unique frames

### 2. Performance Optimizations
- **Issue**: SSIM computation was slow on full-resolution frames
- **Solution**: Downsample to 480p before comparison (3-4x speedup)
- **Additional optimization**: Sample every 1.5 seconds instead of every frame (60x speedup)
- **Implementation**: Adjacent frame comparison (frame N vs N-1, not vs first frame of block)

### 3. Black Border Removal
- **Initial threshold**: 10 (too low, left near-black borders)
- **User feedback**: "occasionally, you have a very very slight black border still"
- **Final threshold**: 30 (catches near-black pixels effectively)

### 4. GUI Deletion Optimization
- **Initial implementation**: Called `load_thumbnails()` after each deletion (very slow)
- **Optimization**:
  - Remove confirmation dialog
  - Destroy only the specific widget
  - Update frame numbers in place
  - No full reload needed

## File Structure and Key Functions

### scraper.py
Main application with CLI interface.

**Key functions**:
- `download_video(url, output_path)`: Downloads YouTube video using yt-dlp
- `crop_black_borders(image, threshold=30)`: Removes black borders using thresholding
- `frames_are_identical(frame1, frame2, threshold=0.95)`: SSIM-based comparison with 480p downsampling
- `extract_unique_frames(video_path, output_dir, threshold, sample_interval, start_time, end_time)`: Main extraction logic
- `create_pdf(frames_dir, output_pdf, orientation)`: PDF generation with A4 layout

**CLI Options**:
- `--threshold`: SSIM similarity threshold (default: 0.95)
- `--sample-interval`: Sample every N seconds (default: 1.5, use 0 for every frame)
- `--start-time` / `--end-time`: Process specific video segments
- `--pdf`: Generate PDF from frames
- `--orientation`: portrait/landscape (default: portrait)
- `--edit`: Launch graphical editor

### frame_editor.py
Tkinter GUI for frame management.

**Features**:
- View thumbnails in scrollable canvas
- Select frames with click
- Move Up/Down to reorder
- Delete frames (optimized - no reload)
- Save & Exit to rename files sequentially

**Critical optimization** in `delete_frame()`:
```python
def delete_frame(self):
    if self.selected_index is None:
        return
    self.frames.pop(self.selected_index)
    widgets = self.frame_container.winfo_children()
    widgets[self.selected_index].destroy()
    self.thumbnails.pop(self.selected_index)
    self.selected_index = None
    # Update frame numbers without reload
    for i, widget in enumerate(self.frame_container.winfo_children()):
        for child in widget.winfo_children():
            if isinstance(child, tk.Frame):
                for label in child.winfo_children():
                    if isinstance(label, tk.Label) and "Frame" in label.cget("text"):
                        label.config(text=f"Frame {i}")
```

### pyproject.toml
uv project configuration with dependencies:
- yt-dlp (YouTube downloading)
- opencv-python (video processing)
- numpy (array operations)
- scikit-image (SSIM computation)
- pillow (image manipulation)
- reportlab (PDF generation)

## PDF Generation Algorithm

1. Scale images to 0.95 for white border
2. Stack images vertically with spacing=10
3. Check if next image would exceed page height (0.9 * A4)
4. If yes, center current stack on both axes and start new page
5. Continue until all frames processed

## Problems Solved

### Duplicate Frames
**Symptom**: 2040 frames extracted, many visually identical
**User quote**: "for some reason there are many images which are just duplicates of each other. surely this should be a trivial fix, since the image is just identical. Do not look at the AUDIO - solely look at the IMAGE."
**Solution**: SSIM comparison with 0.95 threshold

### Slow Processing
**User quote**: "why is it so slow?"
**Solution**: 480p downsampling + 1.5s sampling interval

### Adjacent vs All Pairs Comparison
**User question**: "just to clarify - when you say 'every pair' - this is 'adjacent pairs', right? not 'all pairs'?"
**Confirmed**: Adjacent pairs (N vs N-1), which is correct

### Near-Black Borders
**User quote**: "occasionally, you have a very very slight black border still - it's probably like not 'quite' black but close enough"
**Solution**: Increased threshold from 10 to 30

### Slow Deletion in GUI
**User quote**: "why is deletion so slow?"
**Solution**: Optimized to avoid `load_thumbnails()` call

## Example Usage

```bash
# Basic extraction with default settings (1.5s intervals)
uv run scraper.py "https://www.youtube.com/watch?v=VIDEO_ID"

# Extract from specific timestamps
uv run scraper.py URL --start-time 120 --end-time 300

# Generate PDF in landscape orientation
uv run scraper.py URL --pdf --orientation landscape

# Process every frame (no sampling)
uv run scraper.py URL --sample-interval 0

# Launch editor to reorder/delete frames
uv run scraper.py --edit
```

## Test Cases

### Test 1: Short video
- URL: https://www.youtube.com/watch?v=GdM0lavuo7E
- Initial run: 2040 frames (duplicates)
- After SSIM: 139 frames
- After 1.5s sampling: 25 frames

### Test 2: Long video
- URL: https://www.youtube.com/watch?v=sp6hvLgtf-8&t=2084s
- Result: 98 unique frames
- PDF size: 153MB

## Git Repository

- GitHub: git@github.com:macaquedev/score-video-scraper.git
- Username: macaquedev
- All commits include proper attribution with Co-Authored-By: Claude

## Current State

All requested features are implemented and optimized:
- ✅ YouTube video downloading
- ✅ Unique frame extraction with SSIM
- ✅ Black border cropping (threshold=30)
- ✅ Configurable sampling interval
- ✅ Timestamp selection
- ✅ PDF generation with proper layout
- ✅ Graphical editor with optimized deletion
- ✅ uv package management
- ✅ Git repository with proper commits

## Important Implementation Notes

1. **SSIM threshold**: 0.95 works well for sheet music (higher = more similar required to skip)
2. **Sample interval**: 1.5s is optimal for sheet music videos (reduces processing time 60x)
3. **Black border threshold**: 30 catches near-black pixels (RGB values < 30)
4. **Frame comparison**: Always adjacent pairs (N vs N-1), never compare to first of block
5. **PDF scaling**: 0.95 leaves subtle white border, max_width = 0.9 * page_width
6. **GUI performance**: Never reload thumbnails unnecessarily, update in place

## Dependencies Management

All dependencies managed via uv:
```bash
uv init                    # Initialize project
uv add package-name        # Add dependency
uv run scraper.py          # Run script
```

## Future Considerations

No pending tasks or requested features. Project is feature-complete per user requirements.
