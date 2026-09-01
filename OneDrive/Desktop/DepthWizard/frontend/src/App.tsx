import type { ReactNode } from 'react';
import { AppProvider, useAppState } from './store/AppContext';
import StepNav from './components/StepNav';
import LandingPage from './pages/LandingPage';
import ImageAnalysisPage from './pages/ImageAnalysisPage';
import DepthEstimationPage from './pages/DepthEstimationPage';
import ScaleCalibrationPage from './pages/ScaleCalibrationPage';
import DSMGenerationPage from './pages/DSMGenerationPage';
import TerrainViewerPage from './pages/TerrainViewerPage';
import HeightAnalysisPage from './pages/HeightAnalysisPage';
import ValidationPage from './pages/ValidationPage';
import appStyles from './App.module.css';

function WorkflowShell() {
  const { currentStep } = useAppState();

  const isLanding = currentStep === 'landing';

  const pageMap: Record<string, ReactNode> = {
    landing: <LandingPage />,
    analysis: <ImageAnalysisPage />,
    depth: <DepthEstimationPage />,
    calibration: <ScaleCalibrationPage />,
    dsm: <DSMGenerationPage />,
    terrain: <TerrainViewerPage />,
    'analysis-3d': <HeightAnalysisPage />,
    validation: <ValidationPage />,
  };

  if (isLanding) {
    return <LandingPage />;
  }

  return (
    <div className={appStyles.shell}>
      <StepNav />
      <main className={appStyles.main}>
        {pageMap[currentStep] ?? <LandingPage />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <WorkflowShell />
    </AppProvider>
  );
}
