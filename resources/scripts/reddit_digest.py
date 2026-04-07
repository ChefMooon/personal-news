import argparse
import datetime as dt
import json
import sqlite3
import sys
import time
from typing import Any, Dict, List
from urllib import error, parse, request


USER_AGENT = "personal-news-digest/1.0"
DEFAULT_LIMIT = 25
DEFAULT_TIME_WINDOW = "week"
DEFAULT_WEEK_START = 1
SETTINGS_KEY = "reddit_digest_subreddits"


def eprint(message: str) -> None:
	print(message, file=sys.stderr, flush=True)


def load_subreddits(conn: sqlite3.Connection) -> List[str]:
	row = conn.execute("SELECT value FROM settings WHERE key = ?", (SETTINGS_KEY,)).fetchone()
	if row is None or row[0] is None:
		return []

	try:
		parsed = json.loads(row[0])
	except json.JSONDecodeError as exc:
		raise RuntimeError("reddit_digest_subreddits is not valid JSON") from exc

	if not isinstance(parsed, list):
		raise RuntimeError("reddit_digest_subreddits must be a JSON array")

	results: List[str] = []
	for value in parsed:
		if isinstance(value, str):
			normalized = value.strip().lower()
			if normalized and normalized not in results:
				results.append(normalized)
	return results


def parse_subreddits_arg(raw_value: str) -> List[str]:
	results: List[str] = []
	for value in raw_value.split(","):
		normalized = value.strip().lower()
		if normalized and normalized not in results:
			results.append(normalized)
	return results


def fetch_top_posts(subreddit: str, time_window: str, limit: int) -> List[Dict[str, Any]]:
	params = parse.urlencode({"t": time_window, "limit": str(limit)})
	url = f"https://www.reddit.com/r/{subreddit}/top.json?{params}"
	req = request.Request(url, headers={"User-Agent": USER_AGENT})
	with request.urlopen(req, timeout=15) as response:
		charset = response.headers.get_content_charset() or "utf-8"
		payload = json.loads(response.read().decode(charset))
	return payload.get("data", {}).get("children", [])


def get_week_start_date(week_start_day: int, timestamp: int | None = None) -> str:
	if week_start_day not in (0, 1):
		raise RuntimeError("week_start must be 0 (Sunday) or 1 (Monday)")

	anchor = dt.datetime.fromtimestamp(timestamp or time.time(), tz=dt.timezone.utc).date()
	python_weekday = anchor.weekday()
	if week_start_day == 1:
		days_since_start = python_weekday
	else:
		days_since_start = (python_weekday + 1) % 7
	return (anchor - dt.timedelta(days=days_since_start)).isoformat()


def normalize_post(subreddit: str, child: Dict[str, Any], week_start_date: str) -> Dict[str, Any]:
	data = child.get("data", {})
	now = int(time.time())
	permalink = data.get("permalink") or ""
	if permalink and not str(permalink).startswith("http"):
	  permalink = f"https://www.reddit.com{permalink}"

	return {
		"post_id": str(data.get("id", "")).strip(),
		"week_start_date": week_start_date,
		"subreddit": subreddit,
		"title": str(data.get("title", "")).strip(),
		"url": str(data.get("url", "")).strip() or permalink,
		"permalink": str(permalink).strip(),
		"author": data.get("author") if isinstance(data.get("author"), str) else None,
		"score": int(data["score"]) if isinstance(data.get("score"), int) else None,
		"num_comments": int(data["num_comments"]) if isinstance(data.get("num_comments"), int) else None,
		"created_utc": int(data.get("created_utc", now)),
		"fetched_at": now,
	}


def validate_posts(posts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
	valid: List[Dict[str, Any]] = []
	for post in posts:
		if not post["post_id"] or not post["title"] or not post["url"] or not post["permalink"]:
			continue
		valid.append(post)
	return valid


def main() -> int:
	parser = argparse.ArgumentParser(description="Fetch top Reddit posts for configured subreddits.")
	parser.add_argument("--db-path", required=True, help="Absolute path to the Personal News SQLite database.")
	parser.add_argument("--time-window", default=DEFAULT_TIME_WINDOW, choices=["day", "week", "month", "year", "all"])
	parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
	parser.add_argument("--week-start", type=int, default=DEFAULT_WEEK_START, choices=[0, 1])
	parser.add_argument("--subreddits", help="Comma-separated subreddit subset for one-off syncs.")
	args = parser.parse_args()

	conn = sqlite3.connect(args.db_path)
	try:
		subreddits = parse_subreddits_arg(args.subreddits) if args.subreddits else load_subreddits(conn)
		if not subreddits:
			raise RuntimeError("No Reddit Digest subreddits are configured yet.")

		week_start_date = get_week_start_date(args.week_start)
		posts: List[Dict[str, Any]] = []
		for subreddit in subreddits:
			eprint(f"Fetching r/{subreddit}...")
			try:
				children = fetch_top_posts(subreddit, args.time_window, args.limit)
			except error.HTTPError as exc:
				raise RuntimeError(f"Reddit returned HTTP {exc.code} for r/{subreddit}") from exc
			except error.URLError as exc:
				raise RuntimeError(f"Network error while fetching r/{subreddit}: {exc.reason}") from exc

			posts.extend(validate_posts([normalize_post(subreddit, child, week_start_date) for child in children]))
			time.sleep(1)

		payload = {
			"generated_at": int(time.time()),
			"week_start_date": week_start_date,
			"subreddits": subreddits,
			"posts": posts,
		}
		print(json.dumps(payload), flush=True)
		return 0
	except Exception as exc:  # noqa: BLE001
		eprint(str(exc))
		return 1
	finally:
		conn.close()


if __name__ == "__main__":
	raise SystemExit(main())
