import { ApiClient } from './apiClient';
import { StateManager } from './manageState';
import { CursorFlowUI } from './uiComponents';
import { CursorFlowOptions, CursorFlowState } from './types';
import { ElementUtils } from './elementUtils';
import { DomAnalyzer } from './domAnalyzer';

export default class CursorFlow {
    // Properties
    private options: CursorFlowOptions;
    private apiClient: ApiClient;
    private state: CursorFlowState;
    private cursorElement: HTMLElement | null = null;
    private highlightElement: HTMLElement | null = null;
    private currentTargetElement: HTMLElement | null = null;
    private currentListener: EventListener | null = null;
    private currentInteractionType: string | null = null;
    private recording: any = null;
    private guides: any[] = [];
    private autoProgressTimeout: any = null;
    private startButton: HTMLElement | null = null;
    private sortedSteps: any[] = [];
    private isHandlingNavigation = false;
    private usingDirectHighlight = true;
    private thinkingIndicator: HTMLElement | null = null;
  
    constructor(options: CursorFlowOptions) {
      // Initialize with default options
      console.log('[CURSOR-FLOW-DEBUG] Initializing with options:', options);
      console.log('[CURSOR-FLOW-DEBUG] Original buttonText:', options.buttonText);
      
      this.options = {
        ...options,
        theme: options.theme || {},
        buttonText: 'Co-pilot',
        guidesButtonText: options.guidesButtonText || 'Select Guide',
        debug: options.debug || false
      };
      
      console.log('[CURSOR-FLOW-DEBUG] Final options after defaults:', this.options);
      
      // Create API client
      this.apiClient = new ApiClient(this.options.apiUrl, this.options.organizationId);
      
      // Initialize empty state
      this.state = {
        isPlaying: false,
        currentStep: 0,
        recordingId: null,
        completedSteps: [],
        timestamp: Date.now()
      };
      
      // Log approach being used - but clarify what's actually happening
      console.log('[HIGHLIGHT-DEBUG] Initializing CursorFlow - using CursorFlowUI for highlighting (not DirectHighlight despite the flag)');
      console.log('[HIGHLIGHT-DEBUG] usingDirectHighlight flag is set to:', this.usingDirectHighlight, 'but DirectHighlight class is not imported or used');
      
      if (this.options.debug) {
        console.log('CursorFlow initialized with options:', this.options);
      }
    }
  
    async init(): Promise<boolean> {
      try {
        // Check if API is accessible
        const isHealthy = await this.apiClient.checkHealth();
        if (!isHealthy) {
          console.error('API is not available');
          return false;
        }
        
        if (this.options.debug) {
          console.log('API health check successful');
        }
        
        // Restore state if available
        const savedState = StateManager.restore();
        if (savedState) {
          this.state = savedState;
          
          // Check if tab was closed during active session
          if (this.state.isPlaying && !StateManager.isSessionActive()) {
            // Tab was closed, reset playing state
            console.log('Tab was closed, resetting playing state');
            this.state.isPlaying = false;
            StateManager.save(this.state);
          } else if (this.state.isPlaying && this.state.recordingId) {
            // If guide was playing, reload the recording and continue
            console.log('Guide is active, loading recording');
            await this.loadRecording(this.state.recordingId);
            
            // Set up navigation detection
            this.setupNavigationDetection();
            
            // Proactively check for the next step to play
            console.log('Active guide detected, finding appropriate step to play');
            setTimeout(() => {
              // First, try handleNavigation to see if we have a matching step for this URL
              this.handleNavigation(true); // Pass true to indicate we want to continue even if no match
            }, 500);
          }
          
          if (this.options.debug) {
            console.log('Restored state:', this.state);
          }
        }
        
        // Fetch available guides
        await this.fetchGuides();
        
        // Add the start button to the page
        this.createStartButton();
        
        // Add a window event listener to flush state on page unload
        window.addEventListener('beforeunload', () => {
          if (this.state.isPlaying) {
            StateManager.flushPendingSave();
          }
        });
        
        return true;
      } catch (error) {
        console.error('Failed to initialize CursorFlow:', error);
        return false;
      }
    }
  
