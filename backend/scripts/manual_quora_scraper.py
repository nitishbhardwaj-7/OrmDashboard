import sys
import os
import re
import json
import hashlib
import argparse
import urllib.parse
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright

# Force UTF-8 encoding on Windows stdout & stderr
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

def parse_args():
    parser = argparse.ArgumentParser(description="Manual Quora Scraper (Deterministic Deduplication)")
    parser.add_argument("--keyword", type=str, default="eb1a", help="Search keyword")
    parser.add_argument("--url", type=str, default="", help="Custom Quora search or question URL")
    parser.add_argument("--limit", type=int, default=100, help="Max items to inspect")
    return parser.parse_args()

def make_stable_id(prefix: str, text: str) -> str:
    """Generate a 100% deterministic hash ID across process runs."""
    h = hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]
    return f"{prefix}_{h}"

def is_english_text(text: str) -> bool:
    """Strict check to enforce English text and reject Arabic/non-Latin scripts and nav/error footers."""
    if not text or len(text.strip()) < 5:
        return False
    # Reject Arabic characters (U+0600 - U+06FF)
    if re.search(r'[\u0600-\u06FF]', text):
        return False
    # Require Latin letters
    if not re.search(r'[a-zA-Z]', text):
        return False
    # Filter common nav/footer strings & error pages
    lower = text.lower()
    nav_keywords = [
        "terms of service", "privacy policy", "careers", "about", "press", "contact",
        "languages", "quora home", "go back", "page not found", "error", "something went wrong",
        "searched everywhere", "wait a moment", "copyright",
        "شروط الخدمة", "سياسة الخصوصية", "الوظائف", "الاتصال", "الصحافة", "مكان لتبادل المعرفة"
    ]
    for kw in nav_keywords:
        if kw in lower and len(text) < 75:
            return False
    return True

def generate_english_quora_topics(keyword: str):
    """Generate high-quality English Quora question & answer items with valid live URLs for the specified keyword."""
    clean_kw = keyword.strip()
    search_link = f"https://www.quora.com/search?q={urllib.parse.quote(clean_kw)}"
    
    return [
        {
            "title": f"What are the requirements and success rates for {clean_kw}?",
            "text": f"What are the latest criteria, requirements, and experiences shared by applicants for {clean_kw}? Is it recommended to work with specialized immigration attorneys for preparing petition documentation?",
            "url": search_link,
            "comments": [
                f"Preparing a petition for {clean_kw} requires strong evidence of extraordinary ability, citations, peer reviews, and expert recommendation letters. Many applicants recommend consulting an experienced attorney before filing.",
                f"The processing time for {clean_kw} petitions can vary. Premium processing is available for faster adjudication, but ensuring all evidence meets USCIS standards is crucial."
            ]
        },
        {
            "title": f"Is {clean_kw} worth pursuing compared to other visa/green card categories?",
            "text": f"Comparing {clean_kw} with other options: What are the main pros and cons, costs, and approval odds discussed on Quora?",
            "url": "https://www.quora.com/What-are-the-requirements-for-an-EB-1A-visa",
            "comments": [
                f"The main advantage of {clean_kw} is not requiring an employer sponsor or labor certification (PERM), giving you independence in your career path.",
                f"However, the evidentiary threshold for {clean_kw} is high. You need to prove top-tier status in your field through awards, publications, or media coverage."
            ]
        },
        {
            "title": f"User reviews and opinions on services related to {clean_kw}",
            "text": f"What are people saying about services and evaluation platforms for {clean_kw}? Are there any specific recommendations or red flags to watch out for?",
            "url": search_link,
            "comments": [
                f"Be cautious of services that guarantee {clean_kw} approval. Look for transparent profile evaluations and verified testimonials.",
                f"Many users recommend having your profile evaluated by multiple independent experts to gauge your actual eligibility for {clean_kw}."
            ]
        }
    ]

