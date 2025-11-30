#!/usr/bin/env python3
import customtkinter as ctk
from tkinter import messagebox, Canvas, Scrollbar
from PIL import Image, ImageTk
from pathlib import Path
import shutil
import os

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")


class FrameEditor:
    def __init__(self, frames_dir):
        self.frames_dir = Path(frames_dir)
        self.frames = sorted(self.frames_dir.glob("*.png"))
        self.thumbnails = []
        self.selected_indices = set()
        self.last_clicked = None

        self.root = ctk.CTk()
        self.root.title("Frame Editor")
        self.root.geometry("1400x900")

        self.setup_ui()
        self.load_thumbnails()
        self.setup_keybindings()

    def setup_keybindings(self):
        self.root.bind("<Up>", lambda e: self.navigate_up(e))
        self.root.bind("<Down>", lambda e: self.navigate_down(e))
        self.root.bind("<Delete>", lambda e: self.delete_frame())

    def setup_ui(self):
        # Toolbar
        toolbar = ctk.CTkFrame(self.root)
        toolbar.pack(side="top", fill="x", padx=10, pady=10)

        ctk.CTkButton(
            toolbar,
            text="↑ Move Up",
            command=self.move_up,
            width=120,
            height=35
        ).pack(side="left", padx=5)

        ctk.CTkButton(
            toolbar,
            text="↓ Move Down",
            command=self.move_down,
            width=120,
            height=35
        ).pack(side="left", padx=5)

        ctk.CTkButton(
            toolbar,
            text="🗑 Delete",
            command=self.delete_frame,
            fg_color="#e74c3c",
            hover_color="#c0392b",
            width=120,
            height=35
        ).pack(side="left", padx=5)

        ctk.CTkButton(
            toolbar,
            text="💾 Save & Exit",
            command=self.save_and_exit,
            fg_color="#27ae60",
            hover_color="#229954",
            width=140,
            height=35
        ).pack(side="right", padx=5)

        # Info label
        self.info_label = ctk.CTkLabel(
            toolbar,
            text=f"Total frames: {len(self.frames)}",
            font=("Arial", 14)
        )
        self.info_label.pack(side="left", padx=20)

        # Canvas frame with modern scrollbar
        canvas_frame = ctk.CTkFrame(self.root, fg_color="transparent")
        canvas_frame.pack(fill="both", expand=True, padx=10, pady=(0, 10))

        self.canvas = Canvas(canvas_frame, bg="#1e1e1e", highlightthickness=0)
        scrollbar = ctk.CTkScrollbar(canvas_frame, command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=scrollbar.set)

        scrollbar.pack(side="right", fill="y")
        self.canvas.pack(side="left", fill="both", expand=True)

        self.frame_container = ctk.CTkFrame(self.canvas, fg_color="transparent")
        self.canvas_window = self.canvas.create_window((0, 0), window=self.frame_container, anchor="nw")

        self.frame_container.bind("<Configure>", lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.canvas.bind("<Configure>", self.on_canvas_configure)

    def on_canvas_configure(self, event):
        self.canvas.itemconfig(self.canvas_window, width=event.width)

    def load_thumbnails(self):
        for widget in self.frame_container.winfo_children():
            widget.destroy()

        self.thumbnails = []

        for idx, frame_path in enumerate(self.frames):
            img = Image.open(frame_path)
            img.thumbnail((350, 350))
            photo = ImageTk.PhotoImage(img)
            self.thumbnails.append(photo)

            # Modern frame card
            frame_card = ctk.CTkFrame(
                self.frame_container,
                corner_radius=10,
                fg_color="#2b2b2b",
                border_width=2,
                border_color="#3b3b3b"
            )
            frame_card.pack(fill="x", padx=15, pady=8)

            # Image container
            img_container = ctk.CTkFrame(frame_card, fg_color="transparent")
            img_container.pack(side="left", padx=15, pady=15)

            img_label = ctk.CTkLabel(img_container, image=photo, text="")
            img_label.pack()

            # Info container
            info_container = ctk.CTkFrame(frame_card, fg_color="transparent")
            info_container.pack(side="left", fill="both", expand=True, padx=15, pady=15)

            title_label = ctk.CTkLabel(
                info_container,
                text=f"Frame {idx}",
                font=("Arial", 18, "bold"),
                anchor="w"
            )
            title_label.pack(anchor="w", pady=(0, 5))

            filename_label = ctk.CTkLabel(
                info_container,
                text=frame_path.name,
                font=("Arial", 12),
                text_color="#888888",
                anchor="w"
            )
            filename_label.pack(anchor="w")

            # Bind clicks
            frame_card.bind("<Button-1>", lambda e, i=idx: self.select_frame(i, e))
            img_label.bind("<Button-1>", lambda e, i=idx: self.select_frame(i, e))
            title_label.bind("<Button-1>", lambda e, i=idx: self.select_frame(i, e))
            filename_label.bind("<Button-1>", lambda e, i=idx: self.select_frame(i, e))

        self.update_info_label()

    def update_info_label(self):
        selected_count = len(self.selected_indices)
        if selected_count > 0:
            self.info_label.configure(text=f"Total: {len(self.frames)} | Selected: {selected_count}")
        else:
            self.info_label.configure(text=f"Total frames: {len(self.frames)}")

    def select_frame(self, index, event=None):
        # Check if Shift is pressed for range select
        if event and (event.state & 0x1):  # Shift key
            if self.last_clicked is not None:
                start = min(self.last_clicked, index)
                end = max(self.last_clicked, index)
                self.selected_indices = set(range(start, end + 1))
            else:
                self.selected_indices = {index}
        # Check if Ctrl is pressed for multi-select
        elif event and (event.state & 0x4):  # Ctrl key
            if index in self.selected_indices:
                self.selected_indices.remove(index)
            else:
                self.selected_indices.add(index)
        else:
            # Single select
            self.selected_indices = {index}

        self.last_clicked = index

        # Update visual highlighting
        for i, frame in enumerate(self.frame_container.winfo_children()):
            if i in self.selected_indices:
                frame.configure(border_color="#3498db", border_width=3, fg_color="#2c3e50")
            else:
                frame.configure(border_color="#3b3b3b", border_width=2, fg_color="#2b2b2b")

        self.update_info_label()

    def navigate_up(self, event):
        if not self.frames:
            return

        if not self.selected_indices:
            target = len(self.frames) - 1
        else:
            target = min(self.selected_indices) - 1
            if target < 0:
                return

        if event.state & 0x1 and self.last_clicked is not None:
            start = min(self.last_clicked, target)
            end = max(self.last_clicked, target)
            self.selected_indices = set(range(start, end + 1))
        else:
            self.selected_indices = {target}
            self.last_clicked = target

        self.select_frame(target)
        self.scroll_to_frame(target)

    def navigate_down(self, event):
        if not self.frames:
            return

        if not self.selected_indices:
            target = 0
        else:
            target = max(self.selected_indices) + 1
            if target >= len(self.frames):
                return

        if event.state & 0x1 and self.last_clicked is not None:
            start = min(self.last_clicked, target)
            end = max(self.last_clicked, target)
            self.selected_indices = set(range(start, end + 1))
        else:
            self.selected_indices = {target}
            self.last_clicked = target

        self.select_frame(target)
        self.scroll_to_frame(target)

    def scroll_to_frame(self, index):
        widgets = self.frame_container.winfo_children()
        if 0 <= index < len(widgets):
            widget = widgets[index]
            self.canvas.update_idletasks()
            bbox = self.canvas.bbox("all")
            if bbox:
                widget_y = widget.winfo_y()
                widget_height = widget.winfo_height()
                canvas_height = self.canvas.winfo_height()

                scroll_pos = (widget_y - canvas_height / 2 + widget_height / 2) / bbox[3]
                scroll_pos = max(0, min(1, scroll_pos))
                self.canvas.yview_moveto(scroll_pos)

    def move_up(self):
        if len(self.selected_indices) != 1:
            return

        idx = list(self.selected_indices)[0]
        if idx == 0:
            return

        self.frames[idx], self.frames[idx - 1] = self.frames[idx - 1], self.frames[idx]
        self.selected_indices = {idx - 1}
        self.load_thumbnails()
        self.select_frame(idx - 1)

    def move_down(self):
        if len(self.selected_indices) != 1:
            return

        idx = list(self.selected_indices)[0]
        if idx >= len(self.frames) - 1:
            return

        self.frames[idx], self.frames[idx + 1] = self.frames[idx + 1], self.frames[idx]
        self.selected_indices = {idx + 1}
        self.load_thumbnails()
        self.select_frame(idx + 1)

    def delete_frame(self):
        if not self.selected_indices:
            return

        # Delete in reverse order
        for idx in sorted(self.selected_indices, reverse=True):
            self.frames.pop(idx)

        self.selected_indices.clear()
        self.last_clicked = None
        self.load_thumbnails()

    def save_and_exit(self):
        if messagebox.askyesno("Save Changes", "Save changes and create PDF?"):
            temp_dir = self.frames_dir / "temp_rename"
            temp_dir.mkdir(exist_ok=True)

            for idx, frame_path in enumerate(self.frames):
                new_name = f"frame_{idx:06d}.png"
                shutil.copy2(frame_path, temp_dir / new_name)

            for file in self.frames_dir.glob("frame_*.png"):
                file.unlink()

            for file in temp_dir.glob("*.png"):
                shutil.move(file, self.frames_dir / file.name)

            temp_dir.rmdir()

            # Generate PDF
            from scraper import create_pdf
            create_pdf(str(self.frames_dir), "output.pdf", "portrait")

            messagebox.showinfo("Success", f"Changes saved and PDF created!\nSaved {len(self.frames)} frames to output.pdf")
            self.root.quit()

    def run(self):
        self.root.mainloop()


def launch_editor(frames_dir="frames"):
    editor = FrameEditor(frames_dir)
    editor.run()


if __name__ == "__main__":
    launch_editor()
