# Add your deal

The easiest way: fill in the form at [boltai.com/blackfriday/submit](https://boltai.com/blackfriday/submit). It opens GitHub with your deal file ready; click **Propose changes**, then **Create pull request**.

Or by hand:

1. Fork this repo.
2. Copy `deals/_template.json.example` to `deals/your-app-name.json` (lowercase, dashes).
3. Fill it in and open a pull request. One file per app, nothing else in the diff.

A bot reviews every pull request within a minute, comments with anything to fix, and labels it **ready** or **needs changes**. You don't need to touch `README.md`; it is rebuilt after merging.

## Fields

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | App name |
| `url` | yes | The page where the Black Friday price is shown. No shortened links. |
| `platforms` | yes | Any of `macOS`, `iOS`, `iPadOS`, `visionOS`, `watchOS` |
| `category` | yes | An `id` from [categories.json](categories.json) |
| `description` | yes | What the app does, up to 160 characters |
| `discount` | yes | The headline, up to 30 characters: `40% off`, `Lifetime $49` |
| `code` | no | Discount code, if one is needed |
| `prices` | no | `[{ "plan": "Pro", "before": 49, "after": 29 }]` in USD |
| `terms` | no | Anything a buyer needs to know, up to 160 characters |
| `starts` | no | `2026-11-27`; November or later |
| `ends` | yes | `2026-12-01`; between Nov 20 and Dec 15 |
| `maker` | yes | Your name or company |
| `makerUrl` | no | Your site or X profile |
| `icon` | no | https link to a square app icon (256 px or more) |

## What gets merged

This is a curated list. Deals are merged when they are:

- For an app that runs on Mac, iPhone, iPad, Apple Vision Pro or Apple Watch, and is finished and maintained.
- A real Black Friday price: shown on the linked page with the discount and the dates.
- Open to everyone: no "follow us to get the code", no waitlists, pre-orders, or "free while in beta".
- One entry per app, and at most three apps per maker.

Not accepted: courses, books, templates, boilerplates, bundles or links to other deal lists.

## Featured spots

A small number of paid featured spots sit at the top of [boltai.com/blackfriday](https://boltai.com/blackfriday), with a highlighted card. Details are coming soon.
