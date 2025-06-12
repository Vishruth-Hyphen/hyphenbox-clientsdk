import { ApiClient } from './apiClient';

/**
 * Tracks execution of cursor flows and reports status to backend API
 * Handles tracking start, progress, completion, and abandonment of flows
 */
export class FlowExecutionTracker {
  private executionId: string | null = null;
  private apiClient: ApiClient;
  private flowId: string | null = null;
  private lastStepId: string | null = null;
  private lastStepPosition: number | null = null;
  private retryCount: number = 0;
  private maxRetries: number = 3;
  private active: boolean = false;
  private completed: boolean = false;
  private pendingOperations: Array<() => Promise<boolean>> = [];
  private pendingTimeout: any = null;
  private sessionDetails: any = null;
  private static debugMode: boolean = false;

  constructor(apiClient: ApiClient) {
    if (!apiClient) {
      throw new Error('ApiClient is required for FlowExecutionTracker');
    }
    this.apiClient = apiClient;
  }

  /**
   * Set debug mode for FlowExecutionTracker
   */
  static setDebugMode(enabled: boolean): void {
    FlowExecutionTracker.debugMode = enabled;
  }

  /**
   * Debug logging helper
   */
  private debugLog(...args: any[]): void {
    if (FlowExecutionTracker.debugMode) {
      console.log('[FlowExecutionTracker]', ...args);
    }
  }

  /**
   * Start tracking a flow execution
   * @param flowId - ID of the flow being executed
   * @returns Promise resolving to true if tracking started successfully
   */
  async trackStart(flowId: string): Promise<boolean> {
    try {
      this.flowId = flowId;
      this.active = true;
      
      // Collect session details for context
      this.sessionDetails = this.collectSessionDetails();
      
      // Start the execution tracking on the server
      const executionId = await this.apiClient.startFlowExecution(flowId, this.sessionDetails);
      
      if (!executionId) {
        console.error('[FlowExecutionTracker] Failed to get execution ID from server');
        return false;
      }
      
      this.executionId = executionId;
      this.debugLog(`Started tracking flow execution: ${this.executionId}`);
      
      // Process any pending operations that happened before execution ID was received
      this.processPendingOperations();
      
      return true;
    } catch (error) {
      console.error('[FlowExecutionTracker] Error starting flow execution tracking:', error);
      return false;
    }
  }

  /**
   * Track completion of a flow step
   * @param stepId - ID of the completed step
   * @param position - Position of the completed step
   * @returns Promise resolving to true if tracking updated successfully
   */
  async trackStepCompletion(stepId: string, position: number): Promise<boolean> {
    if (!this.active) {
      this.debugLog('Cannot track step completion - tracking not active');
      return false;
    }
    
    if (this.completed) {
      this.debugLog('Skipping step completion - flow already completed');
      return true;
    }
    
    this.lastStepId = stepId;
    this.lastStepPosition = position;
    
    // If execution hasn't been initialized yet, queue this operation
    if (!this.executionId) {
      this.debugLog('Queueing step completion for later', { stepId, position });
      return this.queueOperation(() => this.trackStepCompletion(stepId, position));
    }
    
    try {
      const success = await this.apiClient.updateFlowProgress(
        this.executionId,
        stepId,
        position,
        'in_progress' // Update status to in_progress when steps are completed
      );
      
      if (!success && this.retryCount < this.maxRetries) {
        this.retryCount++;
        this.debugLog(`Retry ${this.retryCount}/${this.maxRetries} for step completion`);
        return this.trackStepCompletion(stepId, position);
      }
      
      this.retryCount = 0; // Reset retry count on success
      
      return success;
    } catch (error) {
      console.error('[FlowExecutionTracker] Error tracking step completion:', error);
      return false;
    }
  }

