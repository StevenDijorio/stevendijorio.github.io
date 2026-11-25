#!/usr/bin/env python3
"""Check routes, local assets, metadata, and package boundaries of a fresh public build."""

import argparse
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree

ORIGIN = "https://stevendijorio.com"
ARCHIVE = {"/brawl.stars.html", "/cystic_dilation_review/"}
KEY_PATTERN = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"
                         r"gh[pousr]_[A-Za-z0-9]{30,}|sk-(?:proj-)?[A-Za-z0-9]{40,}|AKIA[A-Z0-9]{16}")
ALLOWED_SUFFIXES = {".html", ".xml", ".txt", ".css", ".js", ".woff2", ".pdf", ".webp", ".png", ".jpg"}


class Document(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.attributes = []
        self.ids = []
        self.navigation = []
        self.feed(text)

    def handle_starttag(self, tag, attributes):
        fields = dict(attributes)
        self.attributes.append((tag, fields))
        if "id" in fields:
            self.ids.append(fields["id"])
        for field in ("href", "src"):
            if field in fields:
                self.navigation.append(fields[field])
        if "srcset" in fields:
            self.navigation.extend(source.strip().split()[0] for source in fields["srcset"].split(","))


def route(path):
    name = "/" + path.as_posix()
    return name.removesuffix("index.html") if path.name == "index.html" else name


def verify(root):
    errors = []
    external = set()
    documents = {}
    local = 0
    files = sorted(path for path in root.rglob("*") if path.is_file())
    pdfs = []
    for file in files:
        relative = file.relative_to(root)
        if any(name.startswith((".", "_")) for name in relative.parts):
            errors.append(f"Unexpected hidden/source output {relative}")
        if file.suffix not in ALLOWED_SUFFIXES and relative.as_posix() != "CNAME":
            errors.append(f"Unexpected public file {relative}")
        if file.suffix == ".pdf":
            pdfs.append(relative.as_posix())
            if not file.read_bytes().startswith(b"%PDF-"):
                errors.append(f"Invalid PDF header {relative}")
        if file.suffix in {".xml", ".txt", ".html", ".css", ".js"}:
            contents = file.read_text()
            if KEY_PATTERN.search(contents):
                errors.append(f"Credential-like token in {relative}")
            if file.suffix == ".html":
                documents[route(relative)] = Document(contents)

    if pdfs != ["assets/pdfs/steven-di-jorio-cv.pdf"]:
        errors.append(f"Unexpected public PDFs {pdfs}")
    sitemap = ElementTree.parse(root / "sitemap.xml").getroot()
    indexable = {node.text for node in sitemap.findall(".//{*}loc")}
    if indexable != {ORIGIN + address for address in documents if address not in ARCHIVE}:
        errors.append("Sitemap and indexable HTML routes differ")
    if f"Sitemap: {ORIGIN}/sitemap.xml" not in (root / "robots.txt").read_text():
        errors.append("Missing sitemap directive in robots.txt")

    for address, doc in documents.items():
        if len(doc.ids) != len(set(doc.ids)):
            errors.append(f"{address} contains duplicate IDs")
        if address not in ARCHIVE:
            canonical = [attrs.get("href") for tag, attrs in doc.attributes if tag == "link" and attrs.get("rel") == "canonical"]
            if canonical != [ORIGIN + address]:
                errors.append(f"{address} has incorrect canonical URL")
            for tag, name in (("name", "description"), ("property", "og:title"), ("property", "og:url"), ("property", "og:image")):
                if not any(node == "meta" and attrs.get(tag) == name and attrs.get("content") for node, attrs in doc.attributes):
                    errors.append(f"{address} missing {name}")
            if sum(tag == "h1" for tag, _ in doc.attributes) != 1:
                errors.append(f"{address} must have one h1")
        for raw in doc.navigation:
            parsed = urlsplit(raw)
            if parsed.scheme or parsed.netloc:
                external.add(raw)
                continue
            local += 1
            target = unquote(parsed.path) or address
            if not target.startswith("/"):
                target = address.rsplit("/", 1)[0] + "/" + target
            location = root / target.lstrip("/")
            if location.is_dir():
                location /= "index.html"
            if not location.is_file() or not location.resolve().is_relative_to(root):
                errors.append(f"{address} → {raw} missing or outside preview")
                continue
            canonical_target = route(location.relative_to(root))
            if parsed.fragment and canonical_target in documents and unquote(parsed.fragment) not in documents[canonical_target].ids:
                errors.append(f"{address} → {raw} references an absent anchor")
    return {"public_files": len(files), "html_routes": len(documents), "sitemap_routes": len(indexable),
            "local_references": local, "external_references": sorted(external), "public_pdfs": pdfs, "errors": errors}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("build", type=Path)
    args = parser.parse_args()
    result = verify(args.build.resolve())
    print(json.dumps(result, indent=2))
    raise SystemExit(bool(result["errors"]))
