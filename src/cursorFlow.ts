import { ApiClient } from './apiClient';
import { StateManager } from './manageState';
import { CursorFlowUI } from './uiComponents';
import { CursorFlowOptions, CursorFlowState, InteractionData, NotificationType, StopNotificationOptions } from './types';
import { RobustElementFinder } from './robustElementFinder';
import { SelectiveDomAnalyzer } from './selectiveDomAnalyzer';
import { FlowExecutionTracker } from './flowExecutionTracker';
import { CopilotModal } from './copilotModal';

const API_URL = 'https://hyphenbox-backend.onrender.com';

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

    constructor(options: CursorFlowOptions) {
      console.log('[CURSOR-FLOW-DEBUG] Initializing with options:', options);
      console.log('[CURSOR-FLOW-DEBUG] Original buttonText:', options.buttonText);
      
      if (!options.userId) {
        console.error('[CURSOR-FLOW-DEBUG] ERROR: userId is required but was not provided');
        throw new Error('userId is required for CursorFlow initialization');
      }
      
      this.options = {
        ...options,
        apiKey: options.apiKey, 
        userId: options.userId, 
        theme: options.theme || {},
        buttonText: options.buttonText || 'Help & Guides', 
        guidesButtonText: options.guidesButtonText || 'Select Guide',
        debug: options.debug || false
      };
      
      console.log('[CURSOR-FLOW-DEBUG] Final options after defaults:', this.options);
      
      if (options.apiClient) {
        console.log('[CURSOR-FLOW-DEBUG] Using provided ApiClient');
        this.apiClient = options.apiClient;
      } else {
        console.log('[CURSOR-FLOW-DEBUG] Creating new ApiClient');
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
      
      if (this.options.debug) {
        console.log('CursorFlow initialized with options:', this.options);
      }
      
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
        this.removeStopButton();
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
      this.startButton.style.backgroundColor = this.options.theme?.brand_color || '#dc3545';
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

    private removeStopButton(): void {
      this.debugLog('Removing stop button configurations');

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
          // Restore default copilot functionality
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
        if (textSpan) textSpan.textContent = this.options.buttonText || 'Help & Guides';
        
        this.startButton.classList.remove('hyphen-stop-guide-active');
        this.startButton.style.backgroundColor = '#ffffff';
        this.startButtonIsStopButton = false;
      }

      // Remove dedicated stop button
      if (this.dedicatedStopButton && document.body.contains(this.dedicatedStopButton)) {
        this.dedicatedStopButton.remove();
        this.dedicatedStopButton = null;
      }

      // Reset state
      this.copilotButton = null;
      this.originalCopilotButtonOnClick = null;
      this.copilotButtonOriginalText = '';
    }

    private stopFromButton = () => {
      this.stop();
    }

    // Add missing fetchGuides method
    private async fetchGuides() {
      try {
        // This would typically fetch guides from the API
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
          console.error('API is not available');
          return false;
        }
        
        if (this.options.debug) {
          console.log('API health check successful');
        }
        
        let needsAutoStart = false;
        let redirectGuideId: string | null = null;
        
        const savedState = StateManager.restore();
        if (savedState) {
          this.state = savedState;
          if (this.state.isPlaying && !StateManager.isSessionActive()) {
            console.log('Tab was closed, resetting playing state');
            this.setIsPlaying(false, true); 
          }
          if (this.options.debug) console.log('Restored state:', this.state);
        }
        
        this.debugLog('Fetching organization theme...');
        try {
          const fetchedTheme = await this.apiClient.getOrganizationTheme();
          if (fetchedTheme) {
            this.options.theme = { ...this.options.theme, ...fetchedTheme }; 
            this.debugLog('Successfully fetched and merged theme:', this.options.theme);
          } else {
            this.debugLog('Theme fetch returned null or failed. Using default/existing theme options.');
          }
        } catch (themeError) {
          console.error('Error fetching organization theme during init:', themeError);
        }
        
        try {
          redirectGuideId = localStorage.getItem('hyphen_redirect_guide_id');
          if (redirectGuideId) {
            console.log('Found guide requiring redirect to auto-start:', redirectGuideId);
            localStorage.removeItem('hyphen_redirect_guide_id');
            needsAutoStart = true;
          }
        } catch (err) {
          console.error('Error checking for redirect guide:', err);
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
        
        if (needsAutoStart && redirectGuideId) {
          setTimeout(() => {
            console.log('Executing auto-start for redirect guide:', redirectGuideId);
            this.operationToken = this.generateToken();
            const currentToken = this.operationToken;
            this.setIsPlaying(true);
            this.retrieveGuideData(redirectGuideId, currentToken);
          }, 1000); 
        } else if (this.state.isPlaying && this.state.recordingId) {
          this.setIsPlaying(true);
          console.log('Guide is active from restored state, loading recording');
          await this.loadRecording(this.state.recordingId);
          this.setupNavigationDetection();
          console.log('Active guide detected, finding appropriate step to play');
          setTimeout(() => {
            this.handleNavigation(true); 
          }, 500);
        }
        
        return true;
      } catch (error) {
        console.error('Failed to initialize CursorFlow:', error);
        return false;
      }
    }

    private ensureStartButtonExists(): void {
      if (this.startButton && document.body.contains(this.startButton)) {
        console.log('[CURSOR-FLOW-DEBUG] Start button already exists.');
        return;
      }
      
      const existingButton = document.querySelector('.hyphen-start-button') as HTMLElement;
      if (existingButton) {
        console.log('[CURSOR-FLOW-DEBUG] Found existing start button in DOM.');
        this.startButton = existingButton;
        this.startButton.removeEventListener('click', this.handleToggleClick); 
        this.startButton.addEventListener('click', this.handleToggleClick);
        if (!this.originalStartButtonOnClick) {
            this.originalStartButtonOnClick = this.handleToggleClick;
        }
        return;
      }
      
      console.log('[CURSOR-FLOW-DEBUG] Creating new start button with theme:', this.options.theme);
      this.startButton = CursorFlowUI.createStartButton(
          this.options.buttonText || 'Guides',
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
          console.error('[CURSOR-FLOW-DEBUG] Attempted to update button state, but button not found or not in DOM.');
          return; 
      }
      
      if (!this.state.isPlaying && !this.startButtonIsStopButton) {
        this.debugLog('Updating button state to default (not playing, not stop button).');
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
        textSpan.textContent = this.options.buttonText || 'Help & Guides';
        this.startButton.classList.remove('hyphen-stop-guide-active');
        this.startButton.style.backgroundColor = '#ffffff';
      } else {
        this.debugLog('Button state update skipped (either playing or button is stop button).');
      }
    }

    stop(notificationOptions?: StopNotificationOptions) {
      const oldToken = this.operationToken;
      this.operationToken = this.generateToken();
      this.debugLog(`[STOP CALLED] Invalidating token ${oldToken}, new token ${this.operationToken}`);
      
      const wasPlaying = this.state.isPlaying;
      const flowId = this.state.recordingId;
      
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
      try { localStorage.removeItem('hyphen_redirect_guide_id'); } catch (err) { console.warn('Failed to clear redirect ID on stop:', err); }
      if (this.thinkingIndicator) { CursorFlowUI.hideThinkingIndicator(this.thinkingIndicator); this.thinkingIndicator = null; }
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
          // Ensure playing state is false if cancelled here
          this.setIsPlaying(false, true);
          return;
        }
        
        // Fetch recording data
        const flowData = await this.apiClient.getRecording(guideId);
        
        // Check token again after async operation
        if (token !== this.operationToken) {
          this.debugLog('Operation was cancelled during API fetch, aborting guide processing');
          this.setIsPlaying(false, true);
          return;
        }
        
        this.debugLog('Retrieved guide data:', flowData);
        
        // Get texts if needed
        const texts = await this.apiClient.getTexts(guideId);
        
        // Check token again
        if (token !== this.operationToken) {
          this.debugLog('Operation was cancelled during texts fetch, aborting guide processing');
          this.setIsPlaying(false, true);
          return;
        }
        
        this.debugLog('Retrieved guide texts:', texts);
        
        // Store the recording
        this.recording = flowData;
        
        // Sort steps
        if (this.recording && this.recording.steps) {
          console.time('Sort steps');
          this.sortedSteps = [...this.recording.steps].sort((a, b) => {
            return (a.position || 0) - (b.position || 0);
          });
          console.timeEnd('Sort steps');
        }
        
        // Final token check before proceeding
        if (token !== this.operationToken) {
          this.debugLog('Operation was cancelled after step sorting, aborting guide start');
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
          const redirectUrl = stepUrl || (stepPath ? stepPath : null);
          
          // Check URL matching - use URL first, then fall back to path
          const isUrlMatch = stepUrl ? RobustElementFinder.compareUrls(stepUrl, window.location.href) : false;
          const isPathMatch = stepPath ? window.location.pathname === stepPath : false;
          
          this.debugLog('URL CHECK DETAILS:', { 
            hasUrlToCheck, 
            stepUrl, 
            stepPath, 
            redirectUrl, 
            isUrlMatch, 
            isPathMatch,
            currentPath: window.location.pathname
          });
          
          // Hide thinking indicator if we're showing a notification
          if (hasUrlToCheck && !isUrlMatch && !isPathMatch) {
            // User is not on the correct starting page
            this.debugLog('URL CHECK FAILED: User is not on the correct starting page for the guide');
            
            // Hide thinking indicator before showing notification
            if (this.thinkingIndicator) {
              CursorFlowUI.hideThinkingIndicator(this.thinkingIndicator);
              this.thinkingIndicator = null;
            }
            
            if (redirectUrl) {
              // Store the guide ID in localStorage for auto-start after redirect
              try {
                localStorage.setItem('hyphen_redirect_guide_id', guideId);
                this.debugLog('Stored redirect guide ID in localStorage:', guideId);
              } catch (err) {
                console.error('Failed to store guide ID in localStorage:', err);
              }
              
              // Show notification with redirect option
              CursorFlowUI.showRedirectNotification({
                message: 'To start this guide, you need to go to the starting page first',
                type: 'info',
                redirectUrl: redirectUrl,
                redirectText: 'Go to start'
              });
              // IMPORTANT: Reset playing state as we are redirecting, not playing yet
              this.setIsPlaying(false, true);
            } else {
              // No redirect URL available
              CursorFlowUI.showNotification({
                message: 'Guide cannot start - missing URL information',
                type: 'error',
                autoClose: 5000
              });
              // Reset playing state as guide cannot start
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
        
        // Start the actual guide
        await this.startGuide(guideId, token);
      } catch (error) {
        console.error('Error retrieving guide data:', error);
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
          console.time('Sort steps');
          this.sortedSteps = [...this.recording.steps].sort((a, b) => {
            return (a.position || 0) - (b.position || 0);
          });
          console.timeEnd('Sort steps');
        }
        
        // Preserve completedSteps when it's the same recording ID
        // const preserveSteps = this.state.recordingId === recordingId ? this.state.completedSteps : [];
        // StateManager.restore already handles loading existing state, including completedSteps
        
        // Update state recordingId only (isPlaying is handled elsewhere)
        this.state.recordingId = recordingId;
        // this.state.isPlaying = true; // NO - isPlaying is set by the caller (init or dropdown)
        // this.state.currentStep = 0; // No - state restore handles this or handleNavigation adjusts it
        // this.state.completedSteps = preserveSteps; // No - state restore handles this
        
        // Save state immediately since this is an important transition?
        // Let StateManager handle debouncing unless immediate needed
        StateManager.saveWithDebounce(this.state); 
        
        if (this.options.debug) {
          this.debugLog('Recording loaded:', recordingId, flowData);
          // this.debugLog('Preserved completed steps:', preserveSteps);
        }
        
        return flowData;
      } catch (error) {
        console.error('Failed to load recording:', error);
        this.stop({ message: 'Failed to load guide data.', type: 'error'}); // Stop if loading fails
        throw error;
      }
    }
  
    private async startGuide(guideId: string, token: string) {
      try {
        // Check token validity before starting
        if (token !== this.operationToken) {
          this.debugLog('Operation was cancelled (token mismatch), aborting guide start');
          this.setIsPlaying(false, true);
          return false;
        }
        
        this.debugLog('Starting guide internally:', guideId);
        
        // Set isPlaying via setter - should already be true if called from dropdown/redirect
        // but call again to ensure consistency
        this.setIsPlaying(true);
        
        // Update state variables directly - isPlaying is handled by setter
        this.state.currentStep = 0;
        this.state.recordingId = guideId;
        this.state.completedSteps = []; // Always start fresh
        this.state.timestamp = Date.now();
        
        // Add debug logging
        this.debugLog('Starting guide with state:', JSON.stringify(this.state));
        
        // Load recording (should already be loaded by retrieveGuideData, but maybe call loadRecording for consistency?)
        // Or assume this.recording is populated correctly by retrieveGuideData
        if (!this.recording || this.recording.id !== guideId) {
           console.warn('Recording mismatch in startGuide, attempting to reload');
           await this.loadRecording(guideId);
        } else {
          this.debugLog('Recording already loaded.');
        }
        
        // Start tracking flow execution
        try {
          const trackingStarted = await this.executionTracker.trackStart(guideId);
          if (trackingStarted) {
            this.debugLog(`Flow execution tracking started for flow ${guideId}`);
          } else {
            this.debugLog(`Failed to start flow execution tracking for flow ${guideId}, but continuing with guide`);
          }
        } catch (trackingError) {
          console.error('Error starting flow execution tracking:', trackingError);
          // Continue with guide execution even if tracking fails
        }
        
        // Set session active
        StateManager.setSessionActive();
        
        // Create visual elements if needed
        this.createVisualElements();
        
        // Setup navigation detection
        this.setupNavigationDetection();
        
        // Update button state (setIsPlaying already did this)
        // this.updateButtonState();
        
        // Play first step
        await this.playCurrentStep();
        
        return true;
      } catch (error) {
        console.error('Failed to start guide:', error);
        this.stop({ message: 'Failed to start guide', type: 'error'}); // Stop on error
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
      console.time('Find matching steps');
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
      console.timeEnd('Find matching steps');
      
      if (matchingSteps.length === 0) {
        if (this.options.debug) {
          this.debugLog('DETECT CONTEXT: No steps match current URL or path');
        }
        return null;
      }
      
      console.time('Find uncompleted step');
      // Find the earliest uncompleted step for this URL
      const uncompletedSteps = matchingSteps.filter((step: any) => {
        const stepIndex = step.position || 0;
        return !this.state.completedSteps.includes(stepIndex);
      });
      
      if (uncompletedSteps.length > 0) {
        // Get earliest uncompleted step by position
        // The steps are already sorted, so just take the first one
        const earliestStep = uncompletedSteps[0];
        console.timeEnd('Find uncompleted step');
        return earliestStep;
      }
      
      // All steps for this URL are completed, return the last step for navigation context
      // Since we know sortedSteps is sorted by position, we can use the last matching step
      console.timeEnd('Find uncompleted step');
      return matchingSteps[matchingSteps.length - 1];
    }
  
    // Add this helper method for debug logging
    private debugLog(...args: any[]): void {
      if (this.options.debug) {
        console.log('[CursorFlow]', ...args);
      }
    }
    
    private async playCurrentStep() {
      // ADDED: Log this.options.debug at the start of the function
      this.debugLog(`[DEBUG-VERIFY] playCurrentStep called. this.options.debug = ${this.options.debug}`);

      // Ensure any previous validation loop is stopped before starting a new step
      this.stopValidationLoop();

      // Hide thinking indicator when starting to play a step
      if (this.thinkingIndicator) {
        CursorFlowUI.hideThinkingIndicator(this.thinkingIndicator);
        this.thinkingIndicator = null;
      }
      
      if (!this.recording || !this.state.isPlaying) {
        console.warn('[CursorFlow] No active recording or not in playing state');
        return false;
      }
      
      // Get current step from recording
      let currentStep: any; // Use 'any' for simplicity or define a proper Step type
       if (this.recording.steps && this.recording.steps.length > 0) {
          // Find the current step based on state.currentStep and sortedSteps
          // Find step by position if available
          if (this.sortedSteps[0]?.position !== undefined) {
              const targetPosition = this.sortedSteps[this.state.currentStep]?.position;
              if (targetPosition !== undefined) {
                   // Find the actual step object matching the position from the potentially incomplete state.currentStep index
                  currentStep = this.sortedSteps.find(step => step.position === targetPosition);
                  // If the direct index didn't work (e.g., after skip), find the first uncompleted
                  if (!currentStep || this.state.completedSteps.includes(currentStep.position)) {
                      currentStep = this.sortedSteps.find(step => !this.state.completedSteps.includes(step.position));
                  }
              } else {
                   // Fallback if position is missing unexpectedly
                   currentStep = this.sortedSteps[this.state.currentStep];
              }
          } else {
              // Index-based fallback
              currentStep = this.sortedSteps[this.state.currentStep];
          }
       }


      if (!currentStep) {
          // Potentially all steps completed or state is inconsistent
           const nextStep = this.findNextStep(); // Check if there's logically a next step
          if (nextStep) {
              currentStep = nextStep;
              // Update state.currentStep to match the found next step's index in sortedSteps
              this.state.currentStep = this.sortedSteps.findIndex(step => step === nextStep);
              this.debugLog(`State inconsistency? Found next logical step at index ${this.state.currentStep}, position ${currentStep.position}. Proceeding.`);
              StateManager.saveWithDebounce(this.state); // Save corrected state
          } else {
              console.warn('[CursorFlow] No current or next step found. Guide might be complete or state is invalid.');
              this.completeGuide(); // Assume completion if no steps left
              return false;
          }
      }


      this.debugLog(`Playing step ${this.state.currentStep} (Position: ${currentStep.position || 'N/A'})`);

      // Find target element from interaction data
      const interaction = currentStep.interaction || {}; // interaction object also contains isHighlightStep
      // Ensure interaction text is populated if available in element data
      if (!interaction.text && interaction.element?.textContent) {
          interaction.text = interaction.element.textContent;
      }
      this.debugLog('Interaction data:', JSON.stringify(interaction));

      // Determine if this is a highlight step and if it's the last step
      const isHighlightStep = !!currentStep.is_highlight_step; // CORRECTED: Access directly from currentStep
      const isLastStep = this.state.currentStep >= this.sortedSteps.length - 1 || 
                         (this.sortedSteps.findIndex(step => !this.state.completedSteps.includes(step.position)) === -1 && 
                         this.sortedSteps.indexOf(currentStep) === this.sortedSteps.length -1 );

      this.debugLog(`Step flags: isHighlightStep=${isHighlightStep}, isLastStep=${isLastStep}`);

      // Before we search for elements, check if navigation is expectedx
      const expectedPath = interaction.pageInfo?.path;
      const currentPath = window.location.pathname;
      const isNavigationExpected = expectedPath && expectedPath !== currentPath;

      if (isNavigationExpected) {
          this.debugLog(`Navigation expected from ${currentPath} to ${expectedPath}`);
      }

      // --- Use RobustElementFinder to get candidates ---
      this.debugLog('Finding candidate elements using RobustElementFinder...');
      console.time('Find candidate elements');
      // ADDED: Log the debug value being passed
      const debugValueForFinder = this.options.debug || false;
      this.debugLog(`[DEBUG-VERIFY] Passing debug=${debugValueForFinder} to RobustElementFinder.setDebugMode`);
      RobustElementFinder.setDebugMode(debugValueForFinder);
      let candidateElements = await RobustElementFinder.findCandidates(interaction);
      console.timeEnd('Find candidate elements');
      this.debugLog(`RobustFinder found ${candidateElements.length} candidate(s).`);

      let finalTargetElement: HTMLElement | null = null;

      // --- Validate candidates using SelectiveDomAnalyzer ---
      if (candidateElements.length > 0) {
          this.debugLog('Validating candidate(s) using SelectiveDomAnalyzer...');
          SelectiveDomAnalyzer.clearCache(); // Clear cache for this step's validation
          SelectiveDomAnalyzer.setDebugMode(this.options.debug || false);

          const validCandidates: HTMLElement[] = [];
          for (const candidate of candidateElements) {
              if (SelectiveDomAnalyzer.validateCandidateElement(candidate, interaction)) {
                  validCandidates.push(candidate);
              }
              // Logging for failed validation happens inside SelectiveDomAnalyzer if debugMode is on
          }

          if (validCandidates.length === 1) {
              this.debugLog('Validation successful: 1 valid candidate found.');
              finalTargetElement = validCandidates[0];
          } else if (validCandidates.length > 1) {
              console.warn(`[CursorFlow] Ambiguity detected: ${validCandidates.length} candidates passed validation.`);
              this.debugLog('Candidates passing validation:', validCandidates.map(el => el.outerHTML.substring(0, 100) + '...'));
              // **** Future: Add LLM or other disambiguation logic here ****
              // For now, pick the first valid candidate as a fallback
              finalTargetElement = validCandidates[0];
              console.log('[CursorFlow] Fallback: Picking the first valid candidate.');
          } else {
              // No candidates passed validation
              this.debugLog('Validation failed: No candidates passed deeper checks.');
              finalTargetElement = null;
          }
      } else {
           // No initial candidates found
          this.debugLog('Validation skipped: RobustFinder found no initial candidates.');
          finalTargetElement = null;
      }
      // --- End Validation ---

      // Set the determined target element
      this.currentTargetElement = finalTargetElement;

      // --- Handle Outcome ---
      if (!this.currentTargetElement) {
          console.warn('[CursorFlow] Target element could not be definitively determined for step:', currentStep);
          if (isNavigationExpected) {
              this.debugLog('Element not found/validated, but navigation is expected. Allowing navigation.');
              // Don't show error UI if navigation is the expected next action
              return true; // Allow potential navigation to proceed without error UI
          }
          // Only show error UI if navigation wasn't expected
          console.log('DOM content at time of search:', document.body.innerHTML.substring(0, 500) + '...');
          this.handleInteractionError();
          return false;
      }

      // ADDED: Scroll into view logic *after* validation, *before* showing visuals
      try {
          if (!this.isElementPartiallyInViewport(this.currentTargetElement)) {
              this.debugLog('[CursorFlow] Target element not in viewport, attempting to scroll...');
              // Use the helper from RobustElementFinder (keeping it there for now)
              // Alternatively, implement scroll logic directly in CursorFlowUI or here
              const scrolledCandidates = await RobustElementFinder.ensureCandidatesInView([this.currentTargetElement]);
              if (scrolledCandidates.length === 0) {
                   console.warn('[CursorFlow] Failed to scroll the validated element into view.');
                   // Decide if this is critical enough to stop
                   // For now, let's proceed but log the warning. The validation loop might catch issues.
              } else {
                   this.debugLog('[CursorFlow] Scroll attempt finished.');
              }

              // Short delay for scroll settling might still be useful
              await new Promise(resolve => setTimeout(resolve, 150)); 

              // Re-check connection and visibility after scroll attempt
              if (!this.currentTargetElement.isConnected) {
                   this.debugLog('[CursorFlow] CRITICAL: Target element disconnected after scroll attempt!');
                   this.handleInteractionError(); // Use existing error handler
                   return false;
              }
              // Optionally re-check viewport if needed, but partial visibility check is lenient
              // if (!this.isElementPartiallyInViewport(this.currentTargetElement)) {
              //    console.warn('[CursorFlow] Element still not sufficiently visible after scroll.');
              // }
          } else {
              this.debugLog('[CursorFlow] Target element already sufficiently in viewport. No scroll needed.');
          }
      } catch (scrollError) {
           console.error('[CursorFlow] Error during scroll attempt:', scrollError);
           // Continue execution? Or handle as error? Let's continue for now.
      }
      // --- End Scroll Logic ---

      // Proceed ONLY if element is still valid after potential scroll
      if (!this.currentTargetElement || !this.currentTargetElement.isConnected) {
           this.debugLog('[CursorFlow] Target element became invalid after scroll checks. Aborting step.');
           this.handleInteractionError();
           return false;
       }

      this.debugLog('Successfully identified target element:', this.currentTargetElement.outerHTML.substring(0, 150) + '...');

      console.time('Show visual elements');
      const currentToken = this.operationToken; 
      // Pass currentStep.annotation as the displayText argument
      await this.showVisualElements(this.currentTargetElement, currentStep.interaction, currentStep.annotation || '', isHighlightStep, isLastStep);
      console.timeEnd('Show visual elements');
      
      // Check token again after showing visuals, before setting up interaction
      if (this.operationToken !== currentToken) { 
          this.debugLog(`[playCurrentStep] Operation cancelled after showVisualElements. Aborting interaction setup.`);
          // Explicitly clean up visuals shown if cancelled mid-step
          this.hideVisualElements(); 
          return false; 
      }

      if (isHighlightStep) {
        this.debugLog('[CursorFlow] Setting up highlight step completion (Next/Finish button).');
        this.setupHighlightStepCompletion(isLastStep);
      } else {
        this.debugLog('[CursorFlow] Setting up standard element interaction tracking.');
        console.time('Setup interaction tracking');
        this.setupElementInteractionTracking(this.currentTargetElement, interaction);
        console.timeEnd('Setup interaction tracking');
      }

      // Start the validation loop *after* visuals and tracking are set up
      // Only start validation loop for non-highlight steps where element interaction is expected
      if (!isHighlightStep) {
        this.startValidationLoop();
      }

      return true;
    }
  
    private async showVisualElements(
      targetElement: HTMLElement | null,
      interactionForContext: InteractionData, // Renamed to avoid confusion, primarily for context/flags
      displayText: string, // Explicit parameter for display text
      isHighlightStep: boolean,
      isLastStep: boolean
    ): Promise<void> {
      console.log('[CursorFlow] [VISUAL-ELEMENTS] showVisualElements called with:', {
        element: targetElement ? `${targetElement.tagName}#${targetElement.id || 'noId'}` : 'null',
        displayedText: displayText, // Log the actual text being displayed
        isHighlightStep,
        isLastStep,
        theme: this.options.theme
      });

      const existingPopup = document.getElementById('hyphenbox-text-popup');
      if (existingPopup && existingPopup.parentNode) {
        existingPopup.parentNode.removeChild(existingPopup);
      }
      const existingGuidanceCard = document.getElementById('hyphen-guidance-card');
      if (existingGuidanceCard && existingGuidanceCard.parentNode) {
        existingGuidanceCard.parentNode.removeChild(existingGuidanceCard);
      }

      if (isHighlightStep) {
        console.log('[CursorFlow] [VISUAL-ELEMENTS] Handling highlight step.');

        if (targetElement && targetElement.isConnected) {
          if (!this.highlightElement) {
            this.highlightElement = CursorFlowUI.createHighlight(this.options.theme || {});
          }
          if (this.highlightElement && !document.body.contains(this.highlightElement)) {
              document.body.appendChild(this.highlightElement);
          }
          CursorFlowUI.positionHighlightOnElement(targetElement, this.highlightElement);
          if(this.highlightElement) this.highlightElement.style.display = 'block';
          console.log('[CursorFlow] [VISUAL-ELEMENTS] Highlight shown for highlight step.');
        } else {
          console.log('[CursorFlow] [VISUAL-ELEMENTS] No targetElement or element not connected for highlight step. Skipping highlight.');
          if (this.highlightElement) {
            this.highlightElement.style.display = 'none';
          }
        }

        // Use displayText for the guidance card
        this.guidanceCardElement = CursorFlowUI.createGuidanceCard(displayText || 'Please follow the instruction.', isLastStep, this.options.theme || {});
        if (this.guidanceCardElement) {
          document.body.appendChild(this.guidanceCardElement); // Append to DOM first
          // Now call positionGuidanceCard, passing the targetElement (which can be null)
          CursorFlowUI.positionGuidanceCard(this.guidanceCardElement, targetElement);
        }
        console.log('[CursorFlow] [VISUAL-ELEMENTS] Guidance card shown and positioned for highlight step.');

        if (this.cursorElement || document.getElementById('hyphenbox-cursor-wrapper')) { 
          const cursorWrapper = document.getElementById('hyphenbox-cursor-wrapper');
          if (cursorWrapper && cursorWrapper.parentNode) {
              cursorWrapper.parentNode.removeChild(cursorWrapper);
          }
          this.cursorElement = null;
        }
        console.log('[CursorFlow] [VISUAL-ELEMENTS] Cursor explicitly hidden/removed for highlight step.');

      } else {
        console.log('[CursorFlow] [VISUAL-ELEMENTS] Handling interactive (non-highlight) step.');

        if (!targetElement || !targetElement.isConnected) {
          console.warn('[CursorFlow] [VISUAL-ELEMENTS] Target element not found or not connected for interactive step. Aborting visual elements.');
          CursorFlowUI.cleanupAllUI(true, true);
          return;
        }

        if (!this.cursorElement) {
          this.cursorElement = CursorFlowUI.createCursor(this.options.theme || {});
        }
        // Pass interactionForContext for cursor positioning if it contains element details
        CursorFlowUI.moveCursorToElement(targetElement, this.cursorElement, interactionForContext);
        if(this.cursorElement) this.cursorElement.style.display = 'block';
        console.log('[CursorFlow] [VISUAL-ELEMENTS] Cursor shown for interactive step.');

        if (!this.highlightElement) {
          this.highlightElement = CursorFlowUI.createHighlight(this.options.theme || {});
        }
        if (this.highlightElement && !document.body.contains(this.highlightElement)) {
          document.body.appendChild(this.highlightElement);
        }
        CursorFlowUI.positionHighlightOnElement(targetElement, this.highlightElement);
        if(this.highlightElement) this.highlightElement.style.display = 'block';
        console.log('[CursorFlow] [VISUAL-ELEMENTS] Highlight shown for interactive step.');
        
        // Use displayText for the text popup
        if (displayText) { 
          this.textPopupElement = CursorFlowUI.createTextPopup(displayText, this.options.theme || {});
          if (this.cursorElement && this.textPopupElement) {
              CursorFlowUI.positionTextPopupNearCursor(this.cursorElement, this.textPopupElement);
              console.log('[CursorFlow] [VISUAL-ELEMENTS] Text popup shown for interactive step.');
          } else {
              console.warn('[CursorFlow] [VISUAL-ELEMENTS] Cursor or text popup element missing for positioning.');
          }
        } else {
          console.log('[CursorFlow] [VISUAL-ELEMENTS] No display text provided for interactive step popup.');
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
        console.log(`Visual elements hidden/cleaned up ${keepCursor ? '(keeping cursor)' : '(removing cursor)'}`);
      }
    }
  
    private setupNavigationDetection() {
      if (this.options.debug) {
        console.log('Setting up navigation detection');
      }
      
      // Use history API to detect navigation events
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      // Override pushState
      history.pushState = (...args) => {
        originalPushState.apply(history, args);
        if (this.options.debug) {
          console.log('pushState called, args:', args);
        }
        this.handleNavigation();
      };
      
      // Override replaceState
      history.replaceState = (...args) => {
        originalReplaceState.apply(history, args);
        if (this.options.debug) {
          console.log('replaceState called, args:', args);
        }
        this.handleNavigation();
      };
      
      // Listen for popstate event (browser back/forward buttons)
      window.addEventListener('popstate', () => {
        if (this.options.debug) {
          console.log('popstate event triggered');
        }
        this.handleNavigation();
      });
      
      if (this.options.debug) {
        console.log('Navigation detection set up');
      }
    }
  
    private handleNavigation(continueThroughSteps = false) {
      if (!this.state.isPlaying || this.isHandlingNavigation || this.invalidationInProgress) {
        console.log('handleNavigation: Initial check failed - Not playing, already handling, or invalidation in progress. Returning early');
        return;
      }
      
      this.isHandlingNavigation = true;
      console.log('handleNavigation: Current URL:', window.location.href);
      console.time('Navigation handling');
      
      setTimeout(async () => {
        // **** ADDED CHECK INSIDE TIMEOUT ****
        // Check if stop() was called while we were waiting for the timeout
        if (!this.state.isPlaying) {
            console.log('handleNavigation: state.isPlaying is false after timeout. Aborting navigation handling.');
            this.isHandlingNavigation = false; // Ensure flag is reset
            console.timeEnd('Navigation handling'); // End timer here
            return;
        }
          
        try {
          console.time('Check completed steps');
          // Check if we have completed the previous step and moved to a new URL
          if (this.state.completedSteps.length > 0) {
            const lastCompletedPosition = this.state.completedSteps[this.state.completedSteps.length - 1];
            const currentPath = window.location.pathname;
            
            // Find next step more efficiently using array method instead of a loop
            const nextStepIndex = this.sortedSteps.findIndex((step: any) => {
              const stepPosition = step.position || 0;
              return stepPosition > lastCompletedPosition && 
                    !this.state.completedSteps.includes(stepPosition);
            });
            
            if (nextStepIndex >= 0) {
              const nextExpectedStep = this.sortedSteps[nextStepIndex];
              
              // Check path directly without unnecessary operations
              const nextStepPath = nextExpectedStep.interaction?.pageInfo?.path;
              
              // Fast path check
              if (nextStepPath && nextStepPath === currentPath) {
                console.log('handleNavigation: Path match found');
                this.state.currentStep = this.recording.steps.indexOf(nextExpectedStep);
                console.timeEnd('Check completed steps');
                console.time('Play step');
                // IMPORTANT: Added visual cleanup before playing next step
                this.hideVisualElements();
                console.log('handleNavigation: Cleaned up visuals before playing next step');
                await this.playCurrentStep();
                console.timeEnd('Play step');
                console.timeEnd('Navigation handling');
                this.isHandlingNavigation = false;
                return;
              }
            }
          }
          console.timeEnd('Check completed steps');
          
          // Only run detectCurrentContext if needed
          console.time('Detect context');
          const contextStep = await this.detectCurrentContext();
          console.timeEnd('Detect context');
          
          if (contextStep) {
            console.time('Process context step');
            // Found a matching step for this URL
            console.log('handleNavigation: Found matching step for this URL');
            const stepIndex = contextStep.position || this.recording.steps.indexOf(contextStep);
            
            // Check if this is a backward navigation to a completed step
            const isBackNavigation = this.state.completedSteps.includes(stepIndex);
            
            if (isBackNavigation) {
              console.log('handleNavigation: Back navigation detected, showing step again');
              this.state.currentStep = this.recording.steps.indexOf(contextStep);
              // IMPORTANT: Added visual cleanup before re-showing the same step
              this.hideVisualElements();
              console.log('handleNavigation: Cleaned up visuals before re-showing same step');
              
              // *** ADDED CHECK ***
              const stepPlayedSuccessfully = await this.playCurrentStep();
              if (!stepPlayedSuccessfully) {
                console.log('handleNavigation: playCurrentStep failed after back navigation. Stopping guide.');
                this.stop({
                    message: 'Guide stopped: Element for this step could not be found or validated.',
                    type: 'error',
                    autoClose: 5000
                });
                // Exit navigation handling early
                 this.isHandlingNavigation = false; 
                 console.timeEnd('Process context step'); // End timer here before returning
                 console.timeEnd('Navigation handling');
                 return;
              }
            } else {
              // Forward navigation - check if prerequisites are met
              const prerequisitesMet = this.sortedSteps.every((step: any) => {
                const position = step.position || 0;
                return position >= stepIndex || this.state.completedSteps.includes(position);
              });
              
              if (prerequisitesMet) {
                console.log('handleNavigation: Prerequisites met, playing step');
                this.state.currentStep = this.recording.steps.indexOf(contextStep);
                // IMPORTANT: Added visual cleanup before playing step in forward navigation
                this.hideVisualElements();
                console.log('handleNavigation: Cleaned up visuals before forward navigation step');
                
                 // *** ADDED CHECK ***
                 const stepPlayedSuccessfully = await this.playCurrentStep();
                 if (!stepPlayedSuccessfully) {
                    console.log('handleNavigation: playCurrentStep failed during forward navigation. Stopping guide.');
                    this.stop({
                        message: 'Guide stopped: Element for this step could not be found or validated.',
                        type: 'error',
                        autoClose: 5000
                    });
                     // Exit navigation handling early
                     this.isHandlingNavigation = false; 
                     console.timeEnd('Process context step'); // End timer here before returning
                     console.timeEnd('Navigation handling');
                     return;
                }
              } else {
                console.log('handleNavigation: Prerequisites not met, showing warning');
                
                // IMPORTANT: Added visual cleanup before showing error
                this.hideVisualElements();
                console.log('handleNavigation: Cleaned up visuals before prerequisites warning');
                
                // Find first incomplete step more efficiently
                const firstIncompleteStep = this.sortedSteps.find((step: any) => {
                  const position = step.position || 0;
                  return position < stepIndex && !this.state.completedSteps.includes(position);
                });
                
                if (firstIncompleteStep && firstIncompleteStep.url) {
                  CursorFlowUI.showRedirectNotification({
                    message: 'You need to complete previous steps first',
                    type: 'warning',
                    redirectUrl: firstIncompleteStep.url,
                    redirectText: 'Go to previous step'
                  });
                } else {
                  CursorFlowUI.showNotification({
                    message: 'Please complete previous steps first',
                    type: 'warning',
                    autoClose: 5000
                  });
                }
                
                this.stop({
                  message: 'Please complete previous steps first',
                  type: 'warning'
                });
              }
            }
            console.timeEnd('Process context step');
          } else {
            console.log('handleNavigation: No matching steps for this URL');
            // Check if all steps are completed
            console.time('Check completion');
            const allSteps = this.recording.steps || [];
            const allCompleted = allSteps.every((step: { position?: number }) => {
                const stepPosition = step.position || 0;
                return this.state.completedSteps.includes(stepPosition);
            });
            if (allCompleted && allSteps.length > 0) {
                console.log('handleNavigation: All guide steps completed');
                // IMPORTANT: Added visual cleanup before completing guide
                this.hideVisualElements();
                console.log('handleNavigation: Cleaned up visuals before completing guide');
                this.completeGuide();
            } else {
                // IMPORTANT: Added visual cleanup before showing navigation error
                this.hideVisualElements();
                console.log('handleNavigation: Cleaned up visuals before showing navigation error');
                
                // Track navigation abandonment if we're actively tracking
                if (this.executionTracker.isActive() && this.state.recordingId) {
                  const currentUrl = window.location.href;
                  this.executionTracker.trackAbandonment(
                    'navigation',
                    `User navigated away from guide path to ${currentUrl}`
                  ).catch(error => {
                    console.warn(`Failed to track navigation abandonment: ${error}`);
                    // Continue with stop even if tracking fails
                  });
                }
                
                // Show notification 
                CursorFlowUI.showNotification({
                    message: 'Oops! You\'ve navigated away from the guide path',
                    type: 'warning',
                    autoClose: 5000
                });
                
                // REMOVED setTimeout, call stop directly
                this.stop({
                    message: 'Oops! You\'ve navigated away from the guide path',
                    type: 'warning'
                });
            }
            console.timeEnd('Check completion');
          }
        } catch (error) {
          console.error('Error handling navigation:', error);
          // Ensure stop is called even on error during navigation handling
          // Check isPlaying again before stopping to avoid redundant calls if stop was already called
          if (this.state.isPlaying) {
              // IMPORTANT: Added visual cleanup before stopping due to error
              this.hideVisualElements();
              console.log('handleNavigation: Cleaned up visuals before stopping due to error');
              this.stop({ message: 'Error during navigation', type: 'error' });
          }
        } finally {
          console.timeEnd('Navigation handling');
          this.isHandlingNavigation = false;
        }
      }, 50); 
    }
  
    private setupElementInteractionTracking(element: HTMLElement, interaction: any) {
      // Remove previous listener IF IT EXISTS AND IS DIFFERENT
      this.removeExistingListeners(); // Call this first

      if (!element || !interaction) return;

      if (this.options.debug) {
          console.log('[CursorFlow] Setting up interaction tracking for element:', element);
          console.log('[CursorFlow] Interaction data for tracking:', interaction);
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
      console.log(`[CursorFlow] Adding ${eventType} listener to element:`, element);
      element.addEventListener(eventType, this.currentListener, { capture: true }); // Use capture phase maybe? Test this.

      if (this.options.debug) {
          console.log(`[CursorFlow] Set up ${eventType} listener for element:`, element);
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
            console.log('User clicked outside the highlighted element, stopping guide');
            
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
      // Get current step information for tracking
      const currentStepIndex = this.state.currentStep;
      const currentStepInfo = this.sortedSteps[currentStepIndex];
      
      // Track element not found error if we're actively tracking and not immediately retrying
      if (this.executionTracker.isActive() && this.state.recordingId) {
        const stepDetails = currentStepInfo 
          ? `Step ${currentStepIndex} (position: ${currentStepInfo.position})`
          : `Step ${currentStepIndex}`;
          
        // We don't call trackAbandonment here because the user might choose to retry or skip
        // The actual abandonment will be tracked if/when stop() is called
        
        // Log the error to console for debugging
        this.debugLog(`Interaction error at ${stepDetails}: Element not found or not interactive`);
      }
      
      CursorFlowUI.showErrorNotification(
        'We couldn\'t find the element for this step.',
        {
          message: 'We couldn\'t find the element for this step.',
          type: 'error',
          onRetry: () => this.playCurrentStep(),
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
        console.log('All guide steps completed, resetting state');
      }
      
      // Clear any redirect guide ID
      try {
        localStorage.removeItem('hyphen_redirect_guide_id');
      } catch (err) {
        console.warn('Failed to clear redirect guide ID on completion:', err);
      }
      
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
        console.log('Visual elements created');
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

        // Hide current visual elements first, but keep the cursor and notifications
        // this.hideVisualElements(); // This was causing issues, cleanupAllUI is better
        CursorFlowUI.cleanupAllUI(true, true); // Keep cursor and notifications

        // Remove existing listeners *before* finding the next step's element
        this.removeExistingListeners();

        const nextStep = this.findNextStep();

        if (nextStep) {
            // Update currentStep index in the state to match the found next step
            const nextStepIndex = this.sortedSteps.findIndex(step => step === nextStep);
            if (nextStepIndex !== -1) {
                 this.state.currentStep = nextStepIndex;
                 this.debugLog(`playNextStep: Found next step at index ${this.state.currentStep}. Saving state and playing.`);
                 StateManager.saveWithDebounce(this.state); // Save the updated currentStep index

                 await this.playCurrentStep(); // Play the step we just found
                 return true;
            } else {
                console.error('[CursorFlow] Could not find index for the identified next step. State might be corrupted.');
                 this.completeGuide(); // Fail safe to completion
                 return false;
            }
        } else {
            // No next step found, assume guide completion
            this.debugLog('playNextStep: No next step found by findNextStep(). Completing guide.');
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
      
      // Set playing state via the setter
      this.setIsPlaying(true);
      
      // Show thinking indicator
      if (this.startButton && !this.thinkingIndicator) { 
        this.thinkingIndicator = CursorFlowUI.showThinkingIndicator(this.startButton, this.options.theme || {});
      }
      
      // Call retrieveGuideData with the ID and token
      this.retrieveGuideData(guideId, currentToken);
    }


}