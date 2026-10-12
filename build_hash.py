"""Rename built assets to name.<content hash>.ext and rewrite references.

GitHub Pages sends Cache-Control: max-age=600 and keeps the same URLs.
A new index.html was then paired with cached round-1 CSS. The hash is the
file plus every asset it reaches, so a changed module also renames its importers.
"""
import hashlib
import os
import re

HASH_LEN = 8
ASSET_EXT = {".css", ".js", ".svg", ".png", ".webp", ".jpg", ".jpeg", ".woff2", ".json"}
TEXT_EXT = {".html", ".css", ".js", ".svg"}
HASHED_NAME = re.compile(r"^.+\.[0-9a-f]{%d}\.[^.]+$" % HASH_LEN)


def short_hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:HASH_LEN]


def published_data(dest):
    matches = []
    for name in os.listdir(dest):
        if re.fullmatch(r"data\.[0-9a-f]{%d}\.json" % HASH_LEN, name):
            matches.append(os.path.join(dest, name))
    if len(matches) != 1:
        raise SystemExit(f"expected one hashed data catalog in {dest}, found {matches}")
    return matches[0]


def _rel(root, path):
    return os.path.relpath(path, root).replace(os.sep, "/")


def _hashed_rel(rel, digest):
    directory, name = os.path.split(rel)
    stem, ext = os.path.splitext(name)
    renamed = f"{stem}.{digest}{ext}"
    return f"{directory}/{renamed}" if directory else renamed


def _assets(dest):
    found = {}
    for dirpath, dirnames, filenames in os.walk(dest):
        dirnames[:] = [name for name in dirnames if name != "__pycache__"]
        for name in filenames:
            if HASHED_NAME.match(name) or os.path.splitext(name)[1].lower() not in ASSET_EXT:
                continue
            path = os.path.join(dirpath, name)
            with open(path, "rb") as handle:
                found[_rel(dest, path)] = handle.read()
    return found


def _forms(asset_rel, file_rel):
    file_dir = os.path.dirname(file_rel) or "."
    rel_from = os.path.relpath(asset_rel, file_dir).replace(os.sep, "/")
    forms = []
    for form in (asset_rel, rel_from):
        if form not in forms:
            forms.append(form)
    return forms


def _deps(file_rel, text, assets):
    found = set()
    for asset_rel in assets:
        if asset_rel == file_rel:
            continue
        for form in _forms(asset_rel, file_rel):
            if re.search(r"(?<![\w.-])" + re.escape(form) + r"(?![0-9A-Za-z_-])", text):
                found.add(asset_rel)
                break
    return found


def _closure(rel, deps, seen=None):
    seen = set() if seen is None else seen
    if rel in seen:
        return seen
    seen.add(rel)
    for dep in deps.get(rel, ()):
        _closure(dep, deps, seen)
    return seen


def _rewrite(text, file_rel, mapping):
    file_dir = os.path.dirname(file_rel) or "."
    pairs = []
    seen = set()
    for asset_rel, hashed_rel in mapping.items():
        hashed_from = os.path.relpath(hashed_rel, file_dir).replace(os.sep, "/")
        for old in _forms(asset_rel, file_rel):
            new = hashed_rel if old == asset_rel else hashed_from
            if old in seen or old == new:
                continue
            seen.add(old)
            pairs.append((old, new))
    pairs.sort(key=lambda item: len(item[0]), reverse=True)
    for old, new in pairs:
        text = re.sub(
            r"(?<![\w.-])" + re.escape(old) + r"(?![0-9A-Za-z_-])",
            lambda _match, new=new: new,
            text,
        )
    return text


def _text_files(dest):
    found = []
    for dirpath, dirnames, filenames in os.walk(dest):
        dirnames[:] = [name for name in dirnames if name != "__pycache__"]
        for name in filenames:
            if os.path.splitext(name)[1].lower() not in TEXT_EXT or HASHED_NAME.match(name):
                continue
            path = os.path.join(dirpath, name)
            found.append(_rel(dest, path))
    return found


def _drop_stale(dest, rel, new_rel):
    directory = os.path.dirname(os.path.join(dest, rel))
    stem, ext = os.path.splitext(os.path.basename(rel))
    pattern = re.compile(r"^" + re.escape(stem) + r"\.[0-9a-f]{%d}" % HASH_LEN + re.escape(ext) + r"$")
    keep = os.path.basename(new_rel)
    for name in os.listdir(directory):
        if name != keep and pattern.match(name):
            os.remove(os.path.join(directory, name))


def stamp_assets(dest):
    assets = _assets(dest)
    texts = {}
    for rel in _text_files(dest):
        path = os.path.join(dest, rel)
        with open(path, encoding="utf-8") as handle:
            texts[rel] = handle.read()
    raw = {rel: hashlib.sha256(blob).hexdigest() for rel, blob in assets.items()}
    deps = {}
    for rel, blob in assets.items():
        if os.path.splitext(rel)[1].lower() not in TEXT_EXT:
            deps[rel] = set()
            continue
        deps[rel] = _deps(rel, texts.get(rel, blob.decode("utf-8", "replace")), assets)
    mapping = {}
    for rel in assets:
        members = sorted(_closure(rel, deps))
        payload = "\n".join(f"{item} {raw[item]}" for item in members)
        mapping[rel] = _hashed_rel(rel, short_hash(payload))
    for rel, text in texts.items():
        rewritten = _rewrite(text, rel, mapping)
        if rewritten != text:
            with open(os.path.join(dest, rel), "w", encoding="utf-8") as handle:
                handle.write(rewritten)
    for rel, hashed_rel in mapping.items():
        source = os.path.join(dest, rel)
        target = os.path.join(dest, hashed_rel)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        os.replace(source, target)
        _drop_stale(dest, rel, hashed_rel)
    return mapping
