#!/usr/bin/env python3
"""Build the pinned upstream dictionary, verifying its content-addressed lock."""

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
from datetime import datetime, timezone
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
PINNED_UPSTREAM_SHA = "d06e67fd5d20f72fc11742b3d5124f30d85762d5"
ARCHIVE_SHA256 = "d9a84b492c088f0f0923552f261d773be26fc8af5b9a740af49b474cf92a219a"
REPOSITORY = "vthorsteinsson/Skrafl"
CACHE = ROOT / ".cache" / "upstream"


def upstream_revision():
    lock_path = ROOT / "dictionary.lock.json"
    locked = (
        json.loads(lock_path.read_text(encoding="utf-8"))["upstreamSha"]
        if lock_path.exists()
        else PINNED_UPSTREAM_SHA
    )
    candidate = os.environ.get("UPSTREAM_SHA")
    if candidate is not None and os.environ.get("UPDATE_DICTIONARY_LOCK") != "1":
        raise RuntimeError("UPSTREAM_SHA requires UPDATE_DICTIONARY_LOCK=1")
    revision = candidate if candidate is not None else locked
    if not isinstance(revision, str) or not re.fullmatch("[0-9a-f]{40}", revision):
        raise RuntimeError("Upstream revision must be a full lowercase 40-hex commit SHA")
    return revision


UPSTREAM_SHA = upstream_revision()
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
    checksum_path = archive.with_name(archive.name + ".sha256")
    expected_checksum = (
        ARCHIVE_SHA256
        if UPSTREAM_SHA == PINNED_UPSTREAM_SHA
        else checksum_path.read_text(encoding="ascii").strip()
        if checksum_path.exists()
        else None
    )
    if not archive.exists() or expected_checksum is None:
        download(
            f"https://codeload.github.com/{REPOSITORY}/tar.gz/{UPSTREAM_SHA}",
            archive,
        )
        if expected_checksum is None:
            # A new revision is fetched over HTTPS, then cache-locked independently.
            expected_checksum = digest(archive)
            checksum_path.write_text(expected_checksum + "\n", encoding="ascii")
    if digest(archive) != expected_checksum:
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
    manifest = {"file": filename, "sha256": sha256, "bytes": source.stat().st_size}
    staged_dictionary = directory / (filename + ".publish")
    staged_manifest = directory / "dict-manifest.json.publish"
    try:
        shutil.copyfile(source, staged_dictionary)
        if (
            staged_dictionary.stat().st_size != manifest["bytes"]
            or digest(staged_dictionary) != sha256
        ):
            raise RuntimeError("Dictionary changed while publishing")
        staged_dictionary.replace(directory / filename)
        staged_manifest.write_text(
            json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
        )
        staged_manifest.replace(directory / "dict-manifest.json")
        for previous in directory.glob("ordalisti.*.text.dawg"):
            if previous.name != filename and previous.is_file():
                previous.unlink()
    finally:
        staged_dictionary.unlink(missing_ok=True)
        staged_manifest.unlink(missing_ok=True)
    return manifest


def main():
    lock_path = ROOT / "dictionary.lock.json"
    update = os.environ.get("UPDATE_DICTIONARY_LOCK") == "1"
    if not update and not lock_path.exists():
        raise RuntimeError("Missing dictionary.lock.json; set UPDATE_DICTIONARY_LOCK=1 to create it")
    locked = json.loads(lock_path.read_text(encoding="utf-8")) if lock_path.exists() else None
    if not update and (
        not isinstance(locked.get("sha256"), str)
        or not re.fullmatch("[0-9a-f]{64}", locked["sha256"])
        or not isinstance(locked.get("bytes"), int)
        or locked["bytes"] <= 0
    ):
        raise RuntimeError("Invalid dictionary checksum or byte count in dictionary.lock.json")
    source = ensure_upstream()
    dictionary = source / "resources" / "ordalisti.text.dawg"
    cached = None
    if not update:
        candidates = (
            dictionary,
            ROOT / "public" / "dict" / f"ordalisti.{locked['sha256']}.text.dawg",
        )
        cached = next(
            (
                path for path in candidates
                if path.is_file()
                and path.stat().st_size == locked["bytes"]
                and digest(path) == locked["sha256"]
            ),
            None,
        )
    if cached is not None:
        if cached != dictionary:
            shutil.copyfile(cached, dictionary)
        # Wordbase must load the hash-verified text, never an unchecked cached pickle.
        dictionary.with_name("ordalisti.dawg.pickle").unlink(missing_ok=True)
        print("Reusing dictionary cache verified against dictionary.lock.json")
    else:
        subprocess.run(
            [sys.executable, "dawgbuilder.py"],
            cwd=source,
            check=True,
            env={**os.environ, "PYTHONHASHSEED": "0"},
        )
    metadata = {
        "upstreamSha": UPSTREAM_SHA,
        "sha256": digest(dictionary),
        "bytes": dictionary.stat().st_size,
    }
    if update:
        metadata["builtAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        lock_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    else:
        if any(locked.get(key) != value for key, value in metadata.items()):
            raise RuntimeError(
                "Dictionary differs from dictionary.lock.json; review upstream changes "
                "before setting UPDATE_DICTIONARY_LOCK=1"
            )
    manifest = publish(dictionary, ROOT / "public" / "dict")
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()
