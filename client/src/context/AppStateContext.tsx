import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { GoogleUser } from '../components/SignInOverlay';
import type { Preferences } from '../components/PreferenceForm';
import type { DegreePlan, Course, ElectiveCourse, Student } from '../types/PlanDegreePage';
import {
  clearSaFlow,
  clearSaUser,
  hasValidSavedPlan,
  loadSavedPlan,
  planStorageKey,
  readDisclaimerAccepted,
  readSaFlow,
  readSaUser,
  RESTORABLE_ROUTES,
  writeDisclaimerAccepted,
  writeSaFlow,
  writeSaUser,
  type ApiRecommendationPersisted,
  type SaFlowState,
} from '../lib/persistSession';

export const API_URL = 'http://127.0.0.1:8000';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

export interface ApiRecommendationResponse {
  success: boolean;
  recommendations: unknown[];
  electiveRecommendations?: unknown[];
  stats?: unknown;
}

type AppStateContextValue = {
  disclaimerAccepted: boolean;
  setDisclaimerAccepted: (v: boolean) => void;
  showLogin: boolean;
  setShowLogin: (v: boolean) => void;
  isLoggedIn: boolean;
  setIsLoggedIn: (v: boolean) => void;
  googleUser: GoogleUser | null;
  file: File | null;
  setFile: (f: File | null) => void;
  department: string;
  setDepartment: (d: string) => void;
  completedCourses: string[];
  setCompletedCourses: (c: string[]) => void;
  apiData: ApiRecommendationResponse | null;
  userPrefs: Preferences | null;
  setUserPrefs: (p: Preferences | null) => void;
  isLoading: boolean;
  degreePlan: unknown;
  setDegreePlan: (p: unknown) => void;
  isReturningUser: boolean;
  setIsReturningUser: (v: boolean) => void;
  planDegreeData: {
    student: Student | undefined;
    requiredCourses: Course[];
    electiveCourses: ElectiveCourse[];
  };
  setPlanDegreeData: React.Dispatch<
    React.SetStateAction<{
      student: Student | undefined;
      requiredCourses: Course[];
      electiveCourses: ElectiveCourse[];
    }>
  >;
  enteredViaGuestOverlay: boolean;
  setEnteredViaGuestOverlay: (v: boolean) => void;
  googleOAuthEnabled: boolean;
  usePlanDegreePage: boolean;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleUploadAndParse: () => Promise<void>;
  handleGenerate: (preferences: Preferences) => Promise<void>;
  handleGenerateDegreePlan: (
    creditsPerSemester: number,
    selectedCourses: string[],
    startSemester: string,
    startYear: number,
    includeSummer: boolean,
    chosenElectives: string[]
  ) => Promise<void>;
  handlePlanDegreeComplete: (plan: DegreePlan) => Promise<void>;
  fetchPlanDegreeData: () => Promise<void>;
  handleLogoClick: () => void;
  handleSignOut: () => void;
  handleEditPlan: () => void;
  handleNewTranscript: () => void;
  onGoogleLogin: (user: GoogleUser) => void;
};

const AppStateContext = createContext<AppStateContextValue | null>(null);

function initialFlow(): SaFlowState | null {
  return readSaFlow();
}

function initialDeptAndCourses(): { department: string; completedCourses: string[] } {
  const flow = readSaFlow();
  const u = readSaUser();
  const saved = u?.email ? loadSavedPlan(u.email) : null;
  return {
    department: saved?.department ?? flow?.department ?? '',
    completedCourses: saved?.completedCourses ?? flow?.completedCourses ?? [],
  };
}

