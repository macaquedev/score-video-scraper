# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Preferences

- Never write comments unless explicitly told to.
- When completing a task, just do it and do not explain what you did unless asked.
- No commentary about how the changes improve things, how much better things are now, etc.
- No sycophantic flattery.
- Do not attempt to use `sudo`; you must ask the user to run the command instead.

## Project Overview

A Python console application that downloads YouTube videos and extracts unique frames, designed for scraping sheet music videos. It only saves frames that differ from the previous frame to avoid duplicates.

## Setup

```bash
uv sync
```

## Running

Basic usage:
```bash
uv run scraper.py "https://youtube.com/watch?v=VIDEO_ID"
```

Options:
```bash
uv run scraper.py URL -o OUTPUT_DIR             # Specify output directory
uv run scraper.py URL --keep-video              # Keep downloaded video file
uv run scraper.py URL --threshold 0.95          # SSIM similarity threshold (default: 0.95)
uv run scraper.py URL --sample-interval 1.5     # Sample interval in seconds (default: 1.5)
uv run scraper.py URL --sample-interval 0       # Process every frame (slower but thorough)
uv run scraper.py URL --start-time 120          # Start extraction at 2 minutes
uv run scraper.py URL --end-time 300            # End extraction at 5 minutes
uv run scraper.py URL -v temp.mp4               # Specify temporary video filename
uv run scraper.py URL --pdf                     # Create PDF from extracted frames
uv run scraper.py URL --pdf-output sheet.pdf    # Specify PDF output filename
uv run scraper.py URL --orientation landscape   # Set PDF orientation (portrait or landscape)
uv run scraper.py --edit                        # Launch GUI to reorder/delete frames
```

## Architecture

- `scraper.py` - Main application with three core functions:
  - `download_video()` - Uses yt-dlp to download YouTube videos
  - `frames_are_identical()` - Compares adjacent frames using SSIM (Structural Similarity Index) with 480p downsampling for performance
  - `extract_unique_frames()` - Extracts and saves only unique frames using OpenCV, with configurable frame sampling interval