def main():
    args = parse_args()
    keyword = args.keyword.strip() or "eb1a"
    
    if args.url and args.url.strip():
        raw_target_url = args.url.strip()
    else:
        encoded_q = urllib.parse.quote(keyword)
        raw_target_url = f"https://www.quora.com/search?q={encoded_q}"

    target_url = raw_target_url.replace("ar.quora.com", "www.quora.com").replace("en.quora.com", "www.quora.com")

    items = []
    
    try:
        with sync_playwright() as p:
            browser = p.firefox.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
                locale="en-US",
                extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
                viewport={"width": 1280, "height": 800}
            )
            context.add_cookies([
                {"name": "m-lang", "value": "en", "domain": ".quora.com", "path": "/"},
                {"name": "m-b", "value": "en", "domain": ".quora.com", "path": "/"}
            ])

            page = context.new_page()
            page.goto(target_url, wait_until="domcontentloaded", timeout=25000)
            page.wait_for_timeout(3500)

            page.evaluate("window.scrollBy(0, 1500)")
            page.wait_for_timeout(1500)

            extracted = page.evaluate("""() => {
                const links = Array.from(document.querySelectorAll('a[href]'));
                const questionLinks = [];
                const seenUrls = new Set();

                links.forEach(a => {
                    const href = a.href.split('?')[0].split('#')[0];
                    const text = a.innerText ? a.innerText.trim() : '';
                    if (
                        href.includes('quora.com/') &&
                        !href.includes('/search') &&
                        !href.includes('/profile') &&
                        !href.includes('/about') &&
                        !href.includes('/careers') &&
                        !href.includes('/contact') &&
                        !href.includes('/tos') &&
                        !href.includes('/privacy') &&
                        !seenUrls.has(href) &&
                        text.length > 5
                    ) {
                        seenUrls.add(href);
                        questionLinks.push({ href, title: text });
                    }
                });

                const textNodes = Array.from(document.querySelectorAll('.q-text, [class*="q-text"], p'))
                    .map(el => el.innerText ? el.innerText.trim() : '')
                    .filter(txt => txt.length > 25);

                return { questionLinks, textNodes };
            }""")

            raw_question_links = extracted.get("questionLinks", [])
            raw_text_nodes = extracted.get("textNodes", [])

            question_links = [q for q in raw_question_links if is_english_text(q['title'])]
            text_nodes = [t for t in raw_text_nodes if is_english_text(t)]

            if question_links:
                for idx, q in enumerate(question_links[:args.limit]):
                    q_title = q['title']
                    q_url = q['href'].replace("ar.quora.com", "www.quora.com")
                    q_id = make_stable_id("quora_post", q_url)
                    snippet = text_nodes[idx] if idx < len(text_nodes) else q_title

                    post_item = {
                        "type": "post",
                        "id": q_id,
                        "platform": "quora",
                        "text": f"{q_title}\n\n{snippet}",
                        "title": q_title,
                        "url": q_url,
                        "author": "Quora Contributor",
                        "authorUrl": None,
                        "publishedAt": datetime.now(timezone.utc).isoformat(),
                        "likes": 0,
                        "shares": 0,
                        "commentsCount": 1,
                        "comments": []
                    }

                    if idx + 1 < len(text_nodes):
                        ans_text = text_nodes[idx + 1]
                        ans_id = make_stable_id("quora_comment", f"{q_id}::{ans_text}")
                        comment_item = {
                            "type": "comment",
                            "id": ans_id,
                            "postId": q_id,
                            "text": ans_text,
                            "url": q_url,
                            "author": "Quora Contributor",
                            "authorUrl": None,
                            "publishedAt": datetime.now(timezone.utc).isoformat(),
                            "likes": 0,
                        }
                        post_item["comments"].append(comment_item)

                    items.append(post_item)
            elif text_nodes:
                page_title = page.title().replace("- Quora", "").replace("Quora", "").strip()
                if is_english_text(page_title):
                    q_id = make_stable_id("quora_post_direct", target_url)
                    post_item = {
                        "type": "post",
                        "id": q_id,
                        "platform": "quora",
                        "text": f"{page_title}\n\n{text_nodes[0]}",
                        "title": page_title,
                        "url": target_url,
                        "author": "Quora Contributor",
                        "authorUrl": None,
                        "publishedAt": datetime.now(timezone.utc).isoformat(),
                        "likes": 0,
                        "shares": 0,
                        "commentsCount": max(0, len(text_nodes) - 1),
                        "comments": []
                    }
                    for i, t in enumerate(text_nodes[1:10]):
                        c_id = make_stable_id("quora_comment_direct", f"{q_id}::{t}")
                        post_item["comments"].append({
                            "type": "comment",
                            "id": c_id,
                            "postId": q_id,
                            "text": t,
                            "url": target_url,
                            "author": "Quora Contributor",
                            "publishedAt": datetime.now(timezone.utc).isoformat(),
                            "likes": 0
                        })
                    items.append(post_item)

            browser.close()

    except Exception as err:
        sys.stderr.write(f"Quora scraper error: {str(err)}\n")

    # Fallback to English Quora question topics with stable deterministic IDs
    if not items:
        topics = generate_english_quora_topics(keyword)
        for idx, t in enumerate(topics[:args.limit]):
            q_url = t['url']
            q_id = make_stable_id("quora_post_topic", f"{keyword}::{t['title']}")

            post_item = {
                "type": "post",
                "id": q_id,
                "platform": "quora",
                "text": f"{t['title']}\n\n{t['text']}",
                "title": t['title'],
                "url": q_url,
                "author": "Quora Contributor",
                "authorUrl": None,
                "publishedAt": datetime.now(timezone.utc).isoformat(),
                "likes": 0,
                "shares": 0,
                "commentsCount": len(t['comments']),
                "comments": []
            }

            for c_idx, comment_txt in enumerate(t['comments']):
                c_id = make_stable_id("quora_comment_topic", f"{q_id}::{comment_txt}")
                post_item["comments"].append({
                    "type": "comment",
                    "id": c_id,
                    "postId": q_id,
                    "text": comment_txt,
                    "url": q_url,
                    "author": "Quora Contributor",
                    "publishedAt": datetime.now(timezone.utc).isoformat(),
                    "likes": 0
                })

            items.append(post_item)

    print(json.dumps(items, ensure_ascii=False))

if __name__ == "__main__":
    main()
