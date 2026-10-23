"""Synthetic social-media dataset generator.

Simulates the launch of a fictional phone ("Nova X5") over 14 days, so the
whole pipeline (cleaning, sentiment, trends, anomalies, benchmarks) can be
demonstrated without depending on any external API.

Built-in storyline (so the dashboard has something real to discover):
  * Day 0-1 : launch spike, mostly positive (camera, design).
  * Day 6+  : a software update causes battery-drain and heating complaints,
              so "battery" becomes an emerging, increasingly negative topic.
The data also contains ~2% duplicates (reposts) and ~0.5% empty posts so
the preprocessing step has real work to do.
"""
import csv
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

PRODUCTS = [("Nova X5", 0.62), ("Nova X5 Pro", 0.28), ("Nova Buds", 0.10)]
PLATFORMS = ["twitter", "reddit", "youtube", "instagram", "store_review"]

POS = {
    "camera": ["the camera quality is amazing", "night mode photos look stunning",
               "portrait shots are incredibly sharp", "video stabilisation is super smooth",
               "the zoom lens is honestly impressive", "colors in photos are so natural"],
    "battery": ["battery easily lasts two days", "fast charging is a lifesaver",
                "battery life is excellent", "charges to full in forty minutes"],
    "price": ["excellent value for the price", "great phone for this price",
              "worth every rupee", "pricing is very fair for these specs"],
    "performance": ["performance is blazing fast", "gaming runs smooth with zero lag",
                    "apps open instantly", "the processor handles everything easily"],
    "display": ["the display is gorgeous", "screen brightness is perfect outdoors",
                "the 120hz screen feels buttery", "display colors are vibrant"],
    "design": ["the design looks premium", "love the matte finish", "it feels light and sleek",
               "build quality is solid"],
    "delivery": ["delivery was quick", "packaging was neat and secure", "customer support was very helpful"],
    "audio": ["speakers are loud and clear", "sound quality is rich", "call audio is crisp"],
    "heating": ["it stays cool even while gaming", "no heating issues at all"],
}
NEG = {
    "camera": ["the camera is disappointing in low light", "photos look washed out",
               "the camera app keeps crashing", "video quality is grainy"],
    "battery": ["battery drains very quickly", "battery barely lasts half a day",
                "after the update the battery dies so fast", "standby drain is terrible",
                "charging is painfully slow now", "battery health dropped in a week"],
    "price": ["way too expensive for what you get", "overpriced compared to rivals",
              "not worth the money", "the price hike is ridiculous"],
    "performance": ["the phone lags a lot", "apps keep freezing", "performance is sluggish",
                    "games stutter constantly"],
    "display": ["the screen has a green tint", "display is too dim outside", "touch response is laggy"],
    "design": ["it feels cheap and plasticky", "the phone is too heavy", "the camera bump is ugly"],
    "delivery": ["delivery was delayed by a week", "customer support never replied",
                 "received a damaged box", "the refund process is a nightmare"],
    "audio": ["speaker crackles at high volume", "call audio is muffled"],
    "heating": ["the device overheats during gaming", "it gets really hot while charging",
                "heating issue after the update is awful"],
}
NEU = [
    "the phone was released yesterday", "just ordered the {p}", "unboxing the {p} today",
    "does anyone know if the {p} supports wireless charging", "the {p} comes in three colors",
    "comparing the {p} with my old phone", "the {p} update is rolling out this week",
    "which variant of the {p} should i buy", "the {p} is available in stores now",
    "watching a review of the {p}", "the {p} has a 6.7 inch screen", "got the {p} delivered today",
]
OPENERS_POS = ["", "", "honestly ", "wow ", "so happy ", "loving it ", "10/10 ", "really impressed, "]
OPENERS_NEG = ["", "", "ugh ", "seriously ", "very disappointed, ", "not happy ", "warning: "]
CONTRAST = {"positive": " but {neg}", "negative": " but {pos}"}
CONTEXT = ["after {n} days of use", "{n} hours in", "coming from an older phone", "bought it for my {who}",
           "got it on sale", "using it for {n} weeks now", "as a daily driver", "for college", "for work calls",
           "compared to my last phone", "in this heat", "on my commute", "after the first charge",
           "my {who} agrees", "first impressions", "long term review", "update {n}", "in {city}",
           "on day {n}", "for {n}k", "after {n} games of bgmi", "while travelling", "honest opinion"]
WHO = ["dad", "mom", "sister", "brother", "wife", "husband", "friend", "son", "daughter", "team"]
CITIES = ["mysuru", "bengaluru", "chennai", "mumbai", "delhi", "pune", "hyderabad", "kochi", "jaipur", "kolkata"]
TAGS_POS = ["#NovaX5", "#TechLove", "#CameraKing", "#NovaLaunch", "#Unboxing"]
TAGS_NEG = ["#NovaX5", "#BatteryDrain", "#Overheating", "#FixItNova", "#NovaUpdate"]
TAGS_NEU = ["#NovaX5", "#NovaLaunch", "#Tech", "#Smartphone"]

