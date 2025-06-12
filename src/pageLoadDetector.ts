export class PageLoadDetector {
  private static debugMode: boolean = false;

  /**
   * Set debug mode for PageLoadDetector
   */
  static setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Debug logging helper
   */
  private static debugLog(...args: any[]): void {
    if (this.debugMode) {
      console.log('[PageLoadDetector]', ...args);
    }
  }
  
  /**
   * Check if the page is still loading or has dynamic content being rendered
   */
  static async isPageStable(config?: {
    overallTimeoutMs?: number;
    domCheckDurationMs?: number;
    navCheckDelayMs?: number;
  }): Promise<{ isStable: boolean; reason: string }> {
    const overallTimeout = config?.overallTimeoutMs || 5000;
    const domCheckDuration = config?.domCheckDurationMs || 2000;
    const navCheckDelay = config?.navCheckDelayMs || 500;
    const startTime = Date.now();
    
    // Check basic document ready state
    if (document.readyState !== 'complete') {
      return { isStable: false, reason: 'Document not in complete state' };
    }
    
    // Check for ongoing network requests
    if (this.hasActiveNetworkRequests()) {
      return { isStable: false, reason: 'Active network requests detected' };
    }
    
    // Check for DOM mutations (React/Vue rendering)
    const mutationStability = await this.checkDOMStability(domCheckDuration);
    if (!mutationStability.isStable) {
      return { isStable: false, reason: mutationStability.reason };
    }
    
    // Check for loading indicators
    const loadingIndicators = this.checkLoadingIndicators();
    if (loadingIndicators.hasLoading) {
      return { isStable: false, reason: loadingIndicators.reason };
    }
    
    // Check for expected navigation completion
    const navigationStability = await this.checkNavigationStability(navCheckDelay);
    if (!navigationStability.isStable) {
      return { isStable: false, reason: navigationStability.reason };
    }
    
    // Check overall timeout if other checks keep resolving quickly but not stable
    if (Date.now() - startTime > overallTimeout) {
        return {isStable: false, reason: `Overall stability check timeout (${overallTimeout}ms) exceeded`};
    }

    return { isStable: true, reason: 'Page appears stable' };
  }
  
  /**
   * Check for active network requests that might indicate loading
   */
  private static hasActiveNetworkRequests(): boolean {
    // Check for fetch/XHR requests (this is limited but can catch some cases)
    // Note: This is not foolproof as we can't see all network activity from content script
    
    // Check for images still loading
    const images = document.querySelectorAll('img');
    for (const img of images) {
      if (!img.complete) {
        this.debugLog('Found incomplete image:', img.src);
        return true;
      }
    }
    
    // Check for iframes still loading
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        if (iframe.contentDocument?.readyState !== 'complete') {
          this.debugLog('Found incomplete iframe');
          return true;
        }
      } catch (e) {
        // Cross-origin iframe, can't check - assume it's fine
      }
    }
    
    return false;
  }
  
  /**
   * Monitor DOM for stability (no major mutations for a period)
   */
  private static checkDOMStability(checkDuration: number = 2000): Promise<{ isStable: boolean; reason: string }> {
    return new Promise((resolve) => {
      let mutationCount = 0;
      let significantMutations = 0;
      const startTime = Date.now();
      
      const observer = new MutationObserver((mutations) => {
        mutationCount += mutations.length;
        
        // Count significant mutations (not just attribute changes)
        for (const mutation of mutations) {
          if (mutation.type === 'childList' && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {
            significantMutations++;
          }
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false // Ignore attribute changes for stability check
      });
      
      setTimeout(() => {
        observer.disconnect();
        
        const elapsed = Date.now() - startTime;
        this.debugLog(`DOM stability check: ${mutationCount} total mutations, ${significantMutations} significant mutations in ${elapsed}ms`);
        
        // Consider stable if less than 5 significant mutations in the check period
        if (significantMutations < 5) {
          resolve({ isStable: true, reason: 'DOM appears stable' });
        } else {
          resolve({ 
            isStable: false, 
            reason: `DOM still changing: ${significantMutations} significant mutations in ${elapsed}ms` 
          });
        }
      }, checkDuration);
    });
  }
  
  /**
   * Check for common loading indicators
   */
  private static checkLoadingIndicators(): { hasLoading: boolean; reason: string } {
    const loadingSelectors = [
      // Generic loading indicators
      '.loading', '.spinner', '.loader', '[data-loading="true"]',
      // Framework-specific
      '.mantine-Loader-root', '.ant-spin', '.MuiCircularProgress-root',
      // Custom loading text
      '[aria-label*="loading" i]', '[aria-label*="Loading" i]',
      // Loading overlays
      '.loading-overlay', '.backdrop'
    ];
    
    for (const selector of loadingSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const style = window.getComputedStyle(element);
        if (style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0) {
          return { 
            hasLoading: true, 
            reason: `Loading indicator found: ${selector}` 
          };
        }
      }
    }
    
    // Check for loading text content
    const loadingTextPatterns = /loading|please wait|processing/i;
    const textElements = document.querySelectorAll('*');
    for (const element of textElements) {
      if (element.textContent && loadingTextPatterns.test(element.textContent)) {
        const style = window.getComputedStyle(element);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          return { 
            hasLoading: true, 
            reason: `Loading text found: "${element.textContent.trim()}"` 
          };
        }
      }
    }
    
    return { hasLoading: false, reason: 'No loading indicators found' };
  }
  
  /**
   * Check if navigation is expected and completed
   */
  private static async checkNavigationStability(navCheckDelayMs: number): Promise<{ isStable: boolean; reason: string }> {
    const initialUrl = window.location.href;
    
    await new Promise(resolve => setTimeout(resolve, navCheckDelayMs)); // Use parameterized delay
    
    if (window.location.href !== initialUrl) {
      return { 
        isStable: false, 
        reason: 'URL changed during stability check - navigation in progress' 
      };
    }
    
    // Check for route transition indicators (React Router, Vue Router, etc.)
    const routeTransitionSelectors = [
      '[data-router-loading="true"]',
      '.route-loading',
      '.page-transition'
    ];
    
    for (const selector of routeTransitionSelectors) {
      if (document.querySelector(selector)) {
        return { 
          isStable: false, 
          reason: `Route transition indicator found: ${selector}` 
        };
      }
    }
    
    return { isStable: true, reason: 'Navigation appears stable' };
  }
  
  /**
   * Wait for page to become stable with timeout
   */
  static async waitForStability(maxWaitTime: number = 10000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const stability = await this.isPageStable();
      
      if (stability.isStable) {
        this.debugLog('✅ Page is stable:', stability.reason);
        return true;
      }
      
      this.debugLog('⏳ Page not stable, waiting...', stability.reason);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before next check
    }
    
    this.debugLog('⚠️ Timeout reached, proceeding anyway');
    return false;
  }
  
  /**
   * Quick check for obvious loading states
   */
  static isObviouslyLoading(): boolean {
    // Document not ready
    if (document.readyState !== 'complete') {
      return true;
    }
    
    // Check for obvious loading indicators
    const quickLoadingCheck = this.checkLoadingIndicators();
    return quickLoadingCheck.hasLoading;
  }
} 