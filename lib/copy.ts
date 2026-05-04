// Semantic copy type — keys are brand-independent. Both homesteadCopy and
// coveyCopy implement this shape so components never know which brand is active.
export type AppCopy = {
  brand: {
    name: string;
    legal: string;
    pressLine: string;
    tagline: string;
    quote: string;
    thesis?: string;
  };
  urgentSignal: {
    noun: string;
    actionLabel: string;
    tabLabel: string;
    tabIcon: string;
    towerTitle: string;
    pushTitle: (household: string) => string;
    pushBody: (reason: string, note?: string) => string;
    escalateTitle: (reason: string) => string;
    escalateBody: string;
    respondedTitles: {
      onWay: (name: string) => string;
      thirty: (name: string) => string;
      cannot: (name: string) => string;
    };
    respondedBodies: {
      onWay: string;
      thirty: string;
      cannot: string;
    };
    deepLinkTab: string;
    tagPrefix: string;
    escalateTagPrefix: string;
    respondedTagPrefix: string;
    thirtyTagPrefix: string;
    cannotTagPrefix: string;
  };
  request: {
    newLabel: string;
    acceptVerb: string;
    tabLabel: string;
    pushTitle: (household: string) => string;
    pushTitleTargeted: (household: string) => string;
    coveredTitle: (name: string) => string;
    releasedTitle: (name: string) => string;
    releasedBody: (title: string, when: string) => string;
    cancelledTitle: string;
    deepLinkTab: string;
    shiftsDeepLinkTab: string;
    tagPrefix: string;
    claimedTagPrefix: string;
    releasedTagPrefix: string;
    cancelTagPrefix: string;
  };
  innerRing: {
    listTitle: string;
    tabLabel: string;
    dbValue: string;
  };
  outerRing: {
    listTitle: string;
    tabLabel: string;
    dbValue: string;
  };
  schedule: {
    title: string;
    caregiverTitle: string;
  };
  circle: {
    title: string;
    caregiverTitle: string;
    innerLabel: string;
    outerLabel: string;
    innerNote: string;
    outerNote: string;
    kidLabel: string;
    loadingState: string;
    emptyState: string;
    quote: string;
  };
  roles: {
    keeper: { singular: string; plural: string };
    watcher: { singular: string; plural: string };
  };
  icalendar: {
    prodId: string;
    calName: string;
    uidDomain: string;
    filename: string;
  };
  emails: {
    contact: string;
    notify: string;
  };
  guide: {
    whatIsTitle: string;
    whatIsBody1: string;
    whatIsBody2: string;
    parentSection: string;
    caregiverSection: string;
    tipsTitle: string;
    tipsSub: string;
    footerQuote: string;
    footerTagline: string;
  };
};

import { homesteadCopy } from './copy.legacy';
import { coveyCopy } from './copy.covey';

type BrandFlagState = 'valid' | 'unset' | 'malformed';

export function checkBrandFlag(
  serverValue: string | undefined,
  publicValue: string | undefined,
): BrandFlagState {
  const isValid = (v: string | undefined) => v === 'true' || v === 'false' || v === undefined;
  if (!isValid(serverValue) || !isValid(publicValue)) return 'malformed';
  if (serverValue === undefined && publicValue === undefined) return 'unset';
  return 'valid';
}

// Boot-time guard: the flip from Homestead → Covey is a launch-day env-var
// flip. If COVEY_BRAND_ACTIVE is unset or malformed in production, the app
// silently falls back to Homestead — launch doesn't happen and nothing pages.
// Fire a structured log line at module load so log-rate alerts catch it on deploy.
if (process.env.NODE_ENV === 'production') {
  const state = checkBrandFlag(
    process.env.COVEY_BRAND_ACTIVE,
    process.env.NEXT_PUBLIC_COVEY_BRAND_ACTIVE,
  );
  if (state === 'unset') {
    console.warn(JSON.stringify({
      event: 'covey_brand_flag_unset',
      message: 'COVEY_BRAND_ACTIVE not set in production — defaulting to Homestead copy',
      severity: 'warn',
    }));
  } else if (state === 'malformed') {
    console.error(JSON.stringify({
      event: 'covey_brand_flag_malformed',
      message: 'COVEY_BRAND_ACTIVE has malformed value — defaulting to Homestead copy',
      serverValue: process.env.COVEY_BRAND_ACTIVE,
      publicValue: process.env.NEXT_PUBLIC_COVEY_BRAND_ACTIVE,
      severity: 'error',
    }));
  }
}

// Server-side selector — reads process.env at call time so the flag can be
// changed between test cases without re-importing the module.
export function getCopy(): AppCopy {
  // NEXT_PUBLIC_ variant is required for client components (browser bundle).
  // COVEY_BRAND_ACTIVE (non-prefixed) covers server-only contexts.
  const active =
    process.env.NEXT_PUBLIC_COVEY_BRAND_ACTIVE === 'true' ||
    process.env.COVEY_BRAND_ACTIVE === 'true';
  return active ? coveyCopy : homesteadCopy;
}
