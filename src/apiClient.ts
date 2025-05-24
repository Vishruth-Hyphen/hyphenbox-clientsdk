import axios, { AxiosInstance } from 'axios';

export class ApiClient {
  private baseUrl: string;
  private client: AxiosInstance;
  private apiKey: string;
  private userId: string;
  
  // Simple cache for onboarding checklists
  private checklistsCache: { data: any[], timestamp: number } | null = null;
  private readonly CACHE_DURATION = 30000; // 30 seconds
  
  constructor(baseUrl: string, apiKey: string, userId: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.userId = userId;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'X-External-User-ID': this.userId
      }
    });
  }
  
  /**
   * Get a cursor flow by ID
   */
  async getRecording(id: string): Promise<any> {
    try {
      const response = await this.client.get(`/api/sdk/flows/${id}`, {
        params: { external_user_id: this.userId }
      });
      return response.data; // The flow data is returned directly now
    } catch (error) {
      console.error('Failed to fetch flow:', error);
      throw error;
    }
  }
  
  /**
   * Get list of available flows
   */
  async getRecordings(searchQuery?: string): Promise<any> {
    try {
      const params: any = {
        external_user_id: this.userId
      };
      if (searchQuery) {
        params.searchQuery = searchQuery;
      }
      
      const response = await this.client.get('/api/sdk/flows', {
        params
      });
      return response.data.flows;
    } catch (error) {
      console.error('Failed to fetch flows list:', error);
      throw error;
    }
  }
  
  /**
   * Get annotations for steps (backward compatibility)
   * Note: This is now redundant as annotations are included in the flow data,
   * but kept for backward compatibility
   */
  async getTexts(id: string): Promise<any> {
    try {
      // First get the full flow data
      const flowData = await this.getRecording(id);
      
      // Convert steps to customization format for backward compatibility
      return flowData.steps.map((step: any) => ({
        stepIndex: step.position, // Use position as stepIndex
        popupText: step.annotation,
        isHidden: false
      }));
    } catch (error) {
      console.error('Failed to extract annotations:', error);
      throw error;
    }
  }
  
  /**
   * Check if the API is available
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/health', {
        params: { external_user_id: this.userId }
      });
      return response.data.status === 'ok';
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Validate a recording
   */
  async validateRecording(id: string): Promise<boolean> {
    try {
      const response = await this.client.get(`/api/sdk/flows/${id}/validate`, {
        params: { external_user_id: this.userId }
      });
      return response.data.valid;
    } catch (error) {
      return false;
    }
  }

  /**
   * Perform semantic search for flows
   * @param query - The user's natural language query
   * @returns - The potential match { id: string, name: string } or null
   */
  async semanticSearch(query: string): Promise<{ id: string, name: string } | null> {
    try {
      console.log(`[API Client] Performing semantic search for query: "${query}"`);
      const response = await this.client.post('/api/sdk/flows/semantic-search', {
        query: query,
        external_user_id: this.userId
      });

      // The endpoint returns { match: { id, name } | null }
      console.log('[API Client] Semantic search response:', response.data);
      return response.data.match; 
    } catch (error) {
      console.error('Failed semantic search:', error);
      // Check if the error is specific, e.g., function not found
      if (axios.isAxiosError(error) && error.response?.status === 501) {
        console.error("Semantic search functionality might not be configured on the backend.");
        // Optionally re-throw a more specific error or return a specific indicator
      }
      // For other errors, return null to indicate no match found due to error
      return null; 
    }
  }

  /**
   * Fetch organization theme settings
   * @returns - The theme object with brand_color, cursor_company_label, logo_url, button_position, button_text or null
   */
  async getOrganizationTheme(): Promise<{ 
    brand_color: string, 
    cursor_company_label: string | null, 
    logo_url: string | null,
    button_position: string | null,
    button_text: string | null
  } | null> {
    try {
      console.log(`[API Client] Fetching theme for current organization (via API Key)`);
      const response = await this.client.get(`/api/sdk/theme`, {
        params: { external_user_id: this.userId }
      });
      
      // The endpoint returns { theme: { ... } } or an error
      console.log('[API Client] Organization theme response:', response.data);
      return response.data.theme;
    } catch (error) {
      console.error('Failed to fetch organization theme:', error);
      // Check for 404 explicitly
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.warn(`[API Client] Theme not found for organization.`);
      } else {
        // Log other errors
        console.error('Error fetching theme details:', error);
      }
      // Return null if theme is not found or any other error occurs
      return null;
    }
  }

  /**
   * Get onboarding checklists
   * @returns Array of onboarding checklists with user progress
   */
  async getOnboardingChecklists(): Promise<any[]> {
    // Check cache first
    const now = Date.now();
    if (this.checklistsCache && (now - this.checklistsCache.timestamp) < this.CACHE_DURATION) {
      console.log('[API Client] Using cached onboarding checklists');
      return this.checklistsCache.data;
    }

    try {
      console.log('[API Client] Fetching onboarding checklists from server');
      const response = await this.client.get('/api/sdk/onboarding-checklists');
      console.log('[API Client] Onboarding checklists response:', response.data);
      
      // Cache the result
      this.checklistsCache = {
        data: response.data,
        timestamp: now
      };
      
      return response.data;
    } catch (error) {
      console.error('Failed to fetch onboarding checklists:', error);
      
      // Instead of returning empty array, throw proper error for UI to handle
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new Error('No onboarding checklists found for this organization');
        } else if (error.response?.status === 500) {
          throw new Error('Server error while fetching onboarding checklists. Please try again.');
        } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          throw new Error('Request timed out. Please check your connection and try again.');
        } else {
          throw new Error(`Failed to fetch onboarding checklists: ${error.response?.data?.error || error.message}`);
        }
      }
      
      throw new Error('Network error while fetching onboarding checklists');
    }
  }

  /**
   * Start a flow execution
   * @param flowId - The ID of the flow to execute
   * @param sessionDetails - Optional session details
   * @returns The execution ID
   */
  async startFlowExecution(flowId: string, sessionDetails?: any): Promise<string | null> {
    try {
      console.log(`[API Client] Starting flow execution for flow: ${flowId}`);
      const response = await this.client.post('/api/sdk/flow-executions', {
        flow_id: flowId,
        session_details: sessionDetails || null
      });
      return response.data.execution_id;
    } catch (error) {
      console.error('Failed to start flow execution:', error);
      return null;
    }
  }

  /**
   * Update flow execution progress
   * @param executionId - The execution ID
   * @param lastSuccessfulStepId - ID of the last successful step
   * @param lastSuccessfulStepPosition - Position of the last successful step
   * @param statusOverride - Optional status override
   * @param failureReasonDetails - Optional failure details
   */
  async updateFlowProgress(
    executionId: string, 
    lastSuccessfulStepId: string, 
    lastSuccessfulStepPosition: number,
    statusOverride?: string,
    failureReasonDetails?: string
  ): Promise<boolean> {
    try {
      console.log(`[API Client] Updating flow execution progress: ${executionId}`);
      const payload: any = {
        last_successful_step_id: lastSuccessfulStepId,
        last_successful_step_position: lastSuccessfulStepPosition
      };
      
      if (statusOverride) {
        payload.status_override = statusOverride;
      }
      
      if (failureReasonDetails) {
        payload.failure_reason_details = failureReasonDetails;
      }
      
      const response = await this.client.put(`/api/sdk/flow-executions/${executionId}/progress`, payload);
      return response.data.success;
    } catch (error) {
      console.error('Failed to update flow progress:', error);
      return false;
    }
  }

  /**
   * Complete a flow execution
   * @param executionId - The execution ID
   */
  async completeFlowExecution(executionId: string): Promise<boolean> {
    try {
      console.log(`[API Client] Completing flow execution: ${executionId}`);
      const response = await this.client.put(`/api/sdk/flow-executions/${executionId}/complete`, {});
      
      if (response.data.success) {
        // Clear onboarding cache to ensure fresh completion status on next load
        this.clearOnboardingCache();
        console.log(`[API Client] Flow execution completed and cache cleared: ${executionId}`);
      }
      
      return response.data.success;
    } catch (error) {
      console.error('Failed to complete flow execution:', error);
      return false;
    }
  }

  /**
   * Abandon a flow execution
   * @param executionId - The execution ID
   * @param reasonCode - Reason code for abandonment
   * @param details - Details about abandonment
   * @param lastSuccessfulStepId - Optional ID of the last successful step
   * @param lastSuccessfulStepPosition - Optional position of the last successful step
   */
  async abandonFlowExecution(
    executionId: string,
    reasonCode: string,
    details: string,
    lastSuccessfulStepId?: string,
    lastSuccessfulStepPosition?: number
  ): Promise<boolean> {
    try {
      console.log(`[API Client] Abandoning flow execution: ${executionId}`);
      const payload: any = {
        reason_code: reasonCode,
        details: details
      };
      
      if (lastSuccessfulStepId && lastSuccessfulStepPosition !== undefined) {
        payload.last_successful_step_id = lastSuccessfulStepId;
        payload.last_successful_step_position = lastSuccessfulStepPosition;
      }
      
      const response = await this.client.put(`/api/sdk/flow-executions/${executionId}/abandon`, payload);
      return response.data.success;
    } catch (error) {
      console.error('Failed to abandon flow execution:', error);
      return false;
    }
  }

  /**
   * Clear the onboarding checklists cache
   * Call this after flow completion to ensure fresh data is fetched
   */
  clearOnboardingCache(): void {
    console.log('[API Client] Clearing onboarding checklists cache');
    this.checklistsCache = null;
  }
}