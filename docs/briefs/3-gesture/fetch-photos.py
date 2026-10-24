"""Fetch the photos this brief was tried with, from Wikimedia Commons, into
workspace/images/gesture-test/, with each photo's author and licence in its
manifest.json (the gesture tab's "a photo" route lists them from there).

    python3 docs/briefs/3-gesture/fetch-photos.py

14 photos: 8 raised fists and 6 thumbs-up, all different people. They are
for trying the photo route without a camera; your own hand in front of your
own camera makes a much better training set (see the README). Commons asks
for a few seconds between downloads, so this takes about a minute. Only the
standard library.
"""

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

UA = {"user-agent": "VariableMachine-brief/0.2 (class tool; photos for a gesture test)"}
API = "https://commons.wikimedia.org/w/api.php?"
OUT = "workspace/images/gesture-test"
PHOTOS = {
    "fist": [
        "File:Raised Fist 01 by notwist.jpg",
        "File:Raised Fist 03 by notwist.jpg",
        "File:Raised Fist 04 by notwist.jpg",
        "File:Raised Fist 05 by notwist.jpg",
        "File:Raised Fist 2011.jpg",
        "File:Raised Fist, Hultsfred 2008.jpg",
        "File:Clenched fist.jpg",
        "File:Raised Fist 02 by notwist.jpg",
    ],
    "thumbs": [
        "File:Thumb up.JPG",
        "File:Thumbs Up.JPG",
        "File:Thumbs up.jpg",
        "File:Senior thumbs up.jpg",
        "File:Stubb thumbs up 7-8 Nov. 2018.jpg",
        "File:Gesture thumb up then down forefinger.jpg",
    ],
}


def get(url: str) -> bytes:
    for wait in (10, 20, 30, 40):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(wait)  # too many requests: Commons asks us to slow down
    raise SystemExit(f"Commons kept refusing {url}; try again in a few minutes")


def main():
    os.makedirs(OUT, exist_ok=True)
    credits = []
    for label, titles in PHOTOS.items():
        for i, title in enumerate(titles, 1):
            q = urllib.parse.urlencode({"action": "query", "titles": title, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 800, "format": "json"})
            page = next(iter(json.loads(get(API + q))["query"]["pages"].values()))
            if "imageinfo" not in page:
                print(f"  missing on Commons now: {title}")
                continue
            info, file = page["imageinfo"][0], f"{label}-{i}.jpg"
            meta = info["extmetadata"]
            if not os.path.exists(f"{OUT}/{file}"):
                open(f"{OUT}/{file}", "wb").write(get(info["thumburl"]))
                time.sleep(3)
            credits.append({
                "file": file,
                "title": title,
                "author": re.sub(r"<[^>]+>", "", meta.get("Artist", {}).get("value", "")).strip(),
                "license": meta.get("LicenseShortName", {}).get("value", ""),
                "url": info.get("descriptionurl", ""),
            })
            print(f"  {file}  {credits[-1]['license']}")
    manifest = {
        "name": "gesture-test",
        "kind": "images",
        "created": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        "license": "Wikimedia Commons, various (each photo's in credits)",
        "about": "Raised fists and thumbs-up, all different people, for trying the gesture tab's photo route.",
        "inputs": [c["file"] for c in credits],
        "credits": credits,
    }
    json.dump(manifest, open(f"{OUT}/manifest.json", "w"), indent=2)
    print(f"{len(credits)} photos in {OUT}")


if __name__ == "__main__":
    main()
