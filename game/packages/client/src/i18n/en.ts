/**
 * Textes de l'interface, centralisés (CLAUDE.md §23) — langue par défaut :
 * anglais (continuité des documents de conception) ; le français arrive avec
 * la fondation i18n (backlog P7).
 */
export const t = {
  appName: 'ATG — Across The Galaxies',
  tagline: 'Explore, harvest and conquer: fuel your ambitions.',
  status: {
    checkingServer: 'Contacting the game server…',
    serverDown: 'The game server is unreachable. It may still be waking up — retry in a moment.',
    serverReady: 'Server link established.',
    retry: 'Retry',
  },
} as const;
