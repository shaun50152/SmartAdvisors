import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import DisclaimerModal from './components/DisclaimerModal';
import WelcomePage from './components/WelcomePage';
import LoginPage, { GoogleUser } from './components/LoginPage';
import UploadScreen from './components/UploadScreen';
import TranscriptReview from './components/TranscriptReview';
import PreferenceForm, { Preferences } from './components/PreferenceForm';
import RecommendationDashboard from './components/RecommendationDashboard';
import DegreePlanSetup from './components/DegreePlanSetup';
import SemesterPlanView from './components/SemesterPlanView';

// Use localhost for local development
const API_URL = 'http://127.0.0.1:8000';

// link to run locally: http://localhost:5173/

interface ApiRecommendationResponse {
  success: boolean;
  recommendations: any[];
  electiveRecommendations?: any[];
  stats?: any;
}

/*
  Step flow:
  0  = WelcomePage  (Guest + Sign In buttons)
  0.5 = LoginPage   (SSO wireframe, only if "Sign In" clicked)
  1  = UploadScreen
  2  = TranscriptReview
  --- branches here ---
  Guest:     3 = PreferenceForm → 4 = RecommendationDashboard
  Logged-in: 3 = DegreePlanSetup → 4 = SemesterPlanView
*/

function App() {
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [step, setStep] = useState<number>(0);
  const [showLogin, setShowLogin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [department, setDepartment] = useState<string>('CE');
  const [completedCourses, setCompletedCourses] = useState<string[]>([]);
  const [apiData, setApiData] = useState<ApiRecommendationResponse | null>(null);
  const [userPrefs, setUserPrefs] = useState<Preferences | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [degreePlan, setDegreePlan] = useState<any>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [step, showLogin]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUploadAndParse = async () => {
    if (!file) return;
    setIsLoading(true);

    const formData = new FormData();
    formData.append('transcript', file);

    try {
      const response = await fetch(`${API_URL}/api/parse-transcript`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (response.ok && data.courses) {
        setCompletedCourses(data.courses);
        setStep(2);
      } else {
        alert("Error parsing transcript: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Parse error:", error);
      alert("Could not connect to server. Is the backend running?");
    } finally {
      setIsLoading(false);
    }
  };

  // Guest flow: preferences → recommendations
  const handleGenerate = async (preferences: Preferences) => {
    setUserPrefs(preferences);
    setIsLoading(true);

    const formData = new FormData();
    formData.append('completed_courses', JSON.stringify(completedCourses));
    formData.append('department', department);
    formData.append('preferences', JSON.stringify(preferences));

    try {
      const response = await fetch(`${API_URL}/api/recommendations`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        setApiData(data);
        setStep(4);
      } else {
        alert("Error: " + (data.error || "Unknown error occurred"));
      }
    } catch (error) {
      alert("Could not connect to server.");
    } finally {
      setIsLoading(false);
    }
  };

  // Logged-in flow: degree plan generation
  const handleGenerateDegreePlan = async (creditsPerSemester: number, selectedCourses: string[]) => {
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/degree-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completed_courses: completedCourses,
          department,
          credits_per_semester: creditsPerSemester,
          selected_next_semester: selectedCourses,
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setDegreePlan(data);
        setStep(4);
      } else {
        alert("Error: " + (data.error || "Could not generate degree plan"));
      }
    } catch (error) {
      alert("Could not connect to server.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogoClick = () => {
    setStep(0);
    setShowLogin(false);
    setIsLoggedIn(false);
    setGoogleUser(null);
  };

  // --- Disclaimer overlay (blocks everything) ---
  if (!disclaimerAccepted) {
    return <DisclaimerModal onAccept={() => setDisclaimerAccepted(true)} />;
  }

  // --- Login page (sub-state of step 0) ---
  if (showLogin && step === 0) {
    return (
      <Layout onLogoClick={handleLogoClick}>
        <LoginPage
          onGuestContinue={() => { setIsLoggedIn(false); setShowLogin(false); setStep(1); }}
          onLogin={(user) => { setGoogleUser(user); setIsLoggedIn(true); setShowLogin(false); setStep(1); }}
          onBack={() => setShowLogin(false)}
        />
      </Layout>
    );
  }

  // --- Main step flow ---
  if (step === 0) return (
    <Layout onLogoClick={handleLogoClick}>
      <WelcomePage
        onGetStarted={() => { setIsLoggedIn(false); setStep(1); }}
        onSignIn={() => setShowLogin(true)}
      />
    </Layout>
  );

  if (step === 1) return (
    <Layout onLogoClick={handleLogoClick}>
      <UploadScreen file={file} department={department} onFileChange={handleFileChange} setDepartment={setDepartment} onNext={handleUploadAndParse} onBack={() => setStep(0)} />
    </Layout>
  );

  if (step === 2) return (
    <Layout onLogoClick={handleLogoClick}>
      <TranscriptReview courses={completedCourses} onNext={() => setStep(3)} onBack={() => setStep(1)} />
    </Layout>
  );

  // Step 3: branches based on login state
  if (step === 3) {
    if (isLoggedIn) {
      return (
        <Layout onLogoClick={handleLogoClick}>
          <DegreePlanSetup
            completedCourses={completedCourses}
            department={department}
            onPlanGenerated={handleGenerateDegreePlan}
            isLoading={isLoading}
            onBack={() => setStep(2)}
          />
        </Layout>
      );
    }
    return (
      <Layout onLogoClick={handleLogoClick}>
        <PreferenceForm onGenerateSchedule={handleGenerate} isLoading={isLoading} onBack={() => setStep(2)} />
      </Layout>
    );
  }

  // Step 4: branches based on login state
  if (step === 4) {
    if (isLoggedIn && degreePlan) {
      return (
        <Layout onLogoClick={handleLogoClick}>
          <SemesterPlanView plan={degreePlan} onBack={() => setStep(3)} />
        </Layout>
      );
    }
    if (apiData && userPrefs) {
      return (
        <Layout onLogoClick={handleLogoClick}>
          <RecommendationDashboard
            userData={{
              preferences: userPrefs,
              recommendations: apiData.recommendations,
              electiveRecommendations: apiData.electiveRecommendations || [],
              stats: apiData.stats,
            }}
            onBack={() => setStep(3)}
          />
        </Layout>
      );
    }
  }

  return <div>Loading...</div>;
}

export default App;
