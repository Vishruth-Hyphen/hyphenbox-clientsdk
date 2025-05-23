/*
This file contains UI components for CursorFlow Execution only.
Things related to highlgiht, curosr position, tootlip, hihglightBox and notification etc..
*/
import crazeArrow from '../assets/arrowhead.svg';
import hyphenboxSvg from '../assets/hyphenbox.svg';
import { ThemeOptions, NotificationOptions, ErrorNotificationOptions, RedirectNotificationOptions } from './types';

console.log('[SVG-DEBUG] Loaded hyphenbox SVG:', hyphenboxSvg.substring(0, 100) + '...');

interface EnhancedHTMLElement extends HTMLElement {
  [key: string]: any; // Allow any string property
}

// Define EnhancedGuidanceCard at the top level
interface EnhancedGuidanceCard extends HTMLElement {
    _hyphenAnchorElement?: HTMLElement | null;
    _scrollResizeHandler?: () => void;
    _observer?: MutationObserver;
    _rAfId?: number;
    _mutationDebounceTimeout?: number;
}

export class CursorFlowUI {
  // Add these class variables to track scroll handlers
  private static cursorScrollHandler: EventListener | null = null;
  private static highlightScrollHandler: EventListener | null = null;

  static createStartButton(text: string, color: string, onClick: () => void, theme: ThemeOptions = {}): HTMLElement {
    console.log('[BUTTON-DEBUG] Creating start button with text:', text);
    const button = document.createElement('button');
    button.className = 'hyphen-start-button';
    
    const iconContainer = document.createElement('div');
    iconContainer.className = 'hyphen-icon';
    iconContainer.style.display = 'flex';
    iconContainer.style.alignItems = 'center';
    iconContainer.style.width = '24px'; // Set fixed size for consistency
    iconContainer.style.height = '24px';
    iconContainer.style.minWidth = '24px';

    // Use customer logo if available, otherwise no icon
    if (theme.logo_url) {
        console.log('[BUTTON-DEBUG] Using customer logo URL for button icon:', theme.logo_url);
        const logoImg = document.createElement('img');
        logoImg.src = theme.logo_url;
        logoImg.alt = theme.cursor_company_label || 'Logo'; // Use company label or default alt
        logoImg.style.cssText = `
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        `;
        logoImg.addEventListener('error', () => {
             console.warn('[BUTTON-DEBUG] Failed to load customer logo for button icon:', theme.logo_url);
             iconContainer.innerHTML = ''; // Clear icon on error
        });
        iconContainer.appendChild(logoImg);
    } else {
        console.log('[BUTTON-DEBUG] No customer logo URL provided. Button will have no icon.');
        // iconContainer remains empty
    }
    
    // Create button content structure
    button.innerHTML = `
        <div class="hyphen-button-content" style="display: flex; align-items: center; gap: 8px;">
            ${iconContainer.outerHTML} 
            <span class="hyphen-text" style="white-space: nowrap;">${text}</span>
        </div>
    `;
    
    // Find the inserted icon container to potentially adjust later if needed
    const finalIconContainer = button.querySelector('.hyphen-icon');
    // Note: Adjustments to SVG size are removed as we now use <img> or nothing.
    if (finalIconContainer && finalIconContainer.hasChildNodes()) {
        // Potentially add styles to the container if needed
    } else {
        console.warn('[BUTTON-DEBUG] Icon container is empty or not found after setting innerHTML');
    }
    
    // Modern styling with adjusted padding for icon
    button.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        padding: 10px 16px;
        background-color: #ffffff;
        color: #1a1a1a;
        border: none;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        box-shadow: 0 2px 12px rgba(0,0,0,0.1);
        z-index: 9999;
        display: flex;
        align-items: center;
        transition: all 0.2s ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        min-height: 40px;
    `;

    // Add hover effect
    button.addEventListener('mouseover', () => {
        button.style.transform = 'translateY(-2px)';
        button.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)';
    });
    
    button.addEventListener('mouseout', () => {
        button.style.transform = 'translateY(0)';
        button.style.boxShadow = '0 2px 12px rgba(0,0,0,0.1)';
    });

    // Add click handler
    button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof onClick === 'function') {
            onClick();
        }
    });

    // Make draggable
    this.makeDraggable(button);
    
    return button;
  }
  
  /**
   * Make an element draggable
   */
  private static makeDraggable(element: HTMLElement): void {
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    let startPosition = { x: 0, y: 0 };
    
    // Add a drag handle/indicator
    const dragIndicator = document.createElement('div');
    dragIndicator.style.position = 'absolute';
    dragIndicator.style.top = '3px';
    dragIndicator.style.left = '3px';
    dragIndicator.style.width = '10px';
    dragIndicator.style.height = '10px';
    dragIndicator.style.borderRadius = '50%';
    dragIndicator.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
    dragIndicator.style.cursor = 'move';
    dragIndicator.title = 'Drag to move';
    
    // Append the drag indicator to the element
    element.appendChild(dragIndicator);
    
    // Add a CSS class to show we're in dragging mode
    element.classList.add('hyphen-draggable');
    
    // Define event handlers (keep references to remove them later)
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      // Calculate new position
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
      
      // Use the viewport dimensions to ensure the button stays within visible area
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const buttonWidth = element.offsetWidth;
      const buttonHeight = element.offsetHeight;
      
      // Calculate the bounds (keep button within viewport)
      const minX = 0;
      const maxX = viewportWidth - buttonWidth;
      const minY = 0;
      const maxY = viewportHeight - buttonHeight;
      
      // Apply bounds
      const boundedX = Math.max(minX, Math.min(maxX, x));
      const boundedY = Math.max(minY, Math.min(maxY, y));
      
      // Update the position
      // We need to decide whether to use left/right and top/bottom
      // For simplicity, use left/top positioning
      element.style.left = `${boundedX}px`;
      element.style.top = `${boundedY}px`;
      
      // Remove the original right/bottom positioning
      element.style.removeProperty('right');
      element.style.removeProperty('bottom');
    };
    
    const handleMouseUp = () => {
      if (!isDragging) return;
      
      // Stop dragging
      isDragging = false;
      
      // Reset visual styles
      element.style.opacity = '1';
      element.style.transition = 'opacity 0.2s ease';
      
      // Save the position for future sessions
      try {
        const rect = element.getBoundingClientRect();
        const position = {
          left: `${rect.left}px`,
          top: `${rect.top}px`
        };
        localStorage.setItem('hyphen-button-position', JSON.stringify(position));
      } catch (e) {
        console.warn('Failed to save button position', e);
      }
      
      // Remove global event listeners
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    // Mouse down event - start dragging
    dragIndicator.addEventListener('mousedown', (e) => {
      isDragging = true;
      
      // Get element's current position
      const rect = element.getBoundingClientRect();
      
      // Calculate cursor offset relative to the element
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      
      // Record original positions to compute deltas
      startPosition = {
        x: e.clientX,
        y: e.clientY
      };
      
      // Add visual indicator that we're dragging
      element.style.opacity = '0.8';
      element.style.transition = 'none';
      
      // Add global event listeners
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      // Prevent text selection during drag
      e.preventDefault();
    });
    
    // Store these functions so they can be removed when the element is destroyed
    (element as any)._hyphenDragHandlers = {
      mouseMove: handleMouseMove,
      mouseUp: handleMouseUp
    };
  }

  // Helper function to adjust color brightness
  static adjustColor(color: string, amount: number): string {
    const colorObj = new (window as any).Option().style;
    colorObj.color = color;
    
    if (!colorObj.color) return color;
    
    // Convert to hex if not already
    let hex = colorObj.color;
    if (hex.startsWith('rgb')) {
      const rgb = hex.match(/\d+/g)?.map(Number);
      if (!rgb) return color;
      hex = '#' + rgb.map((c: number) => {
        const newC = Math.max(0, Math.min(255, c + amount));
        return newC.toString(16).padStart(2, '0');
      }).join('');
    }
    
    return hex;
  }

  static createCursor(theme: ThemeOptions, isThinking: boolean = false): HTMLElement {
    const cursorWrapper = document.createElement('div');
    cursorWrapper.className = 'hyphen-cursor-container';
    if (isThinking) {
        cursorWrapper.classList.add('hyphen-thinking');
    }
    cursorWrapper.style.cssText = `
        position: absolute;
        display: inline-flex;
        align-items: center;
        pointer-events: none;
        z-index: 9999;
        transform-origin: top left;
    `;

    // Create the cursor element
    const cursor = document.createElement('div');
    cursor.className = 'hyphen-cursor';
    cursor.innerHTML = crazeArrow; // Use the default arrow SVG
    cursor.style.cssText = `
        position: relative;
        pointer-events: none;
        display: flex;
        align-items: center;
        transform: translate(-1px, -1px);
    `;

    // Create the company label
    const companyLabel = document.createElement('div');
    companyLabel.className = 'hyphen-company-label';
    companyLabel.textContent = isThinking ? 'Thinking...' : (theme.cursor_company_label || '');
    
    // Base styles for label - apply background/color later if theme exists
    companyLabel.style.cssText = `
        background-color: transparent;
        color: transparent; /* Hide text initially */
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        margin-left: -2px;
        white-space: nowrap;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        transform: translateY(2px);
        transition: background-color 0.2s, color 0.2s; /* Add transition */
    `;

    // Apply theme color IF brand_color exists
    if (theme.brand_color) {
        const brandColor = theme.brand_color;
        // Apply background to label only if text exists
        if (companyLabel.textContent) {
          companyLabel.style.backgroundColor = brandColor;
          companyLabel.style.color = 'white'; // Make text visible
        }

        // Apply color to SVG paths
        const paths = cursor.querySelectorAll('path');
        paths.forEach(path => {
            // Assuming the default SVG uses #FF6B00, replace it with the theme color
            if (path.getAttribute('fill')?.toUpperCase() === '#FF6B00') { 
                path.setAttribute('fill', brandColor);
            }
        });
    } else {
        // No brand color - ensure label remains transparent/hidden if no text
        if (!companyLabel.textContent) {
            companyLabel.style.display = 'none'; // Hide label entirely if no text and no color
        }
         // Keep default SVG color if no brand_color
    }

    // Add cursor and label to wrapper
    cursorWrapper.appendChild(cursor);
    cursorWrapper.appendChild(companyLabel);

    return cursorWrapper;
  }

  static createHighlight(theme: ThemeOptions): HTMLElement {
    const highlight = document.createElement('div');
    highlight.className = 'hyphen-highlight';
    highlight.id = 'hyphenbox-highlight';
    
    // Set styles for the highlight
    highlight.style.position = 'absolute';
    highlight.style.top = '0';
    highlight.style.left = '0';
    highlight.style.width = 'calc(100% + 6px)';
    highlight.style.height = 'calc(100% + 6px)';
    highlight.style.transform = 'translate(-3px, -3px)';
    highlight.style.pointerEvents = 'none';
    highlight.style.zIndex = '9995';
    highlight.style.borderRadius = '3px';
    highlight.style.boxSizing = 'border-box';
    // Default to no border/background
    highlight.style.border = 'none'; 
    highlight.style.backgroundColor = 'transparent'; 

    // Apply styling only if brand_color is provided
    if (theme.brand_color) {
        const borderColor = theme.brand_color;
        let backgroundColor = 'transparent'; // Start with transparent
        try {
            // Attempt to convert hex/rgb to rgba with low alpha
            let r=0, g=0, b=0;
            if (borderColor.startsWith('#')) {
                const bigint = parseInt(borderColor.slice(1), 16);
                r = (bigint >> 16) & 255;
                g = (bigint >> 8) & 255;
                b = bigint & 255;
                backgroundColor = `rgba(${r}, ${g}, ${b}, 0.1)`; // Use 10% opacity
            } else if (borderColor.startsWith('rgb')) {
                 const match = borderColor.match(/\d+/g);
                 if (match && match.length >= 3) {
                    r = parseInt(match[0]);
                    g = parseInt(match[1]);
                    b = parseInt(match[2]);
                    backgroundColor = `rgba(${r}, ${g}, ${b}, 0.1)`; // Use 10% opacity
                 }
            }
             // Set border and background if derived successfully
            highlight.style.border = `2px solid ${borderColor}`;
            highlight.style.backgroundColor = backgroundColor;
        } catch (e) {
            console.warn('[Highlight] Could not parse brand_color. Highlight will have no background/border.', e);
            // Keep border/background as none/transparent if parsing fails
        }
    } else {
        console.warn('[Highlight] No brand_color provided. Highlight will have no background/border.');
    }
    
    return highlight;
  }

  static createTextPopup(text: string, theme: ThemeOptions): HTMLElement {
    console.log('[CursorFlowUI] createTextPopup called with params:', { text: text.substring(0, 30) + '...', themeKeys: Object.keys(theme || {}) });
    
    const popup = document.createElement('div');
    popup.className = 'hyphen-text-popup';
    popup.id = 'hyphenbox-text-popup';  // Updated ID

    // Create the text content
    const textContainer = document.createElement('div');
    textContainer.className = 'hyphen-popup-content';
    textContainer.textContent = text;
    
    // Set styles for popup
    popup.style.position = 'absolute';
    popup.style.background = 'white';
    popup.style.padding = '12px';
    popup.style.borderRadius = '8px';
    popup.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
    popup.style.maxWidth = '300px';
    popup.style.zIndex = '9999'; // Keep zIndex high for tooltips
    popup.style.fontSize = '14px';
    popup.style.lineHeight = '1.4';
    popup.style.color = '#333';
    popup.style.wordWrap = 'break-word';
    popup.style.wordBreak = 'normal'; // Use normal to prevent awkward breaks
    
    // Add the text content to the popup
    popup.appendChild(textContainer);
    
    console.log('[CursorFlowUI] Basic text-only popup created with ID:', popup.id);
    // Button creation logic removed
    
    console.log('[CursorFlowUI] Final text-only popup structure:', popup.outerHTML.substring(0, 200) + '...');
    return popup;
  }

  static createGuidanceCard(text: string, isLastStep: boolean, theme: ThemeOptions): HTMLElement {
    console.log('[CursorFlowUI] createGuidanceCard called with params:', { text: text.substring(0, 30) + '...', isLastStep, themeKeys: Object.keys(theme || {}) });

    const card = document.createElement('div');
    card.className = 'hyphen-guidance-card';
    card.id = 'hyphen-guidance-card'; // Unique ID for the card

    card.style.position = 'fixed'; // Default to fixed, will be overridden if placed near highlight
    card.style.backgroundColor = 'white';
    card.style.padding = '20px';
    card.style.borderRadius = '12px';
    card.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    card.style.maxWidth = '450px'; // Slightly wider for card feel
    card.style.minWidth = '300px';
    card.style.zIndex = '10000'; // High zIndex
    card.style.fontSize = '14px';
    card.style.lineHeight = '1.5';
    card.style.color = '#333';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '15px'; // Space between text and button container
    card.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    const textContainer = document.createElement('div');
    textContainer.className = 'hyphen-guidance-text';
    textContainer.textContent = text;
    textContainer.style.wordWrap = 'break-word';

    const actionContainer = document.createElement('div');
    actionContainer.className = 'hyphen-guidance-actions';
    actionContainer.style.display = 'flex';
    actionContainer.style.justifyContent = 'flex-end'; // Align button to the right

    const stepButton = document.createElement('button');
    stepButton.textContent = isLastStep ? 'Finish' : 'Next';
    // Add specific classes for easier selection later
    stepButton.className = isLastStep ? 'hyphen-finish-button hyphen-cta-button' : 'hyphen-next-button hyphen-cta-button';
    stepButton.type = 'button';

    const importantStyles = {
        'display': 'inline-block', // Changed to inline-block
        'padding': '10px 20px',
        'border': 'none',
        'border-radius': '8px',
        'cursor': 'pointer',
        'background-color': theme.brand_color || '#007bff',
        'color': 'white',
        'font-size': '14px',
        'font-weight': '600',
        'text-align': 'center',
        'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'margin': '0',
        'line-height': '1.5',
        'text-decoration': 'none',
        'transition': 'background-color 0.2s ease, box-shadow 0.2s ease'
    };

    Object.entries(importantStyles).forEach(([property, value]) => {
        stepButton.style.setProperty(property, value, 'important');
    });
    stepButton.style.setProperty('box-shadow', '0 2px 4px rgba(0,0,0,0.1)', 'important');

    if ((theme.brand_color || '#007bff').toLowerCase() === '#ffffff' || (theme.brand_color || '#007bff').toLowerCase() === 'white') {
        stepButton.style.setProperty('color', '#333333', 'important');
        stepButton.style.setProperty('border', '1px solid #cccccc', 'important');
    }

    stepButton.addEventListener('mouseenter', () => {
        stepButton.style.setProperty('box-shadow', '0 4px 8px rgba(0,0,0,0.15)', 'important');
        // Consider adjusting brightness slightly on hover, e.g., using a helper
        // stepButton.style.setProperty('background-color', this.adjustColor(theme.brand_color || '#007bff', -20), 'important');

    });
    stepButton.addEventListener('mouseleave', () => {
        stepButton.style.setProperty('box-shadow', '0 2px 4px rgba(0,0,0,0.1)', 'important');
        // stepButton.style.setProperty('background-color', theme.brand_color || '#007bff', 'important');
    });

    actionContainer.appendChild(stepButton);

    card.appendChild(textContainer);
    card.appendChild(actionContainer);

    // Entrance animation for the card - will be triggered after positioning
    // card.animate([
    //     { opacity: 0, transform: 'translateX(-50%) translateY(20px)' },
    //     { opacity: 1, transform: 'translateX(-50%) translateY(0)' }
    // ], {
    //     duration: 300,
    //     easing: 'ease-out'
    // });

    console.log('[CursorFlowUI] Guidance card created (pre-positioning):', card.outerHTML.substring(0, 250) + '...');
    return card;
  }

  static positionGuidanceCard(guidanceCard: HTMLElement, highlightElement: HTMLElement | null): void {
    if (!guidanceCard) return;

    // EnhancedHTMLElement for storing custom properties
    // interface EnhancedGuidanceCard extends HTMLElement { ... } // REMOVED local definition

    const card = guidanceCard as EnhancedGuidanceCard;

    // --- Cleanup previous dynamic tracking if any ---
    if (card._scrollResizeHandler) {
        window.removeEventListener('scroll', card._scrollResizeHandler);
        window.removeEventListener('resize', card._scrollResizeHandler);
        window.removeEventListener('orientationchange', card._scrollResizeHandler);
        card._scrollResizeHandler = undefined;
    }
    if (card._observer) {
        card._observer.disconnect();
        card._observer = undefined;
    }
    if (card._rAfId) {
        cancelAnimationFrame(card._rAfId);
        card._rAfId = undefined;
    }
    if (card._mutationDebounceTimeout) {
        clearTimeout(card._mutationDebounceTimeout);
        card._mutationDebounceTimeout = undefined;
    }
    // --- End Cleanup ---

    card._hyphenAnchorElement = highlightElement;

    const updateCardPositionLogic = () => {
        if (!document.body.contains(card)) { // Card might have been removed
            // Ensure cleanup if card is no longer in DOM
            if (card._scrollResizeHandler) window.removeEventListener('scroll', card._scrollResizeHandler);
            if (card._scrollResizeHandler) window.removeEventListener('resize', card._scrollResizeHandler);
            if (card._scrollResizeHandler) window.removeEventListener('orientationchange', card._scrollResizeHandler);
            if (card._observer) card._observer.disconnect();
            if (card._rAfId) cancelAnimationFrame(card._rAfId);
            if (card._mutationDebounceTimeout) clearTimeout(card._mutationDebounceTimeout);
            return;
        }

        const GAP = 15;
        // Ensure card is measurable (briefly visible off-screen if needed, but usually appending is enough)
        // card.style.visibility = 'hidden'; card.style.position = 'fixed'; card.style.left = '-9999px';
        const cardRect = card.getBoundingClientRect();
        // card.style.visibility = ''; card.style.position = ''; card.style.left = '';

        let bestPosition: { top: number; left: number; positionType: 'absolute' | 'fixed'; transform?: string } | null = null;
        const currentAnchor = card._hyphenAnchorElement;

        if (currentAnchor && document.body.contains(currentAnchor)) {
            const highlightRect = currentAnchor.getBoundingClientRect();
            const scrollX = window.scrollX || window.pageXOffset;
            const scrollY = window.scrollY || window.pageYOffset;

            const positions = [
                { type: 'right', top: highlightRect.top + scrollY + (highlightRect.height / 2) - (cardRect.height / 2), left: highlightRect.right + scrollX + GAP, pos: 'absolute' as 'absolute' },
                { type: 'left', top: highlightRect.top + scrollY + (highlightRect.height / 2) - (cardRect.height / 2), left: highlightRect.left + scrollX - cardRect.width - GAP, pos: 'absolute' as 'absolute' },
                { type: 'bottom', top: highlightRect.bottom + scrollY + GAP, left: highlightRect.left + scrollX + (highlightRect.width / 2) - (cardRect.width / 2), pos: 'absolute' as 'absolute' },
                { type: 'top', top: highlightRect.top + scrollY - cardRect.height - GAP, left: highlightRect.left + scrollX + (highlightRect.width / 2) - (cardRect.width / 2), pos: 'absolute' as 'absolute' }
            ];

            for (const pos of positions) {
                if (pos.top - scrollY >= 0 && pos.left - scrollX >= 0 && (pos.top - scrollY + cardRect.height) <= window.innerHeight && (pos.left - scrollX + cardRect.width) <= window.innerWidth) {
                    bestPosition = { top: pos.top, left: pos.left, positionType: pos.pos };
                    break;
                }
            }
        }

        const currentCardPosition = card.style.position;
        const currentCardTop = card.style.top;
        const currentCardLeft = card.style.left;
        const currentCardBottom = card.style.bottom;
        const currentCardTransform = card.style.transform;

        let positionChanged = false;

        if (bestPosition) {
            if (card.style.position !== bestPosition.positionType || card.style.top !== `${bestPosition.top}px` || card.style.left !== `${bestPosition.left}px`) {
                card.style.position = bestPosition.positionType;
                card.style.top = `${bestPosition.top}px`;
                card.style.left = `${bestPosition.left}px`;
                card.style.bottom = 'auto';
                card.style.right = 'auto';
                card.style.transform = bestPosition.transform || 'none';
                positionChanged = true;
            }
             if (card.style.opacity !== '1') card.style.opacity = '1'; // Ensure visible
        } else {
            // Fallback: screen bottom-center
            const fallbackPosition = { pos: 'fixed' as 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)' };
            if (card.style.position !== fallbackPosition.pos || card.style.bottom !== fallbackPosition.bottom || card.style.left !== fallbackPosition.left || card.style.transform !== fallbackPosition.transform) {
                card.style.position = fallbackPosition.pos;
                card.style.bottom = fallbackPosition.bottom;
                card.style.left = fallbackPosition.left;
                card.style.top = 'auto';
                card.style.right = 'auto';
                card.style.transform = fallbackPosition.transform;
                positionChanged = true;
            }
             if (card.style.opacity !== '1') card.style.opacity = '1'; // Ensure visible
        }
        
        // Trigger animation only if it's the first time or position actually changed
        // For simplicity, we can check if an animation is already running or just animate once on setup.
        // The current logic in the original function animates every time.
        // Let's assume animation is desired on first positioning or significant change.
        // A more robust way would be to check if new position is significantly different.
        // For now, let's animate based on the positionChanged flag.
        if (positionChanged && !card.getAnimations().some(anim => anim.playState === 'running')) { // Animate if position changed and no animation is running
             const targetTransform = bestPosition ? (bestPosition.transform || 'none') : 'translateX(-50%)';
             const initialYOffset = bestPosition ? '10px' : '20px'; // Different offset for absolute vs fixed
             const finalYOffset = '0px';

            let initialTransform = targetTransform;
            if (targetTransform === 'none' || targetTransform === '') {
                initialTransform = `translateY(${initialYOffset})`;
            } else {
                 // Combine existing transform with translateY
                 // This is tricky; for simplicity, let's assume separate transforms for now or use a wrapper for animation.
                 // For now, if there's a horizontal transform, we'll just fade in.
                 if(targetTransform.includes('translateX')) {
                    initialTransform = `${targetTransform} translateY(${initialYOffset})`;
                 } else {
                    initialTransform = `translateY(${initialYOffset})`;
                 }
            }
            
            card.animate([
                { opacity: 0, transform: initialTransform },
                { opacity: 1, transform: targetTransform === 'none' ? `translateY(${finalYOffset})` : `${targetTransform} translateY(${finalYOffset})` }
            ], {
                duration: 300,
                easing: 'ease-out',
                fill: 'forwards' // Keep final state
            });
        } else if (card.style.opacity !== '1') {
            card.style.opacity = '1'; // Ensure visible if no animation
        }

    };

    // Initial position update
    updateCardPositionLogic();

    // --- Setup dynamic tracking ---
    const scrollResizeHandler = () => {
        if (card._rAfId) cancelAnimationFrame(card._rAfId);
        card._rAfId = requestAnimationFrame(() => {
            if (document.body.contains(card)) { // Only update if card is still in DOM
                updateCardPositionLogic();
            }
        });
    };
    card._scrollResizeHandler = scrollResizeHandler;

    window.addEventListener('scroll', scrollResizeHandler, { passive: true });
    window.addEventListener('resize', scrollResizeHandler, { passive: true });
    window.addEventListener('orientationchange', scrollResizeHandler);

    const observerCallback: MutationCallback = (mutationsList) => {
        if (card._mutationDebounceTimeout) clearTimeout(card._mutationDebounceTimeout);
        card._mutationDebounceTimeout = window.setTimeout(() => {
            if (document.body.contains(card)) { // Only update if card is still in DOM
                 console.log('[CursorFlowUI] Guidance card: Mutation detected, updating position.');
                 updateCardPositionLogic();
            }
        }, 50); // Debounce mutations slightly
    };
    card._observer = new MutationObserver(observerCallback);

    const observerConfig = { attributes: true, childList: true, subtree: true, characterData: true };
    if (card._hyphenAnchorElement && document.body.contains(card._hyphenAnchorElement)) {
        card._observer.observe(card._hyphenAnchorElement, observerConfig);
        if (card._hyphenAnchorElement.parentElement) {
            card._observer.observe(card._hyphenAnchorElement.parentElement, { childList: true, subtree: false });
        }
    }
    // Observe body for major layout shifts, but be cautious with subtree true on body.
    // Only observe direct children of body for additions/removals.
    card._observer.observe(document.body, { childList: true, subtree: false });
    console.log('[CursorFlowUI] Dynamic tracking setup for guidance card.');
  }

  static moveCursorToElement(element: HTMLElement, cursor: HTMLElement | null, interaction: any): void {
    if (!cursor) return;
    
    // Get or create cursor wrapper
    let wrapper = document.getElementById('hyphenbox-cursor-wrapper') as EnhancedHTMLElement;
    
    if (!wrapper) {
        // Create new wrapper only if it doesn't exist
        wrapper = document.createElement('div') as EnhancedHTMLElement;
        wrapper.className = 'hyphen-cursor-wrapper';
        wrapper.id = 'hyphenbox-cursor-wrapper';
        wrapper.style.position = 'absolute';
        wrapper.style.pointerEvents = 'none';
        wrapper.style.zIndex = '9999';
        wrapper.style.top = '0';
        wrapper.style.left = '0';
        wrapper.appendChild(cursor);
        document.body.appendChild(wrapper);
    }

    // IMPORTANT: Clean up previous observers and handlers before setting up new ones
    if (wrapper['observer']) {
        wrapper['observer'].disconnect();
        wrapper['observer'] = null;
    }
    if (wrapper['scrollHandler']) {
        window.removeEventListener('scroll', wrapper['scrollHandler']);
        window.removeEventListener('resize', wrapper['scrollHandler']);
        wrapper['scrollHandler'] = null;
    }
    if (wrapper['resizeHandler']) {
        window.removeEventListener('resize', wrapper['resizeHandler']);
        wrapper['resizeHandler'] = null;
    }
    
    // Store current target element reference
    wrapper['currentElement'] = element;
    
    // Add smooth transition for cursor movement
    cursor.style.transition = 'all 0.5s ease';
    cursor.style.position = 'absolute';
    
    // Position cursor at bottom right of element
    cursor.style.right = 'auto';
    cursor.style.bottom = 'auto';
    cursor.style.left = '100%';
    cursor.style.top = '100%';
    cursor.style.transform = 'translate(-8px, -8px)';
    
    // Log cursor position for debugging
    console.log('[CURSOR-DEBUG] Moving cursor to element:', {
        element: element.outerHTML.substring(0, 100),
        currentPosition: wrapper.style.transform,
        timestamp: new Date().getTime()
    });
    
    // Function to update the wrapper position with smooth animation
    const updatePosition = () => {
        // Only update position if this is still the current target element
        if (wrapper['currentElement'] !== element) {
            console.log('[CURSOR-DEBUG] Skipping position update - element is no longer current target');
            return;
        }

        const rect = element.getBoundingClientRect();
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;
        
        // Add transition to wrapper for smooth sliding
        wrapper.style.transition = 'transform 0.5s ease';
        wrapper.style.transform = `translate(${rect.left + scrollX}px, ${rect.top + scrollY}px)`;
        wrapper.style.width = `${rect.width}px`;
        wrapper.style.height = `${rect.height}px`;

        console.log('[CURSOR-DEBUG] Updated position for element:', {
            element: element.outerHTML.substring(0, 100),
            newPosition: wrapper.style.transform,
            timestamp: new Date().getTime()
        });
    };
    
    // Create a MutationObserver with debouncing to prevent rapid updates
    let debounceTimeout: any;
    const observer = new MutationObserver(() => {
        if (debounceTimeout) {
            clearTimeout(debounceTimeout);
        }
        debounceTimeout = setTimeout(() => {
            if (wrapper['currentElement'] === element) {
                updatePosition();
            }
        }, 100);
    });
    
    // Watch for changes to the element's attributes and children
    observer.observe(element, {
        attributes: true,
        childList: true,
        subtree: true
    });

    // ALSO Observe the parent for childList changes (detect sibling additions/removals)
    if (element.parentElement) {
        observer.observe(element.parentElement, {
            childList: true,
            subtree: false // Only direct children of the parent
        });
    }
    
    // Store the observer on the wrapper for later cleanup
    wrapper['observer'] = observer;
    
    // Update position immediately and then after a short delay to ensure rendering
    updatePosition();
    setTimeout(updatePosition, 100);
    
    // Create handlers for scroll and resize events with debouncing
    let scrollTimeout: any;
    const scrollHandler = () => {
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }
        scrollTimeout = setTimeout(() => {
            if (wrapper['currentElement'] === element) {
                updatePosition();
            }
        }, 100);
    };

    let resizeTimeout: any;
    const resizeHandler = () => {
        if (resizeTimeout) {
            clearTimeout(resizeTimeout);
        }
        resizeTimeout = setTimeout(() => {
            if (wrapper['currentElement'] === element) {
                updatePosition();
            }
        }, 100);
    };
    
    // Add event listeners
    window.addEventListener('scroll', scrollHandler, { passive: true });
    window.addEventListener('resize', resizeHandler, { passive: true });
    
    // Store the handlers on the wrapper for later cleanup
    wrapper['scrollHandler'] = scrollHandler;
    wrapper['resizeHandler'] = resizeHandler;
  }
  
  static positionTextPopupNearCursor(cursor: HTMLElement, popup: HTMLElement): void {
    if (!cursor || !popup) return;
    
    console.log('[TEXT-DEBUG] Positioning text popup near cursor');
    
    // Get the cursor wrapper
    const wrapper = document.getElementById('hyphenbox-cursor-wrapper');
    if (!wrapper) {
      console.error('[TEXT-DEBUG] Cursor wrapper not found');
      return;
    }
    
    // Clean up any existing text popup before adding the new one
    const existingPopup = document.getElementById('hyphenbox-text-popup');
    if (existingPopup && existingPopup.parentNode) {
      existingPopup.parentNode.removeChild(existingPopup);
    }
    
    // Add popup to the wrapper for relative positioning
    wrapper.appendChild(popup);
    
    // The cursor parameter is already the container with class 'hyphen-cursor-container'
    const cursorContainer = cursor.classList.contains('hyphen-cursor-container') ? 
      cursor : cursor.querySelector('.hyphen-cursor-container');

    if (!cursorContainer) {
      console.error('[TEXT-DEBUG] Cursor container not found');
      return;
    }
    
    // Store original text for streaming effect
    const originalText = popup.textContent || '';
    popup.textContent = '';
    
    // Get dimensions
    const containerRect = cursorContainer.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Style the popup - start with transparent until positioned
    popup.style.cssText = `
        position: absolute;
        z-index: 9998;
        background-color: #ffffff;
        border: 1px solid #e0e0e0;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        border-radius: 4px;
        padding: 8px 12px;
        min-width: 150px;
        max-width: 300px;
        width: max-content;
        white-space: normal;
        word-wrap: break-word;
        word-break: normal;
        opacity: 0;
        transition: opacity 0.3s ease;
        font-size: 14px;
        line-height: 1.4;
        color: #333333;
    `;
    
    // Position function that handles all four possible positions
    const positionPopup = () => {
      const popupRect = popup.getBoundingClientRect();
      const containerRect = cursorContainer.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      
      // Calculate position relative to the wrapper
      const containerTop = containerRect.top - wrapperRect.top;
      const containerLeft = containerRect.left - wrapperRect.left;
      const containerRight = containerLeft + containerRect.width;
      const containerBottom = containerTop + containerRect.height;
      
      // Calculate available space in each direction
      const spaceRight = viewportWidth - (wrapperRect.left + containerRight);
      const spaceBelow = viewportHeight - (wrapperRect.top + containerBottom);
      
      // Default position: bottom-right with padding
      popup.style.left = `${containerRight}px`;
      popup.style.top = `${containerBottom}px`;
      popup.style.transform = 'translate(-1px, -1px)';
      
      // If not enough space, adjust position
      if (spaceRight < popup.offsetWidth) {
        // Not enough space right, position to left
        popup.style.left = `${containerLeft}px`;
        popup.style.transform = 'translate(-100%, 4px)';
        popup.style.marginLeft = '-4px';
      }

      if (spaceBelow < popup.offsetHeight) {
        // Not enough space below, position above
        popup.style.top = `${containerTop}px`;
        popup.style.transform = `translate(${spaceRight < popup.offsetWidth ? '-100%' : '4px'}, -100%)`;
        popup.style.marginTop = '-4px';
      }
    };
    
    // Initial positioning
    setTimeout(positionPopup, 0);
    
    // Streaming text effect
    let charIndex = 0;
    const textLength = originalText.length;
    
    const streamText = () => {
      if (charIndex < textLength) {
        popup.textContent = originalText.substring(0, charIndex + 1);
        charIndex++;
        setTimeout(streamText, 30);
        
        // Recheck position periodically as text streams in
        if (charIndex === Math.floor(textLength * 0.25) || 
            charIndex === Math.floor(textLength * 0.5) || 
            charIndex === Math.floor(textLength * 0.75)) {
          positionPopup();
        }
      }
    };
    
    // Start the sequence after a short delay to ensure positioning
    setTimeout(() => {
      popup.style.opacity = '1';
      streamText();
    }, 500);
  }

  static showNotification(options: NotificationOptions): HTMLElement {
    const notification = document.createElement('div');
    notification.className = 'hyphen-notification';
    
    // Set basic styles
    notification.style.position = 'fixed';
    notification.style.zIndex = '10001';
    notification.style.padding = '12px 16px';
    notification.style.borderRadius = '4px';
    notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    notification.style.fontSize = '14px';
    notification.style.transition = 'all 0.3s ease';
    notification.style.maxWidth = '300px';
    notification.style.display = 'flex';  // Add flex display
    notification.style.flexDirection = 'column';  // Stack children vertically
    
    // Create header with close button
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'flex-start';
    header.style.width = '100%';
    header.style.marginBottom = options.title ? '0' : '4px';
    
    // Add title if provided
    if (options.title) {
        const title = document.createElement('div');
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '4px';
        title.style.flex = '1';
        title.textContent = options.title;
        header.appendChild(title);
    }
    
    // Add close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '✕';
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.color = options.type === 'warning' ? '#333333' : '#ffffff';
    closeButton.style.cursor = 'pointer';
    closeButton.style.padding = '0 0 0 8px';
    closeButton.style.fontSize = '14px';
    closeButton.style.opacity = '0.7';
    closeButton.style.marginLeft = '8px';
    closeButton.addEventListener('mouseover', () => closeButton.style.opacity = '1');
    closeButton.addEventListener('mouseout', () => closeButton.style.opacity = '0.7');
    closeButton.addEventListener('click', () => {
        if (notification.parentNode) {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    });
    header.appendChild(closeButton);
    
    notification.appendChild(header);
    
    // Add message
    const message = document.createElement('div');
    message.textContent = options.message;
    message.style.flex = '1';
    notification.appendChild(message);
    
    // Adjust style based on notification type
    switch (options.type) {
        case 'success':
            notification.style.backgroundColor = '#4CAF50';
            notification.style.color = '#ffffff';
            break;
        case 'error':
            notification.style.backgroundColor = '#F44336';
            notification.style.color = '#ffffff';
            break;
        case 'warning':
            notification.style.backgroundColor = '#FFC107';
            notification.style.color = '#333333';
            break;
        default: // info
            notification.style.backgroundColor = '#2196F3';
            notification.style.color = '#ffffff';
    }
    
    // Add buttons if provided
    if (options.buttons && options.buttons.length > 0) {
        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '8px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.flexWrap = 'wrap';
        
        options.buttons.forEach(button => {
            const btn = document.createElement('button');
            btn.textContent = button.text;
            btn.style.padding = '6px 12px';
            btn.style.border = 'none';
            btn.style.borderRadius = '4px';
            btn.style.cursor = 'pointer';
            
            if (button.primary) {
                btn.style.backgroundColor = '#ffffff';
                btn.style.color = '#333333';
            } else {
                btn.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
                btn.style.color = options.type === 'warning' ? '#333333' : '#ffffff';
            }
            
            btn.addEventListener('click', () => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
                button.onClick();
            });
            
            buttonContainer.appendChild(btn);
        });
        
        notification.appendChild(buttonContainer);
    }
    
    // Add to DOM
    document.body.appendChild(notification);
    
    // Dynamically position near the active button
    this.positionNotificationNearActiveButton(notification);
    
    // Auto-close if specified (default to 2000ms for stop notifications)
    if (options.autoClose) {
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, options.autoClose);
    }
    
    return notification;
  }

  /**
   * Dynamically positions a notification near the currently active button
   * Priority: copilot button > start button > dedicated stop button > fallback
   */
  private static positionNotificationNearActiveButton(notification: HTMLElement): void {
    let activeButton: HTMLElement | null = null;
    let buttonType = '';

    // Strategy 1: Check for active copilot button (with stop functionality)
    const copilotButton = document.querySelector('.hyphen-copilot-button.hyphen-stop-guide-active') as HTMLElement;
    if (copilotButton && document.body.contains(copilotButton)) {
      activeButton = copilotButton;
      buttonType = 'copilot';
    }

    // Strategy 2: Check for active start button (with stop functionality)
    if (!activeButton) {
      const startButton = document.querySelector('.hyphen-start-button.hyphen-stop-guide-active') as HTMLElement;
      if (startButton && document.body.contains(startButton)) {
        activeButton = startButton;
        buttonType = 'start';
      }
    }

    // Strategy 3: Check for dedicated stop button
    if (!activeButton) {
      const dedicatedStopButton = document.querySelector('.hyphen-dedicated-stop-button') as HTMLElement;
      if (dedicatedStopButton && document.body.contains(dedicatedStopButton)) {
        activeButton = dedicatedStopButton;
        buttonType = 'dedicated';
      }
    }

    // Strategy 4: Fallback to any available button
    if (!activeButton) {
      const fallbackButton = document.querySelector('.hyphen-copilot-button, .hyphen-start-button') as HTMLElement;
      if (fallbackButton && document.body.contains(fallbackButton)) {
        activeButton = fallbackButton;
        buttonType = 'fallback';
      }
    }

    if (activeButton) {
      const buttonRect = activeButton.getBoundingClientRect();
      const notificationRect = notification.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Position based on button type and available space
      if (buttonType === 'dedicated') {
        // Dedicated button is center-bottom, so position notification above it
        notification.style.bottom = `${viewportHeight - buttonRect.top + 10}px`;
        notification.style.left = '50%';
        notification.style.transform = 'translateX(-50%)';
        notification.style.right = 'auto';
        notification.style.top = 'auto';
      } else {
        // For copilot and start buttons, position to the side with best space
        const spaceRight = viewportWidth - buttonRect.right;
        const spaceLeft = buttonRect.left;
        const spaceAbove = buttonRect.top;
        const spaceBelow = viewportHeight - buttonRect.bottom;

        // Estimate notification height (including buttons if present)
        const estimatedHeight = notification.querySelector('.hyphen-notification button') ? 120 : 80;

        // Prefer positioning to the right if there's enough space
        if (spaceRight >= 320) { // 300px notification + 20px margin
          // Ensure notification doesn't go below viewport
          const topPosition = Math.max(10, Math.min(buttonRect.top, viewportHeight - estimatedHeight - 10));
          notification.style.top = `${topPosition}px`;
          notification.style.left = `${buttonRect.right + 10}px`;
          notification.style.transform = 'none';
          notification.style.right = 'auto';
          notification.style.bottom = 'auto';
        }
        // Otherwise try left
        else if (spaceLeft >= 320) {
          const topPosition = Math.max(10, Math.min(buttonRect.top, viewportHeight - estimatedHeight - 10));
          notification.style.top = `${topPosition}px`;
          notification.style.right = `${viewportWidth - buttonRect.left + 10}px`;
          notification.style.left = 'auto';
          notification.style.transform = 'none';
          notification.style.bottom = 'auto';
        }
        // Try above if there's enough space
        else if (spaceAbove >= estimatedHeight + 20) {
          notification.style.bottom = `${viewportHeight - buttonRect.top + 10}px`;
          notification.style.left = `${buttonRect.left}px`;
          notification.style.transform = 'none';
          notification.style.right = 'auto';
          notification.style.top = 'auto';
        }
        // Try below if there's enough space
        else if (spaceBelow >= estimatedHeight + 20) {
          notification.style.top = `${buttonRect.bottom + 10}px`;
          notification.style.left = `${buttonRect.left}px`;
          notification.style.transform = 'none';
          notification.style.right = 'auto';
          notification.style.bottom = 'auto';
        }
        // Fallback: center horizontally and position safely in viewport
        else {
          // Position in the center of the viewport, but ensure it's fully visible
          notification.style.top = '50%';
          notification.style.left = '50%';
          notification.style.transform = 'translate(-50%, -50%)';
          notification.style.right = 'auto';
          notification.style.bottom = 'auto';
        }
      }

      console.log(`[NOTIFICATION] Positioned near ${buttonType} button at:`, {
        buttonRect,
        notificationStyle: {
          top: notification.style.top,
          bottom: notification.style.bottom,
          left: notification.style.left,
          right: notification.style.right,
          transform: notification.style.transform
        }
      });
    } else {
      // Ultimate fallback position if no buttons found
      // Ensure notification is fully visible by measuring its height
      const notificationRect = notification.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      
      // Check if notification has buttons (like redirect notifications)
      const hasButtons = notification.querySelector('button') !== null;
      const estimatedHeight = hasButtons ? 120 : 80; // Estimate based on content
      
      // Position to ensure full visibility
      const bottomMargin = Math.max(20, estimatedHeight - (viewportHeight - 150)); // Ensure we don't go off-screen
      
      // For notifications with important action buttons (like redirect), center them
      if (hasButtons) {
        notification.style.top = '50%';
        notification.style.left = '50%';
        notification.style.transform = 'translate(-50%, -50%)';
        notification.style.right = 'auto';
        notification.style.bottom = 'auto';
        console.log('[NOTIFICATION] No active button found, centering notification with buttons');
      } else {
        // For simple notifications, use bottom-right but ensure visibility
        notification.style.bottom = `${bottomMargin}px`;
        notification.style.right = '20px';
        notification.style.left = 'auto';
        notification.style.transform = 'none';
        notification.style.top = 'auto';
        console.log('[NOTIFICATION] No active button found, using safe bottom-right position');
      }
    }
  }

  static showErrorNotification(message: string, options: ErrorNotificationOptions): HTMLElement {
    // Add retry, skip, and stop buttons
    const buttons = [];
    
    if (options.onRetry) {
      buttons.push({
        text: 'Retry',
        onClick: options.onRetry,
        primary: true
      });
    }
    
    if (options.onSkip) {
      buttons.push({
        text: 'Skip Step',
        onClick: options.onSkip
      });
    }
    
    if (options.onStop) {
      buttons.push({
        text: 'Stop Guide',
        onClick: options.onStop
      });
    }
    
    return this.showNotification({
      title: 'Error',
      message,
      type: 'error',
      buttons
    });
  }

  static positionHighlightOnElement(element: HTMLElement, highlight: HTMLElement | null): void {
    if (!highlight || !element) return;
    
    console.log('[HIGHLIGHT-POSITION] Starting highlight positioning for:', {
        element: {
            tag: element.tagName,
            id: element.id,
            classes: element.className
        },
        timestamp: new Date().toISOString()
    });

    // IMPORTANT: First, always clean up any existing observers and handlers
    // to prevent memory leaks and conflicting updates
    if ((highlight as any)._scrollResizeHandler) {
        window.removeEventListener('scroll', (highlight as any)._scrollResizeHandler);
        window.removeEventListener('resize', (highlight as any)._scrollResizeHandler);
        window.removeEventListener('orientationchange', (highlight as any)._scrollResizeHandler); // Cleanup orientation change too
        (highlight as any)._scrollResizeHandler = null;
        console.log('[HIGHLIGHT-POSITION] Cleaned up previous scroll/resize handlers');
    }
    
    if ((highlight as any)._observer) {
        (highlight as any)._observer.disconnect();
        (highlight as any)._observer = null;
        console.log('[HIGHLIGHT-POSITION] Cleaned up previous mutation observer');
    }
    
    // IMPORTANT: Cancel any pending animation frame from previous positioning
    if ((highlight as any)._frameRequestId) {
        cancelAnimationFrame((highlight as any)._frameRequestId);
        (highlight as any)._frameRequestId = null;
        console.log('[HIGHLIGHT-POSITION] Cleaned up previous animation frame request');
    }

    // IMPORTANT: Always remove highlight from current parent and attach directly to document.body
    // This avoids issues with nested transforms and positioning contexts
    if (highlight.parentElement) {
        highlight.parentElement.removeChild(highlight);
        console.log('[HIGHLIGHT-POSITION] Removed highlight from previous parent');
    }
    
    // Add the highlight to the document body - ALWAYS directly to body for consistent positioning
    document.body.appendChild(highlight);
    console.log('[HIGHLIGHT-POSITION] Attached highlight directly to document.body');
    
    // Ensure highlight has correct base styles
    highlight.style.position = 'absolute';
    highlight.style.pointerEvents = 'none';
    highlight.style.zIndex = '9995'; // Ensure proper stacking order
    highlight.style.boxSizing = 'border-box'; // Ensure dimensions include borders
    highlight.style.transition = 'none'; // Prevent transition during initial positioning
    
    // Store element reference for cleanup
    (highlight as any)._targetElement = element;
    
    // Function to update highlight position with comprehensive error handling
    const updateHighlightPosition = () => {
        try {
            // Enhanced Check: Ensure element and highlight are still valid
            if (!element || !highlight || !element.isConnected || !document.body.contains(highlight)) {
                console.warn('[HIGHLIGHT-POSITION] Update aborted: Element/Highlight missing or disconnected.', {
                    elementExists: !!element,
                    elementConnected: element?.isConnected,
                    highlightExists: !!highlight,
                    highlightInBody: !!highlight && document.body.contains(highlight)
                });
                return; 
            }
            
            // Get current element position
            const rect = element.getBoundingClientRect();
            const scrollX = window.scrollX || document.documentElement.scrollLeft;
            const scrollY = window.scrollY || document.documentElement.scrollTop;
            
            // IMPORTANT: Log raw positions for debugging
            console.log('[HIGHLIGHT-POSITION-RAW] Element position:', {
                top: Math.round(rect.top), 
                left: Math.round(rect.left), 
                width: Math.round(rect.width), 
                height: Math.round(rect.height),
                scroll: { x: Math.round(scrollX), y: Math.round(scrollY) },
                viewport: { width: window.innerWidth, height: window.innerHeight }
            });
            
            // *** IMPORTANT: Set transition to none *before* updating position ***
            highlight.style.transition = 'none'; 
            
            // Position highlight with a slight expansion for visibility (+6px width/height, -3px top/left)
            highlight.style.transform = 'none'; // Reset transform just in case
            highlight.style.top = `${rect.top + scrollY - 3}px`;
            highlight.style.left = `${rect.left + scrollX - 3}px`;
            highlight.style.width = `${rect.width + 6}px`;
            highlight.style.height = `${rect.height + 6}px`;
            highlight.style.opacity = '1'; // Ensure visibility

            // NOTE: Removed the re-application of transitions to avoid potential visual glitches during rapid updates
            // highlight.offsetHeight; // Force reflow
            // highlight.style.transition = 'top 0.2s, left 0.2s, width 0.2s, height 0.2s'; 
            
            console.log('[HIGHLIGHT-POSITION] Updated highlight position:', {
                element: `${element.tagName}#${element.id || 'noId'}`,
                highlight: {
                    top: highlight.style.top,
                    left: highlight.style.left,
                    width: highlight.style.width,
                    height: highlight.style.height
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('[HIGHLIGHT-POSITION] Error updating highlight position:', error);
        }
    };
    
