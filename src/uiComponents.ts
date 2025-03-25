import { ElementUtils } from './elementUtils';
import arrowheadSvg from '../assets/arrowhead.svg';
import hyphenboxSvg from '../assets/hyphenbox.svg';
import crazehqSvg from '../assets/crazehq.svg';

console.log('[SVG-DEBUG] Loaded hyphenbox SVG:', hyphenboxSvg.substring(0, 100) + '...');

interface EnhancedHTMLElement extends HTMLElement {
  [key: string]: any; // Allow any string property
}

export interface ThemeOptions {
  cursorColor?: string;
  highlightColor?: string;
  highlightBorderColor?: string;
  buttonColor?: string;
}

export interface NotificationOptions {
  title?: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  autoClose?: number;
  buttons?: Array<{
    text: string;
    onClick: () => void;
    primary?: boolean;
  }>;
}

export interface ErrorNotificationOptions extends NotificationOptions {
  onRetry?: () => void;
  onSkip?: () => void;
  onStop?: () => void;
}

export interface RedirectNotificationOptions extends NotificationOptions {
  redirectUrl: string;
  redirectText?: string;
}

export class CursorFlowUI {
  // Add these class variables to track scroll handlers
  private static cursorScrollHandler: EventListener | null = null;
  private static highlightScrollHandler: EventListener | null = null;

