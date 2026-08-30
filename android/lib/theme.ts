// AK-LOGIC AI GST — Android Material 3 Dark Theme
// Follows M3 color roles, elevation, typography scale, spacing grid
// Designed for 360dp–412dp Android screens (budget to mid-range)

export const Theme = {
  // ── M3 Surface Hierarchy (dark scheme) ──
  bg: '#0B0F1A',                       // Surface (window background)
  surface1: '#111827',                  // Surface Container Lowest
  surface2: '#151C2E',                  // Surface Container Low
  surface3: '#1A2238',                  // Surface Container
  surface4: '#1F2940',                  // Surface Container High
  surface5: '#253048',                  // Surface Container Highest
  surfaceBright: '#2A3654',             // Surface Bright

  // ── Primary Teal/Mint ──
  primary: '#00D4AA',
  primaryContainer: 'rgba(0,212,170,0.14)',
  onPrimary: '#003828',
  onPrimaryContainer: '#00D4AA',

  // ── Secondary Blue ──
  secondary: '#3B82F6',
  secondaryContainer: 'rgba(59,130,246,0.14)',
  onSecondary: '#0A2463',
  onSecondaryContainer: '#3B82F6',

  // ── Tertiary Gold/Amber (money, credits) ──
  tertiary: '#F59E0B',
  tertiaryContainer: 'rgba(245,158,11,0.14)',
  onTertiary: '#412D00',
  onTertiaryContainer: '#F59E0B',
  tertiaryBorder: 'rgba(245,158,11,0.28)',

  // ── Error / Success / Warning ──
  error: '#F44336',
  errorContainer: 'rgba(244,67,54,0.14)',
  onError: '#601410',
  success: '#4CAF50',
  successContainer: 'rgba(76,175,80,0.14)',
  warning: '#FF9800',
  warningContainer: 'rgba(255,152,0,0.14)',

  // ── On Surface Text (M3 text roles) ──
  onSurface: '#E2E8F0',               // Primary text
  onSurfaceVariant: '#94A3B8',         // Secondary text
  outline: '#334155',                   // Border / divider
  outlineVariant: '#1E293B',            // Subtle divider
  onSurfaceDisabled: '#475569',         // Disabled text

  // ── Inverse ──
  inverseSurface: '#E2E8F0',
  inverseOnSurface: '#0B0F1A',
  inversePrimary: '#006B55',

  // ── Scrim / Overlay ──
  scrim: 'rgba(0,0,0,0.5)',            // M3 scrim for modals
  scrimHeavy: 'rgba(0,0,0,0.72)',

  // ── Gradients (brand accents — used sparingly) ──
  gradientPrimary: ['#00D4AA', '#3B82F6'] as [string, string],
  gradientGold: ['#F59E0B', '#E67E22'] as [string, string],
  gradientBlue: ['#3B82F6', '#1D4ED8'] as [string, string],

  // ── M3 Spacing (4dp grid) ──
  space4: 4,
  space8: 8,
  space12: 12,
  space16: 16,
  space20: 20,
  space24: 24,
  space32: 32,
  space48: 48,

  // ── M3 Shape Scale ──
  shapeNone: 0,
  shapeXs: 4,
  shapeSm: 8,
  shapeMd: 12,
  shapeLg: 16,
  shapeXl: 28,
  shapeFull: 999,

  // ── M3 Typescale (Roboto / system default) ──
  // Display
  displayLarge: 57,
  displayMedium: 45,
  displaySmall: 36,
  // Headline
  headlineLarge: 32,
  headlineMedium: 28,
  headlineSmall: 24,
  // Title
  titleLarge: 22,
  titleMedium: 16,
  titleSmall: 14,
  // Body
  bodyLarge: 16,
  bodyMedium: 14,
  bodySmall: 12,
  // Label
  labelLarge: 14,
  labelMedium: 12,
  labelSmall: 11,

  // ── M3 Elevation (Android dp) ──
  elevation0: {
    elevation: 0,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  elevation1: {
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1,
  },
  elevation2: {
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  elevation3: {
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  elevation4: {
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },

  // ── Android Touch Targets ──
  minTouchTarget: 48,    // M3 minimum 48dp
  navBarHeight: 80,      // M3 Navigation Bar
  topAppBarHeight: 64,   // M3 Top App Bar (medium)
  fabSize: 56,           // M3 FAB
  fabSmall: 40,
};

export type ThemeType = typeof Theme;
