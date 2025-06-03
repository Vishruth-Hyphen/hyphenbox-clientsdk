import { ApiClient } from './apiClient';
import { StateManager } from './manageState';
import { CursorFlowUI } from './uiComponents';
import { CursorFlowOptions, CursorFlowState, InteractionData, NotificationType, StopNotificationOptions } from './types';
import { RobustElementFinder } from './robustElementFinder';
import { SelectiveDomAnalyzer } from './selectiveDomAnalyzer';
import { ElementFinderStrategy, PageContextHint } from './elementFinderStrategy';
import { FlowExecutionTracker } from './flowExecutionTracker';
import { CopilotModal } from './copilotModal';

// const API_URL = 'https://hyphenbox-backend.onrender.com';
const API_URL = 'http://localhost:8000';

export default class CursorFlow {
    private options: CursorFlowOptions;
    private apiClient: ApiClient;
    private state: CursorFlowState;
    private executionTracker: FlowExecutionTracker;
    private cursorElement: HTMLElement | null = null;
    private highlightElement: HTMLElement | null = null;
    private currentTargetElement: HTMLElement | null = null;
    private currentListener: EventListener | null = null;
    private currentInteractionType: string | null = null;
    private recording: any = null;
    private guides: any[] = [];
    private autoProgressTimeout: any = null;
    private startButton: HTMLElement | null = null; // This is the default launcher button
    private sortedSteps: any[] = [];
    private isHandlingNavigation = false;
    private thinkingIndicator: HTMLElement | null = null;
    private validationLoopId: number | null = null;
    private isLoadingGuide = false;
    private operationToken: string = '';
    private invalidationInProgress = false;
    private isDropdownOpen = false;
    private guidanceCardElement: HTMLElement | null = null;
    private textPopupElement: HTMLElement | null = null;
    private dedicatedStopButton: HTMLElement | null = null; 
    private originalStartButtonOnClick: (() => void) | null = null;
    private startButtonIsStopButton: boolean = false;
    // New properties for copilot button strategy
    private copilotButton: HTMLElement | null = null;
    private originalCopilotButtonOnClick: (() => void) | null = null;
    private copilotButtonOriginalText: string = '';
    private lastStepInitiationUrl: string | null = null; // To track URL for quick checks

    constructor(options: CursorFlowOptions) {
      if (!options.userId) {
        throw new Error('userId is required for CursorFlow initialization');
      }
      
      this.options = {
        ...options,
        apiKey: options.apiKey, 
        userId: options.userId, 
        theme: options.theme || {},
        buttonText: options.buttonText,  // Remove fallback - use what's provided
        guidesButtonText: options.guidesButtonText, // Remove fallback
        debug: options.debug || false
      };
      
      if (options.apiClient) {
        this.apiClient = options.apiClient;
      } else {
        this.apiClient = new ApiClient(
          API_URL, 
          this.options.apiKey,
          this.options.userId
        );
      }
      
      this.state = {
        isPlaying: false,
        currentStep: 0,
        recordingId: null,
        completedSteps: [],
        timestamp: Date.now()
      };
      
      this.executionTracker = new FlowExecutionTracker(this.apiClient);
      this.operationToken = this.generateToken();
    }
    
    private setIsPlaying(value: boolean, immediateSave = false): void {
      if (this.state.isPlaying === value) return;
      
      this.debugLog(`Setting isPlaying state to: ${value}`);
      this.state.isPlaying = value;
      StateManager.saveWithDebounce(this.state, immediateSave);

      // Immediately update button state based on new playing state
      if (value) {
        this.setupStopButton();
      } else {
        // If stopping, also ensure isLoadingGuide is false and hide thinking indicator
        this.isLoadingGuide = false;
        this.hideThinking();
        this.restoreOriginalButtonFunctions(); // Changed from removeStopButton
      }
    }

    private setupStopButton(): void {
      this.debugLog('Setting up stop button');
      
      // Strategy 1: Try to use existing copilot button
      this.copilotButton = document.querySelector('.hyphen-copilot-button') as HTMLElement;
      
      if (this.copilotButton && document.body.contains(this.copilotButton)) {
        this.debugLog('Found copilot button, using it as stop button');
        this.useCopilotButtonAsStop();
        return;
      }

      // Strategy 2: Try to use existing start button (default launcher)
      const startButtonExists = this.startButton && document.body.contains(this.startButton);
      if (startButtonExists) {
        this.debugLog('No copilot button found, using start button as stop button');
        this.useStartButtonAsStop();
        return;
      }

      // Strategy 3: Create dedicated stop button
      this.debugLog('No existing buttons found, creating dedicated stop button');
      this.createDedicatedStopButton();
    }

    private useCopilotButtonAsStop(): void {
      if (!this.copilotButton) return;

      // Store original state
      this.copilotButtonOriginalText = this.copilotButton.textContent || '';
      // Store onclick handler if it exists
      if (this.copilotButton.onclick) {
        this.originalCopilotButtonOnClick = () => {
          if (this.copilotButton && this.copilotButton.onclick) {
            this.copilotButton.onclick.call(this.copilotButton, new MouseEvent('click'));
          }
        };
      }
      
      // Remove existing listeners and add stop functionality
      this.copilotButton.onclick = null;
      const clonedButton = this.copilotButton.cloneNode(true) as HTMLElement;
      this.copilotButton.parentNode?.replaceChild(clonedButton, this.copilotButton);
      this.copilotButton = clonedButton;
      
      // Transform to stop button
      this.copilotButton.textContent = 'Stop Guide';
      this.copilotButton.classList.add('hyphen-stop-guide-active');
      this.copilotButton.style.backgroundColor = this.options.theme?.brand_color || '#dc3545';
      this.copilotButton.addEventListener('click', this.stopFromButton);
    }

    private useStartButtonAsStop(): void {
      if (!this.startButton) return;

      // Store original handler if not already stored
      if (!this.originalStartButtonOnClick) {
        this.originalStartButtonOnClick = this.handleToggleClick; 
      }
      
      this.startButton.removeEventListener('click', this.originalStartButtonOnClick);
      this.startButton.addEventListener('click', this.stopFromButton);
      
      const textSpan = this.startButton.querySelector('.hyphen-text') as HTMLElement;
      if (textSpan) textSpan.textContent = 'Stop Guide';
      
      this.startButton.classList.add('hyphen-stop-guide-active'); 
      this.startButtonIsStopButton = true;
    }

    private createDedicatedStopButton(): void {
      if (this.dedicatedStopButton && document.body.contains(this.dedicatedStopButton)) {
        return; // Already exists
      }

      this.debugLog('Creating dedicated stop button');
      this.dedicatedStopButton = CursorFlowUI.createStartButton(
        'Stop Guide',
        this.options.theme?.brand_color || '#dc3545',
        this.stopFromButton,
        this.options.theme || {}
      );

      // Position in center bottom
      this.dedicatedStopButton.style.position = 'fixed';
      this.dedicatedStopButton.style.bottom = '20px';
      this.dedicatedStopButton.style.left = '50%';
      this.dedicatedStopButton.style.transform = 'translateX(-50%)';
      this.dedicatedStopButton.style.zIndex = '10001';
      this.dedicatedStopButton.classList.add('hyphen-dedicated-stop-button');
      
      document.body.appendChild(this.dedicatedStopButton);
    }

    private stopFromButton = () => {
      this.stop();
    }

    // Add missing fetchGuides method
    private async fetchGuides() {
      try {
        this.debugLog('Fetching guides...');
        // For now, just return since the specific implementation depends on your API
        return [];
      } catch (error) {
        console.error('Error fetching guides:', error);
        return [];
      }
    }
  