    // Initial position update - call immediately
    updateHighlightPosition();
    
    // *** IMPORTANT: Modify scroll/resize handling using requestAnimationFrame ***
    let frameRequestId: number | null = null; // Track animation frame request

    const scrollResizeHandler = (event: Event) => {
        // If a frame is already requested, don't request another to avoid backlog
        if (frameRequestId) {
            return; 
        }
        
        // Request the next animation frame to update the position
        frameRequestId = requestAnimationFrame(() => {
            console.log(`[HIGHLIGHT-POSITION] ${event.type} event triggered update via rAF`);
            updateHighlightPosition();
            frameRequestId = null; // Reset after execution, allowing next frame request
        });
    };
    
    // IMPORTANT: Create a more robust mutation observer for DOM changes
    const observerConfig = { 
        attributes: true, 
        childList: true, 
        subtree: true,
        characterData: true // Also watch for text changes
    };
    
    let mutationDebounceTimeout: any = null; // Use debounce for mutations to avoid excessive updates
    const mutationHandler = (mutations: MutationRecord[]) => {
        // Check if any mutations are relevant to our element
        const relevantMutation = mutations.some(mutation => {
            // Either the element itself changed or is affected by changes
            return element.contains(mutation.target) || 
                   (mutation.target instanceof Node && mutation.target.contains(element)) ||
                   mutation.target === element;
        });
        
        if (relevantMutation) {
            if (mutationDebounceTimeout) {
                clearTimeout(mutationDebounceTimeout);
            }
            
            mutationDebounceTimeout = setTimeout(() => {
                console.log('[HIGHLIGHT-POSITION] Relevant DOM mutation detected, updating position');
                updateHighlightPosition();
            }, 50); // Keep a small debounce for DOM mutations
        }
    };
    
