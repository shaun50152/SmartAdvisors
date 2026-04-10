import type { Preferences } from '../components/PreferenceForm';

export const DISCLAIMER_KEY = 'sa_disclaimer_accepted';
export const SA_USER_KEY = 'sa_user';
export const SA_FLOW_KEY = 'sa_flow';

export const planStorageKey = (email: string) => `sa_plan_${email}`;

export type GoogleUserPersisted = {
  name: string;
  email: string;
  picture: string;
};

export type ApiRecommendationPersisted = {
  success: boolean;
  recommendations: unknown[];
  electiveRecommendations?: unknown[];
  stats?: unknown;
};

/** Flow state restored on refresh (excluding binary file upload). */
export type SaFlowState = {
  lastRoute: string;
  department: string;
  completedCourses: string[];
  userPrefs: Preferences | null;
  isReturningUser: boolean;
  enteredViaGuestOverlay: boolean;
  apiData: ApiRecommendationPersisted | null;
};

export function readDisclaimerAccepted(): boolean {
  try {
    return localStorage.getItem(DISCLAIMER_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeDisclaimerAccepted(): void {
  try {
    localStorage.setItem(DISCLAIMER_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function readSaUser(): GoogleUserPersisted | null {
  try {
    const raw = localStorage.getItem(SA_USER_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as GoogleUserPersisted;
    if (o?.email && o?.name) return o;
    return null;
  } catch {
    return null;
  }
}

export function writeSaUser(user: GoogleUserPersisted): void {
  try {
    localStorage.setItem(SA_USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}

export function clearSaUser(): void {
  try {
    localStorage.removeItem(SA_USER_KEY);
  } catch {
    /* ignore */
  }
}

export function readSaFlow(): SaFlowState | null {
  try {
    const raw = localStorage.getItem(SA_FLOW_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SaFlowState;
  } catch {
    return null;
  }
}

export function writeSaFlow(state: SaFlowState): void {
  try {
    localStorage.setItem(SA_FLOW_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

export function clearSaFlow(): void {
  try {
    localStorage.removeItem(SA_FLOW_KEY);
  } catch {
    /* ignore */
  }
}

export function hasValidSavedPlan(email: string): boolean {
  try {
    const raw = localStorage.getItem(planStorageKey(email));
    if (!raw) return false;
    const saved = JSON.parse(raw) as { degreePlan?: { plan?: unknown; stats?: unknown } };
    return Boolean(
      saved.degreePlan &&
        Array.isArray(saved.degreePlan.plan) &&
        saved.degreePlan.stats
    );
  } catch {
    return false;
  }
}

export function loadSavedPlan(email: string): {
  completedCourses: string[];
  department: string;
  degreePlan: unknown;
} | null {
  try {
    const raw = localStorage.getItem(planStorageKey(email));
    if (!raw) return null;
    const saved = JSON.parse(raw) as {
      completedCourses?: string[];
      department?: string;
      degreePlan?: unknown;
    };
    if (
      !saved.degreePlan ||
      typeof saved.degreePlan !== 'object' ||
      !Array.isArray((saved.degreePlan as { plan?: unknown }).plan) ||
      !(saved.degreePlan as { stats?: unknown }).stats
    ) {
      return null;
    }
    return {
      completedCourses: saved.completedCourses || [],
      department: saved.department || '',
      degreePlan: saved.degreePlan,
    };
  } catch {
    return null;
  }
}

/** Routes safe to restore on cold load (must still pass guards). */
export const RESTORABLE_ROUTES = new Set([
  '/',
  '/upload',
  '/transcript',
  '/preferences',
  '/degree-planner',
  '/dashboard',
  '/plan',
  '/recommendations',
]);