    async init(useDefaultLauncher: boolean = true): Promise<boolean> { 
      try {
        const isHealthy = await this.apiClient.checkHealth();
        if (!isHealthy) {
          console.error('[CursorFlow] API health check failed');
          return false;
        }
        
        // Check for auto-start after navigation
        let needsAutoStart = false;
        let autoStartGuideId: string | null = null;
        let autoStartToken: string | null = null;
        
        try {
          const autoStartData = sessionStorage.getItem('hyphen-auto-start-guide');
          if (autoStartData) {
            const parsed = JSON.parse(autoStartData);
            // Check if data is recent (within 30 seconds to handle slow navigations)
            if (Date.now() - parsed.timestamp < 30000) {
              needsAutoStart = true;
              autoStartGuideId = parsed.guideId;
              autoStartToken = parsed.token;
              this.debugLog('Found auto-start guide data:', parsed);
            }
            // Clear the data regardless of age
            sessionStorage.removeItem('hyphen-auto-start-guide');
          }
        } catch (error) {
          console.warn('Error checking auto-start data:', error);
        }
        
        const savedState = StateManager.restore();
        if (savedState) {
          this.state = savedState;
          if (this.state.isPlaying && !StateManager.isSessionActive()) {
            this.setIsPlaying(false, true); 
            // If we stop playing due to inactive session, ensure thinking indicator is also handled
            this.isLoadingGuide = false;
            this.hideThinking();
          }
          this.debugLog('Restored state:', this.state);
        }
        
        try {
          const fetchedTheme = await this.apiClient.getOrganizationTheme();
          if (fetchedTheme) {
            const normalizedTheme = {
              ...fetchedTheme,
              button_position: fetchedTheme.button_position || undefined,
              button_text: fetchedTheme.button_text || undefined,
            };
            this.options.theme = { ...this.options.theme, ...normalizedTheme }; 
            this.debugLog('Theme fetched and applied');
          }
        } catch (themeError) {
          console.error('[CursorFlow] Failed to fetch organization theme:', themeError);
        }
        
        await this.fetchGuides();
        
        if (useDefaultLauncher) {
          this.ensureStartButtonExists();
          if (this.startButton && !this.originalStartButtonOnClick) {
            this.originalStartButtonOnClick = this.handleToggleClick; 
          }
          this.updateButtonState();
        }
        
        window.addEventListener('beforeunload', () => {
          if (this.state.isPlaying) {
            StateManager.flushPendingSave();
          }
        });
        
        if (this.state.isPlaying && this.state.recordingId) {
          this.setIsPlaying(true);
          await this.loadRecording(this.state.recordingId);
          this.setupNavigationDetection();
          // Potentially show thinking indicator here if loading/resuming takes time
          this.showThinking(); 
          setTimeout(() => {
            this.handleNavigation(true); 
          }, 500);
        }
        
        // Auto-start guide after navigation
        if (needsAutoStart && autoStartGuideId && autoStartToken) {
          this.debugLog('Auto-starting guide after navigation:', autoStartGuideId);
          // Small delay to ensure page is ready
          this.isLoadingGuide = true; // Set loading flag
          this.showThinking();      // Show thinking before starting
          setTimeout(() => {
            // startGuideById will manage isLoadingGuide and hideThinking internally
            this.startGuideById(autoStartGuideId!);
          }, 1000);
        }
        
        return true;
      } catch (error) {
        console.error('[CursorFlow] Initialization failed:', error);
        return false;
      }
    }

    private ensureStartButtonExists(): void {
      if (this.startButton && document.body.contains(this.startButton)) {
        return;
      }
      
      const existingButton = document.querySelector('.hyphen-start-button') as HTMLElement;
      if (existingButton) {
        this.startButton = existingButton;
        this.startButton.removeEventListener('click', this.handleToggleClick); 
        this.startButton.addEventListener('click', this.handleToggleClick);
        if (!this.originalStartButtonOnClick) {
            this.originalStartButtonOnClick = this.handleToggleClick;
        }
        return;
      }
      
      // Use theme button_text without fallback - trust the database defaults
      const buttonText = this.options.theme?.button_text || this.options.buttonText || '';
      
      this.startButton = CursorFlowUI.createStartButton(
          buttonText,
          this.options.theme?.buttonColor || '#007bff',
          this.handleToggleClick,
          this.options.theme || {}
      );
      document.body.appendChild(this.startButton);
      if (!this.originalStartButtonOnClick) {
          this.originalStartButtonOnClick = this.handleToggleClick;
      }
    }

    private handleToggleClick = () => {
        CopilotModal.showSearchModal();
    }
  
    private updateButtonState() {
      if (!this.startButton || !document.body.contains(this.startButton)) {
          return; 
      }
      
      if (!this.state.isPlaying && !this.startButtonIsStopButton) {
        let textSpan = this.startButton.querySelector('.hyphen-text');
        if (!textSpan) {
            textSpan = document.createElement('span');
            textSpan.className = 'hyphen-text';
            const iconDiv = this.startButton.querySelector('.hyphen-icon');
            if (iconDiv && iconDiv.parentNode) {
              iconDiv.parentNode.appendChild(textSpan); 
            } else {
              this.startButton.appendChild(textSpan); 
            }
        }
        
        // Use theme button_text without hardcoded fallback
        const buttonText = this.options.theme?.button_text || this.options.buttonText || '';
        textSpan.textContent = buttonText;
        
        this.startButton.classList.remove('hyphen-stop-guide-active');
        this.startButton.style.backgroundColor = '#ffffff';
      }
    }

    stop(notificationOptions?: StopNotificationOptions) {
      const oldToken = this.operationToken;
      this.operationToken = this.generateToken();
      this.debugLog(`[STOP CALLED] Invalidating token ${oldToken}, new token ${this.operationToken}`);
      
      const wasPlaying = this.state.isPlaying;
      const flowId = this.state.recordingId;
      
      this.isLoadingGuide = false;
      this.hideThinking(); 
      
      // CRITICAL: Call setIsPlaying(false) first to ensure immediate button cleanup
      this.setIsPlaying(false, true);

      if (wasPlaying && flowId && this.executionTracker.isActive()) {
        let abandonReason: 'user_initiated' | 'element_not_found' | 'sdk_error' | 'navigation' = 'user_initiated';
        let details = 'User stopped the guide';
        
        if (notificationOptions) {
          if (notificationOptions.type === 'error') {
            if (notificationOptions.message?.includes('element')) {
              abandonReason = 'element_not_found';
              details = notificationOptions.message || 'Failed to find element';
            } else {
              abandonReason = 'sdk_error';
              details = notificationOptions.message || 'SDK error occurred';
            }
          } else if (notificationOptions.message?.includes('navigation') || notificationOptions.message?.includes('navigate')) {
            abandonReason = 'navigation';
            details = notificationOptions.message || 'User navigated away';
          }
        }
        
        if (!(notificationOptions?.type === 'success' && notificationOptions?.message?.includes('completed'))) {
          this.executionTracker.trackAbandonment(abandonReason, details)
            .catch(error => {
              console.warn(`Failed to track flow abandonment: ${error}`);
            });
        }
      }
      
      this.isDropdownOpen = false;
      const existingDropdown = document.getElementById('hyphen-guides-dropdown');
      if (existingDropdown) existingDropdown.remove();

      // this.thinkingIndicator is handled by hideThinking() above
      this.isLoadingGuide = false;
      this.stopValidationLoop();

      if (notificationOptions) {
        CursorFlowUI.showNotification({ ...notificationOptions, autoClose: notificationOptions.autoClose || 2000 });
      }
      
      this.debugLog('Stopping guide - Initiating immediate cleanup');
      CursorFlowUI.cleanupAllUI(false, true);
      
      this.state.currentStep = 0;
      this.state.recordingId = null;
      this.state.completedSteps = [];
      this.state.timestamp = Date.now();
      StateManager.clear();
      StateManager.clearSession();
      this.removeExistingListeners();
      this.cursorElement = null;
      this.highlightElement = null;
      this.currentTargetElement = null;
      this.invalidationInProgress = false;
      this.debugLog('Guide stopped, state reset, cleanup complete');
    }

