import { ApiClient } from './apiClient';
import CursorFlow from './cursorFlow';
import { CopilotModal } from './copilotModal';
import { OnboardingModal } from './onboardingChecklist';
import { FlowExecutionTracker } from './flowExecutionTracker';
import { CursorFlowOptions } from './types';

// Define the API URL constant - same as in cursorFlow.ts
const API_URL = 'https://hyphenbox-backend.onrender.com';
// const API_URL = 'http://localhost:8000';

// Export CursorFlow as the default export (for browser compatibility)
export default CursorFlow;

export interface HyphenboxSDK {
  onboarding: {
    /** Shows the Onboarding Checklist modal. */
    show: () => void;
  };
  copilot: {
    /** Shows the main Copilot modal with search and links to other apps. */
    show: () => void;
  };
  viewAllGuides: {
    /** Shows the modal for listing all available guides. (Currently opens CopilotModal in list view) */
    show: () => void;
  };
  // apiClient can be exposed if direct API access is ever needed by advanced users
  // apiClient: ApiClient;
}

export interface HyphenboxInitializeOptions extends CursorFlowOptions {
  useDefaultLauncher?: boolean; // Defaults to true. If true, shows the main Hyphenbox launcher.
  // apiKey, userId, theme, debug are inherited from CursorFlowOptions
}

/**
 * Initialize the Hyphen SDK
 * This is the main entry point for the Hyphen SDK
 */
export function initialize(options: HyphenboxInitializeOptions): HyphenboxSDK {
  // Ensure required options are provided
  if (!options.apiKey) {
    throw new Error('apiKey is required');
  }
  if (!options.userId) {
    throw new Error('userId is required');
  }

  const useDefaultLauncher = options.useDefaultLauncher !== undefined ? options.useDefaultLauncher : true;

  const apiClientInstance = new ApiClient(
    API_URL,
    options.apiKey,
    options.userId
  );

  const cursorFlowOptions: CursorFlowOptions = {
    ...options, // Pass all original options (apiKey, userId, theme, debug, buttonText for default launcher)
    apiClient: apiClientInstance,
  };

  const cursorFlow = new CursorFlow(cursorFlowOptions);
  // CursorFlow's init will handle the useDefaultLauncher flag
  cursorFlow.init(useDefaultLauncher);

  const internalStartGuide = (guideId: string) => {
    // Ensure startGuideById is public on CursorFlow instance and correctly typed.
    (cursorFlow as any).startGuideById(guideId); 
  };

  // Initialize modals so their static methods are ready
  // MainLauncherModal.init(...) // Removed
  
  CopilotModal.init(
    apiClientInstance,
    internalStartGuide,
    options.theme || {}
  );

  OnboardingModal.init(
    apiClientInstance,
    internalStartGuide,
    options.theme || {}
  );

  const sdk: HyphenboxSDK = {
    onboarding: {
      show: () => OnboardingModal.showOnboardingModal(),
    },
    copilot: {
      show: () => CopilotModal.showSearchModal(),
    },
    viewAllGuides: {
      show: () => {
        CopilotModal.showSearchModal();
      },
    },
    // apiClient: apiClientInstance, // Expose if needed
  };

  return sdk;
}

// Also export other components for advanced usage
export { ApiClient, CursorFlow, CopilotModal, OnboardingModal, FlowExecutionTracker };
export * from './types';

// Ensure Hyphenbox SDK is available on the window object for the extension and direct script integrations
if (typeof window !== 'undefined') {
  (window as any).Hyphenbox = {
    initialize,
    ApiClient,
    CursorFlow,
    CopilotModal,     // Will be removed/refactored
    OnboardingModal,
    FlowExecutionTracker
    // Add other exports from './types' if they need to be directly on window.Hyphenbox.types
  };
}
