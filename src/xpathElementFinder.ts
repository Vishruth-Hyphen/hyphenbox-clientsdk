import { ElementData, XPathStrategy, ParentChildContext } from './types';
import { XPathValidator } from './xpathValidator';

export class XPathElementFinder {
  private static instance: XPathElementFinder;
  
  public static getInstance(): XPathElementFinder {
    if (!XPathElementFinder.instance) {
      XPathElementFinder.instance = new XPathElementFinder();
    }
    return XPathElementFinder.instance;
  }

  /**
   * Find element using XPath strategies ONLY with enhanced validation.
   */
  public findElement(elementData: ElementData, stepData?: any): Element | null {
    console.log('[XPathFinder] 🔍 Starting ENHANCED XPath element search...');
    console.log('[XPathFinder] 📊 Element data received:', {
      tagName: elementData.tagName,
      textContent: elementData.textContent,
      xpathStrategiesCount: elementData.xpathStrategies?.length || 0,
    });

    if (!elementData.xpathStrategies || elementData.xpathStrategies.length === 0) {
      console.log('[XPathFinder] ❌ No XPath strategies provided in elementData. Cannot proceed.');
      return null;
    }

    // Sort strategies by confidence (highest first)
    const sortedStrategies = [...elementData.xpathStrategies].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    console.log(`[XPathFinder] 🎯 Attempting ${sortedStrategies.length} XPath strategies (sorted by confidence)...`);

    const candidates: { element: Element; strategy: XPathStrategy; validation: any }[] = [];

    // Try each strategy and collect candidates with validation results
    for (const strategy of sortedStrategies) {
      console.log(`[XPathFinder]   ↳ Trying XPath type: ${strategy.type || 'N/A'}, confidence: ${strategy.confidence || 'N/A'}`);
      console.log(`[XPathFinder]     XPath: ${strategy.xpath}`);
      
      const foundElements = this.findByXPath(strategy);
      
      if (foundElements.length > 0) {
        console.log(`[XPathFinder] ✅ XPath strategy "${strategy.type || strategy.xpath}" found ${foundElements.length} potential elements.`);
        
        for (const currentElement of foundElements) {
          console.log(`[XPathFinder]   Candidate for validation:`, currentElement);
          console.log(`[XPathFinder]   Running enhanced validation...`);
          
          let validationData;
          if (stepData && stepData.step_data) {
            validationData = {
              element: elementData, 
              position: stepData.step_data.position,
              elementRect: stepData.step_data.elementRect
            };
          } else if (stepData && stepData.element) {
            validationData = stepData;
          } else {
            validationData = { element: elementData };
          }
          
          console.log('[XPathFinder]   🔧 Validation data structure for this candidate:', {
            hasElement: !!validationData.element,
            hasPosition: !!validationData.position,
            hasElementRect: !!validationData.elementRect
          });
          
          const validation = XPathValidator.validateXPathResult(currentElement, validationData);
          
          console.log(`[XPathFinder]   📊 Validation result for this candidate:`, {
            isValid: validation.isValid,
            confidence: validation.confidence.toFixed(2),
            reasons: validation.reasons
          });
          
          candidates.push({ element: currentElement, strategy, validation });
        }
      } else {
        console.log(`[XPathFinder]   ❌ XPath strategy "${strategy.type || strategy.xpath}" did not find any elements.`);
      }
    }

    if (candidates.length > 0) {
      const validCandidates = candidates.filter(c => c.validation.isValid);
      
      if (validCandidates.length > 0) {
        validCandidates.sort((a, b) => b.validation.confidence - a.validation.confidence);
        const bestCandidate = validCandidates[0];
        
        console.log(`[XPathFinder] ✅🏆 Best valid candidate found with confidence: ${bestCandidate.validation.confidence.toFixed(2)} (from strategy: ${bestCandidate.strategy.type})`);
        console.log(`[XPathFinder]    Element:`, bestCandidate.element);
        console.log(`[XPathFinder]    Validation reasons:`, bestCandidate.validation.reasons);
        
        return bestCandidate.element;
      } else {
        console.log('[XPathFinder] ❌ Found potential candidates, but none passed child-focused validation.');
        candidates.slice(0, 5).forEach((candidate, index) => {
          console.log(`[XPathFinder]   Potential Candidate ${index + 1} (Strategy: ${candidate.strategy.type}, XPath: ${candidate.strategy.xpath}) failed validation:`, candidate.validation.reasons);
          console.log(`[XPathFinder]    Failed Element:`, candidate.element);
        });
      }
    } else {
        console.warn('[XPathFinder] 🚨 No potential candidates found by any XPath strategy.');
    }

    console.warn('[XPathFinder] ❌ ENHANCED XPath search: Could not find a definitively valid element with any provided strategy after child validation.');
    return null;
  }

