import React, { useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Layout from '../components/Layout';
import WelcomePage from '../components/WelcomePage';
import SignInOverlay from '../components/SignInOverlay';
import UploadScreen from '../components/UploadScreen';
import TranscriptReview from '../components/TranscriptReview';
import ProfessorPreferencesOnboarding, {
  onboardingSelectionsToPreferences,
} from '../components/ProfessorPreferencesOnboarding';
import ProcessingOverlay from '../components/ProcessingOverlay';
import YourRecommendations from '../components/YourRecommendations';
import DegreePlanSetup from '../components/DegreePlanSetup';
import SemesterPlanView from '../components/SemesterPlanView';
import PlanDegreePage from '../components/PlanDegreePage';
import DashboardLayout from '../components/DashboardLayout';
import DashboardPage from '../components/DashboardPage';
import { getDegreeName, getCollegeName } from '../config/colleges';
import DisclaimerModal from '../components/DisclaimerModal';
import type { ProgressStats } from '../components/YourRecommendations';
import { useAppState } from '../context/AppStateContext';

function RequireDegreePlan({ children }: { children: React.ReactNode }) {
  const { degreePlan, isLoggedIn } = useAppState();
  if (!isLoggedIn) return <Navigate to="/" replace />;
  if (!degreePlan) return <Navigate to="/upload" replace />;
  return <>{children}</>;
}

function RequireGuestRecommendations({ children }: { children: React.ReactNode }) {
  const { apiData, userPrefs, isLoggedIn } = useAppState();
  if (isLoggedIn) return <Navigate to="/upload" replace />;
  if (!userPrefs || !apiData) return <Navigate to="/preferences" replace />;
  return <>{children}</>;
}

function RequireDegreePlanner({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, userPrefs } = useAppState();
  if (!isLoggedIn) return <Navigate to="/" replace />;
  if (!userPrefs) return <Navigate to="/preferences" replace />;
  return <>{children}</>;
}

function RequireTranscriptContext({ children }: { children: React.ReactNode }) {
  const { completedCourses, department } = useAppState();
  if (!department) return <Navigate to="/upload" replace />;
  if (completedCourses.length === 0) return <Navigate to="/upload" replace />;
  return <>{children}</>;
}

function HomeRoute() {
  const navigate = useNavigate();
  const {
    showLogin,
    setShowLogin,
    googleOAuthEnabled,
    onGoogleLogin,
    setEnteredViaGuestOverlay,
    setIsLoggedIn,
    handleLogoClick,
  } = useAppState();

  return (
    <>
      <motion.div
        animate={showLogin ? { scale: 0.97, opacity: 0 } : { scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        style={{ pointerEvents: showLogin ? 'none' : undefined }}
      >
        <Layout onLogoClick={handleLogoClick} onSignIn={() => setShowLogin(true)}>
          <WelcomePage
            onGetStarted={() => {
              setIsLoggedIn(false);
              setEnteredViaGuestOverlay(false);
              navigate('/upload');
            }}
            onSignIn={() => setShowLogin(true)}
          />
        </Layout>
      </motion.div>
      <SignInOverlay
        isVisible={showLogin}
        googleOAuthEnabled={googleOAuthEnabled}
        onLogin={onGoogleLogin}
        onGuestContinue={() => {
          setIsLoggedIn(false);
          setShowLogin(false);
          setEnteredViaGuestOverlay(true);
          navigate('/upload');
        }}
        onClose={() => setShowLogin(false)}
      />
    </>
  );
}

function UploadRoute() {
  const navigate = useNavigate();
  const {
    file,
    department,
    handleFileChange,
    setFile,
    setDepartment,
    handleUploadAndParse,
    isLoading,
    isLoggedIn,
    googleUser,
    handleSignOut,
    handleLogoClick,
    setCompletedCourses,
    enteredViaGuestOverlay,
    setEnteredViaGuestOverlay,
    setShowLogin,
  } = useAppState();

  return (
    <Layout
      onLogoClick={handleLogoClick}
      user={isLoggedIn ? googleUser ?? undefined : undefined}
      onSignOut={isLoggedIn ? handleSignOut : undefined}
      fullViewport
    >
      <UploadScreen
        file={file}
        department={department}
        onFileChange={handleFileChange}
        onClearFile={() => setFile(null)}
        setDepartment={setDepartment}
        onNext={handleUploadAndParse}
        onSkipTranscript={() => {
          setCompletedCourses([]);
          navigate('/preferences');
        }}
        onBack={() => {
          if (enteredViaGuestOverlay) {
            setEnteredViaGuestOverlay(false);
            navigate('/');
            setShowLogin(true);
          } else {
            navigate('/');
          }
        }}
        isLoading={isLoading}
      />
    </Layout>
  );
}

function TranscriptRoute() {
  const navigate = useNavigate();
  const {
    completedCourses,
    isLoggedIn,
    googleUser,
    handleSignOut,
    handleLogoClick,
  } = useAppState();

  return (
    <Layout
      onLogoClick={handleLogoClick}
      user={isLoggedIn ? googleUser ?? undefined : undefined}
      onSignOut={isLoggedIn ? handleSignOut : undefined}
      fullViewport
    >
      <TranscriptReview
        courses={completedCourses}
        onNext={() => navigate('/preferences')}
        onBack={() => navigate('/upload')}
      />
    </Layout>
  );
}

function PreferencesRoute() {
  const navigate = useNavigate();
  const {
    isLoggedIn,
    googleUser,
    handleSignOut,
    handleLogoClick,
    handleGenerate,
    setUserPrefs,
    isLoading,
    completedCourses,
  } = useAppState();

  if (isLoggedIn) {
    return (
      <Layout
        onLogoClick={handleLogoClick}
        user={googleUser ?? undefined}
        onSignOut={handleSignOut}
        fullViewport
      >
        <ProfessorPreferencesOnboarding
          onBack={() =>
            navigate(completedCourses.length ? '/transcript' : '/upload')
          }
          onComplete={(p, l, a) => {
            setUserPrefs(onboardingSelectionsToPreferences(p, l, a));
            navigate('/degree-planner');
          }}
        />
      </Layout>
    );
  }

  return (
    <>
      <Layout onLogoClick={handleLogoClick} fullViewport>
        <ProfessorPreferencesOnboarding
          onBack={() =>
            navigate(completedCourses.length ? '/transcript' : '/upload')
          }
          onComplete={(p, l, a) =>
            handleGenerate(onboardingSelectionsToPreferences(p, l, a))
          }
        />
      </Layout>
      <ProcessingOverlay
        isVisible={isLoading}
        title="Finding your matches"
        steps={[
          'Analyzing preferences...',
          'Matching professors...',
          'Building your list...',
        ]}
        icon="recommend"
      />
    </>
  );
}

function DegreePlannerRoute() {
  const navigate = useNavigate();
  const {
    planDegreeData,
    fetchPlanDegreeData,
    isLoading,
    googleUser,
    handleSignOut,
    handleLogoClick,
    handlePlanDegreeComplete,
    setUserPrefs,
    usePlanDegreePage,
    completedCourses,
    department,
    handleGenerateDegreePlan,
  } = useAppState();

  const fetched = useRef(false);
  useEffect(() => {
    const has =
      planDegreeData.requiredCourses.length > 0 ||
      planDegreeData.electiveCourses.length > 0;
    if (fetched.current) return;
    if (has || isLoading) return;
    fetched.current = true;
    fetchPlanDegreeData();
  }, [planDegreeData, isLoading, fetchPlanDegreeData]);

  if (!usePlanDegreePage) {
    return (
      <Layout
        onLogoClick={handleLogoClick}
        user={googleUser ?? undefined}
        onSignOut={handleSignOut}
      >
        <DegreePlanSetup
          completedCourses={completedCourses}
          department={department}
          onPlanGenerated={handleGenerateDegreePlan}
          isLoading={isLoading}
          onBack={() => {
            setUserPrefs(null);
            navigate('/preferences');
          }}
        />
      </Layout>
    );
  }

  return (
    <>
      <Layout
        onLogoClick={handleLogoClick}
        user={googleUser ?? undefined}
        onSignOut={handleSignOut}
      >
        <PlanDegreePage
          student={planDegreeData.student}
          requiredCourses={planDegreeData.requiredCourses}
          electiveCourses={planDegreeData.electiveCourses}
          loading={isLoading}
          onComplete={handlePlanDegreeComplete}
          onBack={() => {
            setUserPrefs(null);
            navigate('/preferences');
          }}
        />
      </Layout>
      <ProcessingOverlay
        isVisible={isLoading}
        title="Building Your Degree Plan"
        steps={[
          'Checking prerequisites...',
          'Scheduling courses by priority...',
          'Finding top professors...',
          'Finalizing your plan...',
        ]}
        icon="plan"
      />
    </>
  );
}

function DashboardRoute() {
  const navigate = useNavigate();
  const {
    googleUser,
    degreePlan,
    department,
    handleLogoClick,
    handleSignOut,
    setIsReturningUser,
    handleEditPlan,
    handleNewTranscript,
  } = useAppState();

  if (!googleUser) return <Navigate to="/" replace />;

  const handleNavClick = (id: string) => {
    if (id === 'plan') {
      setIsReturningUser(false);
      navigate('/plan');
    }
  };

  return (
    <DashboardLayout
      userName={googleUser.name}
      userPicture={googleUser.picture}
      department={getDegreeName(department) || department}
      onSignOut={handleSignOut}
      onNavClick={handleNavClick}
      onLogoClick={handleLogoClick}
    >
      <DashboardPage
        userName={googleUser.name}
        department={getDegreeName(department) || department}
        college={getCollegeName(department) || 'College of Engineering'}
        degreePlan={(degreePlan as any)?.degreePlan || degreePlan as any}
        onViewPlan={() => { setIsReturningUser(false); navigate('/plan'); }}
        onEditPlan={handleEditPlan}
        onNewTranscript={handleNewTranscript}
      />
    </DashboardLayout>
  );
}

function PlanRoute() {
  const {
    degreePlan,
    googleUser,
    handleLogoClick,
    handleSignOut,
    handleEditPlan,
    handleNewTranscript,
  } = useAppState();

  return (
    <Layout
      onLogoClick={handleLogoClick}
      user={googleUser ?? undefined}
      onSignOut={handleSignOut}
    >
      <SemesterPlanView
        plan={degreePlan as never}
        onBack={() => handleEditPlan()}
        onEditPlan={handleEditPlan}
        onNewTranscript={handleNewTranscript}
      />
    </Layout>
  );
}

function RecommendationsRoute() {
  const navigate = useNavigate();
  const { handleLogoClick } = useAppState();

  return (
    <Layout onLogoClick={handleLogoClick} fullViewport>
      <RecommendationsInner onBack={() => navigate('/preferences')} />
    </Layout>
  );
}

function RecommendationsInner({ onBack }: { onBack: () => void }) {
  const { apiData, userPrefs } = useAppState();
  if (!apiData || !userPrefs) return null;
  return (
    <YourRecommendations
      userData={{
        recommendations: apiData.recommendations as never[],
        electiveRecommendations: (apiData.electiveRecommendations || []) as never[],
        stats: apiData.stats as ProgressStats | undefined,
      }}
      onBack={onBack}
      onExport={() => window.print()}
    />
  );
}

export default function AppRoutes() {
  const { disclaimerAccepted, setDisclaimerAccepted } = useAppState();

  if (!disclaimerAccepted) {
    return (
      <DisclaimerModal
        onAccept={() => {
          setDisclaimerAccepted(true);
        }}
      />
    );
  }

  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/upload" element={<UploadRoute />} />
      <Route
        path="/transcript"
        element={
          <RequireTranscriptContext>
            <TranscriptRoute />
          </RequireTranscriptContext>
        }
      />
      <Route path="/preferences" element={<PreferencesRoute />} />
      <Route
        path="/degree-planner"
        element={
          <RequireDegreePlanner>
            <DegreePlannerRoute />
          </RequireDegreePlanner>
        }
      />
      <Route
        path="/dashboard"
        element={
          <RequireDegreePlan>
            <DashboardRoute />
          </RequireDegreePlan>
        }
      />
      <Route
        path="/plan"
        element={
          <RequireDegreePlan>
            <PlanRoute />
          </RequireDegreePlan>
        }
      />
      <Route
        path="/recommendations"
        element={
          <RequireGuestRecommendations>
            <RecommendationsRoute />
          </RequireGuestRecommendations>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
