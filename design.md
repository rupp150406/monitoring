---
version: alpha
name: Apple II
description: Green-phosphor CRT. Cursor forever. Scanlines optional.
colors:
  primary: "#4AFF8A"
  secondary: "#2D8F4E"
  tertiary: "#FFB84A"
  neutral: "#020502"
  surface: "#0A0D0A"
  on-primary: "#020502"
typography:
  display:
    fontFamily: VT323
    fontSize: 4.5rem
    fontWeight: 400
  h1:
    fontFamily: VT323
    fontSize: 2.2rem
    fontWeight: 400
  body:
    fontFamily: IBM Plex Mono
    fontSize: 0.92rem
    lineHeight: 1.5
  label:
    fontFamily: IBM Plex Mono
    fontSize: 0.72rem
    letterSpacing: "0.08em"
rounded:
  sm: 0px
  md: 0px
  lg: 2px
spacing:
  sm: 8px
  md: 16px
  lg: 32px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: 12px 20px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    padding: 24px
---
## Overview

A green-phosphor CRT aesthetic: deep black background, phosphor-green primary, amber warn.

## Colors

The palette is built around high-contrast neutrals and a single accent that drives interaction.

- **Primary (`#4AFF8A`):** Headlines and core text.
- **Secondary (`#2D8F4E`):** Borders, captions, and metadata.
- **Tertiary (`#FFB84A`):** The sole driver for interaction. Reserve it.
- **Neutral (`#020502`):** The page foundation.

## Typography

- **display:** VT323 4.5rem
- **h1:** VT323 2.2rem
- **body:** IBM Plex Mono 0.92rem
- **label:** IBM Plex Mono 0.72rem

## Do's and Don'ts

- **Do** use Tertiary for exactly one action per screen.
- **Do** let Neutral carry the composition — negative space is a feature.
- **Don't** introduce gradients. This system is flat on purpose.
- **Don't** mix Tertiary with alternate accents; the single-accent rule is load-bearing.