  static createStartButton(text: string, color: string, onClick: () => void): HTMLElement {
    console.log('[BUTTON-DEBUG] Creating start button with text:', text);
    const button = document.createElement('button');
    button.className = 'hyphen-start-button';
    
    // Create modern layout with cursor icon using the crazehq SVG
    console.log('[BUTTON-DEBUG] Using crazehq SVG:', crazehqSvg.substring(0, 50) + '...');
    button.innerHTML = `
        <div class="hyphen-button-content" style="display: flex; align-items: center; gap: 8px;">
            <div class="hyphen-icon" style="display: flex; align-items: center;">
                ${crazehqSvg}
            </div>
            <span class="hyphen-text" style="white-space: nowrap;">${text}</span>
        </div>
    `;
    
    // Adjust the SVG size in the button
    const svg = button.querySelector('svg');
    if (svg) {
        console.log('[BUTTON-DEBUG] Adjusting SVG size');
        svg.style.width = '24px';
        svg.style.height = '24px';
        svg.style.minWidth = '24px';
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.setAttribute('viewBox', '0 0 120 120');
    } else {
        console.warn('[BUTTON-DEBUG] SVG element not found in button');
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

  static createGuidesButton(text: string, color: string, onClick: () => void): HTMLElement {
    // For simplicity, reuse the createStartButton method
    return this.createStartButton(text, color, onClick);
  }

  static showGuidesDropdown(guides: any[], guideButton: HTMLElement, onSelect: (guideData: any) => void): HTMLElement {
    const dropdown = document.createElement('div');
    dropdown.className = 'hyphen-dropdown';
    
    // Modern styling for dropdown
    dropdown.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 20px;
        width: 320px;
        max-height: 400px;
        background-color: #ffffff;
        border-radius: 16px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.12);
        z-index: 10000;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        display: flex;
        flex-direction: column;
    `;
    
    // Add header with modern design
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 20px;
        font-weight: 600;
        font-size: 16px;
        color: #1a1a1a;
        border-bottom: 1px solid #f0f0f0;
    `;
    header.textContent = 'What can I show you?';
    dropdown.appendChild(header);
    
    // Create scrollable content area
    const content = document.createElement('div');
    content.style.cssText = `
        max-height: 320px;
        overflow-y: auto;
        padding: 8px 0;
        flex: 1;
    `;
    
    if (!guides || guides.length === 0) {
        const noGuides = document.createElement('div');
        noGuides.style.cssText = `
            padding: 16px 20px;
            color: #666;
            font-style: italic;
            font-size: 14px;
        `;
        noGuides.textContent = 'No guides available';
        content.appendChild(noGuides);
    } else {
        guides.forEach(guide => {
            const item = document.createElement('div');
            item.className = 'hyphen-dropdown-item';
            
            // Modern list item styling
            item.style.cssText = `
                padding: 12px 20px;
                cursor: pointer;
                transition: all 0.2s ease;
                color: #1a1a1a;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 12px;
            `;
            
            // Add guide icon
            item.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5l7 7-7 7"></path>
                    <path d="M5 12h14"></path>
                </svg>
                <span>${guide.name}</span>
            `;
            
            item.addEventListener('mouseover', () => {
                item.style.backgroundColor = '#f8f8f8';
            });
            
            item.addEventListener('mouseout', () => {
                item.style.backgroundColor = '';
            });
            
            item.addEventListener('click', (event) => {
                event.stopPropagation();
                onSelect(guide);
                if (document.body.contains(dropdown)) {
                    document.body.removeChild(dropdown);
                }
            });
            
            content.appendChild(item);
        });
    }
    
    dropdown.appendChild(content);

    // Add footer with "powered by" and logo
    console.log('[FOOTER-DEBUG] Creating footer with hyphenbox SVG');
    const footer = document.createElement('div');
    footer.style.cssText = `
        padding: 12px 20px;
        border-top: 1px solid #f0f0f0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        color: #666;
        font-size: 12px;
        background: #fafafa;
        line-height: 1;
    `;
    
    // First create the elements separately
    const poweredByText = document.createElement('span');
    poweredByText.textContent = 'powered by';
    poweredByText.style.cssText = `
        opacity: 0.7;
        display: flex;
        align-items: center;
        height: 18px;
    `;
    
    const logoContainer = document.createElement('div');
    logoContainer.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        height: 18px;
        width: 55px;
        position: relative;
        transform: translateY(1px);
    `;
    
    // Set the SVG directly
    logoContainer.innerHTML = hyphenboxSvg;
    
    // Add elements to footer
    footer.appendChild(poweredByText);
    footer.appendChild(logoContainer);
    
    // Adjust the SVG
    const svg = logoContainer.querySelector('svg');
    if (svg) {
        console.log('[FOOTER-DEBUG] Adjusting SVG properties');
        svg.style.cssText = `
            width: 100%;
            height: 100%;
            opacity: 0.7;
            display: block;
        `;
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.setAttribute('viewBox', '0 0 3163 849');
    } else {
        console.warn('[FOOTER-DEBUG] SVG element not found in container');
    }

    dropdown.appendChild(footer);
    document.body.appendChild(dropdown);

    // Add smooth entrance animation
    dropdown.animate([
        { opacity: 0, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'translateY(0)' }
    ], {
        duration: 200,
        easing: 'ease-out'
    });
    
    // Handle outside clicks
    const handleOutsideClick = (event: MouseEvent) => {
        const target = event.target as Node;
        if (!dropdown.contains(target) && target !== guideButton) {
            dropdown.animate([
                { opacity: 1, transform: 'translateY(0)' },
                { opacity: 0, transform: 'translateY(10px)' }
            ], {
                duration: 200,
                easing: 'ease-in'
            }).onfinish = () => {
                if (document.body.contains(dropdown)) {
                    document.body.removeChild(dropdown);
                }
            };
            document.removeEventListener('click', handleOutsideClick);
        }
    };
    
    setTimeout(() => {
        document.addEventListener('click', handleOutsideClick);
    }, 0);
    
    return dropdown;
  }

  static createCursor(theme: ThemeOptions): HTMLElement {
    // Create a container for cursor and label
    const cursorContainer = document.createElement('div');
    cursorContainer.className = 'hyphen-cursor-container';
    cursorContainer.style.cssText = `
      position: relative;
      display: flex;
      align-items: center;
      pointer-events: none;
      transform: translate(-5px, -5px);
    `;

    // Create cursor element
    const cursor = document.createElement('div');
    cursor.className = 'hyphen-cursor';
    cursor.innerHTML = arrowheadSvg;
    cursor.style.cssText = `
      position: relative;
      z-index: 9999;
      pointer-events: none;
      display: flex;
      align-items: center;
    `;

    // Create Craze label
    const crazeLabel = document.createElement('div');
    crazeLabel.className = 'hyphen-craze-label';
    crazeLabel.textContent = 'Craze';
    crazeLabel.style.cssText = `
      background-color: ${theme?.buttonColor || '#FF6B00'};
      color: white;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin-left: -2px;
      position: relative;
      z-index: 9998;
      white-space: nowrap;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 18px;
      line-height: 1;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    `;

    // Apply theme to cursor if provided
    if (theme?.cursorColor) {
      const paths = cursor.querySelectorAll('path');
      paths.forEach(path => {
        if (path.getAttribute('fill') === '#FF6B00') {
          path.setAttribute('fill', theme.cursorColor || '#FF6B00');
        }
      });
    }

    // Assemble the components
    cursorContainer.appendChild(cursor);
    cursorContainer.appendChild(crazeLabel);

    return cursorContainer;
  }

  static createHighlight(theme: ThemeOptions): HTMLElement {
    const highlight = document.createElement('div');
    highlight.className = 'hyphen-highlight';
    highlight.id = 'hyphenbox-highlight';  // Updated ID
    
    // Set basic styles
    highlight.style.position = 'absolute';
    highlight.style.boxSizing = 'border-box';
    highlight.style.pointerEvents = 'none';
    highlight.style.zIndex = '9998';
    highlight.style.border = `2px solid ${theme?.highlightBorderColor || '#FF6B00'}`;
    highlight.style.backgroundColor = theme?.highlightColor || 'rgba(255, 107, 0, 0.1)';
    highlight.style.borderRadius = '3px';
    highlight.style.transition = 'all 0.3s ease-in-out';
    
    return highlight;
  }

  static createTextPopup(text: string, theme: ThemeOptions): HTMLElement {
    const popup = document.createElement('div');
    popup.className = 'hyphen-text-popup';  // Always add the class
    popup.id = 'hyphenbox-text-popup';  // Keep the ID too
    popup.textContent = text;
    
    // Basic styling
    popup.style.position = 'fixed';
    popup.style.zIndex = '9998';
    popup.style.backgroundColor = '#ffffff';
    popup.style.border = '1px solid #e0e0e0';
    popup.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
    popup.style.borderRadius = '4px';
    popup.style.padding = '8px 12px';
    popup.style.fontSize = '14px';
    popup.style.lineHeight = '1.4';
    popup.style.color = '#333333';
    popup.style.minWidth = '150px';      // Minimum width to prevent too narrow wrapping
    popup.style.maxWidth = '300px';      // Maximum width for very long content
    popup.style.width = 'max-content';   // Let content determine width up to maxWidth
    popup.style.whiteSpace = 'normal';   // Allow wrapping
    popup.style.wordWrap = 'break-word'; // Break long words if needed
    popup.style.wordBreak = 'normal';    // Use normal word breaking rules
    
    console.log('[POPUP-DEBUG] Created text popup with ID and class');
    return popup;
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
      wrapper.style.cssText = `
        position: absolute;
        pointer-events: none;
        z-index: 9999;
        top: 0;
        left: 0;
        width: 0;  // Will be set dynamically
        height: 0; // Will be set dynamically
        display: block; // Changed from flex to block
      `;
      wrapper.appendChild(cursor);
      document.body.appendChild(wrapper);
    }
    
    // Add smooth transition for cursor movement
    cursor.style.transition = 'all 0.5s ease';
    cursor.style.position = 'absolute';
    
    // Position cursor at bottom right of the element
    cursor.style.right = '-70px'; // Manual offset from right edge (changed from -24px)
    cursor.style.bottom = '-32px'; // Manual offset from bottom edge (changed from -24px)
    cursor.style.transform = 'none'; // Remove transform, use direct positioning
    cursor.style.margin = '0';
    cursor.style.padding = '0';
    
    // Function to update wrapper size and position
    const updatePosition = () => {
      const rect = element.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;
      
      // Update wrapper size to match element
      wrapper.style.width = `${rect.width}px`;
      wrapper.style.height = `${rect.height}px`;
      wrapper.style.transform = `translate(${rect.left + scrollX}px, ${rect.top + scrollY}px)`;
      
      console.log('[CURSOR-DEBUG] Updated wrapper:', {
        width: wrapper.style.width,
        height: wrapper.style.height,
        transform: wrapper.style.transform,
        cursorRight: cursor.style.right,
        cursorBottom: cursor.style.bottom
      });
    };
    
    // Update position immediately and then after a short delay to ensure rendering
    updatePosition();
    setTimeout(updatePosition, 100);
    
    // Update position on scroll and resize
    const handler = () => updatePosition();
    window.addEventListener('scroll', handler, { passive: true });
    window.addEventListener('resize', handler, { passive: true });
    
    // Store the handlers on the wrapper for later cleanup
    wrapper['scrollHandler'] = handler;
    wrapper['resizeHandler'] = handler;
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
    
    // Add popup to the wrapper for relative positioning
    wrapper.appendChild(popup);
    
    // Store original text for streaming effect
    const originalText = popup.textContent || '';
    popup.textContent = '';
    
    // Style the popup with modern design
    popup.style.cssText = `
        position: absolute;
        z-index: 9998;
        background-color: #ffffff;
        border: 1px solid #e0e0e0;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 14px;
        line-height: 1.4;
        color: #333333;
        min-width: 150px;
        max-width: 300px;
        width: max-content;
        white-space: normal;
        word-wrap: break-word;
        word-break: normal;
        opacity: 0;
        transition: opacity 0.3s ease;
        left: calc(100% + 8px);
        top: calc(100% + 40px);
        transform: translateY(-50%);
    `;
    
    // First pass: let the browser calculate natural width/height
    const prelimPosition = () => {
      // Get viewport dimensions
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Get the element's natural size
      const popupRect = popup.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      
      // Available space in each direction
      const spaceRight = viewportWidth - (wrapperRect.right + 8);
      const spaceLeft = wrapperRect.left - 8;
      
      // If not enough space on right, position to left
      if (spaceRight < popupRect.width && spaceLeft >= popupRect.width) {
        popup.style.left = 'auto';
        popup.style.right = 'calc(100% + 8px)';
      }
      
      // Check if popup goes below viewport
      if (popupRect.bottom > viewportHeight) {
        const topSpace = wrapperRect.top;
        if (topSpace >= popupRect.height) {
          // Position above if there's space
          popup.style.top = 'auto';
          popup.style.bottom = '0';
        } else {
          // Otherwise, ensure it stays within viewport
          popup.style.top = `${Math.max(8, viewportHeight - popupRect.height - 8)}px`;
        }
      }
    };
    
    // Run preliminary positioning
    prelimPosition();
    
    // Streaming text effect
    let charIndex = 0;
    const textLength = originalText.length;
    
    const streamText = () => {
      if (charIndex < textLength) {
        popup.textContent = originalText.substring(0, charIndex + 1);
        charIndex++;
        setTimeout(streamText, 30);
        
        // Recheck position periodically during text streaming
        if (charIndex === Math.floor(textLength * 0.25) || 
            charIndex === Math.floor(textLength * 0.5) || 
            charIndex === Math.floor(textLength * 0.75)) {
          prelimPosition();
        }
      }
    };
    
    // Start the sequence after a short delay
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
    
    // Add title if provided
    if (options.title) {
      const title = document.createElement('div');
      title.style.fontWeight = 'bold';
      title.style.marginBottom = '4px';
      title.textContent = options.title;
      notification.appendChild(title);
    }
    
    // Add message
    const message = document.createElement('div');
    message.textContent = options.message;
    notification.appendChild(message);
    
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
    
    // Position next to the Guides button
    const guideButton = document.querySelector('.hyphen-start-button');
    if (guideButton) {
      const buttonRect = guideButton.getBoundingClientRect();
      notification.style.bottom = `${buttonRect.height + 20}px`;
      notification.style.right = '20px';
    } else {
      // Fallback position if button not found
      notification.style.bottom = '70px';
      notification.style.right = '20px';
    }
    
    // Auto-close if specified
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

  static showCompletionPopup(guideButton: HTMLElement): HTMLElement {
    // Create popup near the guide button
    const popup = document.createElement('div');
    popup.className = 'hyphen-completion-popup';
    
    // Style the popup
    popup.style.position = 'fixed';
    popup.style.backgroundColor = '#4CAF50';
    popup.style.color = '#ffffff';
    popup.style.padding = '10px 15px';
    popup.style.borderRadius = '4px';
    popup.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    popup.style.fontSize = '14px';
    popup.style.zIndex = '10001';
    popup.style.maxWidth = '300px';
    
    // Set content
    popup.textContent = 'Guide Completed! 🎉';
    
    // Add to DOM
    document.body.appendChild(popup);
    
    // Position near the guide button - consistent with notifications
    const buttonRect = guideButton.getBoundingClientRect();
    popup.style.bottom = `${buttonRect.height + 20}px`;
    popup.style.right = '20px';
    
    // Add animation class
    popup.style.animation = 'hyphen-popup-fade 5s forwards';
    
    // Add animation keyframes if they don't exist
    if (!document.getElementById('hyphenbox-animations')) {
      const style = document.createElement('style');
      style.id = 'hyphenbox-animations';
      style.textContent = `
        @keyframes hyphen-popup-fade {
          0% { opacity: 0; transform: translateY(5px); }
          10% { opacity: 1; transform: translateY(0); }
          90% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-5px); }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Remove after animation completes
    setTimeout(() => {
      if (popup.parentNode) {
        popup.parentNode.removeChild(popup);
      }
    }, 5000);
    
    return popup;
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
    
    // Get or create highlight wrapper
    let wrapper = document.getElementById('hyphenbox-highlight-wrapper') as EnhancedHTMLElement;
    
    if (!wrapper) {
      wrapper = document.createElement('div') as EnhancedHTMLElement;
      wrapper.className = 'hyphen-highlight-wrapper';
      wrapper.id = 'hyphenbox-highlight-wrapper';  // Updated ID
      wrapper.style.position = 'fixed';
      wrapper.style.pointerEvents = 'none';
      wrapper.style.zIndex = '9998';
      wrapper.appendChild(highlight);
      document.body.appendChild(wrapper);
    }
    
    // Check portal/modal context with enhanced logging
    const { activeModal } = this.detectAndLogPortals();
    const isInModal = activeModal ? activeModal.contains(element) : false;
    
    // NEW: Verify if element is in expanded navigation
    const isInExpandedNav = element && element.closest ? element.closest('[data-expanded="true"]') !== null : false;
    
    // NEW: Log element ancestry for better debugging
    let ancestryLog = [];
    let parentNode = element.parentElement;
    let depth = 0;
    while (parentNode && depth < 5) {
      ancestryLog.push({
        depth,
        tag: parentNode.tagName,
        id: parentNode.id,
        classes: parentNode.className,
        hasSize: parentNode.getBoundingClientRect().width > 0 && parentNode.getBoundingClientRect().height > 0,
        display: window.getComputedStyle(parentNode).display,
        position: window.getComputedStyle(parentNode).position
      });
      parentNode = parentNode.parentElement;
      depth++;
    }
    
    console.log('[HIGHLIGHT-POSITION] Positioning info:', {
      element: {
        tag: element.tagName,
        id: element.id,
        classes: element.className,
        inModal: isInModal,
        inExpandedNav: isInExpandedNav,
        offsetParent: element.offsetParent !== null
      },
      initialRect: element.getBoundingClientRect(),
      computedStyle: {
        display: window.getComputedStyle(element).display,
        visibility: window.getComputedStyle(element).visibility,
        position: window.getComputedStyle(element).position,
        opacity: window.getComputedStyle(element).opacity,
        zIndex: window.getComputedStyle(element).zIndex,
        transform: window.getComputedStyle(element).transform
      },
      ancestry: ancestryLog
    });
    
    // First, remove any existing highlight wrapper
    const existingWrapper = document.querySelector('.hyphen-highlight-wrapper');
    if (existingWrapper && existingWrapper.parentNode) {
      existingWrapper.parentNode.removeChild(existingWrapper);
      console.log('[HIGHLIGHT-POSITION] Removed existing highlight wrapper');
    }
    
    // Position the highlight with a small padding
    highlight.style.position = 'absolute';
    highlight.style.left = '-4px';  // 4px padding on left
    highlight.style.top = '-4px';   // 4px padding on top
    highlight.style.width = 'calc(100% + 8px)';  // Add 8px (4px on each side)
    highlight.style.height = 'calc(100% + 8px)'; // Add 8px (4px on each side)
    
    // Initially hide the highlight until we can position it properly
    wrapper.style.opacity = '0';
    
    // Add the wrapper to the document
    document.body.appendChild(wrapper);
    console.log('[HIGHLIGHT-POSITION] Created highlight wrapper');
    
    // Variables for position stabilization
    let lastRect = { top: 0, left: 0, width: 0, height: 0 };
    let stabilityCounter = 0;
    let attemptCounter = 0;
    // NEW: Increase attempts for navigation elements
    const MAX_ATTEMPTS = isInExpandedNav ? 60 : (isInModal ? 50 : 30);
    const CHECK_INTERVAL = isInExpandedNav ? 80 : (isInModal ? 100 : 50);
    const INITIAL_DELAY = isInExpandedNav ? 400 : (isInModal ? 300 : 0);
    
    console.log(`[HIGHLIGHT-POSITION] Configuration: delay=${INITIAL_DELAY}ms, interval=${CHECK_INTERVAL}ms, maxAttempts=${MAX_ATTEMPTS}`);
    
    // Function to update the wrapper position
    const updatePosition = () => {
      attemptCounter++;
      
      const rect = element.getBoundingClientRect();
      const styles = window.getComputedStyle(element);
      
      // Log positioning state for debugging
      if (attemptCounter % 5 === 0 || attemptCounter <= 2) {
        console.log(`[HIGHLIGHT-POSITION] Update #${attemptCounter}:`, {
          rect,
          display: styles.display,
          visibility: styles.visibility,
          opacity: styles.opacity,
          stabilityCounter,
          inViewport: rect.width > 0 && rect.height > 0 && 
                     rect.top >= 0 && rect.left >= 0 &&
                     rect.bottom <= window.innerHeight && rect.right <= window.innerWidth,
          elementConnected: element.isConnected
        });
      }
      
      // NEW: Enhanced check for valid element size and visibility
      const hasValidSize = rect.width > 0 && rect.height > 0;
      const isInDocument = document.body.contains(element);
      
      // Only update if element has a valid position we can use
      if (hasValidSize && isInDocument) {
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;
        
        const transformValue = `translate(${rect.left + scrollX}px, ${rect.top + scrollY}px)`;
        wrapper.style.transform = transformValue;
        wrapper.style.width = `${rect.width}px`;
        wrapper.style.height = `${rect.height}px`;
        
        // Check if position has stabilized
        const positionChanged = 
          Math.abs(rect.top - lastRect.top) > 1 || 
          Math.abs(rect.left - lastRect.left) > 1 ||
          Math.abs(rect.width - lastRect.width) > 1 || 
          Math.abs(rect.height - lastRect.height) > 1;
        
        if (positionChanged) {
          // Position still changing, reset counter
          stabilityCounter = 0;
          // Update last rect
          lastRect = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
          console.log('[HIGHLIGHT-POSITION] Position changed, reset stability counter');
        } else {
          // Position stable, increment counter
          stabilityCounter++;
          
          // If position stable for several checks, show the highlight
          if (stabilityCounter >= 3) {
            wrapper.style.opacity = '1';
            console.log('[HIGHLIGHT-POSITION] Position stabilized, showing highlight with transform: ' + transformValue);
            
            // If very stable, stop active checking
            if (stabilityCounter >= 5 && wrapper['positionInterval']) {
              clearInterval(wrapper['positionInterval']);
              wrapper['positionInterval'] = null;
              console.log('[HIGHLIGHT-POSITION] Stopped active position monitoring');
            }
          }
        }
      } else if (isInExpandedNav && attemptCounter < MAX_ATTEMPTS/2) {
        // For nav elements that might be expanding, keep trying
        console.log('[HIGHLIGHT-POSITION] Navigation element not yet ready, continuing to wait...');
        if (attemptCounter % 10 === 0) {
          // Periodically log additional details about the navigation element
          console.log('[HIGHLIGHT-POSITION] Nav element details:', {
            hasSize: hasValidSize,
            isConnected: element.isConnected,
            rect: element.getBoundingClientRect(),
            styles: {
              display: window.getComputedStyle(element).display,
              visibility: window.getComputedStyle(element).visibility,
              opacity: window.getComputedStyle(element).opacity
            }
          });
        }
      } else {
        console.log(`[HIGHLIGHT-POSITION] Element invalid: hasSize=${hasValidSize}, inDoc=${isInDocument}, attempt=${attemptCounter}`);
        
        // NEW: Try to find nearest visible parent to position on instead
        if (isInDocument && !hasValidSize && element.parentElement) {
          let parent = element.parentElement;
          let foundVisibleParent = false;
          let parentSearchDepth = 0;
          
          // Walk up the tree looking for a visible parent
          while (parent && parent !== document.body && !foundVisibleParent && parentSearchDepth < 10) {
            parentSearchDepth++;
            const parentRect = parent.getBoundingClientRect();
            if (parentRect.width > 0 && parentRect.height > 0) {
              console.log('[HIGHLIGHT-POSITION] Found visible parent at depth ' + parentSearchDepth, {
                tag: parent.tagName,
                id: parent.id,
                classes: parent.className,
                rect: parentRect,
                styles: {
                  display: window.getComputedStyle(parent).display,
                  position: window.getComputedStyle(parent).position
                }
              });
              
              const scrollX = window.scrollX || window.pageXOffset;
              const scrollY = window.scrollY || window.pageYOffset;
              
              const transformValue = `translate(${parentRect.left + scrollX}px, ${parentRect.top + scrollY}px)`;
              wrapper.style.transform = transformValue;
              wrapper.style.width = `${parentRect.width}px`;
              wrapper.style.height = `${parentRect.height}px`;
              wrapper.style.opacity = '1';
              
              console.log('[HIGHLIGHT-POSITION] Positioned on parent with transform: ' + transformValue);
              foundVisibleParent = true;
              break;
            }
            const nextParent = parent.parentElement;
            if (!nextParent) {
              console.log('[HIGHLIGHT-POSITION] No more parents to check');
              break;
            }
            parent = nextParent;
          }
          
          if (!foundVisibleParent) {
            console.log('[HIGHLIGHT-POSITION] No visible parent found after checking ' + parentSearchDepth + ' ancestors');
          }
        }
      }
      
      // Stop after max attempts to prevent infinite loops
      if (attemptCounter >= MAX_ATTEMPTS) {
        if (wrapper['positionInterval']) {
          clearInterval(wrapper['positionInterval']);
          wrapper['positionInterval'] = null;
          console.log('[HIGHLIGHT-POSITION] Max attempts reached, stopping monitoring');
          
          // Force highlight to show if we've reached max attempts
          wrapper.style.opacity = '1';
          console.log('[HIGHLIGHT-POSITION] Forcing highlight to show after max attempts');
          
          // Log final state for diagnosis
          console.log('[HIGHLIGHT-POSITION] Final element state:', {
            element: {
              tag: element.tagName,
              id: element.id,
              connected: element.isConnected,
              rect: element.getBoundingClientRect()
            },
            highlight: {
              opacity: wrapper.style.opacity,
              transform: wrapper.style.transform,
              width: wrapper.style.width,
              height: wrapper.style.height
            }
          });
        }
      }
    };
    
    // Use setTimeout to add a delay before starting position monitoring
    setTimeout(() => {
      console.log(`[HIGHLIGHT-POSITION] Starting position monitoring with ${
        isInExpandedNav ? 'navigation' : (isInModal ? 'modal' : 'standard')
      } settings`);
      
      // Start actively monitoring position changes
      const positionInterval = setInterval(updatePosition, CHECK_INTERVAL);
      
      // Store interval for cleanup
      wrapper['positionInterval'] = positionInterval;
      
      // Initial position update
      updatePosition();
    }, INITIAL_DELAY);
    
    // Continue with your existing observer and event handler code...
  }

  // Add a new method to properly clean up all UI components
  static cleanupAllUI(keepCursor: boolean = false): void {
    console.log('[CLEANUP-DEBUG] Starting UI cleanup' + (keepCursor ? ' (keeping cursor)' : ''));
    
    // Clean up the guidance container and its contents
    const container = document.querySelector('.hyphen-guidance-container') as EnhancedHTMLElement;
    if (container) {
      // Clean up event listeners
      if (container['observer']) {
        container['observer'].disconnect();
      }
      if (container['parentObserver']) {
        container['parentObserver'].disconnect();
      }
      if (container['positionInterval']) {
        clearInterval(container['positionInterval']);
      }
      if (container['scrollHandler']) {
        window.removeEventListener('scroll', container['scrollHandler']);
        window.removeEventListener('resize', container['scrollHandler']);
      }
      document.body.removeChild(container);
    }
    
    // Clean up both highlight mechanisms
    
    // 1. Clean up CursorFlowUI highlight wrapper by ID
    const highlightWrapper = document.getElementById('hyphenbox-highlight-wrapper');
    if (highlightWrapper) {
      const enhancedWrapper = highlightWrapper as EnhancedHTMLElement;
      if (enhancedWrapper['observer']) {
        enhancedWrapper['observer'].disconnect();
      }
      if (enhancedWrapper['parentObserver']) {
        enhancedWrapper['parentObserver'].disconnect();
      }
      if (enhancedWrapper['positionInterval']) {
        clearInterval(enhancedWrapper['positionInterval']);
      }
      if (enhancedWrapper['scrollHandler']) {
        window.removeEventListener('scroll', enhancedWrapper['scrollHandler']);
        window.removeEventListener('resize', enhancedWrapper['scrollHandler']);
      }
      highlightWrapper.parentNode?.removeChild(highlightWrapper);
    }
    
    // 2. Clean up DomAnalyzer highlight container
    const domAnalyzerContainer = document.getElementById('hyphenbox-highlight-container');
    if (domAnalyzerContainer) {
      domAnalyzerContainer.parentNode?.removeChild(domAnalyzerContainer);
    }
    
    // Clean up ALL text popups - both by ID and class
    const textPopupById = document.getElementById('hyphenbox-text-popup');
    if (textPopupById && textPopupById.parentNode) {
      console.log('[CLEANUP-DEBUG] Removing text popup by ID');
      textPopupById.parentNode.removeChild(textPopupById);
    }
    
    // Also clean up by class to catch any that might have been created without ID
    const textPopupsByClass = document.querySelectorAll('.hyphen-text-popup');
    textPopupsByClass.forEach(popup => {
      if (popup.parentNode) {
        console.log('[CLEANUP-DEBUG] Removing text popup by class');
        popup.parentNode.removeChild(popup);
      }
    });
    
    // Only clean up cursor if explicitly requested
    if (!keepCursor) {
      // Find cursor wrapper by ID
      const cursorWrapper = document.getElementById('hyphenbox-cursor-wrapper');
      if (cursorWrapper) {
        const enhancedWrapper = cursorWrapper as EnhancedHTMLElement;
        // Clean up all event listeners and observers
        if (enhancedWrapper['observer']) {
          enhancedWrapper['observer'].disconnect();
        }
        if (enhancedWrapper['parentObserver']) {
          enhancedWrapper['parentObserver'].disconnect();
        }
        if (enhancedWrapper['positionInterval']) {
          clearInterval(enhancedWrapper['positionInterval']);
        }
        if (enhancedWrapper['scrollHandler']) {
          window.removeEventListener('scroll', enhancedWrapper['scrollHandler']);
          window.removeEventListener('resize', enhancedWrapper['scrollHandler']);
        }
        // Remove the wrapper and cursor
        cursorWrapper.parentNode?.removeChild(cursorWrapper);
      }
    }
    
    // Clean up draggable elements' event handlers
    const draggables = document.querySelectorAll('.hyphen-draggable') as NodeListOf<EnhancedHTMLElement>;
    draggables.forEach(draggable => {
      if (draggable['_hyphenDragHandlers']) {
        document.removeEventListener('mousemove', draggable['_hyphenDragHandlers'].mouseMove);
        document.removeEventListener('mouseup', draggable['_hyphenDragHandlers'].mouseUp);
        delete draggable['_hyphenDragHandlers'];
      }
    });
    
    // Remove any notifications
    const notifications = document.querySelectorAll('.hyphen-notification');
    notifications.forEach(notification => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    });
    
    // Also clean up any elements that might have been directly highlighted
    const highlightedElements = document.querySelectorAll('[data-highlighted-by-dom-analyzer="true"]');
    highlightedElements.forEach(el => {
      const element = el as HTMLElement;
      // Restore original styles
      element.style.outline = element.dataset.originalOutline || '';
      element.style.backgroundColor = element.dataset.originalBackground || '';
      // Remove our data attributes
      delete element.dataset.originalOutline;
      delete element.dataset.originalBackground;
      delete element.dataset.highlightedByDomAnalyzer;
    });
    
    console.log('[CLEANUP-DEBUG] UI elements cleanup completed');
  }

