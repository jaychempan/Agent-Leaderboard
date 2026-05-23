"""
fetch_utils.py — shared utilities for all fetch_*.py scripts
  - load_token()    : read GitHub token from .config or env
  - gh_get()        : HTTP GET with retry + rate-limit backoff
  - search_repos()  : paginated GitHub search (up to max_pages × per_page)
"""
import json, os, sys, time
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError
from urllib.parse import quote

_CONFIG_PATH = os.path.join(os.path.dirname(__file__), '.config')


def load_token(cli_token: str = '') -> str:
    """Return token: CLI arg > .config file > GITHUB_TOKEN env var."""
    if cli_token:
        return cli_token
    if os.path.exists(_CONFIG_PATH):
        for line in open(_CONFIG_PATH, encoding='utf-8'):
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                key, _, val = line.partition('=')
                if key.strip().upper() in ('GITHUB_TOKEN', 'TOKEN'):
                    return val.strip()
    return os.environ.get('GITHUB_TOKEN') or os.environ.get('GH_TOKEN', '')


def gh_get(url: str, token: str, retries: int = 4) -> dict:
    """GET with exponential-backoff retry and rate-limit awareness."""
    headers = {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'skills-tracker/2.0',
        'X-GitHub-Api-Version': '2022-11-28',
    }
    if token:
        headers['Authorization'] = f'Bearer {token}'

    for attempt in range(retries):
        req = Request(url, headers=headers)
        try:
            with urlopen(req, timeout=20) as r:
                remaining = int(r.headers.get('X-RateLimit-Remaining', 999))
                reset_at  = int(r.headers.get('X-RateLimit-Reset', 0))
                if remaining < 5:
                    wait = max(reset_at - time.time() + 3, 1)
                    print(f'  ⏳ Rate limit low ({remaining} left) — waiting {wait:.0f}s …',
                          file=sys.stderr)
                    time.sleep(wait)
                return json.loads(r.read())

        except HTTPError as e:
            body = e.read().decode(errors='replace')
            if e.code == 401:
                print(f'❌ GitHub token 无效或已过期 (401 Unauthorized)。'
                      f'\n   请检查 GH_TOKEN secret 是否过期并重新生成。', file=sys.stderr)
                sys.exit(1)
            if e.code in (403, 429):
                reset_at = int(e.headers.get('X-RateLimit-Reset', time.time() + 60))
                wait = max(reset_at - time.time() + 3, 10)
                print(f'  ⚠️  HTTP {e.code} rate-limited — waiting {wait:.0f}s '
                      f'(attempt {attempt+1}/{retries}) …', file=sys.stderr)
                time.sleep(wait)
                if attempt < retries - 1:
                    continue
            print(f'  ✗ HTTP {e.code}: {body[:200]}', file=sys.stderr)
            raise

        except URLError as e:
            wait = 2 ** attempt
            print(f'  ⚠️  Network error ({e.reason}) — retry in {wait}s …', file=sys.stderr)
            if attempt < retries - 1:
                time.sleep(wait)
                continue
            raise

    raise RuntimeError(f'Failed after {retries} attempts: {url}')


def search_repos(query: str, token: str,
                 per_page: int = 100, max_pages: int = 5,
                 min_stars: int = 0) -> list:
    """
    Paginated GitHub repo search sorted by stars desc.
    Stops early when a page comes back with fewer than per_page items.
    Filters out repos below min_stars on the fly (useful when GitHub
    returns borderline results near the stars: filter boundary).
    """
    results = []
    for page in range(1, max_pages + 1):
        url = (f'https://api.github.com/search/repositories'
               f'?q={quote(query)}&sort=stars&order=desc'
               f'&per_page={per_page}&page={page}')
        try:
            data = gh_get(url, token)
        except Exception as e:
            print(f'  ✗ search failed (page {page}): {e}', file=sys.stderr)
            break

        items = data.get('items', [])
        # filter stars
        if min_stars:
            items = [i for i in items if i.get('stargazers_count', 0) >= min_stars]
        results.extend(items)

        # stop if we've seen all results or hit the bottom of the stars range
        total_count = data.get('total_count', 0)
        if len(items) < per_page or len(results) >= total_count:
            break

        time.sleep(1.5)   # stay under 30 req/min Search API limit

    return results
