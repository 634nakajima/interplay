"""
FUDI (Fast Universal Digital Interface) client for Pure Data.
Sends messages to Pd via TCP for dynamic patching.
"""

import os
import socket
import subprocess
import time


class FUDIClient:
    """TCP client that speaks Pd's FUDI protocol."""

    def __init__(self, host: str = "127.0.0.1", port: int = 3001):
        self.host = host
        self.port = port
        self.sock = None

    def connect(self) -> bool:
        """Connect to Pd's netreceive."""
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(3.0)
            self.sock.connect((self.host, self.port))
            return True
        except (ConnectionRefusedError, socket.timeout, OSError) as e:
            self.sock = None
            return False

    def disconnect(self):
        if self.sock:
            try:
                self.sock.close()
            except OSError:
                pass
            self.sock = None

    def send(self, message: str):
        """Send a FUDI message (auto-appends semicolon + newline)."""
        if not self.sock:
            return False
        msg = message.rstrip(";").strip() + ";\n"
        try:
            self.sock.sendall(msg.encode("utf-8"))
            return True
        except (BrokenPipeError, OSError):
            self.sock = None
            return False

    def send_to_canvas(self, canvas_name: str, *args):
        """Send a message to a named canvas (e.g. 'pd-ai-canvas')."""
        msg = f"pd-{canvas_name} {' '.join(str(a) for a in args)}"
        return self.send(msg)

    def clear_canvas(self, canvas_name: str = "ai-canvas"):
        """Clear all objects from a canvas."""
        return self.send_to_canvas(canvas_name, "clear")

    def create_obj(self, canvas_name: str, x: int, y: int, *args):
        """Create an object on a canvas."""
        obj_str = " ".join(str(a) for a in args)
        return self.send_to_canvas(canvas_name, "obj", x, y, obj_str)

    def create_msg(self, canvas_name: str, x: int, y: int, text: str):
        """Create a message box on a canvas."""
        return self.send_to_canvas(canvas_name, "msg", x, y, text)

    def connect_objs(self, canvas_name: str, src: int, outlet: int, dst: int, inlet: int):
        """Connect two objects."""
        return self.send_to_canvas(canvas_name, "connect", src, outlet, dst, inlet)

    @property
    def is_connected(self) -> bool:
        return self.sock is not None


class PdFileOpener:
    """Open .pd files in Pd/plugdata."""

    def __init__(self, fudi: FUDIClient | None = None):
        self.fudi = fudi

    def open_patch(self, filepath: str):
        """Open a .pd file using the OS default application (plugdata/Pd)."""
        filepath = os.path.abspath(filepath)
        try:
            subprocess.Popen(["open", filepath])
        except OSError:
            # Fallback to FUDI if 'open' command fails
            if self.fudi:
                dirname = os.path.dirname(filepath)
                basename = os.path.basename(filepath)
                self.fudi.send(f"pd open {basename} {dirname}")
