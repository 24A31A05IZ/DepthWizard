/* DepthWizard — Step Navigation Sidebar */

import { CheckCircle, Circle, Loader } from 'lucide-react';
import { STEPS, type WorkflowStep, useAppState } from '../store/AppContext';
import styles from './StepNav.module.css';

const STEP_ORDER: WorkflowStep[] = STEPS.map(s => s.id);

function getStatus(step: WorkflowStep, current: WorkflowStep, data: Record<string, unknown>) {
  const currentIdx = STEP_ORDER.indexOf(current);
  const stepIdx = STEP_ORDER.indexOf(step);

  // Check if step has data
  const hasData: Record<WorkflowStep, boolean> = {
    landing: false,
    analysis: !!data.uploadData,
    depth: !!data.depthData,
    dsm: !!data.dsmData,
    calibration: false, // optional step
    terrain: !!data.dsmData,
    'analysis-3d': !!data.dsmData,
    validation: !!data.validationData,
  };

  if (step === current) return 'active';
  if (hasData[step]) return 'done';
  if (stepIdx < currentIdx) return 'done';
  return 'pending';
}

interface StepNavProps {
  loading?: boolean;
}

export default function StepNav({ loading }: StepNavProps) {
  const state = useAppState();
  const { currentStep, setCurrentStep, uploadData, depthData, dsmData, validationData } = state;

  function canNavigateTo(step: WorkflowStep): boolean {
    if (step === 'landing') return true;
    if (step === 'analysis') return !!uploadData;
    if (step === 'depth') return !!uploadData;
    if (step === 'dsm') return !!depthData;
    if (step === 'calibration') return !!dsmData;
    if (step === 'terrain') return !!dsmData;
    if (step === 'analysis-3d') return !!dsmData;
    if (step === 'validation') return !!dsmData;
    return false;
  }

  return (
    <nav className={styles.nav}>
      {/* Logo area */}
      <div className={styles.logo}>
        <div className={styles.logoIcon}>
          <svg viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="14" stroke="#2e86de" strokeWidth="1.5"/>
            <circle cx="16" cy="16" r="7" stroke="#00d4ff" strokeWidth="1.5"/>
            <circle cx="16" cy="16" r="2" fill="#00d4ff"/>
            <line x1="16" y1="2" x2="16" y2="8" stroke="#2e86de" strokeWidth="1.5"/>
            <line x1="16" y1="24" x2="16" y2="30" stroke="#2e86de" strokeWidth="1.5"/>
            <line x1="2" y1="16" x2="8" y2="16" stroke="#2e86de" strokeWidth="1.5"/>
            <line x1="24" y1="16" x2="30" y2="16" stroke="#2e86de" strokeWidth="1.5"/>
          </svg>
        </div>
        <div>
          <div className={styles.logoText}>DepthWizard</div>
          <div className={styles.logoSub}>SIH26175 · ISRO</div>
        </div>
      </div>

      <div className={styles.divider} />

      {/* Steps */}
      <div className={styles.steps}>
        {STEPS.map((step, idx) => {
          const status = getStatus(step.id, currentStep, { uploadData, depthData, dsmData, validationData });
          const canGo = canNavigateTo(step.id);
          const isActive = step.id === currentStep;
          const isOptional = step.id === 'calibration';

          return (
            <button
              key={step.id}
              className={`${styles.step} ${styles[status]} ${!canGo ? styles.disabled : ''}`}
              onClick={() => canGo && setCurrentStep(step.id)}
              disabled={!canGo || (isActive && loading)}
            >
              <div className={styles.stepIndicator}>
                <span className={styles.stepNumber}>{String(idx + 1).padStart(2, '0')}</span>
                <div className={styles.stepIcon}>
                  {isActive && loading ? (
                    <Loader size={14} className={styles.spinner} />
                  ) : status === 'done' ? (
                    <CheckCircle size={14} />
                  ) : (
                    <Circle size={14} />
                  )}
                </div>
                {idx < STEPS.length - 1 && <div className={styles.stepLine} />}
              </div>
              <div className={styles.stepContent}>
                <span className={styles.stepLabel}>{step.label}</span>
                {isOptional && <span className={styles.optionalBadge}>optional</span>}
              </div>
            </button>
          );
        })}
      </div>

      <div className={styles.footer}>
        <div className={styles.footerBadge}>PROTOTYPE</div>
        <div className={styles.footerText}>SIH 2026 Demo</div>
      </div>
    </nav>
  );
}