    private async retrieveGuideData(guideId: string, token: string) {
      try {
        // Clear any previous redirect guide ID 
        try {
          localStorage.removeItem('hyphen_redirect_guide_id');
        } catch (err) {
          console.warn('Failed to clear previous redirect guide ID:', err);
        }
        
        this.debugLog(`Retrieving guide data for ID: ${guideId}, Token: ${token}`);
        // Validate token at the start of operation
        if (token !== this.operationToken) {
          this.debugLog('Operation was cancelled (token mismatch), aborting guide retrieval');
          this.isLoadingGuide = false; 
          this.hideThinking();    
          this.setIsPlaying(false, true);
          return;
        }
        
        // Fetch recording data
        const flowData = await this.apiClient.getRecording(guideId);
        
        // Check token again after async operation
        if (token !== this.operationToken) {
          this.debugLog('Operation was cancelled during API fetch, aborting guide processing');
          this.isLoadingGuide = false;
          this.hideThinking();
          this.setIsPlaying(false, true);
          return;
        }
        
        this.debugLog('Retrieved guide data:', flowData);
        
        // Get texts if needed
        const texts = await this.apiClient.getTexts(guideId);
        
        // Check token again
        if (token !== this.operationToken) {
          this.debugLog('Operation was cancelled during texts fetch, aborting guide processing');
          this.isLoadingGuide = false;
          this.hideThinking();
          this.setIsPlaying(false, true);
          return;
        }
        
        this.debugLog('Retrieved guide texts:', texts);
        
        // Store the recording
        this.recording = flowData;
        
        // Sort steps
        if (this.recording && this.recording.steps) {
          this.sortedSteps = [...this.recording.steps].sort((a, b) => {
            return (a.position || 0) - (b.position || 0);
          });
        }
        
        // Final token check before proceeding
        if (token !== this.operationToken) {
          this.debugLog('Operation was cancelled after step sorting, aborting guide start');
          this.isLoadingGuide = false;
          this.hideThinking();
          this.setIsPlaying(false, true);
          return;
        }
        
        // Clear previous state for this guide ID (using StateManager)
        StateManager.clear();
        
        // NEW: Check if user is on the correct starting page
        if (this.recording && this.recording.steps && this.recording.steps.length > 0) {
          // Find the first step
          const sortedSteps = [...this.recording.steps].sort((a, b) => {
            return (a.position || 0) - (b.position || 0);
          });
          
          const firstStep = sortedSteps[0];
          
          // Add debugging logs
          this.debugLog('URL CHECK DEBUG: First step data:', {
            firstStepUrl: firstStep.url,
            firstStepPageInfo: firstStep.interaction?.pageInfo,
            currentUrl: window.location.href,
            firstStepPath: firstStep.interaction?.pageInfo?.path || 'not set'
          });
          
          // Extract URL info from the step - check interaction.pageInfo
          const pageInfo = firstStep.interaction?.pageInfo;
          const stepUrl = pageInfo?.url;
          const stepPath = pageInfo?.path;
          
          // Check if we have URL info to compare
          const hasUrlToCheck = !!stepUrl || !!stepPath;
          
          // Only show redirect if there's a URL to redirect to
          const targetUrl = stepUrl || (stepPath ? new URL(stepPath, window.location.origin).href : null);
          
          // Check URL matching - use URL first, then fall back to path
          // RobustElementFinder.compareUrls is a static method, so we can call it directly if needed elsewhere
          // but it's not used in the main flow after this change.
          const isUrlMatch = stepUrl ? RobustElementFinder.compareUrls(stepUrl, window.location.href) : false;        
          const isPathMatch = stepPath ? window.location.pathname === stepPath : false;
          
          this.debugLog('URL CHECK DETAILS:', { 
            hasUrlToCheck, 
            stepUrl, 
            stepPath, 
            targetUrl, 
            isUrlMatch, 
            isPathMatch,
            currentPath: window.location.pathname
          });
          
          // Hide thinking indicator if we're showing a notification
          if (hasUrlToCheck && !isUrlMatch && !isPathMatch) {
            // User is not on the correct starting page
            this.debugLog('URL CHECK FAILED: User is not on the correct starting page for the guide.');
            
            // OPTION 3: Try to find the first step element on current page before navigating
            try {
              this.debugLog('Attempting intelligent element detection on current page for first step...');
              
              const firstStepElementData = firstStep.interaction?.element || {};
              let firstStepCandidates: HTMLElement[] = [];

              // MODIFIED: Directly use RobustElementFinder for this initial, specialized check.
              // HierarchicalElementFinder was an option here, but we are removing it.
              this.debugLog('Using RobustElementFinder for first step detection on current page...');
              firstStepCandidates = await RobustElementFinder.findCandidates(firstStep.interaction); 
              
              if (firstStepCandidates.length > 0) {
                this.debugLog('SUCCESS: Found target element for first step on current page! Starting guide here.');
                // Element found on current page - we can start the guide here!
                // Hide thinking indicator before starting
                if (this.thinkingIndicator) {
                  CursorFlowUI.hideThinkingIndicator(this.thinkingIndicator);
                  this.thinkingIndicator = null;
                }
                this.isLoadingGuide = false;
                this.hideThinking();
                // Start the guide normally - element exists here
                await this.startGuide(guideId, token);
                return;
              } else {
                this.debugLog('Element not found on current page, proceeding with navigation...');
              }
            } catch (elementError) {
              this.debugLog('Error during element detection:', elementError);
              // Continue with navigation fallback
            }
            
            // Hide thinking indicator before showing notification
            if (this.thinkingIndicator) {
              CursorFlowUI.hideThinkingIndicator(this.thinkingIndicator);
              this.thinkingIndicator = null;
            }
            this.isLoadingGuide = false; 
            this.hideThinking();     

            if (targetUrl) {
              this.debugLog(`Navigating to target URL: ${targetUrl} using window.location.href`);
              // Store the guide info so we can auto-start after navigation
              sessionStorage.setItem('hyphen-auto-start-guide', JSON.stringify({
                guideId,
                token,
                timestamp: Date.now()
              }));
              
              window.location.href = targetUrl;
              // No hideThinking here, as page will reload
              return;
            } else {
              // No redirect URL available
              CursorFlowUI.showNotification({
                message: 'Guide cannot start - missing URL information for the first step.',
                type: 'error',
                autoClose: 5000
              });
              // Reset playing state as guide cannot start
              this.isLoadingGuide = false;
              this.hideThinking();
              this.setIsPlaying(false, true);
            }
            
            return; // Stop processing here
          }
          
          this.debugLog('URL CHECK PASSED: User is on the correct starting page for the guide');
        }
        
        // If URL check passed or wasn't needed, start the actual guide
        // Hide thinking indicator just before starting the guide visuals
        if (this.thinkingIndicator) {
           CursorFlowUI.hideThinkingIndicator(this.thinkingIndicator);
           this.thinkingIndicator = null;
        }
        this.isLoadingGuide = false;
        this.hideThinking();
        
        // Start the actual guide
        await this.startGuide(guideId, token);
      } catch (error) {
        console.error('Error retrieving guide data:', error);
        this.isLoadingGuide = false; 
        this.hideThinking();     
        this.setIsPlaying(false, true);
        
        // Hide thinking indicator on error
        if (this.thinkingIndicator) {
          CursorFlowUI.hideThinkingIndicator(this.thinkingIndicator);
          this.thinkingIndicator = null;
        }
        
        CursorFlowUI.showNotification({
          message: 'Failed to load guide. Please try again.',
          type: 'error',
          autoClose: 5000
        });
      }
    }

    private async loadRecording(recordingId: string) {
      try {
        this.debugLog(`Loading recording: ${recordingId}`);
        // Fetch recording data from API
        const flowData = await this.apiClient.getRecording(recordingId);
        
        // Store the recording
        this.recording = flowData;
        
        // Pre-sort steps once and cache them 
        if (this.recording && this.recording.steps) {
          this.sortedSteps = [...this.recording.steps].sort((a, b) => {
            return (a.position || 0) - (b.position || 0);
          });
        }
        
        // Update state recordingId only (isPlaying is handled elsewhere)
        this.state.recordingId = recordingId;
        
        // Save state immediately since this is an important transition?
        // Let StateManager handle debouncing unless immediate needed
        StateManager.saveWithDebounce(this.state); 
        
        if (this.options.debug) {
          this.debugLog('Recording loaded:', recordingId, flowData);
        }
        
        return flowData;
      } catch (error) {
        console.error('Failed to load recording:', error);
        this.isLoadingGuide = false;
        this.hideThinking();
        this.stop({ message: 'Failed to load guide data.', type: 'error'}); // Stop if loading fails
        throw error;
      }
    }
  
    private async startGuide(guideId: string, token: string) {
      try {
        if (token !== this.operationToken) {
          this.debugLog('Operation was cancelled (token mismatch), aborting guide start');
          this.isLoadingGuide = false;
          this.hideThinking();
          this.setIsPlaying(false, true);
          return false;
        }
        
        this.debugLog('Starting guide internally:', guideId);
        this.isLoadingGuide = false; // Crucial: Signal that the main guide data loading is done.
                                     // The thinking indicator shown by startGuideById should persist
                                     // until playCurrentStep hides it after finding the first element.
        this.setIsPlaying(true);
        this.state.currentStep = 0;
        this.state.recordingId = guideId;
        this.state.completedSteps = [];
        this.state.timestamp = Date.now();
        this.debugLog('Starting guide with state:', JSON.stringify(this.state));

        if (!this.recording || this.recording.id !== guideId) {
           console.warn('Recording mismatch in startGuide, attempting to reload');
           await this.loadRecording(guideId);
        } else {
          this.debugLog('Recording already loaded.');
        }
        
        // Do NOT hide thinking here. playCurrentStep will handle it for the first step.

        try {
          const trackingStarted = await this.executionTracker.trackStart(guideId);
          if (trackingStarted) {
            this.debugLog(`Flow execution tracking started for flow ${guideId}`);
          } else {
            this.debugLog(`Failed to start flow execution tracking for flow ${guideId}, but continuing with guide`);
          }
        } catch (trackingError) {
          console.error('Error starting flow execution tracking:', trackingError);
        }
        
        StateManager.setSessionActive();
        this.createVisualElements();
        this.setupNavigationDetection();
        
        await this.playCurrentStep('initial'); // Initial load, full check
        
        return true;
      } catch (error) {
        console.error('Failed to start guide:', error);
        this.isLoadingGuide = false; // Ensure flag is reset on error
        this.hideThinking();
        this.stop({ message: 'Failed to start guide', type: 'error'});
        return false;
      }
    }
  
    private async detectCurrentContext() {
      if (!this.recording || !this.sortedSteps.length) {
        return null;
      }
      
      const currentUrl = window.location.href;
      const currentPath = window.location.pathname;
      
      if (this.options.debug) {
        this.debugLog('DETECT CONTEXT: Current URL:', currentUrl, 'Path:', currentPath);
      }
      
      // Find steps that match the current URL without excessive logging
      // Use cached sortedSteps instead of re-filtering recording.steps
      const matchingSteps = this.sortedSteps.filter((step: any) => {
        // The pageInfo is inside the interaction object
        const pageInfo = step.interaction?.pageInfo;
        
        // Check URL and path from pageInfo
        const stepUrl = pageInfo?.url;
        const stepPath = pageInfo?.path;
        
        // Check for matches - simplified logic
        const urlMatches = stepUrl ? RobustElementFinder.compareUrls(stepUrl, currentUrl) : false;
        const pathMatches = stepPath === currentPath;
        
        // Return true if either URL or path matches
        return urlMatches || pathMatches;
      });
      
      if (matchingSteps.length === 0) {
        if (this.options.debug) {
          this.debugLog('DETECT CONTEXT: No steps match current URL or path');
        }
        return null;
      }
      
      // Find the earliest uncompleted step for this URL
      const uncompletedSteps = matchingSteps.filter((step: any) => {
        const stepIndex = step.position || 0;
        return !this.state.completedSteps.includes(stepIndex);
      });
      
      if (uncompletedSteps.length > 0) {
        // Get earliest uncompleted step by position
        // The steps are already sorted, so just take the first one
        const earliestStep = uncompletedSteps[0];
        return earliestStep;
      }
      
      // All steps for this URL are completed, return the last step for navigation context
      // Since we know sortedSteps is sorted by position, we can use the last matching step
      return matchingSteps[matchingSteps.length - 1];
    }
  
