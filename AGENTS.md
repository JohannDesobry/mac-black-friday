# For AI agents: adding a deal

This repo lists Black Friday deals on Mac, iPhone and iPad apps. Each deal is one JSON file in `deals/`. If a person asks you to add their app's deal, do this:

1. Open the deal page they give you and read the app name, what it does, the Black Friday offer, the prices and the end date.
2. Write `deals/<app-name>.json` (lowercase, dashes) in the format below. Leave out any optional field you can't confirm from the page. Never invent prices or dates.
3. If you can use git and the GitHub CLI (`gh`): fork this repo, add the file on a new branch, and open a pull request titled `Add <App name> (Black Friday 2026)`. Change nothing else. Otherwise, give the person the JSON and this link to open the pull request in the browser: https://boltai.com/blackfriday/submit

A bot reviews the pull request within a minute and comments if anything needs fixing.

## Format

```json
{
  "name": "Your App",
  "url": "https://yourapp.com/pricing",
  "platforms": ["macOS", "iOS"],
  "category": "productivity",
  "discount": "40% off",
  "description": "What the app does, in one sentence.",
  "code": "BLACKFRIDAY",
  "prices": [{ "plan": "Lifetime", "before": 49, "after": 29 }],
  "ends": "2026-12-01"
}
```

Required: `name`, `url`, `platforms`, `category`, `discount`, `ends`. Everything else is optional.

- `url`: the app's own page that shows the Black Friday price. https, no shortened links.
- `platforms`: any of `macOS`, `iOS`, `iPadOS`, `visionOS`, `watchOS`.
- `category`: an `id` from [categories.json](categories.json); use `other` if unsure.
- `discount`: the headline, up to 30 characters, like `40% off` or `Lifetime $29`.
- `description`: up to 160 characters.
- `prices`: USD numbers; `before` must be higher than `after`. Leave out `before` if the page doesn't show it.
- `ends`: `YYYY-MM-DD`, between 2026-11-20 and 2026-12-15. Use `2026-12-01` if the page gives no end date.
- Optional too: `starts` (November or later), `terms` (up to 160 characters), `makerUrl`, `icon` (https link to a square icon).
- Never set `featured`; maintainers set it for paid spots.

Only finished Mac and iOS apps with a real Black Friday price shown on their own page are merged. See [CONTRIBUTING.md](CONTRIBUTING.md).
