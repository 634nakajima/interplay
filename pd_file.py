"""
Pure Data .pd file parser and utilities.
Reads .pd files so the AI can understand user-edited patches.
"""

import os
import re


def read_patch(filepath: str) -> str | None:
    """Read a .pd file and return its contents."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return f.read()
    except (FileNotFoundError, UnicodeDecodeError):
        return None


def write_patch(filepath: str, content: str) -> bool:
    """Write .pd content to a file."""
    try:
        os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        return True
    except OSError:
        return False


def _clean_pd_content(raw: str) -> str | None:
    """Keep only valid Pd lines (#N, #X) from raw text."""
    lines = []
    for line in raw.strip().split("\n"):
        stripped = line.strip()
        if stripped.startswith(("#N ", "#X ")):
            lines.append(stripped)
        elif lines:
            # Stop at the first non-Pd line after we've started collecting
            break
    if lines and lines[0].startswith("#N canvas"):
        return "\n".join(lines)
    return None


def extract_patch_from_response(response: str) -> str | None:
    """
    Extract .pd file content from AI response.
    Looks for content between PATCH: marker and the end,
    or content in ```pd ... ``` code blocks.
    """
    # Try PATCH: marker first
    match = re.search(r"PATCH:\s*\n(.*)", response, re.DOTALL)
    if match:
        patch_text = match.group(1).strip()
        # Remove any markdown code block markers
        patch_text = re.sub(r"```\s*$", "", patch_text).strip()
        patch_text = re.sub(r"^```(?:pd)?\s*\n?", "", patch_text).strip()
        result = _clean_pd_content(patch_text)
        if result:
            return result

    # Try code block with pd marker
    match = re.search(r"```pd\s*\n(.*?)```", response, re.DOTALL)
    if match:
        result = _clean_pd_content(match.group(1))
        if result:
            return result

    # Try generic code block containing Pd content
    for match in re.finditer(r"```\s*\n(.*?)```", response, re.DOTALL):
        result = _clean_pd_content(match.group(1))
        if result:
            return result

    # Try to find raw Pd content (starts with #N canvas)
    result = _clean_pd_content(response)
    if result:
        return result

    return None


def summarize_patch(content: str) -> str:
    """
    Create a brief summary of a .pd patch for display.
    """
    lines = content.strip().split("\n")
    objects = []
    connections = 0
    comments = []

    for line in lines:
        line = line.strip().rstrip(";")
        if line.startswith("#X obj"):
            parts = line.split()
            if len(parts) >= 5:
                obj_name = parts[4]
                obj_args = " ".join(parts[5:]) if len(parts) > 5 else ""
                objects.append(f"{obj_name} {obj_args}".strip())
        elif line.startswith("#X connect"):
            connections += 1
        elif line.startswith("#X text"):
            parts = line.split(None, 4)
            if len(parts) >= 5:
                comments.append(parts[4])

    summary_parts = []
    summary_parts.append(f"オブジェクト数: {len(objects)}, 接続数: {connections}")

    if objects:
        # Show unique object types
        unique = []
        seen = set()
        for o in objects:
            name = o.split()[0]
            if name not in seen:
                seen.add(name)
                unique.append(name)
        summary_parts.append(f"使用オブジェクト: {', '.join(unique[:15])}")
        if len(unique) > 15:
            summary_parts[-1] += f" 他{len(unique)-15}個"

    return "\n".join(summary_parts)


def get_patch_mtime(filepath: str) -> float | None:
    """Get the modification time of a patch file."""
    try:
        return os.path.getmtime(filepath)
    except OSError:
        return None