    const observer = new MutationObserver(mutationHandler);
    
    // Observe the element itself
    observer.observe(element, observerConfig);
    
    // Also observe parent elements up to 3 levels for better coverage of structural changes
    let parent = element.parentElement;
    let depth = 0;
    while (parent && depth < 3) {
        observer.observe(parent, observerConfig);
        parent = parent.parentElement;
        depth++;
    }
    
    // For completeness, also observe document.body for major DOM changes
    observer.observe(document.body, { childList: true, subtree: false });
    
    // Store handlers and observer on highlight for cleanup
    (highlight as any)._scrollResizeHandler = scrollResizeHandler;
    (highlight as any)._observer = observer;
    (highlight as any)._frameRequestId = frameRequestId; // Store frame ID for potential cleanup
    (highlight as any)._mutationDebounceTimeout = mutationDebounceTimeout; // Store debounce ID for cleanup
    
    // Add event listeners with passive flag for better performance
    window.addEventListener('scroll', scrollResizeHandler, { passive: true });
    window.addEventListener('resize', scrollResizeHandler, { passive: true });
    
    // Also listen for window orientation changes on mobile
    window.addEventListener('orientationchange', scrollResizeHandler);
    
    console.log('[HIGHLIGHT-POSITION] Setup complete: Added event listeners (using rAF) and observers');
    
