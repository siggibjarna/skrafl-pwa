#!/usr/bin/env python3
"""Build the pinned upstream dictionary, verifying its content-addressed lock."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
from datetime import datetime, timezone
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM_SHA = "d06e67fd5d20f72fc11742b3d5124f30d85762d5"
ARCHIVE_SHA256 = "d9a84b492c088f0f0923552f261d773be26fc8af5b9a740af49b474cf92a219a"
REPOSITORY = "vthorsteinsson/Skrafl"
CACHE = ROOT / ".cache" / "upstream"
SOURCE = CACHE / f"Skrafl-{UPSTREAM_SHA}"
WORD_FILES = (
    "ordalisti.full.sorted.txt",
    "ordalisti.add.txt",
    "ordalisti.remove.txt",
)


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def download(url, destination):
    partial = destination.with_name(destination.name + ".download")
    try:
        with urlopen(url, timeout=120) as response, partial.open("wb") as stream:
            shutil.copyfileobj(response, stream)
        partial.replace(destination)
    finally:
        partial.unlink(missing_ok=True)


def ensure_upstream():
    CACHE.mkdir(parents=True, exist_ok=True)
    archive = CACHE / f"Skrafl-{UPSTREAM_SHA}.tar.gz"
    if not archive.exists():
        download(
            f"https://codeload.github.com/{REPOSITORY}/tar.gz/{UPSTREAM_SHA}",
            archive,
        )
    if digest(archive) != ARCHIVE_SHA256:
        raise RuntimeError(f"Upstream archive checksum mismatch: {archive}")
    # Re-extract verified source on every run; never trust mutable cached Python.
    with tarfile.open(archive, "r:gz") as bundle:
        members = bundle.getmembers()
        for member in members:
            parts = Path(member.name).parts
            if (
                not parts
                or parts[0] != SOURCE.name
                or ".." in parts
                or Path(member.name).is_absolute()
                or not (member.isfile() or member.isdir())
            ):
                raise RuntimeError(f"Unsafe upstream archive entry: {member.name}")
            destination = CACHE / member.name
            if destination.is_symlink() or any(
                parent.is_symlink()
                for parent in destination.parents
                if parent != CACHE.parent
            ):
                raise RuntimeError(f"Unsafe cached source path: {destination}")
        bundle.extractall(CACHE, members=members, filter="data")
    for name in WORD_FILES:
        path = SOURCE / "resources" / name
        with path.open("rb") as stream:
            prefix = stream.read(1024)
        if prefix.startswith(b"version https://git-lfs.github.com/spec/v1"):
            fields = dict(line.split(" ", 1) for line in prefix.decode().splitlines())
            expected = fields["oid"].removeprefix("sha256:")
            expected_size = int(fields["size"])
            download(
                f"https://media.githubusercontent.com/media/{REPOSITORY}/{UPSTREAM_SHA}/resources/{name}",
                path,
            )
            if digest(path) != expected or path.stat().st_size != expected_size:
                path.unlink()
                raise RuntimeError(f"LFS object checksum/size mismatch: {name}")
    return SOURCE


def publish(source, directory):
    sha256 = digest(source)
    directory.mkdir(parents=True, exist_ok=True)
    filename = f"ordalisti.{sha256}.text.dawg"
    shutil.copyfile(source, directory / filename)
    manifest = {"file": filename, "sha256": sha256, "bytes": source.stat().st_size}
    (directory / "dict-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def main():
    source = ensure_upstream()
    subprocess.run(
        [sys.executable, "-c", "from dawgbuilder import run_skrafl; run_skrafl()"],
        cwd=source,
        check=True,
        env={**os.environ, "PYTHONHASHSEED": "0"},
    )
    dictionary = source / "resources" / "ordalisti.text.dawg"
    metadata = {
        "upstreamSha": UPSTREAM_SHA,
        "sha256": digest(dictionary),
        "bytes": dictionary.stat().st_size,
    }
    lock_path = ROOT / "dictionary.lock.json"
    if os.environ.get("UPDATE_DICTIONARY_LOCK") == "1":
        metadata["builtAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        lock_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    else:
        if not lock_path.exists():
            raise RuntimeError("Missing dictionary.lock.json; set UPDATE_DICTIONARY_LOCK=1 to create it")
        locked = json.loads(lock_path.read_text(encoding="utf-8"))
        if any(locked.get(key) != value for key, value in metadata.items()):
            raise RuntimeError(
                "Dictionary differs from dictionary.lock.json; review upstream changes "
                "before setting UPDATE_DICTIONARY_LOCK=1"
            )
    manifest = publish(dictionary, ROOT / "public" / "dict")
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()
