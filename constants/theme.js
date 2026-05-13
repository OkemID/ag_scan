// ─────────────────────────────────────────────────────────────
// constants/theme.js
//
// This file holds all the colours, font sizes, and spacing
// values used across the whole app.
//
// Why do this? So if you ever want to change a colour (say,
// make the yellow a brighter shade), you only change it in
// ONE place here instead of hunting through every file.
// ─────────────────────────────────────────────────────────────

export const COLORS = {
  // ── Brand yellows ──────────────────────────────────────────
  yellow:      '#FFD600',   // Main hi-vis yellow (buttons, accents)
  yellowDim:   '#B89900',   // Muted yellow for links / secondary text

  // ── Status colours ─────────────────────────────────────────
  green:       '#00E676',   // COMPLIANT / success
  red:         '#FF1744',   // NON-COMPLIANT / danger
  orange:      '#FF6B00',   // NO PERSON / warning
  blue:        '#40C4FF',   // Info / "On-Device" badge

  // ── Background layers (darkest → lightest) ─────────────────
  bg:          '#0A0C0E',   // Main screen background
  surface:     '#111417',   // Cards, panels (slightly lighter)
  surface2:    '#1A1E24',   // Progress bar tracks, inset areas

  // ── Text colours ───────────────────────────────────────────
  text:        '#F0EEE0',   // Primary readable text
  muted:       '#7A8090',   // Labels, placeholders, timestamps

  // ── Borders ────────────────────────────────────────────────
  border:      'rgba(255, 214, 0, 0.15)',   // Subtle yellow border
};

export const FONTS = {
  // Barlow Condensed = the bold display font for headings/labels
  display: 'BarlowCondensed-Bold',
  displayRegular: 'BarlowCondensed-Regular',

  // Barlow = the normal readable font for body text
  body: 'Barlow-Regular',
  bodyMedium: 'Barlow-Medium',
};

export const SIZES = {
  // Spacing scale — use multiples of 4 for consistency
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 28,

  // Border radius — how rounded corners are
  radiusSm: 6,
  radiusMd: 10,
  radiusLg: 14,
  radiusFull: 999, // Fully round (pill shape)
};
