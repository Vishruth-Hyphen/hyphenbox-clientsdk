export class ElementUtils {
    static findElementFromInteraction(interaction: any, requireExactMatch: boolean = true): HTMLElement | null {
      if (!interaction) return null;
      
      try {
        // Get element data
        const element = interaction.element || {};
        const findingDetails = { tried: [] as string[], results: [] as any[] };
        
        // LOGGING: Initial debug information
        console.log('[ELEMENT-FINDER] Starting search with data:', {
          cssSelector: element.cssSelector,
          tagName: element.tagName,
          id: element.id,
          textContent: element.textContent?.substring(0, 50),
          attributes: element.attributes
        });
        
        // STRATEGY 0: Check for portal/modal context
        const portals = document.querySelectorAll('[data-portal="true"]');
        const modals = document.querySelectorAll('.mantine-Modal-content, [role="dialog"], .modal-content');
        const portalInfo = {
          found: portals.length > 0,
          count: portals.length,
          modalElements: modals.length
        };
        
        console.log('[ELEMENT-FINDER] Portal detection:', portalInfo);
        
        // Define potential search roots - start with most specific (portal content) to least (document)
        const searchRoots = [];
        
        // Add modal contents first if they exist
        modals.forEach((modal, index) => {
          searchRoots.push({
            name: `Modal ${index + 1}`,
            root: modal
          });
        });
        
        // Add portals next
        portals.forEach((portal, index) => {
          searchRoots.push({
            name: `Portal ${index + 1}`,
            root: portal
          });
        });
        
        // Always include full document as fallback
        searchRoots.push({
          name: 'Document',
          root: document
        });
        
        // STRATEGY 1: CSS Selector - try in each context
        if (element.cssSelector) {
          findingDetails.tried.push("CSS Selector");
          
          // Check if it contains the non-standard :contains() pseudo-selector
          if (element.cssSelector.includes(':contains(')) {
            console.log('[ELEMENT-FINDER] Detected :contains() pseudo-selector, using alternative strategy');
            
            // Extract the tag name and text from the selector
            // Pattern: tagName:contains("text")
            const match = element.cssSelector.match(/([a-zA-Z0-9]+):contains\(["'](.+?)["']\)/);
            if (match) {
              const [_, tagName, text] = match;
              console.log(`[ELEMENT-FINDER] Parsed selector: tag=${tagName}, text="${text}"`);
              
              // Search for elements by tag name and text content
              for (const {name, root} of searchRoots) {
                console.log(`[ELEMENT-FINDER] Searching for ${tagName} with text "${text}" in ${name}...`);
                
                try {
                  const elements = Array.from(root.querySelectorAll(tagName));
                  const matchingElements = elements.filter(el => {
                    const elText = el.textContent?.trim();
                    return elText === text;
                  });
                  
                  console.log(`[ELEMENT-FINDER] Found ${matchingElements.length} elements with matching text in ${name}`);
                  
                  if (matchingElements.length > 0) {
                    return matchingElements[0] as HTMLElement;
                  }
                } catch (e) {
                  console.log(`[ELEMENT-FINDER] Error searching in ${name}:`, e);
                }
              }
            }
          } else {
            // Try CSS selector in each search root
            for (const {name, root} of searchRoots) {
              console.log(`[ELEMENT-FINDER] Trying CSS selector "${element.cssSelector}" in ${name}...`);
              
              try {
                const elements = root.querySelectorAll(element.cssSelector);
                console.log(`[ELEMENT-FINDER] Found ${elements.length} matches in ${name}`);
                
                if (elements.length > 0) {
                  // Check text content if specified
                  for (let i = 0; i < elements.length; i++) {
                    const el = elements[i] as HTMLElement;
                    const match = !element.textContent || el.textContent?.trim() === element.textContent.trim();
                    
                    console.log(`[ELEMENT-FINDER] Match #${i+1}: textMatch=${match}, element:`, {
                      id: el.id,
                      className: el.className,
                      textContent: el.textContent?.substring(0, 30),
                      visible: el.offsetParent !== null,
                      rect: el.getBoundingClientRect()
                    });
                    
                    if (match) {
                      return el;
                    }
                  }
                }
              } catch (e) {
                console.log(`[ELEMENT-FINDER] Error with selector in ${name}:`, e);
              }
            }
          }
        }
        
        // STRATEGY 1.5: Text content matching if available
        if (element.textContent || interaction.text) {
          findingDetails.tried.push("Text Content");
          const textToMatch = element.textContent || interaction.text;
          const tagName = element.tagName || '';
          
          console.log(`[ELEMENT-FINDER] Trying to find element by text: "${textToMatch}" with tag: "${tagName}"`);
          
          for (const {name, root} of searchRoots) {
            try {
              // If tagName is specified, filter by it
              const selector = tagName ? tagName : '*';
              const elements = Array.from(root.querySelectorAll(selector));
              
              // First try exact text matching
              const exactMatches = elements.filter(el => {
                // Skip script, style tags and hidden elements
                if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || 
                    (el as HTMLElement).style.display === 'none' || 
                    (el as HTMLElement).style.visibility === 'hidden') {
                  return false;
                }
                
                const elText = el.textContent?.trim();
                return elText === textToMatch;
              });
              
              console.log(`[ELEMENT-FINDER] Found ${exactMatches.length} elements with exact text "${textToMatch}" in ${name}`);
              
              if (exactMatches.length > 0) {
                return exactMatches[0] as HTMLElement;
              }
              
              // If no exact matches, try looking for elements that contain the text
              const containsMatches = elements.filter(el => {
                // Skip script, style tags and hidden elements
                if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || 
                    (el as HTMLElement).style.display === 'none' || 
                    (el as HTMLElement).style.visibility === 'hidden') {
                  return false;
                }
                
                const elText = el.textContent?.trim();
                return elText?.includes(textToMatch) || false;
              });
              
              console.log(`[ELEMENT-FINDER] Found ${containsMatches.length} elements containing text "${textToMatch}" in ${name}`);
              
              if (containsMatches.length > 0) {
                // For buttons and links, prioritize interactive elements that contain the exact text
                const interactiveMatches = containsMatches.filter(el => 
                  (el.tagName === 'BUTTON' || el.tagName === 'A') && 
                  el.textContent?.trim() === textToMatch
                );
                
                if (interactiveMatches.length > 0) {
                  return interactiveMatches[0] as HTMLElement;
                }
                
                return containsMatches[0] as HTMLElement;
              }
            } catch (e) {
              console.log(`[ELEMENT-FINDER] Error searching text in ${name}:`, e);
            }
          }
        }
        
        // STRATEGY 2: Try ID-based fuzzy matching for Mantine elements
        if (element.id && element.id.startsWith('mantine-')) {
          findingDetails.tried.push("Mantine ID Pattern");
          console.log('[ELEMENT-FINDER] Trying Mantine ID pattern matching...');
          
          // Extract the element type from ID (like "mantine-RANDOM-Input-input")
          const idParts = element.id.split('-');
          const mantinePrefix = idParts[0]; // "mantine"
          
          // Identify if this is a tab component based on ID pattern
          const isTabComponent = element.id.includes('-tab-');
          const tabIdentifier = isTabComponent ? element.id.split('-tab-')[1] : null;
          
          console.log(`[ELEMENT-FINDER] Mantine component analysis:`, {
            isTabComponent,
            tabIdentifier,
            fullId: element.id
          });
          
          for (const {name, root} of searchRoots) {
            // Try to find elements with similar pattern
            // First try direct ID
            const directMatch = root.querySelector(`#${element.id}`) as HTMLElement;
            
            if (directMatch) {
              console.log(`[ELEMENT-FINDER] Found direct ID match in ${name}`);
              return directMatch;
            }
            
            // SPECIAL CASE: For Mantine tabs, try a more robust approach
            if (isTabComponent && tabIdentifier) {
              console.log(`[ELEMENT-FINDER] Trying tab-specific matching for "${tabIdentifier}" in ${name}`);
              
              // Try finding any button with -tab- in ID and the tab identifier
              const tabSelector = `button[id*="-tab-${tabIdentifier}"]`;
              const tabElements = root.querySelectorAll(tabSelector);
              console.log(`[ELEMENT-FINDER] Found ${tabElements.length} tab elements with ID pattern matching ${tabIdentifier}`);
              
              if (tabElements.length > 0) {
                return tabElements[0] as HTMLElement;
              }
              
              // If that fails, look for buttons with matching text content
              if (element.textContent) {
                console.log(`[ELEMENT-FINDER] Looking for tab buttons with text "${element.textContent}"`);
                
                const buttons = Array.from(root.querySelectorAll('button'));
                const textMatches = buttons.filter(btn => {
                  const btnText = btn.textContent?.trim();
                  return btnText === element.textContent;
                });
                
                console.log(`[ELEMENT-FINDER] Found ${textMatches.length} buttons with text "${element.textContent}"`);
                
                if (textMatches.length > 0) {
                  return textMatches[0] as HTMLElement;
                }
              }
            }
            
            // Try finding all elements that match the pattern
            if (element.tagName) {
              // Look for elements with the specific tag and similar class structure
              if (element.semanticClasses) {
                const semanticMatches = Array.from(
                  root.querySelectorAll(`${element.tagName}[class*="mantine-"]`)
                ).filter(el => {
                  const classMatch = element.semanticClasses.split(' ').every((cls: string) => 
                    el.className.includes(cls.replace(/^m_[a-z0-9]+\s/g, ''))
                  );
                  return classMatch;
                });
                
                console.log(`[ELEMENT-FINDER] Found ${semanticMatches.length} semantic class pattern matches in ${name}`);
                
                if (semanticMatches.length > 0) {
                  const targetText = element.textContent || interaction.text;
                  if (targetText) {
                    const textMatch = semanticMatches.find(el => 
                      this.isTextMatch(el as HTMLElement, targetText)
                    );
                    if (textMatch) {
                      console.log(`[ELEMENT-FINDER] Found semantic match with matching text in ${name}`);
                      return textMatch as HTMLElement;
                    }
                    continue;
                  }
                  return semanticMatches[0] as HTMLElement;
                }
              }
            }
          }
        }
        
        // STRATEGY 3: Attribute-based searching, especially for inputs
        if (element.attributes) {
          findingDetails.tried.push("Attribute Based");
          console.log('[ELEMENT-FINDER] Trying attribute-based search...');
          
          const attrs = typeof element.attributes === 'string'
            ? JSON.parse(element.attributes)
            : element.attributes;
          
          // Build a selector from available attributes
          const attributeSelectors = [];
          
          if (element.tagName) {
            attributeSelectors.push(element.tagName.toLowerCase());
          }
          
          // Add key attributes that help identify elements
          for (const [key, value] of Object.entries(attrs)) {
            if (['name', 'placeholder', 'role', 'type'].includes(key)) {
              attributeSelectors.push(`[${key}="${value}"]`);
            }
          }
          
          if (attributeSelectors.length > 0) {
            const attrSelector = attributeSelectors.join('');
            
            for (const {name, root} of searchRoots) {
              console.log(`[ELEMENT-FINDER] Trying attribute selector "${attrSelector}" in ${name}...`);
              
              try {
                const elements = root.querySelectorAll(attrSelector);
                console.log(`[ELEMENT-FINDER] Found ${elements.length} attribute matches in ${name}`);
                
                if (elements.length > 0) {
                  // Get target text from either element.textContent or interaction.text
                  const targetText = element.textContent || interaction.text;
                  
                  // If we have target text, find element with matching text
                  if (targetText) {
                    console.log(`[ELEMENT-FINDER] Checking text content match for "${targetText}"`);
                    for (const el of elements) {
                      if (this.isTextMatch(el as HTMLElement, targetText)) {
                        console.log(`[ELEMENT-FINDER] Found element with matching text in ${name}`);
                        return el as HTMLElement;
                      }
                    }
                    // If no text match found, continue to next search root
                    continue;
                  }
                  
                  // Only return first match if no text to match against
                  return elements[0] as HTMLElement;
                }
              } catch (e) {
                console.log(`[ELEMENT-FINDER] Error with attribute selector in ${name}:`, e);
              }
            }
          }
        }
        
        // STRATEGY 4: For inputs, try finding by placeholder text
        if (element.tagName === 'INPUT' && element.attributes) {
          findingDetails.tried.push("Input Placeholder");
          console.log('[ELEMENT-FINDER] Trying input placeholder search...');
          
          const attrs = typeof element.attributes === 'string'
            ? JSON.parse(element.attributes)
            : element.attributes;
          
          if (attrs.placeholder) {
            for (const {name, root} of searchRoots) {
              const placeholderSelector = `input[placeholder="${attrs.placeholder}"]`;
              console.log(`[ELEMENT-FINDER] Trying placeholder selector "${placeholderSelector}" in ${name}...`);
              
              const elements = root.querySelectorAll(placeholderSelector);
              console.log(`[ELEMENT-FINDER] Found ${elements.length} placeholder matches in ${name}`);
              
              if (elements.length > 0) {
                return elements[0] as HTMLElement;
              }
            }
          }
        }
        
        // STRATEGY 4.5: Specific handling for Mantine tabs
        findingDetails.tried.push("Mantine Tab Search");
        console.log('[ELEMENT-FINDER] Trying specific Mantine tab search...');
        
        // Check if this might be a tab based on content and tag
        if (element.tagName === 'BUTTON' && element.textContent) {
          console.log(`[ELEMENT-FINDER] Looking for tab with text: "${element.textContent}"`);
          
          for (const {name, root} of searchRoots) {
            // Look for buttons that have classes indicating they're tabs
            const potentialTabs = Array.from(
              root.querySelectorAll('button[class*="mantine-Tabs-tab"]')
            );
            
            if (!potentialTabs.length) {
              // Fallback to any button if no specific tab classes found
              potentialTabs.push(...Array.from(root.querySelectorAll('button')));
            }
            
            console.log(`[ELEMENT-FINDER] Found ${potentialTabs.length} potential tabs in ${name}`);
            
            // Find tabs with matching text
            const matchingTabs = potentialTabs.filter(tab => {
              const tabText = tab.textContent?.trim();
              return tabText === element.textContent;
            });
            
            console.log(`[ELEMENT-FINDER] Found ${matchingTabs.length} tabs with text "${element.textContent}" in ${name}`);
            
            if (matchingTabs.length > 0) {
              return matchingTabs[0] as HTMLElement;
            }
          }
        }
        
        // No element found after all strategies
        console.log(`[ELEMENT-FINDER] All strategies failed. Tried: ${findingDetails.tried.join(', ')}`);
        
        // DIAGNOSTIC: Log DOM structure of portals to understand better
        if (portals.length > 0) {
          console.log('[ELEMENT-FINDER] Portal DOM structure preview:');
          portals.forEach((portal, i) => {
            console.log(`Portal ${i+1} HTML:`, portal.innerHTML.substring(0, 500) + '...');
          });
        }
        
        // EXTRA DIAGNOSTIC: Try to find all "My Profile" texts anywhere in the document
        if (element.textContent === "My Profile" || interaction.text === "My Profile") {
          console.log('[ELEMENT-FINDER] Extra diagnostic - searching for any "My Profile" text in document:');
          const allElements = document.querySelectorAll('*');
          const potentialMatches = Array.from(allElements).filter(el => 
            el.textContent?.trim() === "My Profile"
          );
          
          console.log(`[ELEMENT-FINDER] Found ${potentialMatches.length} potential "My Profile" matches:`);
          potentialMatches.forEach((el, i) => {
            console.log(`Match #${i+1}:`, {
              tagName: el.tagName,
              id: el.id,
              className: el.className,
              path: this.getElementPath(el as HTMLElement),
              visible: (el as HTMLElement).offsetParent !== null
            });
          });
        }
        
        return null;
      } catch (error) {
        console.error("[ELEMENT-FINDER] Error finding element:", error);
        return null;
      }
    }
  
    static findElementByText(selector: string, text: string, exact: boolean = true): HTMLElement | null {
      return this.querySelectorAllWithText(selector, text, exact)[0] as HTMLElement || null;
    }
  
    static compareUrls(url1: string, url2: string): boolean {
      if (!url1 || !url2) {
        console.log('URL COMPARE: One or both URLs are empty', { url1, url2 });
        return false;
      }
      
      try {
        // Parse URLs to handle components properly
        const parseUrl = (url: string) => {
          try {
            // Add protocol if missing for URL parsing
            if (!url.match(/^https?:\/\//)) {
              url = 'http://' + url;
            }
            
            const parsed = new URL(url);
            return {
              hostname: parsed.hostname,
              pathname: parsed.pathname.replace(/\/$/, '') || '/', // Remove trailing slash but keep root slash
              search: parsed.search,
              hash: parsed.hash
            };
          } catch (error) {
            console.error('Failed to parse URL:', url, error);
            // Return a fallback structure
            return {
              hostname: url.split('/')[0],
              pathname: '/' + url.split('/').slice(1).join('/'),
              search: '',
              hash: ''
            };
          }
        };
        
        const parsedUrl1 = parseUrl(url1);
        const parsedUrl2 = parseUrl(url2);
        
        // Debug log
        console.log('URL COMPARE DETAILS:', {
          url1: { original: url1, parsed: parsedUrl1 },
          url2: { original: url2, parsed: parsedUrl2 }
        });
        
        // Special case: If either URL is localhost, only compare paths
        const isLocalhost1 = parsedUrl1.hostname.includes('localhost') || parsedUrl1.hostname.includes('127.0.0.1');
        const isLocalhost2 = parsedUrl2.hostname.includes('localhost') || parsedUrl2.hostname.includes('127.0.0.1');
        
        // If one is localhost and the other isn't, ignore hostname comparison
        if (isLocalhost1 || isLocalhost2) {
          // When using localhost, paths must still match exactly
          const pathsMatch = parsedUrl1.pathname === parsedUrl2.pathname;
          console.log('URL COMPARE RESULT (localhost mode):', { 
            pathsMatch,
            path1: parsedUrl1.pathname, 
            path2: parsedUrl2.pathname 
          });
          return pathsMatch;
        }
        
        // For non-localhost URLs, compare both hostname and pathname
        const hostnameMatch = parsedUrl1.hostname.toLowerCase() === parsedUrl2.hostname.toLowerCase();
        const pathMatch = parsedUrl1.pathname === parsedUrl2.pathname;
        const result = hostnameMatch && pathMatch;
        
        console.log('URL COMPARE RESULT (standard mode):', { 
          result, 
          hostnameMatch, 
          pathMatch,
          hostname1: parsedUrl1.hostname,
          hostname2: parsedUrl2.hostname,
          path1: parsedUrl1.pathname, 
          path2: parsedUrl2.pathname 
        });
        
        return result;
      } catch (error) {
        console.error('Error comparing URLs:', error);
        
        // Fallback to simple string comparison if URL parsing fails
        const fallbackResult = url1.toLowerCase() === url2.toLowerCase();
        console.log('URL COMPARE FALLBACK RESULT:', fallbackResult);
        return fallbackResult;
      }
    }
  
    static highlightElement(element: HTMLElement): void {
      if (!element) return;
      
      // Add highlight class to element
      element.classList.add('hyphen-highlighted-element');
    }
  
    static removeHighlight(element: HTMLElement): void {
      if (!element) return;
      
      // Remove highlight class from element
      element.classList.remove('hyphen-highlighted-element');
    }
  
    // Helper methods
    static ensureContainsSelector(): void {
      // Add :contains polyfill if needed
    }
  
    static querySelectorAllWithText(selector: string, text: string, exact: boolean = true): Element[] {
      try {
        // Get all elements matching the selector
        const elements = Array.from(document.querySelectorAll(selector));
        
        // Filter by text content
        return elements.filter(el => {
          const elementText = el.textContent?.trim() || '';
          const searchText = text.trim();
          
          // Also check for value attribute (buttons, inputs)
          const valueText = el.getAttribute('value')?.trim() || '';
          
          if (exact) {
            return elementText === searchText || valueText === searchText;
          } else {
            return elementText.toLowerCase().includes(searchText.toLowerCase()) || 
                   valueText.toLowerCase().includes(searchText.toLowerCase());
          }
        });
      } catch (e) {
        console.error('Error in querySelectorAllWithText:', e);
        return [];
      }
    }
  
    static isElementInView(element: HTMLElement): boolean {
      if (!element) return false;
      
      const rect = element.getBoundingClientRect();
      
      return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
      );
    }
  
    static scrollToElement(element: HTMLElement): Promise<void> {
      return new Promise((resolve) => {
        if (!element) {
          resolve();
          return;
        }
        
        // Check if element exists in DOM
        if (!document.body.contains(element)) {
          console.warn('Element not found in DOM for scrolling');
          resolve();
          return;
        }
        
        // Get element's position relative to the viewport
        const rect = element.getBoundingClientRect();
        
        // Calculate if element is in view
        const isInView = (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
        
        if (isInView) {
          // Already in view, no need to scroll
          resolve();
          return;
        }
        
        // Use scrollIntoView with smooth behavior
        try {
          // Check if scrollIntoView is supported with options
          element.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
          
          // Set up a timeout to catch when scrolling is likely done
          const scrollTimeout = setTimeout(() => {
            // Re-check position after scrolling
            const newRect = element.getBoundingClientRect();
            if (newRect.top < 0 || newRect.bottom > window.innerHeight) {
              // If still not fully in view, try a different approach
              const elemTop = newRect.top + window.scrollY;
              const middle = elemTop - (window.innerHeight / 2) + (newRect.height / 2);
              window.scrollTo({
                top: middle,
                behavior: 'smooth'
              });
            }
            resolve();
          }, 800); // Wait longer than the animation time
          
          // Also resolve on scroll end if possible
          let scrollCount = 0;
          const scrollEndDetection = () => {
            scrollCount++;
            if (scrollCount > 5) {
              clearTimeout(scrollTimeout);
              window.removeEventListener('scroll', scrollEndDetection);
              resolve();
            }
          };
          
          window.addEventListener('scroll', scrollEndDetection, { passive: true });
        } catch (e) {
          // Fallback for browsers that don't support smooth scrolling
          const elemTop = rect.top + window.scrollY;
          const middle = elemTop - (window.innerHeight / 2) + (rect.height / 2);
          window.scrollTo(0, middle);
          setTimeout(resolve, 100);
        }
      });
    }
  
    static findMantineInput(placeholder: string): HTMLElement | null {
      console.log(`[MANTINE-FINDER] Looking for input with placeholder: "${placeholder}"`);
      
      // Try different search strategies from most specific to least
      
      // 1. Direct placeholder attribute
      let inputs = Array.from(document.querySelectorAll(`input[placeholder="${placeholder}"]`));
      console.log(`[MANTINE-FINDER] Found ${inputs.length} inputs with direct placeholder match`);
      
      if (inputs.length > 0) {
        return inputs[0] as HTMLElement;
      }
      
      // 2. Look inside modals/portals specifically
      const portals = document.querySelectorAll('[data-portal="true"]');
      for (const portal of portals) {
        inputs = Array.from(portal.querySelectorAll(`input[placeholder="${placeholder}"]`));
        console.log(`[MANTINE-FINDER] Found ${inputs.length} inputs in portal with placeholder match`);
        
        if (inputs.length > 0) {
          return inputs[0] as HTMLElement;
        }
        
        // Try by class pattern for Mantine
        const mantineInputs = Array.from(portal.querySelectorAll('input[class*="mantine-Input-input"]'));
        console.log(`[MANTINE-FINDER] Found ${mantineInputs.length} Mantine inputs in portal`);
        
        for (const input of mantineInputs) {
          if (input.getAttribute('placeholder') === placeholder) {
            console.log('[MANTINE-FINDER] Found matching Mantine input by class + placeholder');
            return input as HTMLElement;
          }
          
          // Log all found inputs for debugging
          console.log('[MANTINE-FINDER] Portal input:', {
            placeholder: input.getAttribute('placeholder'),
            id: input.id,
            classes: input.className
          });
        }
      }
      
      // 3. Find Mantine inputs by class
      const allMantineInputs = document.querySelectorAll('input[class*="mantine-Input-input"]');
      console.log(`[MANTINE-FINDER] Found ${allMantineInputs.length} total Mantine inputs in document`);
      
      for (const input of allMantineInputs) {
        // Log all for debugging
        console.log('[MANTINE-FINDER] Mantine input:', {
          placeholder: input.getAttribute('placeholder'),
          id: input.id,
          classes: input.className,
          visible: (input as HTMLElement).offsetParent !== null
        });
        
        if (input.getAttribute('placeholder') === placeholder) {
          return input as HTMLElement;
        }
      }
      
      console.log('[MANTINE-FINDER] No matching input found');
      return null;
    }
  
    static waitForPortalStability(): Promise<void> {
      return new Promise(resolve => {
        console.log('[PORTAL-WAIT] Starting portal stability monitoring');
        
        // First check if portals exist
        const initialPortals = document.querySelectorAll('[data-portal="true"]');
        
        if (initialPortals.length === 0) {
          console.log('[PORTAL-WAIT] No portals detected, resolving immediately');
          resolve();
          return;
        }
        
        // Track portal state
        let stableCount = 0;
        let lastPortalCount = initialPortals.length;
        let lastModalStructure = '';
        let attempts = 0;
        const MAX_ATTEMPTS = 30;
        
        const checkPortalStability = () => {
          attempts++;
          
          const portals = document.querySelectorAll('[data-portal="true"]');
          const modals = document.querySelectorAll('.mantine-Modal-content, [role="dialog"]');
          
          // Get a string representation of modal structure to detect changes
          const modalStructure = Array.from(modals).map(modal => {
            const rect = modal.getBoundingClientRect();
            return `${modal.className}:${rect.width}x${rect.height}:${modal.children.length}`;
          }).join('|');
          
          console.log(`[PORTAL-WAIT] Check #${attempts}: ${portals.length} portals, ${modals.length} modals`);
          
          // Check if portal count and modal structure have stabilized
          if (portals.length === lastPortalCount && modalStructure === lastModalStructure) {
            stableCount++;
            console.log(`[PORTAL-WAIT] Portal structure stable for ${stableCount} checks`);
            
            if (stableCount >= 3 || attempts >= MAX_ATTEMPTS) {
              console.log('[PORTAL-WAIT] Portal structure has stabilized, resolving');
              resolve();
              return;
            }
          } else {
            // Reset stability counter if anything changed
            stableCount = 0;
            lastPortalCount = portals.length;
            lastModalStructure = modalStructure;
            console.log('[PORTAL-WAIT] Portal structure changed, resetting stability counter');
          }
          
          // Continue checking if not stable yet and not exceeded max attempts
          if (attempts < MAX_ATTEMPTS) {
            setTimeout(checkPortalStability, 100);
          } else {
            console.log('[PORTAL-WAIT] Max attempts reached, resolving anyway');
            resolve();
          }
        };
        
        // Start checking after a small initial delay to allow animations to start
        setTimeout(checkPortalStability, 200);
      });
    }
  
    // Add this helper function before the class methods
    private static isTextMatch(element: HTMLElement, targetText: string | undefined): boolean {
      if (!targetText) return true;
      const elementText = element.textContent?.trim() || '';
      const searchText = targetText.trim();
      
      // First try exact match
      if (elementText === searchText) return true;
      
      // If that fails, check if the element contains the text
      return elementText.includes(searchText);
    }
  
    // Helper function to get element path
    static getElementPath(element: HTMLElement): string {
      if (!element) return '';
      
      let path = '';
      let currentElement: HTMLElement | null = element;
      
      while (currentElement && currentElement !== document.body) {
        let selector = currentElement.tagName.toLowerCase();
        
        if (currentElement.id) {
          selector += `#${currentElement.id}`;
        } else if (currentElement.className) {
          const classes = currentElement.className.split(' ')
            .filter(c => c)
            .map(c => `.${c}`)
            .join('');
          selector += classes;
        }
        
        path = path ? `${selector} > ${path}` : selector;
        currentElement = currentElement.parentElement;
      }
      
      return path;
    }
}