  /*
  static showGuidanceElements(element: HTMLElement, cursor: HTMLElement, highlight: HTMLElement, text: string, theme: ThemeOptions): void {
    // Add a unique debug log to identify when this method is called
    console.log('[CURSOR-DEBUG] Using showGuidanceElements method - places cursor at BOTTOM-RIGHT of element');
    
    // Get or create the container (reuse if possible)
    let container = document.querySelector('.hyphen-guidance-container') as EnhancedHTMLElement;
    let shouldUpdatePositionOnly = false;
    
    // If container exists, we'll reuse it instead of recreating
    if (container) {
      // Clear previous observers gracefully
      if (container['observer']) {
        container['observer'].disconnect();
      }
      shouldUpdatePositionOnly = true;
    } else {
      // Create new container
      container = document.createElement('div') as EnhancedHTMLElement;
      container.className = 'hyphen-guidance-container';
      container.style.position = 'absolute';
      container.style.top = '0';
      container.style.left = '0';
      container.style.pointerEvents = 'none';
      container.style.zIndex = '9998';
      
      // Add container to document once
      document.body.appendChild(container);
      
      // Add the highlight (once) with padding
      container.appendChild(highlight);
      highlight.style.position = 'absolute';
      highlight.style.left = '-4px';
      highlight.style.top = '-4px';
      highlight.style.width = 'calc(100% + 8px)';
      highlight.style.height = 'calc(100% + 8px)';
      
      // Position cursor at bottom right edge of highlighted element
      container.appendChild(cursor);
      cursor.style.position = 'absolute';
      cursor.style.right = '-24px';
      cursor.style.bottom = '-24px';
      cursor.style.transform = 'none';
    }
    
    // Only update text content if popup exists
    const existingPopup = container.querySelector('.hyphen-text-popup');
    let popup: HTMLElement;
    
    if (existingPopup) {
      popup = existingPopup as HTMLElement;
      // Just update text directly
      popup.textContent = text;
    } else {
      // Create new popup
      popup = this.createTextPopup(text, theme);
      container.appendChild(popup);
      popup.style.position = 'absolute';
    }
    
    // Use requestAnimationFrame for smoother position updates
    const updatePosition = () => {
      requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;
        
        container.style.transform = `translate(${rect.left + scrollX}px, ${rect.top + scrollY}px)`;
        container.style.width = `${rect.width}px`;
        container.style.height = `${rect.height}px`;
        
        // Position cursor at bottom right
        if (cursor) {
          cursor.style.right = '-24px';
          cursor.style.bottom = '-24px';
        }
        
        // Position textbox directly at cursor tip
        if (popup) {
          // Get cursor position within container
          const cursorRect = cursor.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          
          // The cursor SVG tip is approximately at these offsets from its top-left
          const cursorTipX = 24;  // Approximate X offset to cursor tip
          const cursorTipY = 16;  // Approximate Y offset to cursor tip
          
          // Position popup absolutely from container
          popup.style.position = 'absolute';
          popup.style.right = 'auto';
          popup.style.bottom = 'auto';
          popup.style.left = `calc(100% + ${cursorTipX}px)`;
          popup.style.top = `calc(100% - ${cursorTipY}px)`;
          
          // SIMPLIFIED: Just make the box wide and handle text properly
          popup.style.width = '150px';           // Fixed wider width
          popup.style.maxWidth = '500px';        // Match the width
          popup.style.whiteSpace = 'normal';     // Allow wrapping
          popup.style.wordWrap = 'break-word';   // Handle long words
          
          // No conditional width adjustment based on text length
          // This gives consistent wider box behavior
          
          // Viewport boundary checks (after positioning and sizing)
          setTimeout(() => {
            const popupRect = popup.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // If off right edge
            if (popupRect.right > viewportWidth) {
              popup.style.left = 'auto';
              popup.style.right = `calc(100% + 10px)`;
            }
            
            // If off bottom
            if (popupRect.bottom > viewportHeight) {
              popup.style.top = 'auto'; 
              popup.style.bottom = `calc(100% + 10px)`;
            }
          }, 0);
        }
      });
    };
    
    // Set up scroll/resize event listeners efficiently (only once)
    if (!shouldUpdatePositionOnly) {
      // Remove old handlers if they exist
      if (container['scrollHandler']) {
        window.removeEventListener('scroll', container['scrollHandler']);
        window.removeEventListener('resize', container['resizeHandler']);
      }
      
      // Throttled event handler
      const throttled = (() => {
        let lastCall = 0;
        return function() {
          const now = Date.now();
          if (now - lastCall >= 16) { // ~60fps
            lastCall = now;
            updatePosition();
          }
        };
      })();
      
      window.addEventListener('scroll', throttled, { passive: true });
      window.addEventListener('resize', throttled, { passive: true });
      container['scrollHandler'] = throttled;
      container['resizeHandler'] = throttled;
    }
    
    // Create a lighter MutationObserver
    const observer = new MutationObserver(() => {
      updatePosition();
    });
    
    // Watch only position-affecting attributes
    observer.observe(element, {
      attributes: true,
      attributeFilter: ['style', 'class'],
      childList: false
    });
    
    // Store the observer
    container['observer'] = observer;
    
    // Initial position update
    updatePosition();
  }
  */

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