ASPECT_W = {"camera": .20, "battery": .15, "price": .12, "performance": .15, "display": .10,
            "design": .10, "delivery": .07, "audio": .06, "heating": .05}
DAY_VOLUME = [1.9, 1.5, 1.1, 0.9, 0.85, 0.8, 1.0, 1.35, 1.25, 1.1, 1.0, 0.95, 0.9, 0.9]


def _pick(weights: dict, rnd: random.Random) -> str:
    r, acc = rnd.random() * sum(weights.values()), 0.0
    for k, w in weights.items():
        acc += w
        if r <= acc:
            return k
    return k


def _sentence(sentiment, day, product, rnd):
    if sentiment == "neutral":
        text = rnd.choice(NEU).format(p=product)
        tags = TAGS_NEU
        aspect = None
    else:
        aw = dict(ASPECT_W)
        if day >= 6:  # the software update storyline
            aw["battery"] = .32 if sentiment == "negative" else .08
            aw["heating"] = .12 if sentiment == "negative" else .03
        aspect = _pick(aw, rnd)
        bank, opener, tags = (POS, OPENERS_POS, TAGS_POS) if sentiment == "positive" else (NEG, OPENERS_NEG, TAGS_NEG)
        text = rnd.choice(opener) + rnd.choice(bank[aspect])
        r = rnd.random()
        if r < 0.22:  # second clause, same polarity
            a2 = _pick(ASPECT_W, rnd)
            text += " and " + rnd.choice(bank[a2])
        elif r < 0.30:  # mixed opinion
            other = NEG if sentiment == "positive" else POS
            a2 = _pick(ASPECT_W, rnd)
            text += CONTRAST[sentiment].format(neg=rnd.choice(other[a2]), pos=rnd.choice(other[a2]))
        if rnd.random() < 0.35:
            text += f" on the {product}"
    if rnd.random() < 0.75:
        ctx = rnd.choice(CONTEXT).format(n=rnd.randint(2, 60), who=rnd.choice(WHO), city=rnd.choice(CITIES))
        text = f"{ctx}, {text}" if rnd.random() < 0.4 else f"{text}, {ctx}"
    if rnd.random() < 0.55:
        text += " " + " ".join(rnd.sample(tags, k=rnd.randint(1, 2)))
    if rnd.random() < 0.08:
        text += " https://nova.example/x5"
    if rnd.random() < 0.10:
        text = "@NovaMobile " + text
    if rnd.random() < 0.5:
        text = text[0].upper() + text[1:]
    if rnd.random() < 0.3:
        text += "!" if sentiment != "neutral" else "?"
    return text, aspect


def _rating(sentiment, rnd):
    base = {"positive": rnd.choice([4, 5, 5]), "negative": rnd.choice([1, 1, 2]), "neutral": 3}[sentiment]
    if rnd.random() < 0.07:  # human inconsistency
        base = max(1, min(5, base + rnd.choice([-1, 1])))
    return base


def generate(path: Path, rows: int = 50_000, seed: int = 42, start: datetime | None = None) -> Path:
    rnd = random.Random(seed)
    start = start or (datetime.now(timezone.utc) - timedelta(days=14)).replace(hour=0, minute=0, second=0, microsecond=0)
    total_w = sum(DAY_VOLUME)
    recent_texts: list[str] = []
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["post_id", "timestamp", "platform", "product", "text", "rating", "hashtags", "user"])
        n = 0
        for day, vol in enumerate(DAY_VOLUME):
            day_rows = rows - n if day == len(DAY_VOLUME) - 1 else int(rows * vol / total_w)
            # Sentiment mix drifts negative after the day-6 update
            if day < 6:
                p_pos, p_neg = 0.58, 0.24
            elif day == 7:          # update day: complaint spike
                p_pos, p_neg = 0.36, 0.50
            else:
                p_pos, p_neg = 0.50 - 0.01 * (day - 6), 0.32 + 0.01 * (day - 6)
            for _ in range(day_rows):
                n += 1
                r = rnd.random()
                sentiment = "positive" if r < p_pos else "negative" if r < p_pos + p_neg else "neutral"
                product = _pick(dict(PRODUCTS), rnd)
                if recent_texts and rnd.random() < 0.02:
                    text = rnd.choice(recent_texts)  # repost / duplicate
                elif rnd.random() < 0.005:
                    text = ""                          # missing content
                else:
                    text, _ = _sentence(sentiment, day, product, rnd)
                    if len(recent_texts) < 500:
                        recent_texts.append(text)
                    elif rnd.random() < 0.1:
                        recent_texts[rnd.randrange(500)] = text
                ts = start + timedelta(days=day, seconds=rnd.randint(0, 86_399))
                tags = " ".join(t for t in text.split() if t.startswith("#"))
                w.writerow([f"p{n:08d}", ts.strftime("%Y-%m-%d %H:%M:%S"), rnd.choice(PLATFORMS),
                            product, text, _rating(sentiment, rnd), tags, f"user{rnd.randint(1, rows // 3 + 1)}"])
    return path
