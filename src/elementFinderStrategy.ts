import { ElementData, InteractionData } from './types';
import { RobustElementFinder } from './robustElementFinder';
import { XPathElementFinder } from './xpathElementFinder';
// XPathValidator is used internally by XPathElementFinder now, so direct import here might not be needed
// unless we plan to re-validate XPath results outside of XPathElementFinder.
// For now, assuming XPathElementFinder's findElement handles its own validation.
import { PageLoadDetector } from './pageLoadDetector';

export type PageContextHint = 'initial' | 'navigation' | 'in_page' | 'in_page_minimal_check';

interface StabilityConfig {
  domCheckDurationMs: number;
  navCheckDelayMs: number;
  overallTimeoutMs?: number;
}

export class ElementFinderStrategy {

  private static debugLog(...args: any[]): void {
    // Basic console log for now, can be tied to a global debug flag later
    console.log('[ElementFinderStrategy]', ...args);
  }

  /**
   * Main method to find an element using the best strategy.
   * @param fullStepData The complete step data object from the database, containing step_data.
   */
  static async findElement(fullStepData: any, pageContextHint: PageContextHint = 'in_page'): Promise<HTMLElement | null> {
    this.debugLog(`Starting element search. Hint: ${pageContextHint}. Full step data:`, fullStepData);

    let stabilityConfig: StabilityConfig;
    let performStabilityCheck = true;

    switch (pageContextHint) {
      case 'initial':
      case 'navigation':
        this.debugLog(`Using FULL stability check for context: ${pageContextHint}`);
        stabilityConfig = { domCheckDurationMs: 2000, navCheckDelayMs: 500, overallTimeoutMs: 5000 };
        break;
      case 'in_page':
        this.debugLog(`Using QUICK stability check for context: ${pageContextHint}`);
        stabilityConfig = { domCheckDurationMs: 500, navCheckDelayMs: 100, overallTimeoutMs: 2000 };
        break;
      case 'in_page_minimal_check':
        this.debugLog(`Using MINIMAL stability check for context: ${pageContextHint}`);
        stabilityConfig = { domCheckDurationMs: 150, navCheckDelayMs: 50, overallTimeoutMs: 500 };
        break;
      default:
        this.debugLog(`Using QUICK stability check by default for hint: ${pageContextHint}`);
        stabilityConfig = { domCheckDurationMs: 500, navCheckDelayMs: 100, overallTimeoutMs: 2000 };
        break;
    }

    if (performStabilityCheck) {
      this.debugLog('Waiting for page stability with config:', stabilityConfig);
      const stability = await PageLoadDetector.isPageStable(stabilityConfig);
      if (!stability.isStable) {
        this.debugLog(`Page is not stable: ${stability.reason}. Proceeding with caution.`);
      } else {
        this.debugLog('Page appears stable.');
      }
    } else {
      this.debugLog('Skipping page stability check based on context hint.');
    }

    // MODIFIED: Access interaction data, which contains element, pageInfo etc.
    const interactionData = fullStepData?.interaction;

    if (!interactionData || !interactionData.element) {
      this.debugLog('Error: Missing fullStepData.interaction or fullStepData.interaction.element. Cannot determine strategy or find element.');
      return null;
    }
    
    // interactionData itself should align with InteractionData type for RobustElementFinder
    const interactionDataForRobust: InteractionData = interactionData as InteractionData;
    const elementDataForStrategy: ElementData = interactionData.element as ElementData;

    // 2. Determine strategy
    const strategy = this.determineStrategy(elementDataForStrategy);
    this.debugLog(`Determined strategy: ${strategy}`);

    let element: HTMLElement | null = null;

    // 3. Use appropriate finder
    if (strategy === 'robust') {
      this.debugLog('Executing RobustElementFinder...');
      const candidates = await RobustElementFinder.findCandidates(interactionDataForRobust);
      if (candidates.length > 0) {
        element = candidates[0]; // RobustElementFinder should ideally return one best candidate or few to pick from.
        this.debugLog('RobustElementFinder found element(s):', candidates);
      } else {
        this.debugLog('RobustElementFinder did not find any candidates.');
      }
    } else if (strategy === 'xpath') {
      this.debugLog('Executing XPathElementFinder...');
      // XPathElementFinder.findElement expects elementData (element specific details) 
      // and the fullStepData (the entire step object from sortedSteps for broader context if needed by validator)
      element = XPathElementFinder.getInstance().findElement(elementDataForStrategy, fullStepData) as HTMLElement | null;
      if (element) {
        this.debugLog('XPathElementFinder found and validated an element:', element);
      } else {
        this.debugLog('XPathElementFinder did not find a validated element. Attempting fallback to RobustElementFinder...');
        const candidates = await RobustElementFinder.findCandidates(interactionDataForRobust);
        if (candidates.length > 0) {
          element = candidates[0];
          this.debugLog('RobustElementFinder (fallback) found element(s):', candidates);
        } else {
          this.debugLog('RobustElementFinder (fallback) did not find any candidates.');
        }
      }
    }

    if (element) {
      this.debugLog('Element found successfully:', element);
    } else {
      this.debugLog('Failed to find element with any strategy.');
    }
    
    return element;
  }
  
