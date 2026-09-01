// DepthWizard — Global Application State
// Shared state passed through React context across all workflow steps.

import { createContext, useContext, useState, type ReactNode } from 'react';
import type {
  UploadResponse,
  DepthResponse,
  DSMResponse,
  CalibrationResult,
  ValidationResult,
} from '../api/client';

export type WorkflowStep =
  | 'landing'
  | 'analysis'
  | 'depth'
  | 'dsm'
  | 'calibration'
  | 'terrain'
  | 'analysis-3d'
  | 'validation';

export const STEPS: { id: WorkflowStep; label: string; short: string }[] = [
  { id: 'landing',      label: 'Upload Image',       short: 'Upload' },
  { id: 'analysis',     label: 'Image Analysis',      short: 'Analysis' },
  { id: 'depth',        label: 'Depth Estimation',    short: 'Depth' },
  { id: 'dsm',          label: 'DSM Generation',      short: 'DSM' },
  { id: 'calibration',  label: 'Scale Calibration',   short: 'Calibrate' },
  { id: 'terrain',      label: '3D Terrain',          short: '3D View' },
  { id: 'analysis-3d',  label: 'Height & Slope',      short: 'Analysis' },
  { id: 'validation',   label: 'Validation',          short: 'Validate' },
];

interface AppState {
  // Current workflow position
  currentStep: WorkflowStep;
  setCurrentStep: (step: WorkflowStep) => void;

  // Session
  sessionId: string | null;

  // Step data
  uploadData: UploadResponse | null;
  depthData: DepthResponse | null;
  dsmData: DSMResponse | null;
  calibrationData: CalibrationResult | null;
  validationData: ValidationResult | null;

  // Setters
  setSessionId: (id: string) => void;
  setUploadData: (d: UploadResponse) => void;
  setDepthData: (d: DepthResponse) => void;
  setDsmData: (d: DSMResponse) => void;
  setCalibrationData: (d: CalibrationResult) => void;
  setValidationData: (d: ValidationResult) => void;

  // Reset to start a new workflow
  reset: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('landing');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null);
  const [depthData, setDepthData] = useState<DepthResponse | null>(null);
  const [dsmData, setDsmData] = useState<DSMResponse | null>(null);
  const [calibrationData, setCalibrationData] = useState<CalibrationResult | null>(null);
  const [validationData, setValidationData] = useState<ValidationResult | null>(null);

  function reset() {
    setCurrentStep('landing');
    setSessionId(null);
    setUploadData(null);
    setDepthData(null);
    setDsmData(null);
    setCalibrationData(null);
    setValidationData(null);
  }

  return (
    <AppContext.Provider
      value={{
        currentStep, setCurrentStep,
        sessionId, setSessionId,
        uploadData, setUploadData,
        depthData, setDepthData,
        dsmData, setDsmData,
        calibrationData, setCalibrationData,
        validationData, setValidationData,
        reset,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppState must be used inside AppProvider');
  return ctx;
}