  // Add a more efficient cleanup method that keeps elements but hides them
  static hideGuidanceElements(): void {
    const container = document.querySelector('.hyphen-guidance-container') as HTMLElement;
    if (container) {
      // Hide instead of removing
      container.style.display = 'none';
    }
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

  static async handleMantineFormTransition(buttonText: string, inputPlaceholder: string): Promise<HTMLElement | null> {
    console.log(`[MANTINE-HANDLER] Handling form transition for button "${buttonText}" and input "${inputPlaceholder}"`);
    
    // First wait for any portal animations to complete
    await ElementUtils.waitForPortalStability();
    
    // After portal has stabilized, find the input element
    let inputElement = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 10;
    
    while (!inputElement && attempts < MAX_ATTEMPTS) {
      attempts++;
      console.log(`[MANTINE-HANDLER] Attempt ${attempts} to find input`);
      
      // Use the specialized finder
      inputElement = ElementUtils.findMantineInput(inputPlaceholder);
      
      if (!inputElement) {
        // Wait a bit before trying again
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }
    
    if (inputElement) {
      console.log('[MANTINE-HANDLER] Successfully found input element:', {
        id: inputElement.id,
        classes: inputElement.className,
        rect: inputElement.getBoundingClientRect()
      });
    } else {
      console.log('[MANTINE-HANDLER] Failed to find input element after all attempts');
    }
    
    return inputElement;
  }

  // Add a new method to show thinking indicator
  static showThinkingIndicator(button: HTMLElement): HTMLElement {
    console.log('[THINKING-DEBUG] Showing thinking indicator');
    
    // Create a container for the thinking indicator
    const container = document.createElement('div');
    container.className = 'hyphen-thinking-indicator';
    container.style.cssText = `
      position: fixed;
      z-index: 9999;
      pointer-events: none;
    `;
    
    // Create a cursor element
    const cursor = this.createCursor({});
    cursor.style.cssText = `
      display: block;
      position: absolute;
      bottom: 5px;
      left: 5px;
      animation: hyphen-pulse 1.5s infinite;
    `;
    
    // Create text bubble
    const bubble = document.createElement('div');
    bubble.style.cssText = `
      position: absolute;
      background: #ffffff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #333;
      bottom: 10px;
      left: 45px;
      white-space: nowrap;
    `;
    
    // Add loading dots animation to the text
    bubble.innerHTML = `
      Thinking<span class="hyphen-loading-dots"><span>.</span><span>.</span><span>.</span></span>
    `;
    
    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
      @keyframes hyphen-pulse {
        0% { opacity: 0.6; transform: scale(0.95); }
        50% { opacity: 1; transform: scale(1); }
        100% { opacity: 0.6; transform: scale(0.95); }
      }
      
      .hyphen-loading-dots span {
        animation: hyphen-dots 1.5s infinite;
        animation-fill-mode: both;
        opacity: 0;
      }
      
      .hyphen-loading-dots span:nth-child(2) {
        animation-delay: 0.2s;
      }
      
      .hyphen-loading-dots span:nth-child(3) {
        animation-delay: 0.4s;
      }
      
      @keyframes hyphen-dots {
        0% { opacity: 0; }
        25% { opacity: 1; }
        50% { opacity: 1; }
        75% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
    
    // Add elements to container
    container.appendChild(cursor);
    container.appendChild(bubble);
    
    // Position the container relative to the button
    const buttonRect = button.getBoundingClientRect();
    container.style.left = `${buttonRect.left - 10}px`;
    container.style.top = `${buttonRect.top - 70}px`;
    
    // Add to document
    document.body.appendChild(container);
    
    // Add entrance animation
    container.animate([
      { opacity: 0, transform: 'translateY(10px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], {
      duration: 300,
      easing: 'ease-out'
    });
    
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
}

// Helper function to adjust color brightness
function adjustColor(color: string, amount: number): string {
  try {
    // Simple algorithm to darken/lighten hex color
    return color.replace(/^#/, '').replace(/.{2}/g, (c) => {
      const newC = Math.max(0, Math.min(255, parseInt(c, 16) + amount));
      return newC.toString(16).padStart(2, '0');
    });
  } catch (e) {
    return color;
  }
}