    // Add this helper method for debug logging
    private debugLog(...args: any[]): void {
      if (this.options.debug) {
        console.log('[CursorFlow]', ...args);
      }
    }
    
    private async playCurrentStep(pageContextHint: PageContextHint = 'in_page') {
      this.stopValidationLoop();
      this.lastStepInitiationUrl = window.location.href; 

      // Do not hide thinking indicator here. Let it persist if shown by caller.
      // It will be hidden after async operations like findElement.

      if (!this.recording || !this.state.isPlaying) {
        console.warn('[CursorFlow] No active recording or not in playing state');
        this.hideThinking(); // Hide if we are returning early
        return false;
      }
      
      let currentStep: any; // Assuming structure is validated upstream or is flexible
       if (this.recording.steps && this.recording.steps.length > 0) {
          if (this.sortedSteps[0]?.position !== undefined) {
              const targetPosition = this.sortedSteps[this.state.currentStep]?.position;
              if (targetPosition !== undefined) {
                  currentStep = this.sortedSteps.find(step => step.position === targetPosition);
                  if (!currentStep || this.state.completedSteps.includes(currentStep.position)) {
                      currentStep = this.sortedSteps.find(step => !this.state.completedSteps.includes(step.position));
                  }
              } else {
                   currentStep = this.sortedSteps[this.state.currentStep];
              }
          } else {
              currentStep = this.sortedSteps[this.state.currentStep];
          }
       }

      if (!currentStep) {
           const nextStep = this.findNextStep();
          if (nextStep) {
              currentStep = nextStep;
              this.state.currentStep = this.sortedSteps.findIndex(step => step === nextStep);
              this.debugLog(`State inconsistency resolved - found next step at index ${this.state.currentStep}`);
              StateManager.saveWithDebounce(this.state);
          } else {
              console.warn('[CursorFlow] No current or next step found. Guide might be complete');
              this.hideThinking(); // Hide before completing
              this.completeGuide();
              return false;
          }
      }

      this.debugLog(`Playing step ${this.state.currentStep} (Position: ${currentStep.position || 'N/A'}, Hint: ${pageContextHint})`);

      const interaction = currentStep.interaction || {};
      if (interaction.type === 'navigation' || interaction.interaction_type === 'navigation') {
        this.debugLog('Detected navigation step, handling navigation...');
        this.hideThinking(); // Hide thinking before navigation step UI/action
        return this.handleNavigationStep(currentStep);
      }

      if (!interaction.text && interaction.element?.textContent) {
          interaction.text = interaction.element.textContent;
      }
      this.debugLog('Interaction data:', JSON.stringify(interaction));

      const isHighlightStep = !!currentStep.is_highlight_step;
      const isLastStep = this.state.currentStep >= this.sortedSteps.length - 1 || 
                         (this.sortedSteps.findIndex(step => !this.state.completedSteps.includes(step.position)) === -1 && 
                         this.sortedSteps.indexOf(currentStep) === this.sortedSteps.length -1 );

      this.debugLog(`Step flags: isHighlightStep=${isHighlightStep}, isLastStep=${isLastStep}`);

      const expectedPath = interaction.pageInfo?.path;
      const currentPath = window.location.pathname;
      const isNavigationExpectedOnThisStep = expectedPath && expectedPath !== currentPath;

      if (isNavigationExpectedOnThisStep) {
          this.debugLog(`Navigation explicitly expected for this step from ${currentPath} to ${expectedPath}. Element finding might be on next page.`);
      }

      this.debugLog(`Calling ElementFinderStrategy.findElement with currentStep (Hint: ${pageContextHint}):`, currentStep);
      const foundElement = await ElementFinderStrategy.findElement(currentStep, pageContextHint);
      
      this.hideThinking(); // Hide thinking indicator now that findElement is complete

      this.debugLog(`ElementFinderStrategy returned: `, foundElement);
      this.currentTargetElement = foundElement; // Assign the result to this.currentTargetElement

      if (!this.currentTargetElement) { // Now check the updated this.currentTargetElement
          console.warn('[CursorFlow] Target element could not be found for step:', currentStep);
          if (isNavigationExpectedOnThisStep) {
              this.debugLog('Element not found but navigation is expected for THIS step. Allowing potential navigation to proceed if step type is navigation.');
              // Thinking indicator already hidden
              return true; 
          }
          // Thinking indicator already hidden
          this.handleInteractionError();
          return false;
      }

      // If we reach here, this.currentTargetElement is an HTMLElement
      try {
          if (!this.isElementPartiallyInViewport(this.currentTargetElement)) {
              this.debugLog('Target element not in viewport, attempting to scroll...');
              // Pass [this.currentTargetElement!] to satisfy TypeScript if it still complains, 
              // but the null check above should guarantee it's HTMLElement here.
              const scrolledCandidates = await RobustElementFinder.ensureCandidatesInView([this.currentTargetElement]);
              if (scrolledCandidates.length === 0) {
                   console.warn('[CursorFlow] Failed to scroll element into view');
              } else {
                   this.debugLog('Scroll attempt finished.');
              }
              await new Promise(resolve => setTimeout(resolve, 150)); 
              if (!this.currentTargetElement.isConnected) { // Check again after scroll and timeout
                   this.debugLog('Target element disconnected after scroll attempt!');
                   // Thinking indicator already hidden
                   this.handleInteractionError();
                   return false;
              }
          } else {
              this.debugLog('Target element already in viewport. No scroll needed.');
          }
      } catch (scrollError) {
           console.error('[CursorFlow] Error during scroll:', scrollError);
      }

      if (!this.currentTargetElement || !this.currentTargetElement.isConnected) {
           this.debugLog('Target element became invalid after scroll checks. Aborting step.');
           // Thinking indicator already hidden
           this.handleInteractionError();
           return false;
       }

      this.debugLog('Successfully identified target element:', this.currentTargetElement.outerHTML.substring(0, 150) + '...');

      const currentToken = this.operationToken; 
      await this.showVisualElements(this.currentTargetElement, currentStep.interaction, currentStep.annotation || '', isHighlightStep, isLastStep);
      
      if (this.operationToken !== currentToken) { 
          this.debugLog(`Operation cancelled after showVisualElements. Aborting interaction setup.`);
          this.hideVisualElements(); 
          return false; 
      }

      if (isHighlightStep) {
        this.debugLog('Setting up highlight step completion (Next/Finish button).');
        this.setupHighlightStepCompletion(isLastStep);
      } else {
        this.debugLog('Setting up standard element interaction tracking.');
        // Pass this.currentTargetElement which is confirmed to be HTMLElement here
        this.setupElementInteractionTracking(this.currentTargetElement, interaction);
      }

      if (!isHighlightStep) {
        this.startValidationLoop();
      }
      return true;
    }
  
    private async showVisualElements(
      targetElement: HTMLElement | null,
      interactionForContext: InteractionData,
      displayText: string,
      isHighlightStep: boolean,
      isLastStep: boolean
    ): Promise<void> {
      const existingPopup = document.getElementById('hyphenbox-text-popup');
      if (existingPopup && existingPopup.parentNode) {
        existingPopup.parentNode.removeChild(existingPopup);
      }
      const existingGuidanceCard = document.getElementById('hyphen-guidance-card');
      if (existingGuidanceCard && existingGuidanceCard.parentNode) {
        existingGuidanceCard.parentNode.removeChild(existingGuidanceCard);
      }

      if (isHighlightStep) {
        if (targetElement && targetElement.isConnected) {
          if (!this.highlightElement) {
            this.highlightElement = CursorFlowUI.createHighlight(this.options.theme || {});
          }
          if (this.highlightElement && !document.body.contains(this.highlightElement)) {
              document.body.appendChild(this.highlightElement);
          }
          CursorFlowUI.positionHighlightOnElement(targetElement, this.highlightElement);
          if(this.highlightElement) this.highlightElement.style.display = 'block';
        } else {
          if (this.highlightElement) {
            this.highlightElement.style.display = 'none';
          }
        }

        this.guidanceCardElement = CursorFlowUI.createGuidanceCard(displayText || 'Please follow the instruction.', isLastStep, this.options.theme || {});
        if (this.guidanceCardElement) {
          document.body.appendChild(this.guidanceCardElement);
          CursorFlowUI.positionGuidanceCard(this.guidanceCardElement, targetElement);
        }

        if (this.cursorElement || document.getElementById('hyphenbox-cursor-wrapper')) { 
          const cursorWrapper = document.getElementById('hyphenbox-cursor-wrapper');
          if (cursorWrapper && cursorWrapper.parentNode) {
              cursorWrapper.parentNode.removeChild(cursorWrapper);
          }
          this.cursorElement = null;
        }

      } else {
        if (!targetElement || !targetElement.isConnected) {
          console.warn('[CursorFlow] Target element not found for interactive step');
          CursorFlowUI.cleanupAllUI(true, true);
          return;
        }

        if (!this.cursorElement) {
          this.cursorElement = CursorFlowUI.createCursor(this.options.theme || {});
        }
        CursorFlowUI.moveCursorToElement(targetElement, this.cursorElement, interactionForContext);
        if(this.cursorElement) this.cursorElement.style.display = 'block';

        if (!this.highlightElement) {
          this.highlightElement = CursorFlowUI.createHighlight(this.options.theme || {});
        }
        if (this.highlightElement && !document.body.contains(this.highlightElement)) {
          document.body.appendChild(this.highlightElement);
        }
        CursorFlowUI.positionHighlightOnElement(targetElement, this.highlightElement);
        if(this.highlightElement) this.highlightElement.style.display = 'block';
        
        if (displayText) { 
          this.textPopupElement = CursorFlowUI.createTextPopup(displayText, this.options.theme || {});
          if (this.cursorElement && this.textPopupElement) {
              CursorFlowUI.positionTextPopupNearCursor(this.cursorElement, this.textPopupElement);
          }
        }
      }
    }
  
