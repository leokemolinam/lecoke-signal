"""Importa la colección pública de un fan de Bandcamp para la app estática."""

from __future__ import annotations

import html
import json
import re
import sys
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist" / "data" / "bandcamp.json"
USER_AGENT = "signal-lecoke/1.0 (+personal music library)"


def request_json(url: str, payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"User-Agent": USER_AGENT}
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))


def load_profile(username: str) -> dict:
    request = urllib.request.Request(
        f"https://bandcamp.com/{username}", headers={"User-Agent": USER_AGENT}
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        source = response.read().decode("utf-8")
    match = re.search(r'<div id="pagedata" data-blob="([^"]+)"', source)
    if not match:
        raise RuntimeError("Bandcamp no expuso el bloque público pagedata")
    return json.loads(html.unescape(match.group(1)))


def fetch_all(profile: dict, kind: str) -> list[dict]:
    data_key = f"{kind}_data"
    cache = profile["item_cache"][kind]
    section = profile[data_key]
    sequence = section.get("sequence") or section.get("pending_sequence") or []
    items = [cache[key] for key in sequence if key in cache]
    token = section.get("last_token")
    endpoint = f"https://bandcamp.com/api/fancollection/1/{kind}_items"

    while token:
        page = request_json(
            endpoint,
            {
                "fan_id": profile["fan_data"]["fan_id"],
                "older_than_token": token,
                "count": 100,
            },
        )
        items.extend(page.get("items", []))
        if not page.get("more_available"):
            break
        next_token = page.get("last_token")
        if not next_token or next_token == token:
            break
        token = next_token
    unique = []
    seen = set()
    for item in items:
        key = (item.get("tralbum_type") or item.get("item_type"), item.get("tralbum_id") or item.get("item_id"))
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def compact(item: dict, source: str) -> dict:
    tralbum_type = item.get("tralbum_type") or ("a" if item.get("item_type") == "album" else "t")
    tralbum_id = item.get("tralbum_id") or item.get("item_id")
    player_type = "album" if tralbum_type == "a" else "track"
    art = item.get("item_art") or {}
    artwork = item.get("item_art_url") or art.get("url") or art.get("thumb_url") or ""
    embed_url = (
        f"https://bandcamp.com/EmbeddedPlayer/{player_type}={tralbum_id}/"
        "size=large/bgcol=11141c/linkcol=ff4d61/tracklist=true/"
        "artwork=small/transparent=true/"
    )
    return {
        "id": f"{tralbum_type}{tralbum_id}",
        "source": source,
        "itemType": "album" if tralbum_type == "a" else "track",
        "title": item.get("item_title") or item.get("album_title") or item.get("featured_track_title") or "Sin título",
        "artist": item.get("band_name") or item.get("label") or "Bandcamp",
        "album": item.get("album_title") or item.get("item_title") or "",
        "featuredTrack": item.get("featured_track_title") or "",
        "artwork": artwork,
        "url": item.get("item_url") or item.get("band_url") or "",
        "embedUrl": embed_url,
        "streamableTracks": item.get("num_streamable_tracks") or 0,
        "duration": item.get("featured_track_duration") or 0,
        "added": item.get("added") or item.get("purchased") or "",
        "purchased": bool(item.get("purchased")),
    }


def main() -> None:
    username = sys.argv[1] if len(sys.argv) > 1 else "okefm"
    profile = load_profile(username)
    collection = fetch_all(profile, "collection")
    wishlist = fetch_all(profile, "wishlist")
    fan = profile["fan_data"]
    payload = {
        "profile": {
            "username": fan["username"],
            "name": fan.get("name") or fan["username"],
            "url": fan["trackpipe_url"],
            "location": fan.get("location") or "",
            "favoriteGenre": fan.get("fav_genre") or "",
            "collectionCount": len(collection),
            "wishlistCount": len(wishlist),
            "followingBands": fan.get("following_bands_count") or 0,
        },
        "collection": [compact(item, "collection") for item in collection],
        "wishlist": [compact(item, "wishlist") for item in wishlist],
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(collection)} collection + {len(wishlist)} wishlist -> {OUTPUT}")


if __name__ == "__main__":
    main()
