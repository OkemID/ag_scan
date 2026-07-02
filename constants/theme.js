// ─────────────────────────────────────────────────────────────
// constants/theme.js
//
// Design system for AG Scan — industrial safety aesthetic.
// Dark base, high-contrast hi-vis yellow as the primary accent,
// with clean semantic status colours.
// ─────────────────────────────────────────────────────────────

export const COLORS = {
  // ── Brand / accent ─────────────────────────────────────────
  yellow:      '#FFD600',   // Hi-vis yellow — primary CTA and accents
  yellowDim:   '#A89000',   // Muted yellow for secondary elements

  // ── Status ─────────────────────────────────────────────────
  green:       '#00E676',   // COMPLIANT
  red:         '#FF1744',   // NON_COMPLIANT
  orange:      '#FF6D00',   // NO_PERSON / warning
  blue:        '#29B6F6',   // Info / YOLO badge
  purple:      '#CE93D8',   // HSV fallback badge

  // ── Background stack ───────────────────────────────────────
  bg:          '#080A0C',   // Root screen background
  surface:     '#0F1215',   // Cards and panels
  surface2:    '#181C21',   // Track fills, inset elements
  surface3:    '#1E242B',   // Hover states, borders on dark

  // ── Text ───────────────────────────────────────────────────
  text:        '#EAE8D8',   // Primary readable text
  textDim:     '#9AA0AC',   // Secondary text
  muted:       '#5A6070',   // Labels, placeholders

  // ── Borders ────────────────────────────────────────────────
  border:      'rgba(255, 214, 0, 0.12)',
  borderDim:   'rgba(255, 255, 255, 0.06)',
};

export const SIZES = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  28,
  xxxl: 40,

  radiusSm:   6,
  radiusMd:   10,
  radiusLg:   16,
  radiusFull: 999,
};
