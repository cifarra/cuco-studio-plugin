---
name: source-visuals
description: Assemble a per-section asset set for a video script/narration — the higher-level routing layer that decides, section by section, between the local image vault (abstract concepts, moods, scenes) and web search (specific people, brands, current events), handles the specific-person licensing reality, and emits a manifest.json. Use when you already have narration split into sections and need one matched asset per section across mixed sources. For plain vault search/curation (no per-section script, no web routing), use the `lupa` skill instead — this skill builds on that engine, it doesn't replace it.
---

# Source Visuals

## Overview

Source images that match each section of a video narration. Uses a dual-source approach:
- **lupa** (local): Abstract concepts, moods, aesthetics, visual continuity
- **Web** (Unsplash): Specific people, places, current events, branded content

Each asset is inspected for fit across **space**, **time**, and **aesthetics**.

## First: Check for lupa

```bash
which lupa && lupa info
```

If lupa exists, use it as primary source. If not, fall back to web-only workflow.

## Source Decision

Analyze each section's text to choose the right source:

```
┌─────────────────────────────────────────────────────────────────┐
│ Section text analysis:                                          │
│                                                                 │
│ Contains specific person/brand/event? ──yes──→ WEB SEARCH       │
│                    │                                            │
│                   no                                            │
│                    ↓                                            │
│ References current events/news? ─────yes──→ WEB SEARCH          │
│                    │                                            │
│                   no                                            │
│                    ↓                                            │
│ Abstract concept/mood/aesthetic? ────yes──→ LUPA LOCAL          │
│                    │                                            │
│                   no                                            │
│                    ↓                                            │
│ Generic scene/setting? ──────────────yes──→ LUPA LOCAL          │
│                    │                                            │
│                   no                                            │
│                    ↓                                            │
│                 WEB SEARCH (fallback)                           │
└─────────────────────────────────────────────────────────────────┘
```

**Examples:**

| Section Text | Source | Why |
|--------------|--------|-----|
| "The morning sun breaks over mountains" | lupa | Abstract landscape |
| "Elon Musk announces new venture" | web | Specific person |
| "A feeling of melancholy pervades" | lupa | Mood/emotion |
| "The 2026 Olympics opening ceremony" | web | Current event |
| "Children play in cobblestone streets" | lupa | Generic scene |
| "The iPhone 17 launch event" | web | Branded content |

## Workflow with lupa

```
┌─────────────────────────────────────────────────────────────────┐
│ For each section (lupa path):                                   │
│                                                                 │
│  1. Extract 2-3 visual concepts from text                       │
│  2. lupa search "[concepts]" --limit 10 --json                  │
│  3. Read top candidates to visually inspect                     │
│  4. Score against space/time/aesthetics                         │
│  5. If good match → copy to output folder                       │
│  6. If no match → try similar/color/light OR fall back to web   │
└─────────────────────────────────────────────────────────────────┘
```

## lupa Search Commands

**Text search (semantic):**
```bash
lupa search "mountain sunrise golden hour" --limit 10
```

**Note:** lupa table output truncates long paths. Use Glob to get full path:
```bash
# If lupa shows: /Users/ale/images/from_ig/account/12345...
# Get full path with:
Glob pattern: **/account/12345*
```

**Similar search (find images like a reference):**
```bash
lupa similar /path/to/reference.jpg --limit 10 --json
```

**Color search (find images with specific color):**
```bash
lupa color "#FF6B35" --limit 10 --json
```

**Luminance search (find images in brightness range):**
```bash
lupa light --min 0 --max 20 --limit 10   # very dark images
lupa light --min 40 --max 60 --limit 10  # mid-tones
lupa light --min 70 --max 100 --limit 10 # bright images
```
Note: Luminance is 0-100 scale, not 0-1.

## Visual Composition with lupa

Beyond matching individual sections, use lupa's features to create **visual musicality**:

### Color Continuity
After selecting first asset, extract its dominant color and use `lupa color` to find harmonious images for subsequent sections:

```
Section 1: Selected warm sunset image (dominant: #E87D4F)
Section 2: lupa color "#E87D4F" → maintains warm palette
Section 3: Transition to cooler tones for contrast
```

### Luminance Rhythm
Create visual rhythm through brightness patterns (scale 0-100):

```
Section 1: Bright opening (lum 70-90)
Section 2: Darker, introspective (lum 20-40)
Section 3: Rising action (lum 50-70)
Section 4: Climax - high contrast
```

**Tip:** B&W images provide natural contrast in color sequences:
```
Section 1: Color (warm golden) → lum 22
Section 2: B&W (grayscale)     → lum 46 (emotional pause)
Section 3: Color (warm indoor) → lum 43
Section 4: Color (ocean blue)  → lum 42
```

### Visual Motifs with Similar
When a visual element should recur:

```
Section 1: Found great mountain image
Section 5: Callback to mountains → lupa similar /path/to/section-001.jpg
```

This creates visual "rhymes" in the video.

## Inspection Criteria

### Space Context
- Room for text overlays?
- Subject placement (rule of thirds, centered)?
- Scale matches narration (intimate vs grand)?

### Time Context
- Era/period matches text?
- Lighting appropriate (day/night, season)?
- Timeless or dated?

### Aesthetics
- Resolution sufficient (1920x1080+)?
- Color palette fits video tone?
- Style consistent with other assets?

**For lupa results, use Read tool to visually inspect:**
```
Read the image at [path] and evaluate:
1. SPACE: Composition, text overlay room, focal point
2. TIME: Era, time of day, anachronisms
3. AESTHETICS: Quality (1-5), color palette, professional fit
4. FIT: Does this support "[section text]"?
Verdict: ACCEPT / REJECT / MAYBE
```

