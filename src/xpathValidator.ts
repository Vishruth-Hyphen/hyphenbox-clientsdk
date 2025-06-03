import { ElementData, ParentChildContext } from './types';

export class XPathValidator {
  
  /**
   * Enhanced validation for XPath results to combat over-confidence
   */
  static validateXPathResult(element: Element, stepData: any): { isValid: boolean; confidence: number; reasons: string[] } {
    const reasons: string[] = [];
    let overallConfidence = 0.0; // Start with zero confidence, build it up.
    let validChildrenFound = 0;
    
    const elementData = stepData?.element as ElementData;
    const parentChildContext = elementData?.parentChildContext as ParentChildContext;

    if (!elementData) {
      reasons.push('No elementData provided in stepData.');
      return { isValid: false, confidence: 0, reasons };
    }
    
    if (!parentChildContext || !parentChildContext.children || parentChildContext.children.length === 0) {
      reasons.push('No children specified in parentChildContext to validate against.');
      // If there are no children to validate, we can't be sure. 
      // Depending on requirements, this might be considered valid or invalid.
      // For now, let's say it's not definitively valid by this method.
      return { isValid: false, confidence: 0, reasons };
    }

    console.log('[XPathValidator] Starting child-focused validation for element:', element);
    console.log('[XPathValidator] Recorded children to match:', parentChildContext.children);

    for (let i = 0; i < parentChildContext.children.length; i++) {
      const recordedChild = parentChildContext.children[i];
      let childMatchFound = false;
      let bestActualChildMatchReasons: string[] = [];

      console.log(`[XPathValidator] Attempting to match recorded child #${i + 1}:`, recordedChild);

      for (let j = 0; j < element.children.length; j++) {
        const actualChild = element.children[j] as HTMLElement;
        const currentChildMatchReasons: string[] = [];
        let currentChildScore = 0;

        // 1. Tag Name Match (Required)
        if (recordedChild.tagName && actualChild.tagName.toUpperCase() !== recordedChild.tagName.toUpperCase()) {
          // Log only if verbose or if this actualChild was a potential candidate otherwise
          continue; // Must match tag name
        }
        currentChildScore += 0.4; // Basic match

        // 2. Attributes Match
        const attrResult = this.compareAttributes(recordedChild.attributes, actualChild);
        if (attrResult.match) {
          currentChildScore += 0.3;
    } else {
          currentChildMatchReasons.push(...attrResult.mismatches);
    }
    
        // 3. Classes Match
        const classResult = this.compareClasses(recordedChild.classes, actualChild);
        if (classResult.match) {
          currentChildScore += 0.15;
        } else {
          currentChildMatchReasons.push(...classResult.mismatches);
        }

        // 4. Text Content Match
        const recordedText = this.normalizeText(recordedChild.textContent);
        const actualText = this.normalizeText(actualChild.textContent);
        // const actualInnerText = this.normalizeText(actualChild.innerText);

        if (recordedText) { // Only validate text if recorded text is not empty
          if (actualText.includes(recordedText) || recordedText.includes(actualText)) { // Partial match is okay for children
            currentChildScore += 0.15;
          } else {
            currentChildMatchReasons.push(`Text mismatch: expected (normalized) something like '${recordedText}', got '${actualText}'`);
          }
        } else {
          currentChildScore += 0.05; // Small boost if no text was expected and none found or actual has text
        }

        // Check if this actualChild is a better match for the current recordedChild
        if (currentChildScore > 0.6 && currentChildMatchReasons.length === 0) { // Threshold for a good match
          console.log(`[XPathValidator] ✅ SUCCESS: Recorded child #${i + 1} MATCHED actual child #${j + 1} (Score: ${currentChildScore.toFixed(2)})`, {
            recorded: recordedChild,
            actual: {
              tagName: actualChild.tagName,
              attributes: actualChild.attributes,
              classes: Array.from(actualChild.classList),
              textContent: actualChild.textContent?.substring(0, 100)
            }
          });
          childMatchFound = true;
          validChildrenFound++;
          reasons.push(`Matched recorded child #${i+1} (Tag: ${recordedChild.tagName}) with actual child #${j+1}.`);
          break; // Found a good match for this recordedChild, move to the next recordedChild
        } else if (currentChildMatchReasons.length > 0 && (bestActualChildMatchReasons.length === 0 || currentChildMatchReasons.length < bestActualChildMatchReasons.length)){
            // Log potential but failed match for debugging
            bestActualChildMatchReasons = [`Actual child #${j+1} (Tag: ${actualChild.tagName}, Score: ${currentChildScore.toFixed(2)}) had issues: ${currentChildMatchReasons.join(', ')}`];
        }
      } // End loop through actual children

      if (!childMatchFound) {
        const message = `[XPathValidator] ❌ FAILED: Recorded child #${i + 1} (Tag: ${recordedChild.tagName}, Text: '${recordedChild.textContent?.substring(0,50)}') found NO DEFINITIVE MATCH among actual children.`;
        console.log(message);
        if(bestActualChildMatchReasons.length > 0){
            console.log(`[XPathValidator] Closest actual child attempt for recorded child #${i+1}: ${bestActualChildMatchReasons.join(', ')}`);
            reasons.push(message + ` Closest attempt issues: ${bestActualChildMatchReasons.join(', ')}`);
        } else {
            reasons.push(message + ' No actual child was even a remote candidate (e.g., tag name mismatch).');
        }
      }
    } // End loop through recorded children

    if (validChildrenFound === 0 && parentChildContext.children.length > 0) {
        reasons.push('No recorded children could be confidently matched to actual children.');
        return { isValid: false, confidence: 0, reasons };
  }
  
    // Calculate confidence based on the proportion of matched children
    // This is a simple approach; more sophisticated scoring could be added.
    overallConfidence = validChildrenFound / parentChildContext.children.length;
    const isValid = overallConfidence >= 0.5; // Require at least 50% of children to match

    if (isValid) {
      reasons.push(`Validation successful: ${validChildrenFound} out of ${parentChildContext.children.length} recorded children matched.`);
    } else {
      reasons.push(`Validation failed: Only ${validChildrenFound} out of ${parentChildContext.children.length} recorded children matched.`);
    }
    console.log(`[XPathValidator] Final Validation Result: isValid=${isValid}, Confidence=${overallConfidence.toFixed(2)}`);

    return { isValid, confidence: overallConfidence, reasons };
  }
  