    private hideVisualElements() {
      // Stop the validation loop when hiding elements between steps
      this.stopValidationLoop();

      // Clean up UI elements - Change keepCursor to false to remove the cursor on completion/stop
      // Keep cursor true between steps, false on final stop/completion
      const keepCursor = this.state.isPlaying; // Keep cursor if still playing
      CursorFlowUI.cleanupAllUI(keepCursor, true); // Keep notifications

      // Reset references ONLY for elements being cleaned up
      this.highlightElement = null;
      // Don't reset cursorElement if keepCursor is true

      if (this.options.debug) {
        this.debugLog(`Visual elements hidden/cleaned up ${keepCursor ? '(keeping cursor)' : '(removing cursor)'}`);
      }
    }
  
    private setupNavigationDetection() {
      if (this.options.debug) {
        this.debugLog('Setting up navigation detection');
      }
      
      // Use history API to detect navigation events
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      // Override pushState
      history.pushState = (...args) => {
        originalPushState.apply(history, args);
        if (this.options.debug) {
          this.debugLog('pushState called, args:', args);
        }
        this.handleNavigation();
      };
      
      // Override replaceState
      history.replaceState = (...args) => {
        originalReplaceState.apply(history, args);
        if (this.options.debug) {
          this.debugLog('replaceState called, args:', args);
        }
        this.handleNavigation();
      };
      
      // Listen for popstate event (browser back/forward buttons)
      window.addEventListener('popstate', () => {
        if (this.options.debug) {
          this.debugLog('popstate event triggered');
        }
        this.handleNavigation();
      });
      
      if (this.options.debug) {
        this.debugLog('Navigation detection set up');
      }
    }
  
    private handleNavigation(continueThroughSteps = false) {
      if (!this.state.isPlaying || this.isHandlingNavigation || this.invalidationInProgress) {
        return;
      }
      
      this.isHandlingNavigation = true;
      this.debugLog('[NAVIGATION_HANDLER] Navigation detected or invoked.');
      this.showThinking(); // Show thinking indicator at the start of navigation handling
      
      setTimeout(async () => {
        if (!this.state.isPlaying) {
            this.isHandlingNavigation = false;
            this.hideThinking(); // Ensure hidden if not playing anymore
            return;
        }
          
        try {
          // URL has definitely changed or is being treated as such.
          // Full stability check is warranted.
          const contextStep = await this.detectCurrentContext(); // detectCurrentContext internally uses current URL
          
          if (contextStep) {
            const stepIndex = contextStep.position || this.recording.steps.indexOf(contextStep);
            const isBackNavigation = this.state.completedSteps.includes(stepIndex);

            this.state.currentStep = this.recording.steps.indexOf(contextStep);
            this.hideVisualElements(); // Hides step UI, not thinking indicator
            
            this.debugLog(`[NAVIGATION_HANDLER] Resuming at step ${this.state.currentStep} (Position: ${stepIndex}). Is back nav: ${isBackNavigation}`);
            // playCurrentStep will handle hiding the thinking indicator after its async ops
            const stepPlayedSuccessfully = await this.playCurrentStep('navigation'); 

            if (!stepPlayedSuccessfully) {
              // playCurrentStep would have called hideThinking if it failed to find an element and called handleInteractionError
              // If it returned false for other reasons, ensure thinking is hidden before stopping
              this.hideThinking();
              this.stop({
                  message: 'Guide stopped: Element for this step could not be found or validated after navigation.',
                  type: 'error',
                  autoClose: 5000
              });
            }
          } else {
            // ... (existing logic for no context step found after navigation) ...
            this.debugLog('[NAVIGATION_HANDLER] No context step found for current URL. Guide may be off track or complete.');
            this.hideThinking(); // Hide indicator before stopping or completing
             const allSteps = this.recording.steps || [];
            const allCompleted = allSteps.every((step: { position?: number }) => {
                const stepPosition = step.position || 0;
                return this.state.completedSteps.includes(stepPosition);
            });
            if (allCompleted && allSteps.length > 0) {
                this.hideVisualElements();
                this.completeGuide();
            } else {
                this.hideVisualElements();
                if (this.executionTracker.isActive() && this.state.recordingId) {
                  const currentUrl = window.location.href;
                  this.executionTracker.trackAbandonment(
                    'navigation',
                    `User navigated away from guide path to ${currentUrl}`
                  ).catch(error => console.warn(`Failed to track navigation abandonment: ${error}`));
                }
                CursorFlowUI.showNotification({
                    message: 'Oops! You\'ve navigated away from the guide path',
                    type: 'warning',
                    autoClose: 5000
                });
                this.hideThinking(); // Hide indicator before stopping
                this.stop({
                    message: 'Oops! You\'ve navigated away from the guide path',
                    type: 'warning'
                });
            }
          }
        } catch (error) {
          console.error('Error handling navigation:', error);
          if (this.state.isPlaying) {
              this.hideVisualElements();
              this.hideThinking(); // Hide indicator before stopping
              this.stop({ message: 'Error during navigation', type: 'error' });
          }
        } finally {
          this.isHandlingNavigation = false;
          this.hideThinking(); // Ensure thinking is hidden in finally block
        }
      }, 50);
    }
  
    private setupElementInteractionTracking(element: HTMLElement, interaction: any) {
      // Remove previous listener IF IT EXISTS AND IS DIFFERENT
      this.removeExistingListeners(); // Call this first

      if (!element || !interaction) return;

      if (this.options.debug) {
          this.debugLog('[CursorFlow] Setting up interaction tracking for element:', element);
          this.debugLog('[CursorFlow] Interaction data for tracking:', interaction);
      }

      // Store current interaction type
      this.currentInteractionType = interaction.action || 'click';

      if (!this.currentInteractionType) {
          console.warn('[CursorFlow] No interaction type specified');
          return;
      }

      const eventType = this.getEventTypeForInteraction(this.currentInteractionType);
      if (!eventType) {
          console.warn('[CursorFlow] Unknown interaction type for tracking:', this.currentInteractionType);
          return;
      }

      // Create handler
      this.currentListener = (event) => {
          this.debugLog(`${eventType} event triggered:`, event);
          this.debugLog('Target element:', event.target);

          // Check if the event originated from the expected element or its child
          if (!element.contains(event.target as Node)) {
              this.debugLog('Event target is outside the tracked element. Ignoring.');
              return; // Ignore events bubbling up from outside the target
          }

          // Stop the validation loop as soon as a valid interaction starts
          this.stopValidationLoop();

          // Validate interaction (e.g., check input value if needed)
          if (this.validateInteraction(event, interaction)) {
              this.debugLog('Interaction validated successfully.');

              const currentStep = this.sortedSteps[this.state.currentStep]; // Use sortedSteps
              const stepIndex = currentStep?.position !== undefined ? currentStep.position : this.state.currentStep;

              this.debugLog(`Marking step completed: Index=${this.state.currentStep}, Position=${stepIndex}`);
              
              // Track step completion via the FlowExecutionTracker 
              if (currentStep && currentStep.id && this.executionTracker.isActive()) {
                this.debugLog(`Tracking completion of step ID=${currentStep.id}, Position=${stepIndex}`);
              }
              
              this.completeStep(stepIndex); // Pass the correct identifier

               // If this interaction causes navigation (e.g., clicking a link/button that changes URL)
              const isNavigationTrigger =
                  (event.target instanceof HTMLAnchorElement && event.target.href && !event.target.target) ||
                  (event.target instanceof HTMLButtonElement && event.target.type === 'submit') || // Form submission
                  interaction.action === 'navigation'; // Explicit navigation step type?

              const currentURL = window.location.href;
              // Check if URL is likely to change after a microtask delay
              queueMicrotask(() => {
                  if (window.location.href !== currentURL || isNavigationTrigger) {
                      this.debugLog('Navigation detected or expected after interaction. Letting handleNavigation take over.');
                      StateManager.saveWithDebounce(this.state, true); // Save state immediately before potential navigation
                      this.hideVisualElements(); // Clean up visuals
                      this.removeExistingListeners(); // Remove listener before navigating
                      // DO NOT CALL playNextStep here, handleNavigation will manage it.
                  } else {
                       // Only play next step if no navigation occurred
                       this.debugLog('No navigation detected. Moving to next step...');
                       this.playNextStep();
                  }
              });


          } else {
              this.debugLog('Interaction validation failed.');
              // Optionally handle failed validation (e.g., show error)
          }
      };

      // ADDED: Log the specific element the listener is being added to.
      this.debugLog(`[CursorFlow] Adding ${eventType} listener to element:`, element);
      element.addEventListener(eventType, this.currentListener, { capture: true }); // Use capture phase maybe? Test this.

      if (this.options.debug) {
          this.debugLog(`[CursorFlow] Set up ${eventType} listener for element:`, element);
      }
    }
  
