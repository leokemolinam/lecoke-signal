"""Construye el snapshot de recomendaciones y precios para signal / dig crate."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import html
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist" / "data" / "recommendations.json"
USER_AGENT = "signal-lecoke/2.0 (+personal DJ digging dashboard)"
LIMIT_PER_GENRE = 8


BEATPORT = {
    "house": [
        (1, "So Fly", "Extended", "Riton, Kid Enigma, RUZE", "Ministry of Sound Recordings", 131, "D Min", "4:10", 1.69),
        (2, "The Boss", "Extended Mix", "James Brown, Elvis Guetta", "Defected", 128, "F Min", "5:52", 1.69),
        (3, "Feel The Power", "Extended Mix", "IDEMI", "Rendezvous Sound", 132, "Db Min", "5:41", 2.49),
        (4, "Not Over Yet", "Grace, Paul Oakenfold vs. Julian Fijma — Extended", "Paul Oakenfold, Grace, Julian Fijma", "Atlantic Records UK", 132, "Db Min", "6:25", 1.69),
        (5, "Fancy Footwork", "Extended Mix", "Chromeo, Chris Lorenzo", "Turbo Blanco", 130, "F Min", "4:40", 1.69),
        (6, "H.O.U.S.E", "Extended Mix", "Snoop Dogg, HUGEL", "Make The Girls Dance Records", 128, "E Maj", "5:00", 2.49),
    ],
    "techno": [
        (1, "Dārin", "Original Mix", "Phil Berg", "Mutual Rytm", 142, "Ab Min", "5:52", 1.49),
        (2, "Force Majeure", "Original Mix", "Chlär, Primal Instinct Records", "Primal Instinct", 142, "E Maj", "4:57", 1.69),
        (3, "Burning Sky", "Original Mix", "Chlär, Primal Instinct Records", "Primal Instinct", 141, "G Min", "5:04", 1.69),
        (4, "Wisdom To The Wise", "Joris Voorn Remix", "Dave Clarke, Joris Voorn", "Spectrum (NL)", 137, "E Min", "4:51", 1.69),
        (5, "Silver Skin", "Original Mix", "Chlär, Primal Instinct Records", "Primal Instinct", 141, "B Min", "5:43", 1.69),
        (6, "Whisper", "Original Mix", "Alaricø", "Klockworks", 141, "B Min", "6:09", 1.69),
        (7, "Pull the Trigger", "Original Mix", "Klaps (BE)", "Get In Line", 148, "G Min", "7:49", 1.49),
        (8, "Threshold State", "Original Mix", "Lewis Fautzi", "Mutual Rytm", 138, "E Min", "5:07", 1.69),
    ],
}


def request_text(url: str, payload: dict | None = None) -> str:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.8"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read().decode("utf-8", errors="replace")


def discover_url(item: dict) -> str:
    hints = item.get("url_hints") or {}
    host = hints.get("custom_domain") if hints.get("custom_domain_verified") else ""
    if not host:
        host = f"{hints.get('subdomain') or 'bandcamp'}.bandcamp.com"
    item_type = "album" if (hints.get("item_type") or item.get("type")) == "a" else "track"
    slug = hints.get("slug") or ""
    return f"https://{host}/{item_type}/{slug}"


def find_offer(node: object) -> tuple[float | None, str | None]:
    if isinstance(node, dict):
        offers = node.get("offers")
        candidates = offers if isinstance(offers, list) else [offers] if offers else []
        for offer in candidates:
            if not isinstance(offer, dict):
                continue
            raw_price = offer.get("price") or offer.get("lowPrice")
            currency = offer.get("priceCurrency")
            try:
                if raw_price is not None and currency:
                    return float(raw_price), str(currency).upper()
            except (TypeError, ValueError):
                pass
        for value in node.values():
            price, currency = find_offer(value)
            if price is not None:
                return price, currency
    elif isinstance(node, list):
        for value in node:
            price, currency = find_offer(value)
            if price is not None:
                return price, currency
    return None, None


def fetch_bandcamp_price(item: dict, url: str) -> tuple[float | None, str | None]:
    mobile_url = (
        "https://bandcamp.com/api/mobile/24/tralbum_details?"
        + urllib.parse.urlencode(
            {
                "band_id": item.get("band_id"),
                "tralbum_type": item.get("type") or "a",
                "tralbum_id": item.get("id"),
            }
        )
    )
    try:
        details = json.loads(request_text(mobile_url))
        if details.get("price") is not None and details.get("currency"):
            return float(details["price"]), str(details["currency"]).upper()
    except Exception:
        pass

    source = request_text(url)
    for match in re.finditer(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        source,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        try:
            payload = json.loads(html.unescape(match.group(1)).strip())
        except (json.JSONDecodeError, TypeError):
            continue
        price, currency = find_offer(payload)
        if price is not None:
            return price, currency

    match = re.search(r'data-tralbum="([^"]+)"', source)
    if match:
        try:
            tralbum = json.loads(html.unescape(match.group(1)))
            current = tralbum.get("current") or {}
            raw_price = current.get("minimum_price") or current.get("price")
            currency_match = re.search(r'data-band-currency="([A-Z]{3})"', source)
            if raw_price is not None:
                return float(raw_price), currency_match.group(1) if currency_match else "USD"
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
    return None, None


def fetch_bandcamp_genre(tag: str) -> list[dict]:
    response = json.loads(
        request_text(
            "https://bandcamp.com/api/discover/3/get_web",
            {"p": 0, "s": "top", "g": "electronic", "t": tag},
        )
    )
    items = response.get("items", [])[:LIMIT_PER_GENRE]
    recommendations = []
    for rank, item in enumerate(items, 1):
        item_type = item.get("type") or "a"
        item_id = item.get("id")
        featured = item.get("featured_track") or {}
        player_type = "album" if item_type == "a" else "track"
        recommendations.append(
            {
                "id": f"bandcamp-{tag}-{item_type}{item_id}",
                "store": "bandcamp",
                "genre": tag,
                "rank": rank,
                "bandId": item.get("band_id"),
                "itemId": item_id,
                "itemType": item_type,
                "featuredTrackId": featured.get("id"),
                "title": item.get("primary_text") or featured.get("title") or "Sin título",
                "artist": item.get("secondary_text") or "Bandcamp",
                "mix": featured.get("title") or "",
                "label": "",
                "location": item.get("location_text") or "",
                "artwork": f"https://f4.bcbits.com/img/a{item.get('art_id')}_10.jpg" if item.get("art_id") else "",
                "url": discover_url(item),
                "embedUrl": (
                    f"https://bandcamp.com/EmbeddedPlayer/{player_type}={item_id}/"
                    "size=large/bgcol=121212/linkcol=e9ff5b/tracklist=true/"
                    "artwork=small/transparent=true/"
                ),
                "price": None,
                "currency": None,
                "bpm": None,
                "key": "",
                "duration": featured.get("duration") or None,
                "popularityLabel": "Discover · best-selling",
                "priceBasis": "precio del lanzamiento",
            }
        )

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(fetch_bandcamp_price, source, compacted["url"]): compacted
            for source, compacted in zip(items, recommendations)
        }
        for future in as_completed(futures):
            item = futures[future]
            try:
                item["price"], item["currency"] = future.result()
            except Exception as error:  # La recomendación sigue siendo útil si falla un precio.
                item["priceError"] = str(error)
    return recommendations


def beatport_items(tag: str) -> list[dict]:
    chart_url = (
        "https://www.beatport.com/genre/house/5/top-100"
        if tag == "house"
        else "https://www.beatport.com/genre/techno-raw-deep-hypnotic/92/top-100"
    )
    items = []
    for rank, title, mix, artist, label, bpm, key, duration, price in BEATPORT[tag]:
        query = urllib.parse.quote_plus(f"{title} {artist}")
        items.append(
            {
                "id": f"beatport-{tag}-{rank}-{re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')}",
                "store": "beatport",
                "genre": tag,
                "rank": rank,
                "title": title,
                "artist": artist,
                "mix": mix,
                "label": label,
                "location": "",
                "artwork": "",
                "url": f"https://www.beatport.com/search?q={query}",
                "chartUrl": chart_url,
                "embedUrl": "",
                "price": price,
                "currency": "USD",
                "bpm": bpm,
                "key": key,
                "duration": duration,
                "popularityLabel": "Top 100 · ventas/descargas",
                "priceBasis": "precio de la pista",
            }
        )
    return items


def main() -> None:
    bandcamp = []
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {executor.submit(fetch_bandcamp_genre, tag): tag for tag in ("house", "techno")}
        for future in as_completed(futures):
            bandcamp.extend(future.result())
    bandcamp.sort(key=lambda item: (item["genre"], item["rank"]))

    beatport = beatport_items("house") + beatport_items("techno")
    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "methodology": {
            "bandcamp": "Orden público Discover con señal top/best-selling; Bandcamp no publica conteos exactos de descargas.",
            "beatport": "Snapshot de los rankings oficiales Top 100 por género, con BPM, tonalidad y precio público.",
            "prices": "Los precios se muestran en la moneda publicada por cada tienda y no incluyen impuestos ni conversión.",
        },
        "items": bandcamp + beatport,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    priced = sum(item.get("price") is not None for item in payload["items"])
    print(f"{len(payload['items'])} recomendaciones, {priced} con precio -> {OUTPUT}")


if __name__ == "__main__":
    main()