  // Helper function to normalize text (similar to RobustElementFinder)
  private static normalizeText(text: string | null | undefined): string {
    return (text || '').toLowerCase().trim().replace(/\s+/g, '');
  }

  // Helper function to compare attributes
  private static compareAttributes(recordedAttrs: { [key: string]: string } | undefined, actualElement: Element): { match: boolean; mismatches: string[] } {
    const mismatches: string[] = [];
    if (!recordedAttrs || Object.keys(recordedAttrs).length === 0) {
      return { match: true, mismatches }; // No recorded attributes to compare
    }

    for (const [key, expectedValue] of Object.entries(recordedAttrs)) {
      const actualValue = actualElement.getAttribute(key);
      if (String(actualValue) !== String(expectedValue)) {
        mismatches.push(`Attribute '${key}': expected '${expectedValue}', got '${actualValue}'`);
      }
    }
    return { match: mismatches.length === 0, mismatches };
  }

  // Helper function to compare classes
  private static compareClasses(recordedClasses: string[] | undefined, actualElement: Element): { match: boolean; mismatches: string[] } {
    const mismatches: string[] = [];
    if (!recordedClasses || recordedClasses.length === 0) {
      return { match: true, mismatches }; // No recorded classes to compare
    }

    for (const expectedClass of recordedClasses) {
      if (!actualElement.classList.contains(expectedClass)) {
        mismatches.push(`Missing class: '${expectedClass}'`);
      }
    }
    return { match: mismatches.length === 0, mismatches };
  }
  
  /**
   * Quick validation - NOT THE PRIMARY VALIDATION FOR XPATH.
   * This is a placeholder or can be adapted if a truly "quick" version is needed elsewhere.
   * For now, it will just use the main validation with a high threshold.
   */
  static quickValidate(element: Element, stepData: any): boolean {
    console.warn('[XPathValidator] quickValidate is using the full child-focused validation. Consider if a separate light-weight version is needed.');
    const result = this.validateXPathResult(element, stepData);
    return result.isValid && result.confidence >= 0.75; // Higher threshold for "quick" validation
  }
} 