## Web Search (Fallback)

When lupa doesn't have what you need or content is too specific:

**Use Unsplash:**
```
Search: site:unsplash.com [specific concept]
```

**Download pattern:**
```bash
curl -L -o output/image.jpg \
  "https://unsplash.com/photos/[photo-id]/download?force=true" \
  -H "User-Agent: Mozilla/5.0"
```

**When to go directly to web:**
- Specific people, brands, logos
- Current events, news imagery
- Specific locations (e.g., "Eiffel Tower at night")
- Technical/scientific imagery
- Anything unlikely in a personal collection

## Specific People: The Licensing Reality

**Problem:** Searching for specific people (Steve Jobs, celebrities, executives) on Unsplash returns:
- Action figures, toys
- Book covers with their photo
- Fan art, drawings
- NOT actual photographs

**Why:** Portrait rights and licensing. Real photos of specific people require:
- Getty Images, AP Images (paid licensing)
- Official press kits
- Public domain archives

**Solution: Conceptual Alternatives**

When you can't source the actual person, use imagery that evokes their context:

```
Narration: "Steve Jobs once said: Stay hungry, stay foolish"
Can't find: Actual Steve Jobs portrait
Alternative: Apple device on minimal desk (evokes Apple/innovation)
            Dark stage with spotlight (evokes keynote presentations)
            Typography on black (let the quote speak)
```

**Document in manifest:**
```json
{
  "limitation_note": "Specific person requires licensed content. Used conceptual alternative.",
  "source": "lupa (conceptual alternative)"
}
```

This is honest about the limitation while providing a usable asset.

## Output Structure

```
output/
  section-001-sunrise.jpg
  section-002-village.jpg
  section-003-street.jpg
  manifest.json
```

**manifest.json:**
```json
{
  "sections": [
    {
      "id": 1,
      "text": "The ocean stretches endlessly...",
      "asset": "section-001-ocean.jpg",
      "source": "lupa",
      "source_query": "dramatic coastline aerial view",
      "source_path": "/Users/ale/images/from_ig/...",
      "dimensions": "1440x1725",
      "inspection_notes": "Quality 4/5, aerial coastal view, room for text",
      "lum": 22,
      "palette_note": "warm gold cliffs, deep ocean - establishes palette"
    },
    {
      "id": 2,
      "text": "A sense of longing fills the air...",
      "asset": "section-002-longing.webp",
      "source": "lupa",
      "source_query": "melancholy mist ethereal",
      "inspection_notes": "B&W provides emotional pause in color sequence",
      "lum": 46
    },
    {
      "id": 3,
      "text": "Steve Jobs once said...",
      "asset": "section-003-apple.jpg",
      "source": "lupa (conceptual alternative)",
      "limitation_note": "Specific person requires licensed content",
      "inspection_notes": "Apple device on desk evokes innovation context"
    },
    {
      "id": 4,
      "text": "And so the sea returns...",
      "asset": "section-004-sea-callback.jpg",
      "source": "lupa similar",
      "source_query": "lupa similar section-001-ocean.jpg",
      "similarity_score": 0.87,
      "inspection_notes": "Visual callback to section 1, completes sea motif"
    }
  ],
  "visual_strategy": {
    "palette_arc": "warm gold → B&W pause → warm indoor → ocean return",
    "luminance_arc": "22 (dramatic) → 46 (mid) → 43 (warm) → 42 (settling)",
    "motifs": ["ocean bookends sections 1 and 4 via similar search"],
    "source_routing": {
      "lupa_semantic": [1, 2],
      "lupa_similar": [4],
      "conceptual_alternative": [3]
    }
  }
}
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using web for abstract concepts | lupa handles moods, aesthetics better |
| Using lupa for specific people/events | These won't exist locally |
| Expecting web to have specific people | Unsplash has toys/books, not portraits - use conceptual alt |
| Ignoring visual continuity | Use color/light/similar for cohesion |
| Accepting first result | Always visually inspect before selecting |
| Random color palette | Plan palette progression, document in manifest |
| Not using `similar` for callbacks | Creates powerful visual rhymes (0.8+ similarity) |
| Forgetting path truncation | Use Glob to get full path from truncated lupa output |
| Wrong luminance scale | It's 0-100, not 0-1 |

## Quick Reference

| Task | Tool | Command |
|------|------|---------|
| Check lupa | Bash | `which lupa && lupa info` |
| Semantic search | Bash | `lupa search "concept" --limit 10` |
| Similar images | Bash | `lupa similar /path.jpg --limit 10` |
| Color search | Bash | `lupa color "#hex" --limit 10` |
| Light search | Bash | `lupa light --min 20 --max 40 --limit 10` |
| Get full path | Glob | `**/folder/prefix*` (lupa truncates paths) |
| Inspect local | Read | View image file directly |
| Web search | WebSearch | `site:unsplash.com [concept]` |
| Inspect web | WebFetch | Fetch photo page + prompt |
| Copy local | Bash | `cp /source/path output/name.jpg` |
| Download web | Bash | `curl -L -o output/name.jpg "url"` |

## Usage

```
I have this narration split into sections:

1. "The morning sun breaks over the mountain ridge..."
2. "In the valley below, a small village awakens..."
3. "Meanwhile, tech mogul announces breakthrough..."
4. "But in nature, time moves differently..."

Find matching video assets. Use lupa for abstract/scenic content,
web for specific people/events. Create visual continuity through
color and luminance choices.
```