    private getEventTypeForInteraction(interactionType: string): string | null {
      switch (interactionType.toLowerCase()) {
        case 'click':
          return 'click';
        case 'input':
        case 'type':
          return 'input';
        case 'change':
          return 'change';
        case 'focus':
          return 'focus';
        case 'hover':
          return 'mouseover';
        default:
          return null;
      }
    }
  
    private validateInteraction(event: Event, expectedInteraction: any): boolean {
      if (!event || !expectedInteraction) return false;
      
      const interactionType = expectedInteraction.action?.toLowerCase() || 'click';
      
      // NEW: Check if the click is on the target element or its children
      if (interactionType === 'click') {
        // For clicks, make sure the click is on the expected element or its children
        if (this.currentTargetElement) {
          const clickedElement = event.target as HTMLElement;
          if (!this.currentTargetElement.contains(clickedElement)) {
            // User clicked outside the highlighted element
            
            // Show notification
            this.stop({
              message: 'Incorrect click. Guide stopped.',
              type: 'error'
            });
            
            // Stop the guide
            setTimeout(() => this.stop(), 100);
            return false;
          }
        }
      }
      
      switch (interactionType) {
        case 'click':
          // For clicks, validate target element (already checked above)
          return true;
          
        case 'input':
        case 'type':
          // For input, check if input has expected value
          if (event.target instanceof HTMLInputElement ||
              event.target instanceof HTMLTextAreaElement) {
            const inputElement = event.target as HTMLInputElement;
            
            // If expectedValue is specified, check against it
            if (expectedInteraction.value) {
              return inputElement.value.includes(expectedInteraction.value);
            }
            
            // Otherwise just check that some input was provided
            return !!inputElement.value.trim();
          }
          return false;
          
        case 'change':
          // For select elements, check if value matches expected
          if (event.target instanceof HTMLSelectElement) {
            const selectElement = event.target as HTMLSelectElement;
            
            if (expectedInteraction.value) {
              return selectElement.value === expectedInteraction.value;
            }
            
            return true;
          }
          return true;
          
        default:
          // For other types, just pass validation
          return true;
      }
    }
  
    private removeExistingListeners() {
        // Stop validation loop when listeners are removed (e.g., before moving to next step)
        this.stopValidationLoop();

        if (this.currentTargetElement && this.currentListener && this.currentInteractionType) {
          const eventType = this.getEventTypeForInteraction(this.currentInteractionType);
          if (eventType) {
             // Ensure listener removal happens correctly, especially with capture phase
             this.currentTargetElement.removeEventListener(eventType, this.currentListener, { capture: true });
             this.debugLog(`Removed ${eventType} listener from element:`, this.currentTargetElement);
          }
        }
         // Reset tracking properties *after* removing
        this.currentListener = null;
        this.currentInteractionType = null;
        // this.currentTargetElement = null; // Don't nullify currentTargetElement here, it's needed elsewhere
    }
    private handleInteractionError() {
      const currentStepIndex = this.state.currentStep;
      const currentStepInfo = this.sortedSteps[currentStepIndex];
      
      // Thinking indicator should have been hidden by playCurrentStep before this point.
      
      if (this.executionTracker.isActive() && this.state.recordingId) {
        const stepDetails = currentStepInfo 
          ? `Step ${currentStepIndex} (position: ${currentStepInfo.position})`
          : `Step ${currentStepIndex}`;
        this.debugLog(`Interaction error at ${stepDetails}: Element not found or not interactive`);
      }
      
      const retryHint: PageContextHint = window.location.href === this.lastStepInitiationUrl ? 'in_page_minimal_check' : 'in_page';
      this.debugLog(`Interaction error - Retry hint will be: ${retryHint} (current URL: ${window.location.href}, last step URL: ${this.lastStepInitiationUrl})`);

      CursorFlowUI.showErrorNotification(
        'We couldn\'t find the element for this step.',
        {
          message: 'We couldn\'t find the element for this step.',
          type: 'error',
          onRetry: () => this.playCurrentStep(retryHint), // Pass determined hint for retry
          onSkip: () => this.playNextStep(), 
          onStop: () => this.stop({
            message: 'Element not found for step. Guide stopped.',
            type: 'error'
          })
        }
      );
    }
  
    // Add this method to find the next logical step based on completed steps
    private findNextStep(): any | null {
      if (!this.recording || !this.sortedSteps || this.sortedSteps.length === 0) {
        this.debugLog('findNextStep: No recording or steps available.');
        return null;
      }

      this.debugLog('findNextStep: Looking for next step. Completed steps:', this.state.completedSteps);

      // Find the first step in sortedSteps whose position is not in completedSteps
      const nextStep = this.sortedSteps.find(step => {
         const stepId = step.position !== undefined ? step.position : this.sortedSteps.indexOf(step);
         return !this.state.completedSteps.includes(stepId);
      });


      if (nextStep) {
         const stepId = nextStep.position !== undefined ? nextStep.position : this.sortedSteps.indexOf(nextStep);
         this.debugLog('findNextStep: Found next uncompleted step:', { position: stepId, step: nextStep.annotation || nextStep.interaction?.text });
         return nextStep;
      }


      this.debugLog('findNextStep: All steps appear to be completed.');
      return null; // All steps are completed
    }
  
    // Add a new method for guide completion
    private completeGuide() {
      if (this.options.debug) {
        this.debugLog('All guide steps completed, resetting state');
      }
      
      this.hideThinking(); // Hide indicator before stopping for completion

      // Track successful completion of the flow
      if (this.executionTracker.isActive()) {
        this.executionTracker.trackCompletion()
          .catch(error => {
            console.warn(`Failed to track flow completion: ${error}`);
            // Continue with guide completion even if tracking fails
          });
      }
      
      // Stop the guide
      this.stop({
        message: 'Guide completed successfully!',
        type: 'success',
        autoClose: 3000
      });
      
      // Mark session inactive
      StateManager.clearSession();
    }

    private createVisualElements() {
      if (!this.cursorElement) {
        this.cursorElement = CursorFlowUI.createCursor(this.options.theme || {});
      }
      
      if (!this.highlightElement) {
        this.highlightElement = CursorFlowUI.createHighlight(this.options.theme || {});
      }
      
      if (this.options.debug) {
        this.debugLog('Visual elements created');
      }
    }

    private completeStep(stepIdentifier: number) { // Use position or index
      // Stop validation loop when step is successfully completed
      this.stopValidationLoop();

      if (!this.state.completedSteps.includes(stepIdentifier)) {
        this.state.completedSteps.push(stepIdentifier);
        StateManager.saveWithDebounce(this.state); // Debounced save
        
        // Track step completion
        if (this.state.recordingId && this.executionTracker.isActive()) {
          // Get the current step from sortedSteps to find its step ID
          const currentStep = this.sortedSteps.find(step => step.position === stepIdentifier);
          if (currentStep && currentStep.id) {
            this.executionTracker.trackStepCompletion(currentStep.id, stepIdentifier)
              .catch(error => {
                console.warn(`Failed to track step completion: ${error}`);
                // Continue guide execution even if tracking fails
              });
          }
        }
        
        if (this.options.debug) {
          this.debugLog(`Step completed (ID/Pos: ${stepIdentifier}). Completed: [${this.state.completedSteps.join(', ')}]`);
        }
      } else {
         if (this.options.debug) {
            this.debugLog(`Step (ID/Pos: ${stepIdentifier}) was already marked completed.`);
         }
      }
    }


    private async playNextStep() {
        if (!this.state.isPlaying) return false;

        this.debugLog('playNextStep: Attempting to move to the next step.');
        CursorFlowUI.cleanupAllUI(true, true); // Cleans up previous step's UI
        this.removeExistingListeners();
        
        this.showThinking(); // Show thinking indicator while preparing for the next step

        const nextStep = this.findNextStep();

        if (nextStep) {
            const nextStepIndex = this.sortedSteps.findIndex(step => step === nextStep);
            if (nextStepIndex !== -1) {
                 this.state.currentStep = nextStepIndex;
                 this.debugLog(`playNextStep: Found next step at index ${this.state.currentStep}. Saving state and playing.`);
                 StateManager.saveWithDebounce(this.state);

                 // Determine hint based on URL change for playNextStep
                 const hintForNextStep: PageContextHint = window.location.href === this.lastStepInitiationUrl ? 'in_page_minimal_check' : 'in_page';
                 this.debugLog(`playNextStep - Hint for next step will be: ${hintForNextStep}`);
                 // playCurrentStep will handle hiding the thinking indicator after its async ops
                 await this.playCurrentStep(hintForNextStep);
                 return true;
            } else {
                console.error('[CursorFlow] Could not find index for the identified next step. State might be corrupted.');
                 this.hideThinking(); // Hide before completing
                 this.completeGuide();
                 return false;
            }
        } else {
            this.debugLog('playNextStep: No next step found by findNextStep(). Completing guide.');
            this.hideThinking(); // Hide before completing
            this.completeGuide();
            return false;
        }
    }