    // Double-check position after a short delay to catch any post-rendering changes
    setTimeout(updateHighlightPosition, 100);
    setTimeout(updateHighlightPosition, 500); // And again after longer delay
  }

  // Add a new method to properly clean up all UI components
  static cleanupAllUI(keepCursor: boolean = false, keepNotifications: boolean = true): void {
    // Check if there are active modals that we should not interfere with
    const activeModals = [
      document.getElementById('hyphen-search-overlay'), // CopilotModal
      document.getElementById('hyphen-onboarding-overlay'), // OnboardingModal
    ].filter(modal => modal !== null);

    const hasActiveModals = activeModals.length > 0;

    if (hasActiveModals) {
      console.log('[CLEANUP-DEBUG] Active modal detected, performing limited cleanup to avoid interference');
      
      // Only clean up flow-specific elements when modals are active
      // This prevents interfering with modal event listeners and DOM structure
      
      // Clean up cursor (if not keeping it)
      if (!keepCursor) {
        const cursorWrapper = document.getElementById('hyphenbox-cursor-wrapper') as EnhancedHTMLElement;
        if (cursorWrapper) {
          try {
            // Clean up cursor-specific observers and handlers
            if (cursorWrapper['observer']) {
              cursorWrapper['observer'].disconnect();
              cursorWrapper['observer'] = null;
            }
            if (cursorWrapper['scrollHandler']) {
              window.removeEventListener('scroll', cursorWrapper['scrollHandler']);
              window.removeEventListener('resize', cursorWrapper['scrollHandler']);
              cursorWrapper['scrollHandler'] = null;
            }
            if (cursorWrapper['resizeHandler']) {
              window.removeEventListener('resize', cursorWrapper['resizeHandler']);
              cursorWrapper['resizeHandler'] = null;
            }
            if (cursorWrapper['positionInterval']) {
              clearInterval(cursorWrapper['positionInterval']);
            }
            cursorWrapper['currentElement'] = null;
            
            if (cursorWrapper.parentNode) {
              cursorWrapper.parentNode.removeChild(cursorWrapper);
            }
          } catch (error) {
            console.warn('Error cleaning up cursor:', error);
          }
        }
      }
      
      // Clean up highlights (flow-specific, unlikely to conflict with modals)
      const highlights = document.querySelectorAll('.hyphen-highlight');
      highlights.forEach(highlight => {
        try {
          if ((highlight as any)._scrollResizeHandler) {
            window.removeEventListener('scroll', (highlight as any)._scrollResizeHandler);
            window.removeEventListener('resize', (highlight as any)._scrollResizeHandler);
            window.removeEventListener('orientationchange', (highlight as any)._scrollResizeHandler);
            (highlight as any)._scrollResizeHandler = null;
          }
          
          if ((highlight as any)._observer) {
            (highlight as any)._observer.disconnect();
            (highlight as any)._observer = null;
          }
          
          if ((highlight as any)._frameRequestId) {
            cancelAnimationFrame((highlight as any)._frameRequestId);
            (highlight as any)._frameRequestId = null;
          }
          if ((highlight as any)._mutationDebounceTimeout) {
            clearTimeout((highlight as any)._mutationDebounceTimeout);
            (highlight as any)._mutationDebounceTimeout = null;
          }
          
          (highlight as any)._targetElement = null;
          
          if (highlight.parentNode) {
            highlight.parentNode.removeChild(highlight);
          }
        } catch (error) {
          console.warn('Error cleaning up highlight:', error);
        }
      });
      
      // Clean up text popup (flow-specific)
      const textPopup = document.getElementById('hyphenbox-text-popup');
      if (textPopup && textPopup.parentNode) {
        textPopup.parentNode.removeChild(textPopup);
      }
      
      // Clean up guidance card (flow-specific)
      const guidanceCard = document.getElementById('hyphen-guidance-card') as EnhancedGuidanceCard;
      if (guidanceCard) {
        if (guidanceCard._observer) {
          guidanceCard._observer.disconnect();
          guidanceCard._observer = undefined;
        }
        if (guidanceCard._scrollResizeHandler) {
          window.removeEventListener('scroll', guidanceCard._scrollResizeHandler);
          window.removeEventListener('resize', guidanceCard._scrollResizeHandler);
          window.removeEventListener('orientationchange', guidanceCard._scrollResizeHandler);
          guidanceCard._scrollResizeHandler = undefined;
        }
        if (guidanceCard._rAfId) {
          cancelAnimationFrame(guidanceCard._rAfId);
          guidanceCard._rAfId = undefined;
        }
        if (guidanceCard._mutationDebounceTimeout) {
          clearTimeout(guidanceCard._mutationDebounceTimeout);
          guidanceCard._mutationDebounceTimeout = undefined;
        }
        if (guidanceCard.parentNode) {
          guidanceCard.parentNode.removeChild(guidanceCard);
        }
      }
      
      console.log('[CLEANUP-DEBUG] Limited cleanup completed while modal is active');
      return;
    }

    // Full cleanup when no modals are active (original behavior)
    console.log('[CLEANUP-DEBUG] No active modals, performing full cleanup');

    // Clean up the guidance container and its contents
    const container = document.querySelector('.hyphen-guidance-container') as EnhancedHTMLElement;
    if (container) {
        // Clean up event listeners
        if (container['observer']) {
            container['observer'].disconnect();
            container['observer'] = null;
        }
        if (container['parentObserver']) {
            container['parentObserver'].disconnect();
            container['parentObserver'] = null;
        }
        if (container['positionInterval']) {
            clearInterval(container['positionInterval']);
        }
        if (container['scrollHandler']) {
            window.removeEventListener('scroll', container['scrollHandler']);
            window.removeEventListener('resize', container['scrollHandler']);
            container['scrollHandler'] = null;
        }
        document.body.removeChild(container);
    }

    // Clean up all highlights by class name
    const highlights = document.querySelectorAll('.hyphen-highlight');
    highlights.forEach(highlight => {
        try {
            // Clean up event listeners and observers for the new overlay approach
            if ((highlight as any)._scrollResizeHandler) {
                window.removeEventListener('scroll', (highlight as any)._scrollResizeHandler);
                window.removeEventListener('resize', (highlight as any)._scrollResizeHandler);
                window.removeEventListener('orientationchange', (highlight as any)._scrollResizeHandler); // Cleanup orientation change
                (highlight as any)._scrollResizeHandler = null;
            }
            
            if ((highlight as any)._observer) {
                (highlight as any)._observer.disconnect();
                (highlight as any)._observer = null;
            }
            
            // IMPORTANT: Cancel pending animation frame and mutation debounce on cleanup
            if ((highlight as any)._frameRequestId) {
                cancelAnimationFrame((highlight as any)._frameRequestId);
                (highlight as any)._frameRequestId = null;
            }
            if ((highlight as any)._mutationDebounceTimeout) {
                clearTimeout((highlight as any)._mutationDebounceTimeout);
                (highlight as any)._mutationDebounceTimeout = null;
            }
            
            // Remove reference to target element
            (highlight as any)._targetElement = null;
            
            // Remove the highlight from DOM
            if (highlight.parentNode) {
                highlight.parentNode.removeChild(highlight);
            }
        } catch (error) {
            console.warn('Error cleaning up highlight:', error);
        }
    });

    // Clean up text popup by ID
    const textPopup = document.getElementById('hyphenbox-text-popup');
    if (textPopup && textPopup.parentNode) {
        textPopup.parentNode.removeChild(textPopup);
    }

    // Clean up the new guidance card by ID
    const guidanceCard = document.getElementById('hyphen-guidance-card') as EnhancedGuidanceCard; // Use enhanced type
    if (guidanceCard) {
      // Disconnect observer and remove listeners added by positionGuidanceCard
      if (guidanceCard._observer) {
        guidanceCard._observer.disconnect();
        guidanceCard._observer = undefined;
      }
      if (guidanceCard._scrollResizeHandler) {
          window.removeEventListener('scroll', guidanceCard._scrollResizeHandler);
          window.removeEventListener('resize', guidanceCard._scrollResizeHandler);
          window.removeEventListener('orientationchange', guidanceCard._scrollResizeHandler);
          guidanceCard._scrollResizeHandler = undefined;
      }
      if (guidanceCard._rAfId) {
          cancelAnimationFrame(guidanceCard._rAfId);
          guidanceCard._rAfId = undefined;
      }
      if (guidanceCard._mutationDebounceTimeout) {
          clearTimeout(guidanceCard._mutationDebounceTimeout);
          guidanceCard._mutationDebounceTimeout = undefined;
      }
      // Remove the card itself
      if (guidanceCard.parentNode) {
          guidanceCard.parentNode.removeChild(guidanceCard);
      }
    }

    // Only clean up cursor if explicitly requested
    if (!keepCursor) {
        // Find cursor wrapper by ID
        const cursorWrapper = document.getElementById('hyphenbox-cursor-wrapper') as EnhancedHTMLElement;
        if (cursorWrapper) {
            try {
                // Clean up all observers and handlers
                if (cursorWrapper['observer']) {
                    cursorWrapper['observer'].disconnect();
                    cursorWrapper['observer'] = null;
                }
                if (cursorWrapper['scrollHandler']) {
                    window.removeEventListener('scroll', cursorWrapper['scrollHandler']);
                    window.removeEventListener('resize', cursorWrapper['scrollHandler']);
                    cursorWrapper['scrollHandler'] = null;
                }
                if (cursorWrapper['resizeHandler']) {
                    window.removeEventListener('resize', cursorWrapper['resizeHandler']);
                    cursorWrapper['resizeHandler'] = null;
                }
                if (cursorWrapper['positionInterval']) {
                    clearInterval(cursorWrapper['positionInterval']);
                }
                
                // Clear current element reference
                cursorWrapper['currentElement'] = null;
                
                // Remove the wrapper and cursor
                if (cursorWrapper.parentNode) {
                    cursorWrapper.parentNode.removeChild(cursorWrapper);
                }
            } catch (error) {
                console.warn('Error cleaning up cursor:', error);
            }
        }
    }

    // Clean up draggable elements' event handlers
    const draggables = document.querySelectorAll('.hyphen-draggable') as NodeListOf<EnhancedHTMLElement>;
    draggables.forEach(draggable => {
        try {
            if (draggable['_hyphenDragHandlers']) {
                document.removeEventListener('mousemove', draggable['_hyphenDragHandlers'].mouseMove);
                document.removeEventListener('mouseup', draggable['_hyphenDragHandlers'].mouseUp);
                delete draggable['_hyphenDragHandlers'];
            }
        } catch (error) {
            console.warn('Error cleaning up draggable:', error);
        }
    });

    // Clean up any notifications only if explicitly requested
    if (!keepNotifications) {
        const notifications = document.querySelectorAll('.hyphen-notification');
        notifications.forEach(notification => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
    }

    console.log('[CLEANUP-DEBUG] Full UI cleanup completed', keepCursor ? '(keeping cursor)' : '(including cursor)', keepNotifications ? '(keeping notifications)' : '(including notifications)');
  }

  // Add this as a new method in the CursorFlowUI class
  static detectAndLogPortals(): { 
    portals: HTMLElement[], 
    modals: HTMLElement[],
    activeModal: HTMLElement | null
  } {
    // Find all portals and modal-like elements
    const portals = Array.from(document.querySelectorAll('[data-portal="true"]')) as HTMLElement[];
    const modals = Array.from(document.querySelectorAll(
      '.mantine-Modal-content, [role="dialog"], .modal-content, .modal, .dialog'
    )) as HTMLElement[];
    
    // Log detailed info about portals and modals
    console.log('[PORTAL-DETECTOR] Found portals:', {
      count: portals.length,
      portals: portals.map(p => ({
        classes: p.className,
        children: p.children.length,
        visible: p.offsetParent !== null,
        rect: p.getBoundingClientRect()
      }))
    });
    
    console.log('[PORTAL-DETECTOR] Found modals:', {
      count: modals.length,
      modals: modals.map(m => ({
        classes: m.className,
        role: m.getAttribute('role'),
        children: m.children.length,
        visible: m.offsetParent !== null,
        rect: m.getBoundingClientRect()
      }))
    });
    
    // Determine which modal is most likely to be active/visible
    let activeModal = null;
    
    // Check for visibility and z-index to determine most prominent modal
    const visibleModals = modals.filter(m => {
      const rect = m.getBoundingClientRect();
      const styles = window.getComputedStyle(m);
      return rect.width > 0 && 
             rect.height > 0 && 
             styles.display !== 'none' &&
             styles.visibility !== 'hidden' &&
             styles.opacity !== '0';
    });
    
    if (visibleModals.length > 0) {
      // Sort by z-index (highest first)
      visibleModals.sort((a, b) => {
        const zIndexA = parseInt(window.getComputedStyle(a).zIndex) || 0;
        const zIndexB = parseInt(window.getComputedStyle(b).zIndex) || 0;
        return zIndexB - zIndexA;
      });
      
      activeModal = visibleModals[0];
      console.log('[PORTAL-DETECTOR] Active modal identified:', {
        classes: activeModal.className,
        role: activeModal.getAttribute('role'),
        zIndex: window.getComputedStyle(activeModal).zIndex
      });
    }
    
    return { portals, modals, activeModal };
  }

  // Add a new method to show thinking indicator
  static showThinkingIndicator(button: HTMLElement, theme: ThemeOptions): HTMLElement {
    console.log('[THINKING-DEBUG] Showing thinking indicator');
    
    // Remove any existing thinking indicators
    const existingIndicators = document.querySelectorAll('.hyphen-thinking-indicator');
    existingIndicators.forEach(indicator => {
      if (document.body.contains(indicator)) {
        document.body.removeChild(indicator);
      }
    });
    
    // Also clean up any existing cursors to prevent duplicates
    const existingCursors = document.querySelectorAll('#hyphenbox-cursor-wrapper');
    existingCursors.forEach(cursor => {
      if (document.body.contains(cursor)) {
        document.body.removeChild(cursor);
      }
    });
    
    // Create a container for positioning the thinking cursor
    const container = document.createElement('div');
    container.className = 'hyphen-thinking-indicator-positioner';
    container.style.cssText = `
      position: fixed;
      z-index: 9999;
      pointer-events: none;
    `;
    
    // Create a cursor element configured for thinking state
    const thinkingCursor = this.createCursor(theme, true);
    // Apply pulsing animation via CSS targeting .hyphen-thinking class
    thinkingCursor.style.position = 'relative';
    thinkingCursor.style.bottom = 'auto';
    thinkingCursor.style.left = 'auto';
    
    // Add animation styles if not already present
    const styleId = 'hyphen-pulse-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes hyphen-pulse {
          0% { opacity: 0.6; transform: scale(0.95); }
          50% { opacity: 1; transform: scale(1); }
          100% { opacity: 0.6; transform: scale(0.95); }
        }
        
        .hyphen-cursor-container.hyphen-thinking {
          animation: hyphen-pulse 1.5s infinite;
        }
      `;
      document.head.appendChild(style);
    }
    
    // Add thinking cursor to the positioner container
    container.appendChild(thinkingCursor);
    
    // Position the container relative to the button
    const buttonRect = button.getBoundingClientRect();
    container.style.left = `${buttonRect.left - 10}px`;
    container.style.top = `${buttonRect.top - (thinkingCursor.offsetHeight || 50) - 10}px`;
    
    // Add to document
    document.body.appendChild(container);
    
    return container;
  }
  
  static hideThinkingIndicator(indicator: HTMLElement): void {
    if (!indicator || !document.body.contains(indicator)) return;
    
    // Add exit animation
    const animation = indicator.animate([
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(10px)' }
    ], {
      duration: 300,
      easing: 'ease-in'
    });
    
    // Remove after animation completes
    animation.onfinish = () => {
      if (document.body.contains(indicator)) {
        document.body.removeChild(indicator);
      }
    };
  }

  static showRedirectNotification(options: RedirectNotificationOptions): HTMLElement {
    // Create buttons array with redirect button
    const buttons = [
      {
        text: options.redirectText || 'Go to page',
        onClick: () => {
          window.location.href = options.redirectUrl;
        },
        primary: true
      },
      ...(options.buttons || [])
    ];
    
    // Create a notification with the redirect button
    return this.showNotification({
      ...options,
      buttons
    });
  }
}