export function AppStateProvider({
  children,
  googleOAuthEnabled,
}: {
  children: React.ReactNode;
  googleOAuthEnabled: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const flowInit = initialFlow();
  const deptCoursesInit = initialDeptAndCourses();

  const [disclaimerAccepted, setDisclaimerAcceptedState] = useState(
    readDisclaimerAccepted
  );
  const [showLogin, setShowLogin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => Boolean(readSaUser()));
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(() => {
    const u = readSaUser();
    return u ? { name: u.name, email: u.email, picture: u.picture } : null;
  });
  const [file, setFile] = useState<File | null>(null);
  const [department, setDepartment] = useState(() => deptCoursesInit.department);
  const [completedCourses, setCompletedCourses] = useState<string[]>(
    () => deptCoursesInit.completedCourses
  );
  const [apiData, setApiData] = useState<ApiRecommendationResponse | null>(
    () => (flowInit?.apiData as ApiRecommendationResponse | null) ?? null
  );
  const [userPrefs, setUserPrefs] = useState<Preferences | null>(
    () => flowInit?.userPrefs ?? null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [degreePlan, setDegreePlan] = useState<unknown>(() => {
    const u = readSaUser();
    if (!u?.email) return null;
    return loadSavedPlan(u.email)?.degreePlan ?? null;
  });
  const [isReturningUser, setIsReturningUser] = useState(
    () => flowInit?.isReturningUser ?? false
  );
  const [enteredViaGuestOverlay, setEnteredViaGuestOverlay] = useState(
    () => flowInit?.enteredViaGuestOverlay ?? false
  );
  const [planDegreeData, setPlanDegreeData] = useState<{
    student: Student | undefined;
    requiredCourses: Course[];
    electiveCourses: ElectiveCourse[];
  }>({
    student: undefined,
    requiredCourses: [],
    electiveCourses: [],
  });

  const setDisclaimerAccepted = useCallback((v: boolean) => {
    setDisclaimerAcceptedState(v);
    if (v) writeDisclaimerAccepted();
  }, []);

  const persistFlow = useCallback(() => {
    const state: SaFlowState = {
      lastRoute: location.pathname,
      department,
      completedCourses,
      userPrefs,
      isReturningUser,
      enteredViaGuestOverlay,
      apiData: apiData as ApiRecommendationPersisted | null,
    };
    writeSaFlow(state);
  }, [
    location.pathname,
    department,
    completedCourses,
    userPrefs,
    isReturningUser,
    enteredViaGuestOverlay,
    apiData,
  ]);

  useEffect(() => {
    persistFlow();
  }, [persistFlow]);

  const homeRedirectDone = useRef(false);
  useEffect(() => {
    if (homeRedirectDone.current) return;
    if (location.pathname !== '/') return;
    const u = googleUser ?? readSaUser();
    if (u && hasValidSavedPlan(u.email)) {
      homeRedirectDone.current = true;
      navigate('/dashboard', { replace: true });
      return;
    }
    const flow = readSaFlow();
    if (
      flow?.lastRoute &&
      flow.lastRoute !== '/' &&
      RESTORABLE_ROUTES.has(flow.lastRoute)
    ) {
      homeRedirectDone.current = true;
      navigate(flow.lastRoute, { replace: true });
    }
  }, [location.pathname, googleUser, navigate]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname, showLogin]);

  useEffect(() => {
    if (location.pathname !== '/degree-planner') {
      setPlanDegreeData({
        student: undefined,
        requiredCourses: [],
        electiveCourses: [],
      });
    }
  }, [location.pathname]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setFile(e.target.files[0]);
  }, []);

  const handleUploadAndParse = useCallback(async () => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      alert('File too large. Please upload a PDF under 5 MB.');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please upload a PDF file.');
      return;
    }
    setIsLoading(true);
    const formData = new FormData();
    formData.append('transcript', file);
    try {
      const response = await fetchWithTimeout(`${API_URL}/api/parse-transcript`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (response.ok && data.courses) {
        setCompletedCourses(data.courses);
        setDegreePlan(null);
        navigate('/transcript');
      } else {
        alert(data.error || 'Error parsing transcript.');
      }
    } catch (error: unknown) {
      const err = error as { name?: string };
      if (err?.name === 'AbortError') {
        alert('Request timed out. Please try again.');
      } else {
        alert('Could not connect to server. Is the backend running?');
      }
    } finally {
      setIsLoading(false);
    }
  }, [file, navigate]);

  const handleGenerate = useCallback(
    async (preferences: Preferences) => {
      setUserPrefs(preferences);
      setIsLoading(true);
      const formData = new FormData();
      formData.append('completed_courses', JSON.stringify(completedCourses));
      formData.append('department', department);
      formData.append('preferences', JSON.stringify(preferences));
      try {
        const response = await fetchWithTimeout(`${API_URL}/api/recommendations`, {
          method: 'POST',
          body: formData,
        });
        const data = (await response.json()) as ApiRecommendationResponse;
        if (response.ok) {
          setApiData(data);
          navigate('/recommendations');
        } else {
          alert((data as { error?: string }).error || 'Could not generate recommendations.');
        }
      } catch (error: unknown) {
        const err = error as { name?: string };
        if (err?.name === 'AbortError') {
          alert('Request timed out. Please try again.');
        } else {
          alert('Could not connect to server. Is the backend running?');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [completedCourses, department, navigate]
  );

  const handleGenerateDegreePlan = useCallback(
    async (
      creditsPerSemester: number,
      selectedCourses: string[],
      startSemester: string,
      startYear: number,
      includeSummer: boolean,
      chosenElectives: string[]
    ) => {
      setIsLoading(true);
      try {
        const response = await fetchWithTimeout(
          `${API_URL}/api/degree-plan`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              completed_courses: completedCourses,
              department,
              credits_per_semester: creditsPerSemester,
              selected_next_semester: selectedCourses,
              start_semester: startSemester,
              start_year: startYear,
              include_summer: includeSummer,
              chosen_electives: chosenElectives,
              preferences: userPrefs,
            }),
          },
          60000
        );
        const data = await response.json();
        if (response.ok && data.success) {
          setDegreePlan(data);
          setIsReturningUser(false);
          navigate('/plan');
          if (googleUser) {
            try {
              localStorage.setItem(
                planStorageKey(googleUser.email),
                JSON.stringify({
                  completedCourses,
                  department,
                  degreePlan: data,
                })
              );
            } catch {
              /* quota */
            }
          }
        } else {
          alert(data.error || 'Could not generate degree plan.');
        }
      } catch (error: unknown) {
        const err = error as { name?: string };
        if (err?.name === 'AbortError') {
          alert('Request timed out. Please try again.');
        } else {
          alert('Could not connect to server. Is the backend running?');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [completedCourses, department, userPrefs, googleUser, navigate]
  );

  const handlePlanDegreeComplete = useCallback(
    async (plan: DegreePlan) => {
      await handleGenerateDegreePlan(
        plan.maxHoursPerSemester,
        plan.selectedCourseIds,
        plan.season,
        parseInt(plan.year, 10),
        plan.includeSummer,
        []
      );
    },
    [handleGenerateDegreePlan]
  );

  const fetchPlanDegreeData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/degree-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completed_courses: completedCourses,
          department,
          credits_per_semester: 15,
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        const requiredCourses: Course[] = (data.eligibleCourses || [])
          .filter((c: { requirement?: string }) => c.requirement === 'required')
          .map((c: { code: string; name: string; creditHours: number }) => ({
            id: c.code,
            code: c.code,
            name: c.name,
            creditHours: c.creditHours,
          }));
        const electiveSource =
          data.allElectives ||
          data.eligibleCourses?.filter(
            (c: { requirement?: string }) => c.requirement === 'elective'
          ) ||
          [];
        const electiveCourses: ElectiveCourse[] = electiveSource.map(
          (c: {
            code: string;
            name: string;
            creditHours: number;
            missingPrereqs?: string[];
            electiveGroup?: string | null;
            elective_group?: string | null;
          }) => ({
            id: c.code,
            code: c.code,
            name: c.name,
            creditHours: c.creditHours,
            missingPrereqs: c.missingPrereqs || [],
            electiveGroup: c.electiveGroup ?? c.elective_group ?? null,
          })
        );
        const remHrs = Math.max(
          0,
          (data.stats.totalHours || 0) - (data.stats.completedHours || 0)
        );
        const student: Student | undefined = data.stats
          ? {
              name: googleUser?.name || 'Student',
              completedCourses: [...completedCourses],
              completedCreditHours: data.stats.completedHours || 0,
              totalCreditHours: data.stats.totalHours || 0,
              totalCoursesRequired: data.stats.totalCourses || 0,
              estimatedSemestersLeft:
                remHrs > 0 ? Math.max(1, Math.ceil(remHrs / 15)) : 0,
            }
          : undefined;
        setPlanDegreeData({
          student,
          requiredCourses,
          electiveCourses,
        });
      }
    } catch {
      console.error('Failed to fetch plan degree data');
      alert('Could not connect to server.');
    } finally {
      setIsLoading(false);
    }
  }, [completedCourses, department, googleUser?.name]);

  const handleLogoClick = useCallback(() => {
    if (isLoggedIn && degreePlan && googleUser) {
      setIsReturningUser(true);
      navigate('/dashboard');
      return;
    }
    navigate('/');
    setShowLogin(false);
    setIsLoggedIn(false);
    setIsReturningUser(false);
    setGoogleUser(null);
    clearSaUser();
    setDegreePlan(null);
    setCompletedCourses([]);
    setFile(null);
    setUserPrefs(null);
    setApiData(null);
    clearSaFlow();
  }, [isLoggedIn, degreePlan, googleUser, navigate]);

  const handleSignOut = useCallback(() => {
    navigate('/');
    setShowLogin(false);
    setIsLoggedIn(false);
    setIsReturningUser(false);
    setGoogleUser(null);
    clearSaUser();
    setDegreePlan(null);
    setCompletedCourses([]);
    setFile(null);
    setUserPrefs(null);
    setApiData(null);
    clearSaFlow();
  }, [navigate]);

  const handleEditPlan = useCallback(() => {
    navigate('/degree-planner');
  }, [navigate]);

  const handleNewTranscript = useCallback(() => {
    if (googleUser) localStorage.removeItem(planStorageKey(googleUser.email));
    setIsReturningUser(false);
    setDegreePlan(null);
    setCompletedCourses([]);
    setFile(null);
    setUserPrefs(null);
    navigate('/upload');
  }, [googleUser, navigate]);

  const onGoogleLogin = useCallback(
    (user: GoogleUser) => {
      writeSaUser({
        name: user.name,
        email: user.email,
        picture: user.picture,
      });
      const savedRaw = localStorage.getItem(planStorageKey(user.email));
      if (savedRaw) {
        try {
          const saved = loadSavedPlan(user.email);
          if (saved) {
            setCompletedCourses(saved.completedCourses);
            setDepartment(saved.department);
            setDegreePlan(saved.degreePlan);
            setGoogleUser(user);
            setIsLoggedIn(true);
            setIsReturningUser(true);
            setShowLogin(false);
            navigate('/dashboard', { replace: true });
            return;
          }
          localStorage.removeItem(planStorageKey(user.email));
        } catch {
          localStorage.removeItem(planStorageKey(user.email));
        }
      }
      setGoogleUser(user);
      setIsLoggedIn(true);
      setShowLogin(false);
      navigate('/upload');
    },
    [navigate]
  );

  const value = useMemo<AppStateContextValue>(
    () => ({
      disclaimerAccepted,
      setDisclaimerAccepted,
      showLogin,
      setShowLogin,
      isLoggedIn,
      setIsLoggedIn,
      googleUser,
      file,
      setFile,
      department,
      setDepartment,
      completedCourses,
      setCompletedCourses,
      apiData,
      userPrefs,
      setUserPrefs,
      isLoading,
      degreePlan,
      setDegreePlan,
      isReturningUser,
      setIsReturningUser,
      planDegreeData,
      setPlanDegreeData,
      enteredViaGuestOverlay,
      setEnteredViaGuestOverlay,
      googleOAuthEnabled,
      usePlanDegreePage: true,
      handleFileChange,
      handleUploadAndParse,
      handleGenerate,
      handleGenerateDegreePlan,
      handlePlanDegreeComplete,
      fetchPlanDegreeData,
      handleLogoClick,
      handleSignOut,
      handleEditPlan,
      handleNewTranscript,
      onGoogleLogin,
    }),
    [
      disclaimerAccepted,
      setDisclaimerAccepted,
      showLogin,
      isLoggedIn,
      setIsLoggedIn,
      googleUser,
      file,
      department,
      completedCourses,
      apiData,
      userPrefs,
      isLoading,
      degreePlan,
      isReturningUser,
      planDegreeData,
      enteredViaGuestOverlay,
      googleOAuthEnabled,
      handleFileChange,
      handleUploadAndParse,
      handleGenerate,
      handleGenerateDegreePlan,
      handlePlanDegreeComplete,
      fetchPlanDegreeData,
      handleLogoClick,
      handleSignOut,
      handleEditPlan,
      handleNewTranscript,
      onGoogleLogin,
    ]
  );

  return (
    <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