    private setupHighlightStepCompletion(isLastStep: boolean) {
      this.removeExistingListeners(); // Clear any other listeners

      if (!this.guidanceCardElement || !document.body.contains(this.guidanceCardElement)) {
        this.debugLog('[CursorFlow] Guidance card not found or not in DOM for highlight step completion setup.');
        // Optionally, attempt to re-create or show an error.
        // For now, just return to prevent errors.
        return;
      }

      // Log guidance card structure for debugging
      this.debugLog(`[CursorFlow] Guidance card HTML for button search: ${this.guidanceCardElement.outerHTML.substring(0, 300)}...`);

      const buttonClassSelector = isLastStep ? '.hyphen-finish-button' : '.hyphen-next-button';
      let completeButton = this.guidanceCardElement.querySelector(buttonClassSelector) as HTMLElement;

      // Fallback if specific class not found, try the generic CTA class within the card
      if (!completeButton) {
        this.debugLog(`[CursorFlow] Button not found with ${buttonClassSelector} in guidance card, trying .hyphen-cta-button`);
        completeButton = this.guidanceCardElement.querySelector('.hyphen-cta-button') as HTMLElement;
      }

      if (!completeButton) {
        this.debugLog('[CursorFlow] Button not found in guidance card using any class selector.');
        // Log all buttons within the card for detailed debugging
        const allButtons = this.guidanceCardElement.querySelectorAll('button');
        this.debugLog(`[CursorFlow] Total buttons found in guidance card: ${allButtons.length}`);
        if (allButtons.length > 0) {
          Array.from(allButtons).forEach((btn, i) => {
            this.debugLog(`[CursorFlow] Guidance Card Button ${i} classes: ${btn.className}, HTML: ${btn.outerHTML.substring(0, 100)}`);
          });
        }
        return;
      }

      this.debugLog(`[CursorFlow] Found button in guidance card: ${completeButton.className}, text: ${completeButton.textContent}`);

      this.currentListener = (event: Event) => {
        event.stopPropagation();
        event.preventDefault();
        this.debugLog(`[CursorFlow] Guidance card ${isLastStep ? 'Finish' : 'Next'} button clicked.`);

        const currentStep = this.sortedSteps[this.state.currentStep];
        if (!currentStep) {
            this.debugLog('[CursorFlow] Error: Current step not found during highlight completion.');
            this.stop({ message: 'Error processing step.', type: 'error' });
            return;
        }
        const stepIdentifier = currentStep?.position !== undefined ? currentStep.position : this.state.currentStep;
        this.completeStep(stepIdentifier);

        if (isLastStep) {
          this.completeGuide();
        } else {
          this.playNextStep();
        }
      };

      completeButton.addEventListener('click', this.currentListener);
      this.debugLog(`[CursorFlow] Added click listener to guidance card button: ${completeButton.textContent}`);
      
      this.currentInteractionType = 'highlight-step-completion'; 
      this.currentTargetElement = completeButton; // Track the button for listener removal
    }

    // --- NEW Methods for Validation Loop ---

    private startValidationLoop() {
        // Ensure no loop is already running
        this.stopValidationLoop();

        if (!this.state.isPlaying || !this.currentTargetElement) {
            this.debugLog('[VALIDATION] Starting validation loop ABORTED: Not playing or no target element.');
            return;
        }

        this.debugLog('[VALIDATION] Starting validation loop for current step.');

        // Keep a reference to the element being validated in this loop instance
        const elementToValidate = this.currentTargetElement;
        // Get the corresponding interaction data for validation context
        const interactionData = this.sortedSteps[this.state.currentStep]?.interaction;

        const VALIDATION_INTERVAL_MS = 500; // Interval for checks
        let lastValidationTime = Date.now();

        const loopFn = () => {
            // Stop conditions
            if (!this.state.isPlaying || this.validationLoopId === null || this.currentTargetElement !== elementToValidate) {
                this.debugLog('[VALIDATION] Stopping loop (state changed or cancelled).');
                this.validationLoopId = null;
                return;
            }

            const currentTime = Date.now();

            // Only perform validation check if enough time has passed
            if (currentTime - lastValidationTime >= VALIDATION_INTERVAL_MS) {
                lastValidationTime = currentTime;
                
                try {
                    // SANITY CHECK: Basic DOM connection check
                    if (!elementToValidate.isConnected) {
                        this.debugLog('[VALIDATION] CRITICAL: Target element disconnected from DOM!');
                        this.handleStepInvalidation('Element removed from DOM');
                        return;
                    }

                    // CRITICAL FIX: Check viewport status FIRST before any validation
                    const isInViewport = this.isElementPartiallyInViewport(elementToValidate);
                    this.debugLog(`[VALIDATION] Viewport check: Element is ${isInViewport ? 'VISIBLE' : 'NOT VISIBLE'} in viewport.`);
                    
                    // KEY CHANGE: For partially visible elements, always pass validation
                    // This addresses the sensitivity issue when scrolling
                    if (isInViewport) {
                        this.debugLog('[VALIDATION] Element is at least partially visible - PASSING validation');
                        // Continue the loop without further checks as long as element is partially visible
                    } else {
                        // Only if completely outside viewport, do relaxed validation
                        this.debugLog('[VALIDATION] Element completely outside viewport, performing RELAXED validation only.');
                        
                        const isRelaxedValid = SelectiveDomAnalyzer.validateCandidateElement(
                            elementToValidate,
                            interactionData,
                            'relaxed'
                        );
                        
                        if (!isRelaxedValid) {
                            this.debugLog('[VALIDATION] CRITICAL: Element failed even RELAXED validation while outside viewport.');
                            this.handleStepInvalidation('Element identity changed');
                            return;
                        }
                        
                        this.debugLog('[VALIDATION] Element passed relaxed validation while outside viewport.');
                    }
                } catch (error) {
                    console.error('[VALIDATION] Error during loop:', error);
                }
            }

            // Continue the loop
            this.validationLoopId = requestAnimationFrame(loopFn);
        };

        // Start the loop
        this.validationLoopId = requestAnimationFrame(loopFn);
    }

    private stopValidationLoop() {
        if (this.validationLoopId !== null) {
            this.debugLog('[VALIDATION] Stopping validation loop.');
            cancelAnimationFrame(this.validationLoopId);
            this.validationLoopId = null;
        }
    }

    // More lenient viewport check - detects if element is at least partially visible
    private isElementPartiallyInViewport(element: HTMLElement | null): boolean {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        
        // Element is at least partially visible if:
        // IMPORTANT: Increased buffer from 100px to 300px to be more lenient with scrolling
        const BUFFER = 300; // Increased from 100px for more leniency
        
        const isPartiallyVisible = (
            rect.top < (window.innerHeight + BUFFER) && // Element top is above bottom edge (with buffer)
            rect.bottom > -BUFFER &&                    // Element bottom is below top edge (with buffer)
            rect.left < (window.innerWidth + BUFFER) && // Element left is before right edge (with buffer)
            rect.right > -BUFFER                        // Element right is after left edge (with buffer)
        );
        
        // Only log verbosely if debug mode is on
        if (this.options.debug) {
            this.debugLog(`[VIEWPORT-CHECK] ${element.tagName}#${element.id || 'noId'} pos: top=${Math.round(rect.top)}, bottom=${Math.round(rect.bottom)}, left=${Math.round(rect.left)}, right=${Math.round(rect.right)}, isPartiallyVisible=${isPartiallyVisible}, buffer=${BUFFER}px`);
        }
        
        return isPartiallyVisible;
    }

    private handleStepInvalidation(reason: string) {
        // Don't proceed if we're already stopping
        if (this.invalidationInProgress) {
            this.debugLog(`Ignoring step invalidation (${reason}) as invalidation is already in progress`);
            return;
        }
        
        // Set invalidation flag to prevent concurrent stop calls
        this.invalidationInProgress = true;
        
        this.debugLog(`Handling Step Invalidation: ${reason}`);
        this.stopValidationLoop(); // Ensure loop is stopped
        this.hideThinking(); // Hide thinking indicator as we are stopping

        // Get current step information for more detailed tracking
        const currentStepIndex = this.state.currentStep;
        const currentStepInfo = this.sortedSteps[currentStepIndex];
        
        // Track element not found error if we're actively tracking
        if (this.executionTracker.isActive() && this.state.recordingId) {
            const stepDetails = currentStepInfo 
                ? `Step ${currentStepIndex} (position: ${currentStepInfo.position})`
                : `Step ${currentStepIndex}`;
                
            this.executionTracker.trackAbandonment(
                'element_not_found',
                `Element validation failed: ${reason}. ${stepDetails}`
            ).catch(error => {
                console.warn(`Failed to track element validation failure: ${error}`);
                // Continue with stop even if tracking fails
            });
        }

        // Show notification similar to handleNavigation's failure case
        CursorFlowUI.showNotification({
            message: 'Oops! Looks like the context changed unexpectedly.',
            type: 'warning',
            autoClose: 5000
        });

        // Stop the guide IMMEDIATELY
        this.stop({
            message: 'Guide stopped due to unexpected context change.',
            type: 'warning'
        });
    }
    // --- End NEW Methods ---