  /**
   * Track successful completion of a flow
   * @returns Promise resolving to true if tracking updated successfully
   */
  async trackCompletion(): Promise<boolean> {
    if (!this.active) {
      this.debugLog('Cannot track completion - tracking not active');
      return false;
    }
    
    this.completed = true;
    
    // If execution hasn't been initialized yet, queue this operation
    if (!this.executionId) {
      this.debugLog('Queueing flow completion for later');
      return this.queueOperation(() => this.trackCompletion());
    }
    
    try {
      const success = await this.apiClient.completeFlowExecution(this.executionId);
      
      if (success) {
        this.debugLog(`Tracked successful completion of flow ${this.flowId}`);
        this.reset(); // Reset tracker state after successful completion
      } else if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        this.debugLog(`Retry ${this.retryCount}/${this.maxRetries} for flow completion`);
        return this.trackCompletion();
      }
      
      return success;
    } catch (error) {
      console.error('[FlowExecutionTracker] Error tracking flow completion:', error);
      return false;
    }
  }

  /**
   * Track abandonment of a flow
   * @param reason - Categorized reason for abandonment (user_initiated, element_not_found, sdk_error, navigation)
   * @param details - Detailed reason for abandonment
   * @returns Promise resolving to true if tracking updated successfully
   */
  async trackAbandonment(
    reason: 'user_initiated' | 'element_not_found' | 'sdk_error' | 'navigation',
    details: string
  ): Promise<boolean> {
    if (!this.active) {
      this.debugLog('Cannot track abandonment - tracking not active');
      return false;
    }
    
    this.completed = true;
    
    // Map the reason to the status format expected by the backend
    const statusMap = {
      'user_initiated': 'abandoned_by_user',
      'element_not_found': 'abandoned_element_not_found',
      'sdk_error': 'abandoned_sdk_error',
      'navigation': 'abandoned_navigation'
    };
    
    const status = statusMap[reason] || 'abandoned_by_user';
    
    // If execution hasn't been initialized yet, queue this operation
    if (!this.executionId) {
      this.debugLog('Queueing flow abandonment for later');
      return this.queueOperation(() => this.trackAbandonment(reason, details));
    }
    
    try {
      const success = await this.apiClient.abandonFlowExecution(
        this.executionId,
        status,
        details,
        this.lastStepId || undefined,
        this.lastStepPosition !== null ? this.lastStepPosition : undefined
      );
      
      if (success) {
        this.debugLog(`Tracked abandonment of flow ${this.flowId}: ${reason}`);
        this.reset(); // Reset tracker state after successful abandonment tracking
      } else if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        this.debugLog(`Retry ${this.retryCount}/${this.maxRetries} for flow abandonment`);
        return this.trackAbandonment(reason, details);
      }
      
      return success;
    } catch (error) {
      console.error('[FlowExecutionTracker] Error tracking flow abandonment:', error);
      return false;
    }
  }

  /**
   * Reset the tracker state
   */
  private reset(): void {
    this.executionId = null;
    this.flowId = null;
    this.lastStepId = null;
    this.lastStepPosition = null;
    this.retryCount = 0;
    this.active = false;
    this.completed = false;
    this.pendingOperations = [];
    this.sessionDetails = null;
    
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }
  }

  /**
   * Queue an operation to be executed once execution ID is available
   * @param operation - Function to execute later
   * @returns Promise resolving to true (optimistic)
   */
  private queueOperation(operation: () => Promise<boolean>): Promise<boolean> {
    this.pendingOperations.push(operation);
    return Promise.resolve(true); // Optimistically return true
  }

  /**
   * Process any pending operations in the queue
   */
  private processPendingOperations(): void {
    if (this.pendingOperations.length === 0) return;
    
    console.log(`[FlowExecutionTracker] Processing ${this.pendingOperations.length} pending operations`);
    
    // Clone the array to avoid issues with operations being added during processing
    const operations = [...this.pendingOperations];
    this.pendingOperations = [];
    
    // Process operations with a small delay between each to avoid overwhelming the API
    let index = 0;
    const processNext = () => {
      if (index >= operations.length) return;
      
      const operation = operations[index++];
      operation().then(success => {
        if (!success) {
          console.warn('[FlowExecutionTracker] Pending operation failed');
        }
        
        if (index < operations.length) {
          this.pendingTimeout = setTimeout(processNext, 500);
        }
      });
    };
    
    processNext();
  }

  /**
   * Collect information about the current session for context
   * @returns Object with session details
   */
  private collectSessionDetails(): any {
    return {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      referrer: document.referrer || null
    };
  }

  /**
   * Check if the tracker is actively tracking a flow
   * @returns boolean indicating if tracking is active
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Get the current execution ID if available
   * @returns The current execution ID or null
   */
  getExecutionId(): string | null {
    return this.executionId;
  }

  /**
   * Get the current flow ID if available
   * @returns The current flow ID or null
   */
  getFlowId(): string | null {
    return this.flowId;
  }
} 