    private async fetchGuides() {
      try {
        // API now returns flows instead of recordings
        const flows = await this.apiClient.getRecordings();
        this.guides = flows;
        
        if (this.options.debug) {
          console.log('Available guides:', this.guides);
        }
      } catch (error) {
        console.error('Failed to fetch guides:', error);
        this.guides = [];
      }
    }
    
    private createStartButton() {
      console.log('[CURSOR-FLOW-DEBUG] Creating start button');
      console.log('[CURSOR-FLOW-DEBUG] Current buttonText:', this.options.buttonText);
      
      if (!this.startButton) {
        this.startButton = CursorFlowUI.createStartButton(
          this.options.buttonText || 'Guides',
          this.options.theme?.buttonColor || '#007bff',
          () => this.toggleGuideState()
        );
        
        document.body.appendChild(this.startButton);
        
        if (this.options.debug) {
          console.log('[CURSOR-FLOW-DEBUG] Start button created and appended to body');
        }
      }
      
      // Update button text based on current state
      this.updateButtonState();
    }
  
    private toggleGuideState() {
      if (this.state.isPlaying) {
        // If guide is playing, stop it
        this.stop();
      } else {
        // If guide is not playing, start it
        this.start();
      }
    }
  
    private updateButtonState() {
      console.log('[CURSOR-FLOW-DEBUG] Updating button state');
      console.log('[CURSOR-FLOW-DEBUG] Current state:', { isPlaying: this.state.isPlaying });
      
      if (!this.startButton) {
        console.warn('[CURSOR-FLOW-DEBUG] No start button found to update');
        return;
      }
      
      if (this.state.isPlaying) {
        console.log('[CURSOR-FLOW-DEBUG] Setting button to "Stop Guide"');
        // Update only the text span while preserving the SVG
        const textSpan = this.startButton.querySelector('.hyphen-text');
        if (textSpan) {
          textSpan.textContent = 'Stop Guide';
        }
        this.startButton.classList.add('hyphen-playing');
      } else {
        console.log('[CURSOR-FLOW-DEBUG] Setting button to:', this.options.buttonText || 'Guides');
        // Update only the text span while preserving the SVG
        const textSpan = this.startButton.querySelector('.hyphen-text');
        if (textSpan) {
          textSpan.textContent = this.options.buttonText || 'Guides';
        }
        this.startButton.classList.remove('hyphen-playing');
      }
    }
  
    start() {
      if (this.options.debug) {
        console.log('Starting guide selection');
      }
      
      // Set session flag
      StateManager.setSessionActive();
      
      // Check if we already have guides, fetch them if not
      if (this.guides.length === 0) {
        this.fetchGuides().then(() => {
          this.showGuidesDropdown();
        });
      } else {
        this.showGuidesDropdown();
      }
    }
  
    private showGuidesDropdown() {
      if (!this.startButton) return;
      
      // Create and show dropdown
      CursorFlowUI.showGuidesDropdown(
        this.guides, 
        this.startButton,
        (guideData) => {
          console.log('Selected guide:', guideData);
          
          // Show thinking indicator as soon as guide is selected
          if (this.startButton) {
            this.thinkingIndicator = CursorFlowUI.showThinkingIndicator(this.startButton);
          }
          
          // For now just retrieve and log the recording data
          this.retrieveGuideData(guideData.id);
        }
      );
    }
  
