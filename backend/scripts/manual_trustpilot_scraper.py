import sys
import os
import re
import json
import hashlib
import argparse
import urllib.parse
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright

# Force UTF-8 output on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

def parse_args():
    parser = argparse.ArgumentParser(description="Manual Trustpilot Scraper (Deterministic Deduplication)")
    parser.add_argument("--keyword", type=str, default="eb1aexperts.com", help="Domain or keyword to search/review")
    parser.add_argument("--url", type=str, default="", help="Custom Trustpilot review page URL")
    parser.add_argument("--limit", type=int, default=100, help="Max reviews to inspect")
    return parser.parse_args()

def make_stable_id(prefix: str, text: str) -> str:
    """Generate 100% deterministic hash ID across runs."""
    h = hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]
    return f"{prefix}_{h}"

def clean_review_text(title: str, text: str) -> str:
    """Clean duplicate title/text repetition and nav footers."""
    clean_title = (title or "").strip()
    clean_text = (text or "").strip()

    if clean_title and clean_text.startswith(clean_title):
        full_text = clean_text
    elif clean_title and clean_text and clean_title not in clean_text:
        full_text = f"{clean_title}\n\n{clean_text}"
    else:
        full_text = clean_text or clean_title

    # Remove repeated snippet headers like "Verified" or "Unprompted review" suffix
    full_text = re.sub(r'\s+(Unprompted review|Verified)\s*$', '', full_text, flags=re.IGNORECASE)
    return full_text.strip()

def main():
    args = parse_args()
    keyword = args.keyword.strip() or "eb1aexperts.com"

    if args.url and args.url.strip():
        target_url = args.url.strip()
    else:
        clean_kw = keyword.replace("https://", "").replace("http://", "").replace("www.trustpilot.com/review/", "").strip("/")
        target_url = f"https://www.trustpilot.com/review/{clean_kw}"

    items = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                locale="en-US",
                viewport={"width": 1280, "height": 800}
            )
            page = context.new_page()

            page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(3500)

            # Scroll down to load all available reviews
            page.evaluate("window.scrollBy(0, 1500)")
            page.wait_for_timeout(1500)

            extracted_reviews = page.evaluate("""() => {
                const results = [];
                const seenUrls = new Set();
                const cards = document.querySelectorAll('article, [data-service-review-card="true"], div[class*="styles_reviewCard"]');

                cards.forEach(card => {
                    const linkEl = card.querySelector('a[href*="/reviews/"]');
                    if (!linkEl) return;

                    const reviewUrl = linkEl.href.split('?')[0].split('#')[0];
                    if (seenUrls.has(reviewUrl)) return;
                    seenUrls.add(reviewUrl);

                    // Author name
                    const authorEl = card.querySelector('[data-consumer-name-typography], [class*="consumerName"], font, span');
                    const author = authorEl ? authorEl.innerText.trim() : 'Trustpilot Customer';

                    // Title
                    const titleEl = card.querySelector('h2, [data-service-review-title-typography], [class*="reviewTitle"]');
                    const title = titleEl ? titleEl.innerText.trim() : '';

                    // Main Review Text
                    const textEl = card.querySelector('[data-service-review-text-typography], p[class*="reviewText"], [class*="styles_reviewContent"]');
                    const text = textEl ? textEl.innerText.trim() : title;

                    // Star rating (1 to 5)
                    const imgEl = card.querySelector('img[alt*="star"], [data-service-review-rating]');
                    let rating = 5;
                    if (imgEl && imgEl.alt) {
                        const match = imgEl.alt.match(/(\\d+)\\s*out of/i);
                        if (match) rating = parseInt(match[1], 10);
                    }

                    // Date
                    const timeEl = card.querySelector('time');
                    const dateStr = timeEl ? timeEl.getAttribute('datetime') || timeEl.innerText.trim() : null;

                    if (title || text) {
                        results.push({
                            author,
                            title,
                            text,
                            rating,
                            url: reviewUrl,
                            dateStr
                        });
                    }
                });

                return results;
            }""")

            for idx, r in enumerate(extracted_reviews[:args.limit]):
                r_url = r['url']
                r_id = make_stable_id("tp_review", r_url)
                r_text = clean_review_text(r['title'], r['text'])
                r_author = r['author'] or "Trustpilot Customer"

                # Parse date if available
                pub_date = datetime.now(timezone.utc).isoformat()
                if r['dateStr']:
                    try:
                        pub_date = datetime.fromisoformat(r['dateStr'].replace('Z', '+00:00')).isoformat()
                    except Exception:
                        pass

                post_item = {
                    "type": "post",
                    "id": r_id,
                    "platform": "trustpilot",
                    "text": r_text,
                    "title": r['title'] or f"Trustpilot review for {keyword}",
                    "url": r_url,
                    "author": r_author,
                    "authorUrl": None,
                    "publishedAt": pub_date,
                    "likes": r['rating'],
                    "shares": 0,
                    "commentsCount": 0,
                    "comments": []
                }

                items.append(post_item)

            browser.close()

    except Exception as err:
        sys.stderr.write(f"Trustpilot scraper error: {str(err)}\n")

    print(json.dumps(items, ensure_ascii=False))

if __name__ == "__main__":
    main()
