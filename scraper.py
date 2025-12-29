#!/usr/bin/env python3
import argparse
import os
import sys
import shutil
import cv2
import numpy as np
import yt_dlp
from pathlib import Path
from skimage.metrics import structural_similarity as ssim
from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def download_video(url, output_path="video.mp4"):
    ydl_opts = {
        'format': 'best',
        'outtmpl': output_path,
        'quiet': False,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    return output_path


def crop_black_borders(image, threshold=30):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    _, thresh = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)

    coords = cv2.findNonZero(thresh)

    if coords is None:
        return image

    x, y, w, h = cv2.boundingRect(coords)

    cropped = image[y:y+h, x:x+w]

    return cropped


def frames_are_identical(frame1, frame2, threshold=0.95):
    if frame1.shape != frame2.shape:
        return False

    gray1 = cv2.cvtColor(frame1, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(frame2, cv2.COLOR_BGR2GRAY)

    height, width = gray1.shape
    scale = min(1.0, 480 / height)
    if scale < 1.0:
        new_height = int(height * scale)
        new_width = int(width * scale)
        gray1 = cv2.resize(gray1, (new_width, new_height))
        gray2 = cv2.resize(gray2, (new_width, new_height))

    similarity = ssim(gray1, gray2)

    return similarity > threshold


def extract_unique_frames(video_path, output_dir, threshold=0.95, sample_interval=None, start_time=None, end_time=None):
    os.makedirs(output_dir, exist_ok=True)

    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        print(f"Error: Could not open video file {video_path}")
        return

    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    start_frame = int(start_time * fps) if start_time is not None else 0
    end_frame = int(end_time * fps) if end_time is not None else total_frames

    if start_frame > 0:
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
        print(f"Starting at {start_time}s (frame {start_frame})")

    if end_time is not None:
        print(f"Ending at {end_time}s (frame {end_frame})")

    if sample_interval is not None:
        skip_frames = int(fps * sample_interval)
        print(f"Sampling every {sample_interval} seconds ({skip_frames} frames at {fps:.2f} FPS)")
    else:
        skip_frames = 1
        print(f"Processing every frame at {fps:.2f} FPS")

    frame_count = start_frame
    saved_count = 0
    prev_frame = None

    print(f"Processing frames {start_frame} to {end_frame}...")

    while frame_count < end_frame:
        ret, frame = cap.read()

        if not ret:
            break

        frame_count += 1

        if (frame_count - start_frame) % skip_frames != 0:
            continue

        if prev_frame is None or not frames_are_identical(prev_frame, frame, threshold):
            cropped_frame = crop_black_borders(frame)
            output_path = os.path.join(output_dir, f"frame_{saved_count:06d}.png")
            cv2.imwrite(output_path, cropped_frame)
            saved_count += 1
            prev_frame = frame.copy()

        if (frame_count - start_frame) % (100 * skip_frames) == 0:
            print(f"Processed {frame_count - start_frame}/{end_frame - start_frame} frames, saved {saved_count} unique frames")

    cap.release()
    print(f"\nDone! Saved {saved_count} unique frames out of {frame_count - start_frame} processed frames")


def create_pdf(frames_dir, output_pdf, orientation="portrait", page_breaks=None, crop=None, preview_only=False):
    import tempfile
    import os as os_module
    import shutil

    frames_path = Path(frames_dir)
    image_files = sorted(frames_path.glob("*.png"))

    if not image_files:
        print(f"No images found in {frames_dir}")
        return

    print(f"Creating PDF with {len(image_files)} frames...")

    # Determine if we need to crop
    needs_crop = crop and (crop.get('top', 0) > 0 or crop.get('bottom', 0) > 0 or crop.get('left', 0) > 0 or crop.get('right', 0) > 0)

    # Create temp directory for processing
    temp_dir = tempfile.mkdtemp(prefix='pdf_gen_')
    print(f"Using temp directory: {temp_dir}")

    try:
        # Process all images: crop if needed and save to temp directory
        print("Processing images...")
        processed_images = []

        for idx, img_path in enumerate(image_files):
            if idx % 10 == 0:
                print(f"Processing image {idx + 1}/{len(image_files)}...")

            img = Image.open(img_path)

            # Apply crop if needed
            if needs_crop:
                width, height = img.size
                left = crop.get('left', 0)
                top = crop.get('top', 0)
                right = width - crop.get('right', 0)
                bottom = height - crop.get('bottom', 0)

                if idx == 0:
                    print(f"Cropping: ({left}, {top}, {right}, {bottom}) from {(width, height)}")

                img = img.crop((left, top, right, bottom))

                if idx == 0:
                    print(f"Result: {img.size}")

                # Save back to original if not preview
                if not preview_only:
                    img.save(str(img_path), 'PNG')

            # Save processed image to temp directory
            temp_img_path = os_module.path.join(temp_dir, f"img_{idx:06d}.png")
            img.save(temp_img_path, 'PNG')
            processed_images.append((temp_img_path, img.size[0], img.size[1]))
            img.close()

        # Convert page_breaks to a set
        page_break_set = set(page_breaks) if page_breaks else set()

        if orientation == "portrait":
            page_width, page_height = A4
        else:
            page_height, page_width = A4

        c = canvas.Canvas(output_pdf, pagesize=(page_width, page_height))

        # Generate PDF pages - fit as many images as possible per page
        print("Generating PDF pages...")

        # Get manual page break boundaries
        manual_breaks = sorted(list(page_break_set))
        section_starts = [0] + [b + 1 for b in manual_breaks]
        section_ends = [b + 1 for b in manual_breaks] + [len(processed_images)]

        page_num = 0
        max_width = page_width * 0.9
        max_height = page_height * 0.9

        for section_idx in range(len(section_starts)):
            section_start = section_starts[section_idx]
            section_end = section_ends[section_idx]

            # Get images for this section
            section_images = processed_images[section_start:section_end]

            print(f"Section {section_idx + 1}: frames {section_start}-{section_end-1}")

            # Pack images into pages, fitting as many as possible
            idx = 0
            while idx < len(section_images):
                page_images = []
                current_height = 0

                # Add images to current page until we run out of space
                while idx < len(section_images):
                    img_path, img_width, img_height = section_images[idx]

                    # Scale to fit page width
                    scale = min(1.0, max_width / img_width)
                    scaled_width = img_width * scale
                    scaled_height = img_height * scale

                    # Check if this image fits on current page
                    if current_height + scaled_height <= max_height:
                        page_images.append((img_path, scaled_width, scaled_height))
                        current_height += scaled_height
                        idx += 1
                    else:
                        break

                # If we couldn't fit any images, force add one (image too tall for page)
                if not page_images and idx < len(section_images):
                    img_path, img_width, img_height = section_images[idx]
                    scale = min(max_width / img_width, max_height / img_height)
                    scaled_width = img_width * scale
                    scaled_height = img_height * scale
                    page_images.append((img_path, scaled_width, scaled_height))
                    idx += 1

                # Render page
                if page_images:
                    page_num += 1
                    total_height = sum(h for _, _, h in page_images)
                    print(f"Creating page {page_num} with {len(page_images)} frames")

                    y_offset = (page_height - total_height) / 2

                    for img_path, img_width, img_height in page_images:
                        x_offset = (page_width - img_width) / 2
                        y_position = page_height - y_offset - img_height

                        c.drawImage(img_path, x_offset, y_position, width=img_width, height=img_height)

                        y_offset += img_height

                    c.showPage()

        print("Saving PDF...")
        c.save()
        print(f"PDF created: {output_pdf}")

    finally:
        # Clean up temp directory
        print("Cleaning up temp files...")
        try:
            shutil.rmtree(temp_dir)
        except Exception as e:
            print(f"Warning: Could not remove temp directory: {e}")


def main():
    parser = argparse.ArgumentParser(description="Download YouTube video and extract unique frames")
    parser.add_argument("url", nargs="?", help="YouTube video URL")
    parser.add_argument("-o", "--output", default="frames", help="Output directory for frames (default: frames)")
    parser.add_argument("-v", "--video", default="video.mp4", help="Temporary video file path (default: video.mp4)")
    parser.add_argument("--keep-video", action="store_true", help="Keep downloaded video file after extraction")
    parser.add_argument("--threshold", type=float, default=0.95, help="SSIM similarity threshold, higher=more similar required (default: 0.95)")
    parser.add_argument("--sample-interval", type=float, default=1.5, help="Sample interval in seconds (default: 1.5). Use 0 to process every frame")
    parser.add_argument("--start-time", type=float, help="Start time in seconds")
    parser.add_argument("--end-time", type=float, help="End time in seconds")
    parser.add_argument("--pdf", action="store_true", help="Create a PDF from extracted frames")
    parser.add_argument("--pdf-output", default="output.pdf", help="PDF output filename (default: output.pdf)")
    parser.add_argument("--orientation", choices=["portrait", "landscape"], default="portrait", help="PDF page orientation (default: portrait)")
    parser.add_argument("--edit", action="store_true", help="Launch graphical editor to reorder/delete frames")

    args = parser.parse_args()

    if args.edit:
        print("Please use 'bun dev' or 'npm run dev' to launch the frame editor.")
        return

    if not args.url:
        parser.error("URL is required unless using --edit")

    if os.path.exists(args.output):
        response = input(f"Directory '{args.output}' already exists. Delete it? (y/n): ").strip().lower()
        if response == 'y' or response == 'yes':
            shutil.rmtree(args.output)
            print(f"Deleted directory: {args.output}")
        else:
            print("Exiting...")
            sys.exit(0)

    print(f"Downloading video from: {args.url}")
    video_path = download_video(args.url, args.video)

    sample_interval = None if args.sample_interval == 0 else args.sample_interval

    print(f"\nExtracting unique frames to: {args.output}")
    extract_unique_frames(video_path, args.output, args.threshold, sample_interval, args.start_time, args.end_time)

    if args.pdf:
        print(f"\nCreating PDF with {args.orientation} orientation...")
        create_pdf(args.output, args.pdf_output, args.orientation)

    if not args.keep_video:
        os.remove(video_path)
        print(f"Removed temporary video file: {video_path}")


if __name__ == "__main__":
    main()