  /**
   * Find element using a specific XPath strategy
   */
  private findByXPath(strategy: XPathStrategy): Element[] {
    const elements: Element[] = [];
    try {
      const result = document.evaluate(
        strategy.xpath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      
      for (let i = 0; i < result.snapshotLength; i++) {
        const node = result.snapshotItem(i);
        if (node instanceof Element) {
          elements.push(node);
        }
      }
      
      return elements;
    } catch (error) {
      console.warn(`[XPathFinder] XPath evaluation failed for "${strategy.xpath}":`, error);
    }
    
    return elements;
  }

  /**
   * Find element using parent-child relationship context
   */
  private findByParentChildContext(elementData: ElementData): Element | null {
    const context = elementData.parentChildContext;
    if (!context || !context.parents || context.parents.length === 0) {
      return null;
    }

    // Try to find a stable parent first
    for (let i = 0; i < context.parents.length; i++) {
      const parentData = context.parents[i];
      const parentElements = this.findParentElements(parentData);
      
      for (const parentElement of parentElements) {
        // Look for target element within this parent
        const targetElement = this.findTargetWithinParent(parentElement, elementData, i + 1);
        if (targetElement) {
          return targetElement;
        }
      }
    }

    return null;
  }

  /**
   * Find potential parent elements based on parent data
   */
  private findParentElements(parentData: any): Element[] {
    const selectors: string[] = [];
    
    // Build XPath selectors for parent
    if (parentData.id) {
      selectors.push(`//${parentData.tagName.toLowerCase()}[@id='${parentData.id}']`);
    }
    
    if (parentData.attributes) {
      Object.entries(parentData.attributes).forEach(([key, value]) => {
        if (key === 'data-testid' || key === 'name' || key.startsWith('data-')) {
          selectors.push(`//${parentData.tagName.toLowerCase()}[@${key}='${value}']`);
        }
      });
    }
    
    if (parentData.classes && parentData.classes.length > 0) {
      const bestClass = parentData.classes.sort((a: string, b: string) => b.length - a.length)[0];
      selectors.push(`//${parentData.tagName.toLowerCase()}[contains(@class, '${bestClass}')]`);
    }

    const elements: Element[] = [];
    for (const selector of selectors) {
      try {
        const result = document.evaluate(
          selector,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );
        
        for (let i = 0; i < result.snapshotLength; i++) {
          const element = result.snapshotItem(i) as Element;
          if (element && !elements.includes(element)) {
            elements.push(element);
          }
        }
      } catch (error) {
        console.warn(`[XPathFinder] Parent selector failed: ${selector}`, error);
      }
    }

    return elements;
  }

  /**
   * Find target element within a parent element
   */
  private findTargetWithinParent(parentElement: Element, elementData: ElementData, depth: number): Element | null {
    // Build XPath relative to parent
    const targetSelectors: string[] = [];
    
    // Ensure we have a tagName to work with
    if (!elementData.tagName) {
      return null;
    }
    
    const tagName = elementData.tagName.toLowerCase();
    
    // Try with stable attributes first
    if (elementData.stableAttributes) {
      Object.entries(elementData.stableAttributes).forEach(([key, value]) => {
        targetSelectors.push(`.//${tagName}[@${key}='${value}']`);
      });
    }
    
    // Try with semantic classes
    if (elementData.semanticClasses) {
      const classes = elementData.semanticClasses.split(' ').filter(cls => cls.length > 2);
      if (classes.length > 0) {
        const bestClass = classes.sort((a, b) => b.length - a.length)[0];
        targetSelectors.push(`.//${tagName}[contains(@class, '${bestClass}')]`);
      }
    }
    
    // Try with text content (for small text)
    if (elementData.textContent && elementData.textContent.length < 30 && elementData.textContent.length > 0) {
      targetSelectors.push(`.//${tagName}[normalize-space(text())='${elementData.textContent}']`);
    }
    
    // Try with position if we have sibling context
    if (elementData.parentChildContext?.siblings) {
      const siblings = elementData.parentChildContext.siblings;
      if (siblings.length > 0) {
        // Use sibling information to build more precise selector
        targetSelectors.push(`.//${tagName}`);
      }
    }

    for (const selector of targetSelectors) {
      try {
        const result = document.evaluate(
          selector,
          parentElement,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        
        const element = result.singleNodeValue as Element;
        if (element) {
          console.log(`[XPathFinder] Found target within parent using: ${selector}`);
          return element;
        }
      } catch (error) {
        console.warn(`[XPathFinder] Target selector failed: ${selector}`, error);
      }
    }

    return null;
  }

  /**
   * Find element using stable attributes
   */
  private findByStableAttributes(elementData: ElementData): Element | null {
    if (!elementData.stableAttributes) {
      return null;
    }

    const selectors: string[] = [];
    
    if (!elementData.tagName) {
      return null;
    }
    
    const tagName = elementData.tagName.toLowerCase();
    
    Object.entries(elementData.stableAttributes).forEach(([key, value]) => {
      selectors.push(`//${tagName}[@${key}='${value}']`);
    });

    for (const selector of selectors) {
      try {
        const result = document.evaluate(
          selector,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        
        const element = result.singleNodeValue as Element;
        if (element) {
          console.log(`[XPathFinder] Found element using stable attribute: ${selector}`);
          return element;
        }
      } catch (error) {
        console.warn(`[XPathFinder] Stable attribute selector failed: ${selector}`, error);
      }
    }

    return null;
  }

  /**
   * Validate that found element matches expected characteristics
   */
  private validateElement(element: Element, elementData: ElementData): boolean {
    // Basic tag name check
    if (elementData.tagName && element.tagName !== elementData.tagName) {
      console.warn('[XPathFinder] Validation FAIL: Tag name mismatch:', element.tagName, 'vs', elementData.tagName);
      return false;
    }

    // Check ID if available
    if (elementData.id && element.id !== elementData.id) {
      console.warn('[XPathFinder] Validation FAIL: ID mismatch:', element.id, 'vs', elementData.id);
      return false;
    }

    // Check stable attributes if they exist in elementData
    if (elementData.stableAttributes) {
      for (const [key, value] of Object.entries(elementData.stableAttributes)) {
        if (element.getAttribute(key) !== value) {
          console.warn(`[XPathFinder] Validation FAIL: Stable attribute mismatch for ${key}:`, element.getAttribute(key), 'vs', value);
          return false;
        }
      }
    }

    // Check general attributes if they exist in elementData
    if (typeof elementData.attributes === 'string') {
        try {
            const attrs = JSON.parse(elementData.attributes);
            for (const [key, value] of Object.entries(attrs)) {
                if (typeof value === 'boolean') {
                    if (element.hasAttribute(key) !== value) {
                        console.warn(`[XPathFinder] Validation FAIL: Boolean attribute presence mismatch for ${key}:`, element.hasAttribute(key), 'vs', value);
                        return false;
                    }
                } else if (element.getAttribute(key) !== String(value)) { // Ensure comparison with string value
                    console.warn(`[XPathFinder] Validation FAIL: Attribute mismatch for ${key}:`, element.getAttribute(key), 'vs', String(value));
                    return false;
                }
            }
        } catch (e) {
            console.log('[XPathFinder] Note: Could not parse elementData.attributes for validation, skipping this check.');
        }
    } else if (typeof elementData.attributes === 'object' && elementData.attributes !== null) {
        for (const [key, value] of Object.entries(elementData.attributes)) {
             if (typeof value === 'boolean') {
                if (element.hasAttribute(key) !== value) {
                    console.warn(`[XPathFinder] Validation FAIL: Boolean attribute presence mismatch for ${key}:`, element.hasAttribute(key), 'vs', value);
                    return false;
                }
            } else if (element.getAttribute(key) !== String(value)) { // Ensure comparison with string value
                console.warn(`[XPathFinder] Validation FAIL: Attribute mismatch for ${key}:`, element.getAttribute(key), 'vs', String(value));
                return false;
            }
        }
    }

    // TEXT CONTENT VALIDATION REMOVED FOR TESTING
    /*
    if (elementData.textContent && elementData.textContent.length > 0) {
      // Normalize both texts: trim, lowercase, REMOVE ALL SPACES
      const normalizeForTextComparison = (text: string | null | undefined) => (text || '').trim().toLowerCase().replace(/\s+/g, '');
      
      const elementTextNormalized = normalizeForTextComparison(element.textContent);
      const expectedTextNormalized = normalizeForTextComparison(elementData.textContent);
      
      if (!elementTextNormalized.includes(expectedTextNormalized)) {
        console.warn('[XPathFinder] Validation FAIL: Text content mismatch. Expected (no spaces) to include:', `"${expectedTextNormalized}"`, 'Actual (no spaces):', `"${elementTextNormalized}"`);
        return false;
      }
    }
    */
    console.log('[XPathFinder] ⚠️ Text content validation SKIPPED for testing.');

    console.log('[XPathFinder] ✅ Element passed all other validation checks.');
    return true;
  }

  /**
   * Get multiple candidate elements for manual selection
   */
  public findCandidateElements(elementData: ElementData): Element[] {
    const candidates: Element[] = [];
    
    // Try all XPath strategies
    if (elementData.xpathStrategies) {
      for (const strategy of elementData.xpathStrategies) {
        const foundElements = this.findByXPath(strategy);
        for (const element of foundElements) {
          if (element && !candidates.includes(element)) {
            candidates.push(element);
          }
        }
      }
    }

    // Try parent-child context
    if (elementData.parentChildContext) {
      const contextElement = this.findByParentChildContext(elementData);
      if (contextElement && !candidates.includes(contextElement)) {
        candidates.push(contextElement);
      }
    }

    // Try stable attributes
    if (elementData.stableAttributes) {
      const stableElement = this.findByStableAttributes(elementData);
      if (stableElement && !candidates.includes(stableElement)) {
        candidates.push(stableElement);
      }
    }

    return candidates;
  }
}

export default XPathElementFinder; 