    private async retrieveGuideData(guideId: string) {
      try {
        // Fetch recording data - now returns the full flow with steps
        const flowData = await this.apiClient.getRecording(guideId);
        console.log('Retrieved guide data:', flowData);
        
        // Get texts is optional since annotations are already in the flowData
        // But keeping for backward compatibility
        const texts = await this.apiClient.getTexts(guideId);
        console.log('Retrieved guide texts:', texts);
        
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
        
        // MODIFICATION: For a guide selected from the dropdown, always start fresh
        // Clear any previous state for this guide ID
        StateManager.clear();
        
        // NEW: Check if user is on the correct starting page
        if (this.recording && this.recording.steps && this.recording.steps.length > 0) {
          // Find the first step
          const sortedSteps = [...this.recording.steps].sort((a, b) => {
            return (a.position || 0) - (b.position || 0);
          });
          
          const firstStep = sortedSteps[0];
          
          // Add debugging logs
          console.log('URL CHECK DEBUG: First step data:', {
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
          const isUrlMatch = stepUrl ? ElementUtils.compareUrls(stepUrl, window.location.href) : false;
          const isPathMatch = stepPath ? window.location.pathname === stepPath : false;
          
          console.log('URL CHECK DETAILS:', { 
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
            console.log('URL CHECK FAILED: User is not on the correct starting page for the guide');
            
            // Hide thinking indicator before showing notification
            if (this.thinkingIndicator) {
              CursorFlowUI.hideThinkingIndicator(this.thinkingIndicator);
              this.thinkingIndicator = null;
            }
            
            if (redirectUrl) {
              // Show notification with redirect option
              CursorFlowUI.showRedirectNotification({
                message: 'To start this guide, you need to go to the starting page first',
                type: 'info',
                redirectUrl: redirectUrl,
                redirectText: 'Go to start'
              });
            } else {
              // No redirect URL available
              CursorFlowUI.showNotification({
                message: 'Guide cannot start - missing URL information',
                type: 'error',
                autoClose: 5000
              });
            }
            
            return;
          }
          
          console.log('URL CHECK PASSED: User is on the correct starting page for the guide');
        }
        
        // Start the actual guide instead of just showing a demo
        await this.startGuide(guideId);
      } catch (error) {
        console.error('Failed to retrieve guide data:', error);
        
        // Hide thinking indicator on error
        if (this.thinkingIndicator) {
          CursorFlowUI.hideThinkingIndicator(this.thinkingIndicator);
          this.thinkingIndicator = null;
        }
        
        // Show error notification
        CursorFlowUI.showNotification({
          message: 'Failed to load guide. Please try again.',
          type: 'error',
          autoClose: 5000
        });
      }
    }
  
    private showFirstStepDemo(firstStepData: any) {
      // Create cursor and text popup elements if not already created
      if (!this.cursorElement) {
        this.cursorElement = CursorFlowUI.createCursor(this.options.theme || {});
      }
      
      // Create text popup with the instruction
      const textPopup = CursorFlowUI.createTextPopup(
        firstStepData.popupText || "Click here",
        this.options.theme || {}
      );
      
      // For demo purposes, create a meaningful interaction object based on the step text
      const popupText = firstStepData.popupText || '';
      console.log('Step instruction:', popupText);
      
      // Extract what to look for from the popup text
      let elementText = '';
      
      if (popupText.includes('Writing link')) {
        elementText = 'Writing';
      } else if (popupText.includes('Examples of Deep Focus')) {
        elementText = 'Examples of Deep Focus';
      } else if (popupText.includes('Podcasts section')) {
        elementText = 'Podcasts';
      } else {
        // Generic fallback
        elementText = popupText.replace(/Click on /i, '').replace(/Navigate to /i, '');
      }
      
      const interaction = {
        text: elementText,
        action: "click"
      };
      
      console.log('Looking for element with text:', elementText);
      
      // Find the target element
      this.currentTargetElement = ElementUtils.findElementFromInteraction(interaction, false);
      
      if (this.currentTargetElement) {
        console.log('Found target element:', this.currentTargetElement);
        
        // Move cursor to the element
        CursorFlowUI.moveCursorToElement(
          this.currentTargetElement, 
          this.cursorElement, 
          interaction
        );
        
        // Position the text popup near the cursor
        CursorFlowUI.positionTextPopupNearCursor(this.cursorElement, textPopup);
        
        // Highlight the target element
        this.highlightElement = CursorFlowUI.createHighlight(this.options.theme || {});
        this.positionHighlightOnElement(this.currentTargetElement, this.highlightElement);
        
        if (this.options.debug) {
          console.log('Demo: Showing cursor and text for first step');
        }
      } else {
        console.warn('Could not find target element for first step');
      }
    }
  
    private positionHighlightOnElement(element: HTMLElement, highlight: HTMLElement | null) {
      // Use DirectHighlight approach if flag is set
      if (this.usingDirectHighlight) {
        console.log('[DIRECT-HIGHLIGHT-TEST] Using DirectHighlight for positioning instead of manual positioning');
        
        // DirectHighlight handles this through its own methods
        // We don't need to do manual positioning
        // This method might be called directly in some cases, so we log it
        return;
      }
      
      /* 
      // OLD APPROACH (COMMENTED OUT)
      if (!highlight || !element) return;
      
      // Get element position
      const rect = element.getBoundingClientRect();
      
      // Add to DOM if not already there
      if (!highlight.parentElement) {
        document.body.appendChild(highlight);
      }
      
      // Position and size the highlight to match the element
      highlight.style.left = `${rect.left}px`;
      highlight.style.top = `${rect.top}px`;
      highlight.style.width = `${rect.width}px`;
      highlight.style.height = `${rect.height}px`;
      */
    }
  
    stop() {
      // Hide thinking indicator when stopping the guide
      if (this.thinkingIndicator) {
        CursorFlowUI.hideThinkingIndicator(this.thinkingIndicator);
        this.thinkingIndicator = null;
      }
      
      if (this.options.debug) {
        console.log('Stopping guide');
      }
      
      // First clear DomAnalyzer highlights
      try {
        DomAnalyzer.clearHighlights();
        console.log('[HIGHLIGHT-DEBUG] DomAnalyzer highlights cleared');
      } catch (e) {
        console.error('[HIGHLIGHT-DEBUG] Failed to clear DomAnalyzer highlights:', e);
      }
      
      // Then remove visual elements - pass false to ensure cursor is also cleaned up
      CursorFlowUI.cleanupAllUI(false);
      
      // Reset state
      this.state = {
        isPlaying: false,
        currentStep: 0,
        recordingId: null,
        completedSteps: [],
        timestamp: Date.now(),
        debug: this.options.debug
      };
      
      // Use immediate clear instead of debounced save
      StateManager.clear();
      StateManager.clearSession();
      
      // Remove event listeners
      this.removeExistingListeners();
      
      // Update button state
      this.updateButtonState();
      
      // Reset all element references
      this.cursorElement = null;
      this.highlightElement = null;
      this.currentTargetElement = null;
      
      if (this.options.debug) {
        console.log('Guide stopped, state reset');
      }
    }
  
    private async loadRecording(recordingId: string) {
      try {
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
        const preserveSteps = this.state.recordingId === recordingId ? this.state.completedSteps : [];
        
        // Update state
        this.state.recordingId = recordingId;
        this.state.isPlaying = true;
        this.state.currentStep = 0;
        this.state.completedSteps = preserveSteps;
        
        // Save state immediately since this is an important transition
        StateManager.saveWithDebounce(this.state, true);
        
        if (this.options.debug) {
          console.log('Recording loaded:', recordingId, flowData);
          console.log('Preserved completed steps:', preserveSteps);
        }
        
        return flowData;
      } catch (error) {
        console.error('Failed to load recording:', error);
        throw error;
      }
    }
  
    private async startGuide(guideId: string) {
      try {
        if (this.options.debug) {
          console.log('Starting guide:', guideId);
        }
        
        // Create a new state with empty completedSteps
        // We're removing the code that preserves old completedSteps
        this.state = {
          isPlaying: true,
          currentStep: 0,
          recordingId: guideId,
          completedSteps: [], // Always start fresh when selecting from dropdown
          timestamp: Date.now()
        };
        
        // Add debug logging
        console.log('Starting guide with state:', JSON.stringify(this.state));
        
        // Load recording
        await this.loadRecording(guideId);
        
        // Set session active
        StateManager.setSessionActive();
        
        // Create visual elements if needed
        this.createVisualElements();
        
        // Setup navigation detection
        this.setupNavigationDetection();
        
        // Update button state
        this.updateButtonState();
        
        // Play first step
        await this.playCurrentStep();
        
        return true;
      } catch (error) {
        console.error('Failed to start guide:', error);
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
        console.log('DETECT CONTEXT: Current URL:', currentUrl, 'Path:', currentPath);
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
        const urlMatches = stepUrl ? ElementUtils.compareUrls(stepUrl, currentUrl) : false;
        const pathMatches = stepPath === currentPath;
        
        // Return true if either URL or path matches
        return urlMatches || pathMatches;
      });
      console.timeEnd('Find matching steps');
      
      if (matchingSteps.length === 0) {
        if (this.options.debug) {
          console.log('DETECT CONTEXT: No steps match current URL or path');
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
        console.log(...args);
      }
    }
    
    private async playCurrentStep() {
      // Hide thinking indicator when starting to play a step
      if (this.thinkingIndicator) {
        CursorFlowUI.hideThinkingIndicator(this.thinkingIndicator);
        this.thinkingIndicator = null;
      }
      
      if (!this.recording || !this.state.isPlaying) {
        console.warn('No active recording or not in playing state');
        return false;
      }
      
      // NEW: Clean up any existing UI elements before starting new step
      // Keep cursor since we're about to use it
      CursorFlowUI.cleanupAllUI(true);
      
      // Get current step from recording
      let currentStep;
      if (this.recording.steps && this.recording.steps.length > 0) {
        // If this is position-based, find by position, otherwise use index
        if (this.recording.steps[0].position !== undefined) {
          // Find first uncompleted step
          for (const step of this.sortedSteps) {
            const stepIndex = step.position;
            if (!this.state.completedSteps.includes(stepIndex)) {
              currentStep = step;
              break;
            }
          }
          
          // If all steps completed, use the last one
          if (!currentStep && this.sortedSteps.length > 0) {
            currentStep = this.sortedSteps[this.sortedSteps.length - 1];
          }
        } else {
          // Use index-based approach
          currentStep = this.recording.steps[this.state.currentStep];
        }
      }
      
      if (!currentStep) {
        console.warn('No step found for current position');
        return false;
      }
      
      this.debugLog('Playing step:', currentStep);
      
      // Find target element from interaction data
      const interaction = currentStep.interaction || {};
      this.debugLog('Full interaction object:', JSON.stringify(interaction));
      
      // Support both interaction.element.textContent and interaction.text
      if (interaction.element?.textContent) {
        this.debugLog('Using element textContent for finding:', interaction.element.textContent);
        interaction.text = interaction.element.textContent;
      }
      
      // Before we search for elements, check if navigation is expected
      const expectedPath = interaction.pageInfo?.path;
      const currentPath = window.location.pathname;
      const isNavigationExpected = expectedPath && expectedPath !== currentPath;
      
      // Only do this quick check if we have path info - very low latency impact
      if (isNavigationExpected) {
        console.log(`Navigation expected from ${currentPath} to ${expectedPath}`);
      }
      
      // Add debugging for element finding
      this.debugLog('Looking for element with properties:', JSON.stringify({
        text: interaction.text,
        selector: interaction.selector,
        action: interaction.action || 'click'
      }));
      
      console.time('Find target element');
      // NEW: First initialize the DOM analyzer
      await DomAnalyzer.initialize(500, this.options.debug); // 500px viewport expansion
      
      // NEW: Then use it to find the element
      this.currentTargetElement = DomAnalyzer.findElement(interaction);
      console.timeEnd('Find target element');
      
      if (!this.currentTargetElement) {
        console.warn('Target element not found for step:', currentStep);
        
        // NEW CONDITION: Skip error if navigation is expected
        if (isNavigationExpected) {
          console.log('Element not found, but navigation is expected - skipping error');
          return true; // Allow navigation to proceed
        }
        
        console.log('DOM content at time of search:', document.body.innerHTML.substring(0, 500) + '...');
        this.handleInteractionError();
        return false;
      }
      
      this.debugLog('Found target element:', this.currentTargetElement.outerHTML);
      
      console.time('Show visual elements');
      // This log is very misleading - update it
      console.log('[HIGHLIGHT-DEBUG] Despite the name, we are NOT using DirectHighlight.ts - we are using CursorFlowUI and DomAnalyzer');
      await this.showVisualElements(this.currentTargetElement, interaction);
      console.timeEnd('Show visual elements');
      
      console.time('Setup interaction tracking');
      this.setupElementInteractionTracking(this.currentTargetElement, interaction);
      console.timeEnd('Setup interaction tracking');
      
      return true;
    }
  
    private async showVisualElements(targetElement: HTMLElement, interaction: any) {
      // Create cursor element if not already created
      if (!this.cursorElement) {
        console.log('[HIGHLIGHT-DEBUG] Creating cursor element using CursorFlowUI.createCursor()');
        this.cursorElement = CursorFlowUI.createCursor(this.options.theme || {});
      }
      
      // Check if element is in view and scroll to it if needed
      if (!ElementUtils.isElementInView(targetElement)) {
        if (this.options.debug) {
          console.log('[HIGHLIGHT-DEBUG] Target element is not in view, scrolling to it');
        }
        await ElementUtils.scrollToElement(targetElement);
      }
      
      // Get annotation text
      let annotationText = '';
      const currentStep = this.recording?.steps?.[this.state.currentStep];
      if (currentStep) {
        annotationText = currentStep.annotation || currentStep.popupText || 'Click here';
      }
      
      console.log('[HIGHLIGHT-DEBUG] About to try highlighting with DomAnalyzer');
      try {
        // These DomAnalyzer calls are likely failing silently
        DomAnalyzer.clearHighlights();
        DomAnalyzer.highlightElement(
          targetElement, 
          this.state.currentStep, 
          this.options.theme?.highlightBorderColor || '#FF6B00'
        );
        console.log('[HIGHLIGHT-DEBUG] DomAnalyzer highlighting completed successfully');
      } catch (e) {
        console.error('[HIGHLIGHT-DEBUG] DomAnalyzer failed:', e);
      }
      
      // Add detailed cursor positioning flow log
      console.log('[CURSOR-FLOW-DEBUG] About to position cursor - this will call CursorFlowUI.moveCursorToElement(), NOT showGuidanceElements()');
      
      console.log('[HIGHLIGHT-DEBUG] Using CursorFlowUI for cursor positioning');
      // Continue using CursorFlowUI for cursor movement and text popup
      CursorFlowUI.moveCursorToElement(
        targetElement, 
        this.cursorElement, 
        interaction
      );
      
      console.log('[HIGHLIGHT-DEBUG] Creating and positioning text popup with CursorFlowUI');
      // Create and position text popup
      const textPopup = CursorFlowUI.createTextPopup(annotationText, this.options.theme || {});
      CursorFlowUI.positionTextPopupNearCursor(this.cursorElement, textPopup);
      
      if (this.options.debug) {
        console.log('[HIGHLIGHT-DEBUG] Visual elements shown for element:', targetElement);
      }
    }
  
    private hideVisualElements() {
      console.log('[HIGHLIGHT-DEBUG] Starting to hide visual elements');
      
      // Try to use DomAnalyzer for clearing highlights - likely failing silently
      try {
        console.log('[HIGHLIGHT-DEBUG] Attempting to clear DomAnalyzer highlights');
        DomAnalyzer.clearHighlights();
        console.log('[HIGHLIGHT-DEBUG] DomAnalyzer.clearHighlights() succeeded');
      } catch (e) {
        console.error('[HIGHLIGHT-DEBUG] DomAnalyzer.clearHighlights() failed:', e);
      }
      
      console.log('[HIGHLIGHT-DEBUG] Using CursorFlowUI.cleanupAllUI() to clean up UI elements');
      // Clean up UI elements but keep the cursor
      CursorFlowUI.cleanupAllUI(true);
      
      // Reset references
      this.highlightElement = null;
      
      console.log('[HIGHLIGHT-DEBUG] Visual elements hidden and references cleared');
      
      if (this.options.debug) {
        console.log('Visual elements hidden and cleaned up');
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
      if (!this.state.isPlaying || this.isHandlingNavigation) {
        console.log('handleNavigation: Not playing or already handling, returning early');
        return;
      }
      
      this.isHandlingNavigation = true;
      console.log('handleNavigation: Current URL:', window.location.href);
      console.time('Navigation handling');
      
      // Use an even shorter timeout
      setTimeout(async () => {
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
              await this.playCurrentStep();
            } else {
              // Forward navigation - check if prerequisites are met
              const prerequisitesMet = this.sortedSteps.every((step: any) => {
                const position = step.position || 0;
                return position >= stepIndex || this.state.completedSteps.includes(position);
              });
              
              if (prerequisitesMet) {
                console.log('handleNavigation: Prerequisites met, playing step');
                this.state.currentStep = this.recording.steps.indexOf(contextStep);
                await this.playCurrentStep();
              } else {
                console.log('handleNavigation: Prerequisites not met, showing warning');
                
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
                
                this.stop();
              }
            }
            console.timeEnd('Process context step');
          } else {
            console.log('handleNavigation: No matching steps for this URL');
            
            // Check if all steps are completed
            console.time('Check completion');
            const allSteps = this.recording.steps || [];
            const allCompleted = allSteps.every((step: any) => {
              const stepPosition = step.position || 0;
              return this.state.completedSteps.includes(stepPosition);
            });
            
            if (allCompleted && allSteps.length > 0) {
              console.log('handleNavigation: All guide steps completed');
              this.completeGuide();
            } else {
              // Navigated away
              CursorFlowUI.showNotification({
                message: 'You\'ve navigated away from the guide path',
                type: 'warning',
                autoClose: 5000
              });
              this.stop();
            }
            console.timeEnd('Check completion');
          }
        } catch (error) {
          console.error('Error handling navigation:', error);
        } finally {
          console.timeEnd('Navigation handling');
          this.isHandlingNavigation = false;
        }
      }, 50); // Even shorter timeout
    }
  
    private setupElementInteractionTracking(element: HTMLElement, interaction: any) {
      // Clean up previous listeners
      this.removeExistingListeners();
      
      if (!element || !interaction) return;
      
      if (this.options.debug) {
        console.log('Setting up interaction tracking for element:', element);
        console.log('Interaction data:', interaction);
      }
      
      // Store current interaction type
      this.currentInteractionType = interaction.action || 'click';
      
      // Create appropriate event listener based on interaction type
      const eventType = this.getEventTypeForInteraction(this.currentInteractionType || 'click');
      
      if (!eventType) {
        console.warn('Unknown interaction type:', this.currentInteractionType);
        return;
      }
      
      // Create handler
      this.currentListener = (event) => {
        console.log(`${eventType} event triggered:`, event);
        console.log('Target element:', event.target);
        
        // Validate interaction
        if (this.validateInteraction(event, interaction)) {
          console.log('Interaction validated successfully');
          
          // Get current step index
          const currentStep = this.recording?.steps?.[this.state.currentStep];
          const stepIndex = currentStep?.position || this.state.currentStep;
          
          console.log('Marking step completed:', stepIndex);
          
          // Mark step as completed
          this.completeStep(stepIndex);
          
          // If this is a link that will navigate, let the navigation happen
          // The handleNavigation method will pick up from there
          const isNavigationLink = 
            event.target instanceof HTMLAnchorElement && 
            event.target.href && 
            !event.target.getAttribute('target');
          
          if (isNavigationLink) {
            console.log('Navigation link detected, letting natural navigation occur');
            
            // Save state immediately before navigation
            StateManager.saveWithDebounce(this.state, true);
            
            // Clean up for navigation
            this.hideVisualElements();
            this.removeExistingListeners();
            
            // Don't call playNextStep, let the navigation handler take over
            return;
          }
          
          // Move to next step for non-navigation interactions
          console.log('Moving to next step...');
          this.playNextStep();
        } else {
          console.log('Interaction validation failed');
        }
      };
      
      // Add debugging for event listener
      console.log(`Adding ${eventType} listener to element:`, element);
      
      // TypeScript doesn't recognize that eventType can't be null here
      element.addEventListener(eventType as string, this.currentListener);
      
      if (this.options.debug) {
        console.log(`Set up ${eventType} listener for element:`, element);
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
            CursorFlowUI.showNotification({
              message: 'Incorrect click. Guide stopped.',
              type: 'error',
              autoClose: 5000
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
      if (this.currentTargetElement && this.currentListener && this.currentInteractionType) {
        const eventType = this.getEventTypeForInteraction(this.currentInteractionType);
        
        if (eventType) {
          this.currentTargetElement.removeEventListener(eventType as string, this.currentListener);
          
          if (this.options.debug) {
            console.log(`Removed ${eventType} listener from element:`, this.currentTargetElement);
          }
        }
      }
      
      // Reset tracking properties
      this.currentListener = null;
      this.currentInteractionType = null;
    }
    private handleInteractionError() {
      console.log('[DIRECT-HIGHLIGHT-TEST] Handling interaction error using DirectHighlight approach');
      
      CursorFlowUI.showErrorNotification(
        'We couldn\'t find the element for this step.',
        {
          message: 'We couldn\'t find the element for this step.',
          type: 'error',
          onRetry: () => this.playCurrentStep(),
          onSkip: () => this.playNextStep(),
          onStop: () => this.stop()
        }
      );
    }
  
    // Add this method to find the next logical step based on completed steps
    private findNextStep(): any {
      if (!this.recording || this.sortedSteps.length === 0) {
        console.log('findNextStep: No recording or steps available');
        return null;
      }
      
      // No need to sort again - use cached sorted steps
      console.log('findNextStep: Looking for next step. Completed steps:', this.state.completedSteps);
      
      // Find first uncompleted step
      for (const step of this.sortedSteps) {
        const stepIndex = step.position || this.sortedSteps.indexOf(step);
        
        if (!this.state.completedSteps.includes(stepIndex)) {
          console.log('findNextStep: Found next uncompleted step:', {
            position: stepIndex,
            step
          });
          return step;
        }
      }
      
      console.log('findNextStep: All steps are completed');
      return null;
    }
  
    // Add a new method for guide completion
    private completeGuide() {
      if (this.options.debug) {
        console.log('Guide completed');
      }
      
      // Update state to completed
      this.state.isPlaying = false;
      
      // Save state immediately since this is the final state
      StateManager.saveWithDebounce(this.state, true);
      
      // Show completion popup near the guide button
      if (this.startButton) {
        CursorFlowUI.showCompletionPopup(this.startButton);
      }
      
      // Clean up
      this.hideVisualElements();
      this.updateButtonState();
      
      // Also show notification for extra visibility
      CursorFlowUI.showNotification({
        message: 'Guide completed! 🎉',
        type: 'success',
        autoClose: 5000
      });
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

    private completeStep(stepIndex: number) {
      // Don't add duplicates
      if (!this.state.completedSteps.includes(stepIndex)) {
        this.state.completedSteps.push(stepIndex);
        
        // Use debounced save instead of immediate save
        StateManager.saveWithDebounce(this.state);
        
        if (this.options.debug) {
          console.log('Step completed:', stepIndex);
          console.log('Completed steps:', this.state.completedSteps);
        }
      }
    }

    private async playNextStep() {
      if (!this.state.isPlaying) return false;
      
      // Hide current visual elements first, but keep the cursor
      CursorFlowUI.cleanupAllUI(true);
      
      // Remove existing listeners
      this.removeExistingListeners();
      
      // Find the current step
      let currentStepIndex = this.state.currentStep;
      let currentStepPosition = 0;
      
      if (this.recording && this.recording.steps && this.recording.steps.length > 0) {
        // If this is position-based, get the current position
        if (this.recording.steps[0].position !== undefined) {
          // Use cached sortedSteps instead of resorting
          
          // Find current step by index
          const currentStep = this.sortedSteps[currentStepIndex];
          if (currentStep) {
            currentStepPosition = currentStep.position;
          }
          
          // Find next step using the cached sortedSteps
          let nextPosition = Number.MAX_SAFE_INTEGER;
          let nextStep = null;
          
          for (const step of this.sortedSteps) {
            const stepPos = step.position || 0;
            // Find the next position that's greater than current but smaller than any we've found so far
            if (stepPos > currentStepPosition && stepPos < nextPosition && 
                !this.state.completedSteps.includes(stepPos)) {
              nextPosition = stepPos;
              nextStep = step;
            }
          }
          
          if (nextStep) {
            // Update current step in state
            this.state.currentStep = this.sortedSteps.indexOf(nextStep);
            
            // Use debounced save instead of immediate save
            StateManager.saveWithDebounce(this.state);
            
            // Play the new current step
            await this.playCurrentStep();
            return true;
          }
        } else {
          // Simple index-based navigation
          this.state.currentStep++;
          
          // Check if we're at the end
          if (this.state.currentStep >= this.recording.steps.length) {
            // Guide completed - call completeGuide instead of handling completion here
            this.completeGuide();
            return false;
          }
          
          StateManager.saveWithDebounce(this.state);  // Use debounced save here too
          await this.playCurrentStep();
          return true;
        }
      }
      
      // If we get here, there are no more steps
      this.completeGuide();
      return false;
    }
  }