  /**
   * Determines the best finder strategy based on element characteristics
   * Expects elementData (e.g., fullStepData.step_data.element)
   */
  private static determineStrategy(elementData: ElementData): 'robust' | 'xpath' {
    if (!elementData) {
      this.debugLog('No element data provided for strategy determination, defaulting to robust.');
      return 'robust'; // Default fallback
    }
    
    const tagName = elementData.tagName?.toUpperCase() || '';
    const isInteractive = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'TEXTAREAEXTENDED'].includes(tagName);
    const hasSpecificId = elementData.id && !elementData.id.startsWith('headlessui-');
    const hasStableAttrs = elementData.stableAttributes && Object.keys(elementData.stableAttributes).length > 0;
    const childCount = elementData.parentChildContext?.children?.length || 0;
    const hasXPathStrategies = elementData.xpathStrategies && elementData.xpathStrategies.length > 0;
    const textContentLength = elementData.textContent?.trim().length || 0;

    // Prioritize Robust for clearly interactive elements with few children, or strong unique identifiers
    if (isInteractive && childCount < 2 && !hasXPathStrategies) { // More restrictive for interactive robust
       this.debugLog(`Strategy: robust (interactive element '${tagName}', ${childCount} children, no XPath strategies)`);
      return 'robust';
    }
    if (hasSpecificId || (hasStableAttrs && Object.keys(elementData.stableAttributes!).length >= 1)) {
      this.debugLog(`Strategy: robust (has specific ID '${elementData.id}' or >=1 stable attributes)`);
      return 'robust';
    }

    // Conditions for XPath:
    // 1. It's a known container tag AND has at least one child OR has XPath strategies.
    // 2. It has XPath strategies (regardless of tag/children, implies XPath was useful).
    // 3. It has very long text content (often indicative of a larger structural element).
    const isKnownContainer = ['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE', 'FORM', 'UL', 'OL', 'TABLE', 'P', 'SPAN'].includes(tagName);

    if (hasXPathStrategies) {
      this.debugLog(`Strategy: xpath (has XPath strategies defined for '${tagName}')`);
      return 'xpath';
    }
    
    if (isKnownContainer && (childCount > 0 || textContentLength > 100)) {
        this.debugLog(`Strategy: xpath (container '${tagName}', ${childCount} children, text length ${textContentLength})`);
        return 'xpath';
    }
    
    if (textContentLength > 150 && !isInteractive) { // Long text on non-interactive element
        this.debugLog(`Strategy: xpath (long text content ${textContentLength} on non-interactive '${tagName}')`);
        return 'xpath';
    }

    // Default to robust as a final fallback
    this.debugLog(`Strategy: Defaulting to robust (fallback for '${tagName}')`);
    return 'robust'; 
  }

  // Removed shouldUseRobustFinder, shouldUseXPathFinder, shouldUseHierarchicalFinder,
  // hasSpecificAttributes, isStableParent, isHashBasedClass as the logic is simplified
  // and incorporated into determineStrategy or handled by individual finders.
} 