# Spirit Keep — approved Superdesign mockups

Approved by the user on 2026-10-21. Canvas:
https://superdesign.dev/teams/58a3a644-0c38-4de0-8dca-58d504e79426/projects/9a7eefce-d127-49e8-a2bb-2a29b84eb1a5

The HTML snapshot of each approved draft sits next to this file. They are
references for layout and style only — the real UI is built in React with
local CSS (no Tailwind CDN, no iconify CDN, no remote images).

| Room | Snapshot | Draft |
|---|---|---|
| Cottage home (hotspot menu, hover labels, badges) | `cottage-home.html` | https://p.superdesign.dev/draft/b77a274c-20c3-4dce-92cb-4039b0de0da0 |
| Letter Inbox — The Writing Desk (also the room panel frame) | `letter-inbox.html` | https://p.superdesign.dev/draft/a6df6845-e3d7-442b-8b02-80125d9ee67e |
| Message Inbox — The Enchanted Mirror | `message-inbox.html` | https://p.superdesign.dev/draft/cf55fa3e-4a46-4290-9fd5-b74169635ef4 |
| Contacts — The Cat's Ledger (list + add/edit form) | `contacts.html` | https://p.superdesign.dev/draft/51615da9-210e-4981-957a-f3f1e675ba03 |
| Source — The Crystal Ball | `source.html` | https://p.superdesign.dev/draft/8496541e-ce84-4cdd-849c-b9d689b4f2a6 |
| Akashic Library — The Bookshelf | `akashic-library.html` | https://p.superdesign.dev/draft/9b3551b9-ddfd-41e0-9bb6-8e62bd1c6cc6 |
| Settings — The Fireplace | `settings.html` | https://p.superdesign.dev/draft/a7825cd7-d65d-40dd-9ff4-c92b4f63fe7d |

## Style: Stardew Valley pixel UI, mystical and witchy

User direction: "semi pixel stardew valley like but very mystical, witchy",
then "a stardew valley pixel like feel to the ui as well".

### Colors
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#140c24` | window background |
| `--purple` | `#2a1846` | deep accents, Source panels |
| `--midnight` | `#141a3a` | Source / night panels |
| `--gold` | `#e8b04a` | highlights, active tabs, hover glow, titles |
| `--teal` | `#3fb8a8` | user's own bubbles, primary buttons, "connected" |
| `--parchment` | `#f1e2c0` | panel interiors, letters |
| `--parchment-dim` | `#e8d5ae` | input bars on parchment |
| `--ink` | `#2b1d14` | text on parchment |
| `--outline` | `#1a0f0a` | every 4px outer outline |
| `--wood-dark` | `#3a2318` | frame body |
| `--wood-mid` | `#5a3a2a` | buttons, list rows |
| `--wood-light` | `#8b5e3c` | top-left bevel highlight |
| `--wood-shade` | `#22130d` | bottom-right bevel shade |
| `--header` | `#321e14` | panel header strip |
| `--seal-red` | `#c1272d` | unread badge (wax bubble) |

### Fonts
- **Pixelify Sans** — every label, button, tab, heading, badge; usually UPPERCASE with letter-spacing.
- **Caveat** (and the companion's own handwriting font from `HANDWRITING_FONTS`) — letter bodies only.
- **EB Garamond** italic — English translations, Source replies, Akashic readings.

Fonts ship with the app via `@fontsource/*` (offline; no Google Fonts at runtime).

### Chrome
- No rounded corners, no blur, no soft gradients. `image-rendering: pixelated` everywhere.
- Frame: `background: var(--wood-dark); border: 4px solid var(--outline); box-shadow: inset 4px 4px 0 var(--wood-light), inset -4px -4px 0 var(--wood-shade);`
- Inner well: `background:#422a1e; border:4px solid var(--outline); box-shadow: inset 4px 4px 0 rgba(0,0,0,.3);`
- Button: wood-mid fill, 4px outline, inset 2px wood-light highlight, 2px hard drop shadow; `:active` moves 2px down-right and drops the shadow. Primary = teal fill, selected tab = gold fill with wood-dark text.
- Inputs: ink fill, 4px outline, inset 2px black shadow, parchment text.
- Panels float over the cottage art at `brightness(0.2)`; each room has a "BACK TO COTTAGE" button top-left in the header strip.
- Portraits sit in square frames with a 2–4px outline.
- Unread badge: small square red wax bubble, 2px dark-red border, white pixel digit.
- A few tiny square sparkles drift over the scene (pulse animation, off when reduced motion is set).
- Cottage hotspots: on hover, a gold 4px pixel outline/glow and a wooden name-plate label.
