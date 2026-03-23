#!/usr/bin/env python3
"""
pd-ai-coder: AI-powered interactive Pure Data patch development tool.

Usage:
    python pd_ai_coder.py [--patch FILE] [--port PORT] [--no-fudi]

Workflow:
    1. Describe what you want in natural language
    2. AI generates a Pd patch
    3. Patch opens in Pd - tweak it manually if you like
    4. Save in Pd, then ask AI for more changes
    5. Repeat
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

try:
    from prompt_toolkit import PromptSession
    from prompt_toolkit.history import FileHistory
    from prompt_toolkit.formatted_text import HTML
    from prompt_toolkit.styles import Style
    HAS_PROMPT_TOOLKIT = True
except ImportError:
    HAS_PROMPT_TOOLKIT = False

from fudi import FUDIClient, PdFileOpener
from pd_file import (
    read_patch, write_patch, extract_patch_from_response,
    summarize_patch, get_patch_mtime,
)
from prompts import SYSTEM_PROMPT


# --- Configuration ---

DEFAULT_PATCH_DIR = os.path.expanduser("~/pd-ai-patches")
DEFAULT_PATCH_NAME = "ai-patch.pd"
HISTORY_FILE = os.path.expanduser("~/.pd_ai_coder_history")

STYLE = Style.from_dict({
    "prompt": "#00aa88 bold",
    "info": "#888888",
    "success": "#00cc66",
    "warning": "#ccaa00",
    "error": "#cc3333",
})


# --- Display Helpers ---

class Colors:
    CYAN = "\033[36m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    RED = "\033[31m"
    DIM = "\033[2m"
    BOLD = "\033[1m"
    RESET = "\033[0m"


def info(msg: str):
    print(f"{Colors.DIM}{msg}{Colors.RESET}")


def success(msg: str):
    print(f"{Colors.GREEN}{msg}{Colors.RESET}")


def warning(msg: str):
    print(f"{Colors.YELLOW}{msg}{Colors.RESET}")


def error(msg: str):
    print(f"{Colors.RED}{msg}{Colors.RESET}")


def header(msg: str):
    print(f"\n{Colors.CYAN}{Colors.BOLD}{msg}{Colors.RESET}")


# --- Core Application ---

class PdAICoder:
    def __init__(self, patch_path: str, fudi_port: int = 3001, use_fudi: bool = True):
        self.patch_path = os.path.abspath(patch_path)
        self.patch_dir = os.path.dirname(self.patch_path)
        self.use_fudi = use_fudi

        # Ensure patch directory exists
        os.makedirs(self.patch_dir, exist_ok=True)

        # Check claude CLI availability
        self.claude_bin = shutil.which("claude")
        if not self.claude_bin:
            error("claude CLI が見つかりません。Claude Code をインストールしてください。")
            sys.exit(1)

        # Session ID for multi-turn conversation via --resume
        self.session_id: str | None = None

        # Track patch file modification time
        self.last_patch_mtime: float | None = None

        # FUDI connection (for sending messages to Pd)
        self.fudi: FUDIClient | None = None
        if use_fudi:
            self.fudi = FUDIClient(port=fudi_port)

        # File opener (always available, uses macOS 'open' command)
        self.opener = PdFileOpener(self.fudi)

    def connect_fudi(self) -> bool:
        """Try to connect to Pd via FUDI."""
        if not self.fudi:
            return False
        if self.fudi.is_connected:
            return True
        return self.fudi.connect()

    def get_current_patch(self) -> str | None:
        """Read the current patch file, checking for user edits."""
        content = read_patch(self.patch_path)
        if content:
            mtime = get_patch_mtime(self.patch_path)
            if self.last_patch_mtime and mtime and mtime > self.last_patch_mtime:
                info("📝 Pdでの手動編集を検出しました")
            self.last_patch_mtime = mtime
        return content

    def build_user_message(self, user_input: str) -> str:
        """Build the user message with current patch context."""
        parts = [user_input]

        # Include current patch if it exists
        current_patch = self.get_current_patch()
        if current_patch:
            parts.append(
                f"\n\n--- 現在のパッチ ({os.path.basename(self.patch_path)}) ---\n"
                f"{current_patch}"
            )

        return "\n".join(parts)

    def call_ai(self, user_input: str) -> str:
        """Send message to Claude via claude CLI and get response."""
        full_message = self.build_user_message(user_input)

        cmd = [
            self.claude_bin,
            "-p", full_message,
            "--system-prompt", SYSTEM_PROMPT,
            "--output-format", "json",
            "--max-turns", "1",
        ]

        # Resume existing session for multi-turn context
        if self.session_id:
            cmd += ["--resume", self.session_id]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=180,
        )

        if result.returncode != 0:
            raise RuntimeError(f"claude CLI エラー: {result.stderr.strip()}")

        try:
            data = json.loads(result.stdout)
        except json.JSONDecodeError:
            raise RuntimeError(f"JSON解析エラー。stdout: {result.stdout[:300]}")

        # Save session ID for multi-turn
        if "session_id" in data:
            self.session_id = data["session_id"]

        response_text = data.get("result", "")
        if not response_text:
            warning(f"⚠️  応答が空です (subtype: {data.get('subtype', '?')}, stop_reason: {data.get('stop_reason', '?')})")

        return response_text

    def handle_response(self, response: str) -> bool:
        """Process AI response: extract patch, save, open in Pd."""
        patch_content = extract_patch_from_response(response)

        if patch_content:
            # Save patch
            if write_patch(self.patch_path, patch_content):
                self.last_patch_mtime = get_patch_mtime(self.patch_path)
                success(f"✅ パッチ保存: {self.patch_path}")
                info(summarize_patch(patch_content))

                # Open in Plugdata/Pd (new tab each time)
                self.opener.open_patch(self.patch_path)
                success("🔊 パッチを開きました（古いタブは手動で閉じてください）")
                return True
            else:
                error("❌ パッチの保存に失敗しました")
                return False

        return False

    def display_description(self, response: str):
        """Display the description part of the response."""
        # Extract DESCRIPTION section
        lines = response.split("\n")
        in_desc = False
        in_changes = False
        desc_lines = []
        change_lines = []

        for line in lines:
            if line.startswith("DESCRIPTION:"):
                in_desc = True
                in_changes = False
                continue
            elif line.startswith("CHANGES:"):
                in_desc = False
                in_changes = True
                continue
            elif line.startswith("PATCH:"):
                break

            if in_desc:
                desc_lines.append(line)
            elif in_changes:
                change_lines.append(line)

        desc = "\n".join(desc_lines).strip()
        changes = "\n".join(change_lines).strip()

        if desc:
            header("📋 説明")
            print(desc)
        if changes:
            header("🔧 変更点")
            print(changes)

    def process_command(self, user_input: str) -> bool:
        """Process special commands. Returns True if handled."""
        cmd = user_input.strip().lower()

        if cmd in ("/quit", "/exit", "/q"):
            return True  # Signal to exit

        if cmd == "/status":
            self._show_status()
            return True

        if cmd == "/patch":
            content = self.get_current_patch()
            if content:
                print(content)
            else:
                info("パッチファイルがまだありません")
            return True

        if cmd == "/reload":
            content = self.get_current_patch()
            if content:
                info("パッチを再読み込みしました")
                info(summarize_patch(content))
            return True

        if cmd == "/open":
            self.opener.open_patch(self.patch_path)
            success("パッチを開きました")
            return True

        if cmd == "/reset":
            self.session_id = None
            success("会話履歴をリセットしました")
            return True

        if cmd.startswith("/save "):
            new_name = cmd[6:].strip()
            if not new_name.endswith(".pd"):
                new_name += ".pd"
            new_path = os.path.join(self.patch_dir, new_name)
            content = self.get_current_patch()
            if content and write_patch(new_path, content):
                success(f"パッチを保存しました: {new_path}")
            else:
                error("保存に失敗しました")
            return True

        if cmd.startswith("/load "):
            filepath = cmd[6:].strip()
            if not os.path.isabs(filepath):
                filepath = os.path.join(self.patch_dir, filepath)
            content = read_patch(filepath)
            if content:
                self.patch_path = os.path.abspath(filepath)
                self.last_patch_mtime = get_patch_mtime(filepath)
                success(f"パッチを読み込みました: {filepath}")
                info(summarize_patch(content))
            else:
                error(f"ファイルが見つかりません: {filepath}")
            return True

        if cmd == "/help":
            self._show_help()
            return True

        return False  # Not a command

    def _show_status(self):
        header("ステータス")
        info(f"パッチファイル: {self.patch_path}")

        content = self.get_current_patch()
        if content:
            info(f"パッチ状態: 存在する")
            info(summarize_patch(content))
        else:
            info(f"パッチ状態: なし")

        fudi_status = "未使用"
        if self.use_fudi:
            if self.fudi and self.fudi.is_connected:
                fudi_status = "接続中"
            else:
                fudi_status = "未接続"
        info(f"FUDI接続: {fudi_status}")
        info(f"セッション: {self.session_id or 'なし'}")

    def _show_help(self):
        header("コマンド一覧")
        commands = [
            ("/help", "このヘルプを表示"),
            ("/status", "現在の状態を表示"),
            ("/patch", "現在のパッチ内容を表示"),
            ("/reload", "Pdで保存されたパッチを再読み込み"),
            ("/open", "Pdでパッチを開き直す"),
            ("/save <name>", "パッチを別名で保存"),
            ("/load <file>", "別のパッチファイルを読み込む"),
            ("/reset", "会話履歴をリセット"),
            ("/quit", "終了"),
        ]
        for cmd, desc in commands:
            print(f"  {Colors.CYAN}{cmd:<18}{Colors.RESET} {desc}")

        header("使い方の例")
        examples = [
            "440Hzのサイン波を出力するパッチを作って",
            "FM合成で金属的なベルの音を作りたい",
            "ディレイエフェクトを追加して",
            "フィルタのカットオフにLFOをかけて",
            "もう少しアタックを鋭くして",
        ]
        for ex in examples:
            print(f"  {Colors.DIM}> {ex}{Colors.RESET}")


def main():
    parser = argparse.ArgumentParser(
        description="pd-ai-coder: AI-powered Pure Data patch development"
    )
    parser.add_argument(
        "--patch", "-p",
        default=os.path.join(DEFAULT_PATCH_DIR, DEFAULT_PATCH_NAME),
        help=f"パッチファイルのパス (default: {DEFAULT_PATCH_DIR}/{DEFAULT_PATCH_NAME})"
    )
    parser.add_argument(
        "--port",
        type=int, default=3001,
        help="Pd FUDI port (default: 3001)"
    )
    parser.add_argument(
        "--no-fudi",
        action="store_true",
        help="FUDI接続を無効にする（ファイルベースのみ）"
    )
    args = parser.parse_args()

    # Initialize
    coder = PdAICoder(
        patch_path=args.patch,
        fudi_port=args.port,
        use_fudi=not args.no_fudi,
    )

    # Banner
    print(f"""
{Colors.CYAN}{Colors.BOLD}╔══════════════════════════════════════════╗
║         pd-ai-coder v0.1.0               ║
║   AI-powered Pure Data Development       ║
╚══════════════════════════════════════════╝{Colors.RESET}
""")
    info(f"パッチファイル: {coder.patch_path}")

    # Try FUDI connection
    if coder.use_fudi:
        if coder.connect_fudi():
            success("🔌 Pdに接続しました")
        else:
            warning("⚠️  Pdに接続できません（後から接続を試みます）")
            info("   Pdで以下のパッチを開いてください: pd-ai-receiver.pd")

    info("自然言語でPdパッチの作成・修正を指示できます。 /help でコマンド一覧\n")

    # Setup prompt
    if HAS_PROMPT_TOOLKIT:
        session = PromptSession(
            history=FileHistory(HISTORY_FILE),
            style=STYLE,
        )
        def get_input():
            return session.prompt(
                HTML("<prompt>pd-ai</prompt> <info>&gt;</info> ")
            )
    else:
        def get_input():
            return input("pd-ai > ")

    # Main loop
    while True:
        try:
            user_input = get_input().strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if not user_input:
            continue

        # Check for commands
        if user_input.startswith("/"):
            if user_input.strip().lower() in ("/quit", "/exit", "/q"):
                break
            if coder.process_command(user_input):
                continue

        # Call AI
        info("🤖 考え中...")
        try:
            response = coder.call_ai(user_input)
        except Exception as e:
            error(f"API エラー: {e}")
            continue

        # Display description
        coder.display_description(response)

        # Handle patch extraction and saving
        patch_found = coder.handle_response(response)

        if not patch_found:
            # No patch in response - just show the full text
            # (might be a question or explanation)
            print()
            print(response)

        print()

    # Cleanup
    if coder.fudi:
        coder.fudi.disconnect()
    info("👋 終了します")


if __name__ == "__main__":
    main()
