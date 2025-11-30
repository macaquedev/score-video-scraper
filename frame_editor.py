#!/usr/bin/env python3
import tkinter as tk
from tkinter import ttk, messagebox
from PIL import Image, ImageTk
from pathlib import Path
import shutil
import os


class FrameEditor:
    def __init__(self, frames_dir):
        self.frames_dir = Path(frames_dir)
        self.frames = sorted(self.frames_dir.glob("*.png"))
        self.thumbnails = []
        self.selected_index = None
        
        self.root = tk.Tk()
        self.root.title("Frame Editor")
        self.root.geometry("1200x800")
        
        self.setup_ui()
        self.load_thumbnails()
        
    def setup_ui(self):
        toolbar = tk.Frame(self.root)
        toolbar.pack(side=tk.TOP, fill=tk.X, padx=5, pady=5)
        
        tk.Button(toolbar, text="Move Up", command=self.move_up).pack(side=tk.LEFT, padx=2)
        tk.Button(toolbar, text="Move Down", command=self.move_down).pack(side=tk.LEFT, padx=2)
        tk.Button(toolbar, text="Delete", command=self.delete_frame, fg="red").pack(side=tk.LEFT, padx=2)
        tk.Button(toolbar, text="Save & Exit", command=self.save_and_exit, bg="green", fg="white").pack(side=tk.RIGHT, padx=2)
        
        canvas_frame = tk.Frame(self.root)
        canvas_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.canvas = tk.Canvas(canvas_frame, bg="white")
        scrollbar = tk.Scrollbar(canvas_frame, orient=tk.VERTICAL, command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=scrollbar.set)
        
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        self.frame_container = tk.Frame(self.canvas, bg="white")
        self.canvas_window = self.canvas.create_window((0, 0), window=self.frame_container, anchor=tk.NW)
        
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
            img.thumbnail((300, 300))
            photo = ImageTk.PhotoImage(img)
            self.thumbnails.append(photo)
            
            frame = tk.Frame(self.frame_container, relief=tk.RAISED, borderwidth=2, bg="lightgray")
            frame.pack(fill=tk.X, padx=5, pady=5)
            
            label = tk.Label(frame, image=photo, bg="white")
            label.pack(side=tk.LEFT, padx=5, pady=5)
            
            info_frame = tk.Frame(frame, bg="lightgray")
            info_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=10)
            
            tk.Label(info_frame, text=f"Frame {idx}", font=("Arial", 12, "bold"), bg="lightgray").pack(anchor=tk.W)
            tk.Label(info_frame, text=frame_path.name, bg="lightgray").pack(anchor=tk.W)
            
            frame.bind("<Button-1>", lambda e, i=idx: self.select_frame(i))
            label.bind("<Button-1>", lambda e, i=idx: self.select_frame(i))
            
    def select_frame(self, index):
        self.selected_index = index
        for i, frame in enumerate(self.frame_container.winfo_children()):
            if i == index:
                frame.configure(bg="blue", highlightbackground="blue", highlightthickness=3)
            else:
                frame.configure(bg="lightgray", highlightthickness=0)
                
    def move_up(self):
        if self.selected_index is None or self.selected_index == 0:
            return
        
        idx = self.selected_index
        self.frames[idx], self.frames[idx - 1] = self.frames[idx - 1], self.frames[idx]
        self.selected_index = idx - 1
        self.load_thumbnails()
        self.select_frame(self.selected_index)
        
    def move_down(self):
        if self.selected_index is None or self.selected_index >= len(self.frames) - 1:
            return
        
        idx = self.selected_index
        self.frames[idx], self.frames[idx + 1] = self.frames[idx + 1], self.frames[idx]
        self.selected_index = idx + 1
        self.load_thumbnails()
        self.select_frame(self.selected_index)
        
    def delete_frame(self):
        if self.selected_index is None:
            return
        
        if messagebox.askyesno("Confirm Delete", f"Delete frame {self.selected_index}?"):
            self.frames.pop(self.selected_index)
            self.selected_index = None
            self.load_thumbnails()
            
    def save_and_exit(self):
        if messagebox.askyesno("Save Changes", "Save changes and rename files?"):
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
            
            messagebox.showinfo("Success", "Changes saved successfully!")
            self.root.quit()
        
    def run(self):
        self.root.mainloop()


def launch_editor(frames_dir="frames"):
    editor = FrameEditor(frames_dir)
    editor.run()


if __name__ == "__main__":
    launch_editor()
