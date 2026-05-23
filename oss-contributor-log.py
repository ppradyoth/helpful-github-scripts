#!/usr/bin/env python3
"""Manage the OSS contribution log at ~/.oss-contributor/log.json."""
import json, sys
from pathlib import Path
from datetime import date

LOG_DIR = Path.home() / ".oss-contributor"
LOG_FILE = LOG_DIR / "log.json"

def init_log():
    LOG_DIR.mkdir(exist_ok=True)
    if not LOG_FILE.exists():
        LOG_FILE.write_text("[]")
        print(f"Created log at {LOG_FILE}")
    else:
        print(f"Log exists at {LOG_FILE}")

def read_log():
    return json.loads(LOG_FILE.read_text()) if LOG_FILE.exists() else []

def append_entry(entry):
    log = read_log()
    log.append(entry)
    LOG_FILE.write_text(json.dumps(log, indent=2))
    print(f"Logged: {entry['repo']}#{entry['issue_number']} — {entry['status']}")

def is_attempted(repo, issue_number):
    return any(e["repo"] == repo and e["issue_number"] == issue_number for e in read_log())

def show_log():
    log = read_log()
    if not log:
        print("No contributions logged yet.")
        return
    for e in log:
        icon = {"pr_opened": "✓", "skipped": "–", "abandoned": "✗"}.get(e.get("status", ""), "?")
        print(f"{icon} [{e.get('date','?')}] {e['repo']}#{e['issue_number']} — {e.get('issue_title','')}")
        if e.get("pr_url"):   print(f"    PR:   {e['pr_url']}")
        if e.get("fork_url"): print(f"    Fork: {e['fork_url']}")

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "init"
    if cmd == "init":   init_log()
    elif cmd == "show": show_log()
    elif cmd == "check":
        repo, issue = sys.argv[2], int(sys.argv[3])
        if is_attempted(repo, issue):
            print(f"ALREADY_ATTEMPTED: {repo}#{issue}"); sys.exit(1)
        else:
            print(f"NOT_ATTEMPTED: {repo}#{issue}"); sys.exit(0)
    elif cmd == "add":
        entry = json.loads(sys.argv[2])
        entry.setdefault("date", date.today().isoformat())
        append_entry(entry)
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr); sys.exit(1)