    // Generate a unique token for operation tracking
    private generateToken(): string {
      return Date.now().toString() + Math.random().toString(36).substring(2);
    }

    // *** NEW Method to handle starting guide after successful search ***
    public async startGuideById(guideId: string) { // Renamed from startGuideAfterSearch, made public
      this.debugLog(`Starting guide ${guideId} via startGuideById.`);
      
      // IMPORTANT: Generate a new operation token
      this.operationToken = this.generateToken();
      const currentToken = this.operationToken;
      
      this.isLoadingGuide = true; // Set flag for initial loading
      this.setIsPlaying(true);   // Set playing state
      this.showThinking();       // Show thinking indicator (will be respected due to isLoadingGuide)
      
      // Call retrieveGuideData with the ID and token
      // retrieveGuideData will be responsible for isLoadingGuide = false and hideThinking()
      this.retrieveGuideData(guideId, currentToken);
    }

    // Add this new method after the existing private methods
    private createNavigationStep(targetUrl: string, stepText: string = "Let's start by navigating to the right page"): any {
      return {
        position: -1, // This will be step 0 when sorted
        interaction: {
          type: 'navigation',
          url: targetUrl,
          pageInfo: {
            url: targetUrl,
            path: new URL(targetUrl).pathname
          }
        },
        step_data: {
          guidance_text: stepText,
          interaction_type: 'navigation'
        },
        id: 'dynamic-nav-step',
        url: targetUrl
      };
    }

    private async injectNavigationStep(guideId: string, token: string, targetUrl: string) {
      this.debugLog('Injecting navigation step to:', targetUrl);
      
      // Create the navigation step
      const navStep = this.createNavigationStep(targetUrl, "First, let's navigate to the right page to start this guide");
      
      // Insert it at the beginning of the steps array
      if (this.recording && this.recording.steps) {
        this.recording.steps.unshift(navStep);
        
        // Re-sort steps with the new navigation step
        this.sortedSteps = [...this.recording.steps].sort((a, b) => {
          return (a.position || 0) - (b.position || 0);
        });
      }
      
      // Start the guide normally - it will begin with our navigation step
      await this.startGuide(guideId, token);
    }

    private async handleNavigationStep(step: any): Promise<boolean> {
      this.debugLog('Handling navigation step:', step);
      
      // Thinking indicator should have been hidden by playCurrentStep before calling this.
      // This method primarily shows a guidance card, which is UI.

      // Get target URL from step
      const targetUrl = step.interaction?.url || step.interaction?.pageInfo?.url || step.url;
      
      if (!targetUrl) {
        this.debugLog('Navigation step missing target URL');
        CursorFlowUI.showNotification({
          message: 'Navigation step is missing target URL',
          type: 'error',
          autoClose: 5000
        });
        return false;
      }
      
      // Show guidance card with navigation instruction
      const guidanceText = step.step_data?.guidance_text || step.annotation || `Navigating to ${targetUrl}...`;
      this.guidanceCardElement = CursorFlowUI.createGuidanceCard(
        guidanceText, 
        false, // Not last step
        this.options.theme || {}
      );
      
      if (this.guidanceCardElement) {
        document.body.appendChild(this.guidanceCardElement);
        // Position at center of screen since there's no target element
        this.guidanceCardElement.style.position = 'fixed';
        this.guidanceCardElement.style.top = '50%';
        this.guidanceCardElement.style.left = '50%';
        this.guidanceCardElement.style.transform = 'translate(-50%, -50%)';
        this.guidanceCardElement.style.zIndex = '10000';
      }
      
      // Auto-navigate after showing the card
      setTimeout(() => {
        this.debugLog(`Auto-navigating to: ${targetUrl}`);
        // No need to manage thinking indicator here; page will reload.
        window.location.href = targetUrl;
      }, 2000); // Give user 2 seconds to read the message
      
      return true;
    }

    // New helper methods for thinking indicator
    private showThinking(): void {
      if (!this.state.isPlaying) {
        this.hideThinking(); // Ensure it's hidden if not playing
        return;
      }

      // If isLoadingGuide is true, it means we are in the initial phase of loading a guide.
      // In this case, we should show the thinking indicator.
      if (this.isLoadingGuide) {
        if (!this.thinkingIndicator || !document.body.contains(this.thinkingIndicator)) {
          this.debugLog('[ThinkingIndicator] Showing (forced by isLoadingGuide).');
          const anchorButton = this.startButton && document.body.contains(this.startButton) ? this.startButton : null;
          this.thinkingIndicator = CursorFlowUI.showThinkingIndicator(anchorButton, this.options.theme || {});
        }
        return; // Exit after handling isLoadingGuide case
      }

      // If not explicitly loading a guide (isLoadingGuide is false),
      // then show thinking indicator only if no other primary step UI is visible.
      // Primary step UI includes cursor, highlight, guidance card, or text popup.
      const isStepUIVisible = this.cursorElement || // Active cursor for a step
                             this.highlightElement || // Active highlight for a step
                             (this.guidanceCardElement && document.body.contains(this.guidanceCardElement)) || // Guidance card for highlight/nav step
                             document.getElementById('hyphenbox-text-popup'); // Text popup with instructions

      if (isStepUIVisible) {
        // If step-specific UI is visible, we are actively on a step, so no thinking indicator.
        // Ensure any existing thinking indicator is hidden.
        this.debugLog('[ThinkingIndicator] Suppressed: Step UI is visible.');
        this.hideThinking();
        return;
      }

      // If we reach here, it means:
      // 1. state.isPlaying is true.
      // 2. isLoadingGuide is false.
      // 3. No primary step UI is visible.
      // This is the state where we are "between steps" or waiting for something minor.
      if (!this.thinkingIndicator || !document.body.contains(this.thinkingIndicator)) {
        this.debugLog('[ThinkingIndicator] Showing (between steps/idle within active guide).');
        const anchorButton = this.startButton && document.body.contains(this.startButton) ? this.startButton : null;
        this.thinkingIndicator = CursorFlowUI.showThinkingIndicator(anchorButton, this.options.theme || {});
      }
    }

    private hideThinking(): void {
      if (this.thinkingIndicator && document.body.contains(this.thinkingIndicator)) {
        this.debugLog('[ThinkingIndicator] Hiding thinking indicator.');
        CursorFlowUI.hideThinkingIndicator(this.thinkingIndicator);
        this.thinkingIndicator = null;
      }
    }

    // Renamed from removeStopButton to be more descriptive of its full action
    private restoreOriginalButtonFunctions(): void {
      this.debugLog('Restoring original button functions and removing stop button configurations');

      // Revert copilot button if it was used
      if (this.copilotButton && document.body.contains(this.copilotButton)) {
        this.copilotButton.textContent = this.copilotButtonOriginalText;
        this.copilotButton.classList.remove('hyphen-stop-guide-active');
        this.copilotButton.style.backgroundColor = this.options.theme?.buttonColor || '#007bff';
        
        // Remove stop listener and restore original
        const clonedButton = this.copilotButton.cloneNode(true) as HTMLElement;
        this.copilotButton.parentNode?.replaceChild(clonedButton, this.copilotButton);
        this.copilotButton = clonedButton;
        
        if (this.originalCopilotButtonOnClick) {
          this.copilotButton.onclick = this.originalCopilotButtonOnClick;
        } else {
          // Restore default copilot functionality if no specific original handler
          this.copilotButton.addEventListener('click', () => {
            CopilotModal.showSearchModal();
          });
        }
      }

      // Revert start button if it was used
      if (this.startButtonIsStopButton && this.startButton && document.body.contains(this.startButton)) {
        this.startButton.removeEventListener('click', this.stopFromButton);
        if (this.originalStartButtonOnClick) {
          this.startButton.addEventListener('click', this.originalStartButtonOnClick);
        }
        
        const textSpan = this.startButton.querySelector('.hyphen-text') as HTMLElement;
        if (textSpan) {
          textSpan.textContent = this.options.theme?.button_text || this.options.buttonText || '';
        }
        
        this.startButton.classList.remove('hyphen-stop-guide-active');
        this.startButton.style.backgroundColor = '#ffffff'; // Assuming default, or use theme if available
        this.startButtonIsStopButton = false;
      }

      // Remove dedicated stop button
      if (this.dedicatedStopButton && document.body.contains(this.dedicatedStopButton)) {
        this.dedicatedStopButton.remove();
        this.dedicatedStopButton = null;
      }

      // Reset state variables related to button swapping
      this.copilotButton = null;
      this.originalCopilotButtonOnClick = null;
      this.copilotButtonOriginalText = '';
      // originalStartButtonOnClick is generally preserved unless explicitly changed
    }

}