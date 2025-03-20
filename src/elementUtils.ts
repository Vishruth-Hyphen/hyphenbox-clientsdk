export class ElementUtils {
    static findElementFromInteraction(interaction: any, requireExactMatch: boolean = true): HTMLElement | null {
      if (!interaction) {
        console.error("Invalid interaction data", interaction);
        return null;
      }

      console.log('Finding element for interaction:', interaction);
      
      try {
        let element = null;
        
        // Strategy 1: Try by selector if provided
        if (interaction.selector) {
          try {
            element = document.querySelector(interaction.selector) as HTMLElement;
            if (element) {
              console.log('Found element by selector');
            }
          } catch (e) {
            console.warn('Invalid selector', interaction.selector, e);
          }
        }
        
        // Strategy 2: Try by text content
        if ((!element || requireExactMatch) && interaction.text) {
          const textContent = interaction.text.trim();
          
          // Try exact text match on buttons and links
          const textElements = this.querySelectorAllWithText('a, button, [role="button"], .btn', textContent, true);
          
          if (textElements.length === 1) {
            console.log('Found element by exact text match');
            element = textElements[0] as HTMLElement;
          } else if (textElements.length > 1) {
            // Multiple matches, try to find the most visible one
            console.log('Found multiple elements with text:', textContent);
            // Just take the first one for simplicity
            element = textElements[0] as HTMLElement;
          } else if (!requireExactMatch) {
            // Try partial text match if exact match not required
            const partialMatches = this.querySelectorAllWithText('a, button, [role="button"], .btn', textContent, false);
            if (partialMatches.length > 0) {
              console.log('Found element by partial text match');
              element = partialMatches[0] as HTMLElement;
            }
          }
        }
        
        // Strategy 3: If still not found and not requiring exact match, try broader search
        if (!element && !requireExactMatch && interaction.text) {
          const elements = this.querySelectorAllWithText('*', interaction.text, false);
          if (elements.length > 0) {
            console.log('Found element by broader text search');
            element = elements[0] as HTMLElement;
          }
        }
        
        if (!element) {
          console.warn('Could not find element for', interaction);
        }
        
        return element;
      } catch (error) {
        console.error("Error finding element:", error);
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
  }