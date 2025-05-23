import { ApiClient } from './apiClient';
import { OnboardingChecklist, OnboardingFlow, ThemeOptions } from './types';
import hyphenboxSvg from '../assets/hyphenbox.svg';
import { CopilotModal } from './copilotModal';

export class OnboardingModal {
  private static activeModal: HTMLElement | null = null;
  private static apiClient: ApiClient | null = null;
  private static theme: ThemeOptions = {};
  private static onFlowSelected: (flowId: string) => void = () => {};
  private static checklists: OnboardingChecklist[] = [];
  private static loadingStyleAdded: boolean = false;

  /**
   * Initialize the Onboarding Modal
   */
  static init(
    apiClient: ApiClient, 
    onFlowSelected: (flowId: string) => void, 
    theme: ThemeOptions = {}
  ): void {
    this.apiClient = apiClient;
    this.onFlowSelected = onFlowSelected;
    this.theme = theme;
    this.addLoadingStyle();
  }

  /**
   * Create a button to show the onboarding checklists
   */
  static createOnboardingButton(container: HTMLElement, buttonText: string = 'Onboarding', customClass?: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = buttonText;
    button.className = customClass || 'hyphen-onboarding-button';
    
    if (!customClass) {
      button.style.cssText = `
        background-color: ${this.theme?.buttonColor || '#007bff'};
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        transition: background-color 0.2s ease, transform 0.1s ease;
      `;
      
      button.addEventListener('mouseover', () => {
        button.style.backgroundColor = this.adjustColor(this.theme?.buttonColor || '#007bff', -20);
      });
      
      button.addEventListener('mouseout', () => {
        button.style.backgroundColor = this.theme?.buttonColor || '#007bff';
      });
      
      button.addEventListener('mousedown', () => {
        button.style.transform = 'scale(0.98)';
      });
      
      button.addEventListener('mouseup', () => {
        button.style.transform = 'scale(1)';
      });
    }
    
    button.addEventListener('click', () => {
      this.showOnboardingModal();
    });
    
    container.appendChild(button);
    return button;
  }

  /**
   * Render onboarding content in an existing modal container
   * This can be used to render onboarding within CopilotModal
   */
  static async renderInExistingModal(container: HTMLElement, onBack?: () => void): Promise<void> {
    if (!container) {
      console.error('[OnboardingModal] Cannot render in null container');
      return;
    }

    // Clear existing content
    container.innerHTML = '';

    // Initial loading state within the container (before checklists are fetched)
    const tempLoadingHeader = document.createElement('div');
    tempLoadingHeader.style.cssText = 'padding: 16px; text-align: center;';
    const loadingTitle = this.createHeaderTitleElement('Loading...');
    tempLoadingHeader.appendChild(loadingTitle);
    container.appendChild(tempLoadingHeader);

    const loadingIndicatorDiv = document.createElement('div');
    loadingIndicatorDiv.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      color: #888;
      min-height: 100px;
      margin: 20px 0;
    `;
    loadingIndicatorDiv.innerHTML = `
      <span class="hyphen-loading-dots"><span>.</span><span>.</span><span>.</span></span>
    `;
    container.appendChild(loadingIndicatorDiv);

    // Fetch and render checklists
    if (this.apiClient) {
      try {
        console.log('[OnboardingModal] Fetching onboarding checklists for inline display...');
        this.checklists = await this.apiClient.getOnboardingChecklists();
        console.log('[OnboardingModal] Checklists fetched for inline display:', this.checklists);

        // Now that checklists are fetched, clear loading and render proper header + content
        container.innerHTML = ''; // Clear again to remove temp loading

        const firstChecklist = (this.checklists && this.checklists.length > 0) ? this.checklists[0] : undefined;
        const headerElement = this.createDynamicHeader(firstChecklist, '', onBack);
        container.appendChild(headerElement);

        // Render checklists (or empty state)
        if (!this.checklists || this.checklists.length === 0) {
          const emptyState = document.createElement('div');
          emptyState.style.cssText = `
            padding: 32px 16px;
            text-align: center;
            color: #777;
            font-style: italic;
          `;
          emptyState.textContent = 'No onboarding checklists available.';
          container.appendChild(emptyState);
        } else {
          // Render each checklist
          const checklistsContainer = document.createElement('div');
          checklistsContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 24px;
            margin-bottom: 16px;
          `;
          
          this.checklists.forEach(checklist => {
            const checklistEl = this.createChecklistElement(checklist);
            checklistsContainer.appendChild(checklistEl);
          });
          
          container.appendChild(checklistsContainer);
        }
      } catch (error) {
        console.error('[OnboardingModal] Failed to load onboarding checklists for inline display:', error);
        // More detailed error logging
        if (error instanceof Error) {
          console.error('[OnboardingModal] Error details:', error.message, error.stack);
        }
        
        // Remove loading indicator
        container.removeChild(loadingIndicatorDiv);
        
        // Show error message
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
          padding: 20px;
          background-color: #fff5f5;
          border: 1px solid #ffcccc;
          border-radius: 8px;
          color: #dc3545;
          text-align: center;
          margin: 16px 0;
        `;
        errorDiv.textContent = 'Failed to load onboarding checklists. Please try again later.';
        container.appendChild(errorDiv);
        
        // Try again button
        const retryButton = document.createElement('button');
        retryButton.textContent = 'Try Again';
        retryButton.style.cssText = `
          padding: 8px 16px;
          background-color: ${this.theme.buttonColor || '#007bff'};
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          margin: 0 auto 16px;
          display: block;
        `;
        retryButton.addEventListener('click', () => {
          // Try to render again
          this.renderInExistingModal(container, onBack);
        });
        container.appendChild(retryButton);
      }
    } else {
      console.error('[OnboardingModal] API client not initialized for inline display');
      
      // Remove loading indicator
      container.removeChild(loadingIndicatorDiv);
      
      // Show error message
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = `
        padding: 20px;
        background-color: #fff5f5;
        border: 1px solid #ffcccc;
        border-radius: 8px;
        color: #dc3545;
        text-align: center;
        margin: 16px 0;
      `;
      errorDiv.textContent = 'API client not initialized. Please refresh the page and try again.';
      container.appendChild(errorDiv);
    }
  }

  /**
   * Show the onboarding modal with checklists
   */
  static async showOnboardingModal(): Promise<void> {
    // Close any existing modal
    this.closeModal();

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'hyphen-onboarding-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.7);
      z-index: 10000;
      display: flex;
      justify-content: center;
      align-items: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    // Create modal container
    const modal = document.createElement('div');
    modal.id = 'hyphen-onboarding-modal';
    modal.style.cssText = `
      background-color: #ffffff;
      padding: 0;
      border-radius: 16px;
      box-shadow: 0 5px 20px rgba(0, 0, 0, 0.15);
      width: 90%;
      max-width: 600px;
      max-height: 80vh;
      transform: translateY(20px);
      transition: transform 0.3s ease;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    // Inner container for content
    const modalContent = document.createElement('div');
    modalContent.id = 'hyphen-onboarding-content';
    modalContent.style.cssText = `
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      flex-grow: 1;
      overflow-y: auto;
    `;

    // Set loading state initially
    this.renderLoadingState(modalContent);

    // Assemble Modal
    modal.appendChild(modalContent);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this.activeModal = modal;

    // Trigger animations
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      modal.style.transform = 'translateY(0)';
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeModal();
      }
    });

    // Fetch and render checklists
    if (this.apiClient) {
      try {
        console.log('[OnboardingModal] Fetching onboarding checklists...');
        this.checklists = await this.apiClient.getOnboardingChecklists();
        console.log('[OnboardingModal] Checklists fetched:', this.checklists);
        this.renderChecklists(modalContent);
      } catch (error) {
        console.error('[OnboardingModal] Failed to load onboarding checklists:', error);
        // More detailed error logging
        if (error instanceof Error) {
          console.error('[OnboardingModal] Error details:', error.message, error.stack);
        }
        this.renderError(modalContent);
      }
    } else {
      console.error('[OnboardingModal] API client not initialized');
      this.renderError(modalContent, 'API client not initialized');
    }
  }

  /**
   * Close the onboarding modal
   */
  static closeModal(): void {
    const overlay = document.getElementById('hyphen-onboarding-overlay');
    const modal = this.activeModal;

    if (overlay && modal) {
      overlay.style.opacity = '0';
      modal.style.transform = 'translateY(20px)';
      setTimeout(() => {
        if (document.body.contains(overlay)) {
          document.body.removeChild(overlay);
        }
        this.activeModal = null;
      }, 300);
    } else if (overlay && document.body.contains(overlay)) {
      document.body.removeChild(overlay);
    }
    this.activeModal = null;
  }

  /**
   * Render loading state while fetching checklists
   */
  private static renderLoadingState(container: HTMLElement): void {
    container.innerHTML = '';

    // Use a generic header for loading state, or a simplified one from the first checklist if already fetched (though likely not)
    const headerElement = this.createDynamicHeader(undefined, 'Loading...');
    container.appendChild(headerElement);

    // Loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      color: #888;
      min-height: 100px;
    `;
    loadingDiv.innerHTML = `
      <span class="hyphen-loading-dots"><span>.</span><span>.</span><span>.</span></span>
    `;

    // Footer
    const footer = this.createFooter();

    // Assemble
    container.appendChild(loadingDiv);
    container.appendChild(footer);
  }

  /**
   * Render error state if checklists couldn't be loaded
   */
  private static renderError(container: HTMLElement, message: string = 'Failed to load checklists'): void {
    container.innerHTML = '';

    const headerElement = this.createDynamicHeader(undefined, ''); // No title for error state
    container.appendChild(headerElement);

    // Error message
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      padding: 20px;
      background-color: #fff5f5;
      border: 1px solid #ffcccc;
      border-radius: 8px;
      color: #dc3545;
      text-align: center;
      margin-bottom: 16px;
    `;
    errorDiv.textContent = message;

    // Try again button
    const retryButton = document.createElement('button');
    retryButton.textContent = 'Try Again';
    retryButton.style.cssText = `
      padding: 8px 16px;
      background-color: ${this.theme.buttonColor || '#007bff'};
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      margin: 0 auto;
      display: block;
    `;
    retryButton.addEventListener('click', () => {
      const modalContent = document.getElementById('hyphen-onboarding-content');
      if (modalContent) {
        this.renderLoadingState(modalContent);
        if (this.apiClient) {
          this.apiClient.getOnboardingChecklists()
            .then(checklists => {
              this.checklists = checklists;
              this.renderChecklists(modalContent);
            })
            .catch(() => this.renderError(modalContent));
        }
      }
    });

    // Footer
    const footer = this.createFooter();

    // Assemble
    container.appendChild(errorDiv);
    container.appendChild(retryButton);
    container.appendChild(footer);
  }

  /**
   * Render the checklists
   */
  private static renderChecklists(container: HTMLElement): void {
    container.innerHTML = '';

    const firstChecklist = (this.checklists && this.checklists.length > 0) ? this.checklists[0] : undefined;
    const headerElement = this.createDynamicHeader(firstChecklist);
    container.appendChild(headerElement);

    if (!this.checklists || this.checklists.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.style.cssText = `
        padding: 32px 16px;
        text-align: center;
        color: #777;
        font-style: italic;
      `;
      emptyState.textContent = 'No checklists available.';
      container.appendChild(emptyState);
      container.appendChild(this.createFooter());
      return;
    }
    
    // Render each checklist
    const checklistsContainer = document.createElement('div');
    checklistsContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 24px;
    `;
    
    this.checklists.forEach(checklist => {
      const checklistEl = this.createChecklistElement(checklist);
      checklistsContainer.appendChild(checklistEl);
    });
    
    // Footer
    const footer = this.createFooter();
    
    // Assemble
    container.appendChild(checklistsContainer);
    container.appendChild(footer);
  }

  /**
   * Create a checklist element
   */
  private static createChecklistElement(checklist: OnboardingChecklist): HTMLElement {
    const mainContainer = document.createElement('div');
    mainContainer.className = 'onboarding-checklist-content';
    // No border here, border will be on the flowsList a.ka. the "box"
    mainContainer.style.cssText = ` 
      display: flex;
      flex-direction: column;
      gap: 16px; /* Space between description and flows box */
    `;

    // Description (plain text, no background, directly under header line)
    if (checklist.description) {
      const descriptionEl = document.createElement('p');
      descriptionEl.textContent = checklist.description;
      descriptionEl.style.cssText = `
        margin: 0;
        padding: 0 16px; /* Horizontal padding to align with modal content */
        font-size: 14px;
        color: #666;
        line-height: 1.4;
        background-color: transparent;
      `;
      mainContainer.appendChild(descriptionEl);
    }
    
    // Checklist flows (this will be the "box")
    const flowsList = document.createElement('div');
    flowsList.className = 'onboarding-flows-box';
    flowsList.style.cssText = `
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    `;
    
    if (checklist.flows && checklist.flows.length > 0) {
      checklist.flows.forEach((flow, index) => {
        const flowItem = this.createFlowItem(flow, index === checklist.flows.length - 1);
        flowsList.appendChild(flowItem);
      });
    } else {
      // Optional: Add a message if there are no flows in this checklist
      const noFlowsMessage = document.createElement('div');
      noFlowsMessage.textContent = 'No steps in this checklist yet.';
      noFlowsMessage.style.cssText = `
        padding: 16px;
        text-align: center;
        font-style: italic;
        color: #888;
        font-size: 13px;
      `;
      flowsList.appendChild(noFlowsMessage);
    }
    
    mainContainer.appendChild(flowsList);
    
    return mainContainer;
  }

  /**
   * Create a flow item element
   */
  private static createFlowItem(flow: OnboardingFlow, isLast: boolean): HTMLElement {
    const flowItem = document.createElement('div');
    flowItem.className = 'onboarding-flow-item';
    flowItem.style.cssText = `
      padding: 12px 16px;
      display: flex;
      align-items: center;
      ${!isLast ? 'border-bottom: 1px solid #f0f0f0;' : ''}
      cursor: pointer;
      transition: background-color 0.2s ease, transform 0.1s ease;
    `;
    
    flowItem.addEventListener('mouseover', () => {
      flowItem.style.backgroundColor = '#f9f9f9';
    });
    
    flowItem.addEventListener('mouseout', () => {
      flowItem.style.backgroundColor = '';
    });
    
    flowItem.addEventListener('mousedown', () => {
      flowItem.style.transform = 'scale(0.99)';
    });
    flowItem.addEventListener('mouseup', () => {
      flowItem.style.transform = 'scale(1)';
    });
    flowItem.addEventListener('mouseleave', () => {
        flowItem.style.transform = 'scale(1)';
    });
    
    flowItem.addEventListener('click', () => {
      // Check if we're inside CopilotModal
      const isCopilotModal = !!document.getElementById('hyphen-search-overlay');
      
      // Close the appropriate modal
      if (isCopilotModal) {
        // If running inside CopilotModal, use its method to close
        if (typeof CopilotModal.closeSearchModal === 'function') {
          CopilotModal.closeSearchModal();
        } else {
          // Fallback: Try to close the overlay directly
          const overlay = document.getElementById('hyphen-search-overlay');
          if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
        }
      } else {
        // Use the standard close method for standalone OnboardingModal
        this.closeModal();
      }
      
      // Then trigger the flow
      this.onFlowSelected(flow.flow_id);
    });
    
    // Checkbox for completion status
    const checkbox = document.createElement('div');
    checkbox.style.cssText = `
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid ${flow.is_completed_by_user ? '#28a745' : '#dee2e6'};
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 12px;
      flex-shrink: 0;
      background-color: ${flow.is_completed_by_user ? '#28a745' : 'transparent'};
      transition: all 0.2s ease;
    `;
    
    if (flow.is_completed_by_user) {
      checkbox.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4.5 8.25L2.25 6L1.5 6.75L4.5 9.75L10.5 3.75L9.75 3L4.5 8.25Z" fill="white"/>
        </svg>
      `;
    }
    
    // Flow details (title only)
    const flowDetails = document.createElement('div');
    flowDetails.style.cssText = `
      flex-grow: 1;
    `;
    
    const flowTitle = document.createElement('div');
    flowTitle.textContent = flow.flow_name;
    flowTitle.style.cssText = `
      font-size: 14px;
      color: #333;
      font-weight: ${flow.is_completed_by_user ? '400' : '500'};
    `;
    
    flowDetails.appendChild(flowTitle);
    
    // Remove flow description - only show title
    
    // Assemble flow item
    flowItem.appendChild(checkbox);
    flowItem.appendChild(flowDetails);
    
    return flowItem;
  }

  /**
   * Create the footer element
   */
  private static createFooter(): HTMLElement {
    const footer = document.createElement('div');
    footer.style.cssText = `
      display: flex;
      justify-content: flex-end;
      align-items: center;
      padding-top: 16px;
      margin-top: 16px;
      border-top: 1px solid #f0f0f0;
    `;
    
    // Powered by
    const poweredBy = document.createElement('div');
    poweredBy.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      color: #666;
      font-size: 12px;
      line-height: 1;
    `;
    
    const poweredByText = document.createElement('span');
    poweredByText.textContent = 'powered by';
    poweredByText.style.cssText = `
      opacity: 0.7;
      display: flex;
      align-items: center;
      height: 18px;
    `;
    
    // Logo link
    const logoLink = document.createElement('a');
    logoLink.href = 'https://hyphenbox.com';
    logoLink.target = '_blank';
    logoLink.rel = 'noopener noreferrer';
    logoLink.style.display = 'flex';
    logoLink.style.alignItems = 'center';
    logoLink.style.textDecoration = 'none';
    
    const logoContainer = document.createElement('div');
    logoContainer.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      height: 18px;
      width: 55px;
      position: relative;
      transform: translateY(1px);
      cursor: pointer;
    `;
    
    logoContainer.innerHTML = hyphenboxSvg;
    
    // Append logo container to link
    logoLink.appendChild(logoContainer);
    
    // Add hover effect
    const svgElement = logoContainer.querySelector('svg');
    if (svgElement) {
      svgElement.style.cssText = `
        width: 100%;
        height: 100%;
        opacity: 0.7;
        display: block;
        transition: opacity 0.2s ease;
      `;
      svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svgElement.setAttribute('viewBox', '0 0 3163 849');
      
      logoLink.addEventListener('mouseover', () => {
        svgElement.style.opacity = '1';
      });
      
      logoLink.addEventListener('mouseout', () => {
        svgElement.style.opacity = '0.7';
      });
    }
    
    // Assemble footer
    poweredBy.appendChild(poweredByText);
    poweredBy.appendChild(logoLink);
    footer.appendChild(poweredBy);
    
    return footer;
  }

  /**
   * Adjust color brightness
   */
  private static adjustColor(color: string, amount: number): string {
    try {
      let usePound = false;
      if (color[0] == "#") {
        color = color.slice(1);
        usePound = true;
      }
      const num = parseInt(color, 16);
      let r = (num >> 16) + amount;
      if (r > 255) r = 255;
      else if (r < 0) r = 0;
      let b = ((num >> 8) & 0x00FF) + amount;
      if (b > 255) b = 255;
      else if (b < 0) b = 0;
      let g = (num & 0x0000FF) + amount;
      if (g > 255) g = 255;
      else if (g < 0) g = 0;
      const newColor = (g | (b << 8) | (r << 16)).toString(16);
      // Pad with leading zeros if necessary
      const paddedColor = "000000".slice(newColor.length) + newColor;
      return (usePound ? "#" : "") + paddedColor;
    } catch (e) {
      return color; // Fallback
    }
  }

  /**
   * Add loading dots style
   */
  private static addLoadingStyle(): void {
    if (this.loadingStyleAdded) return;
    
    const style = document.createElement('style');
    style.textContent = `
      .hyphen-loading-dots span {
        animation: hyphen-dots 1.4s infinite;
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
        0%, 80%, 100% { opacity: 0; }
        40% { opacity: 1; }
      }
    `;
    
    document.head.appendChild(style);
    this.loadingStyleAdded = true;
  }

  // --- NEW HELPER METHODS ---

  private static createHeaderTitleElement(text: string): HTMLElement {
    const titleElement = document.createElement('h2');
    titleElement.textContent = text;
    Object.assign(titleElement.style, {
        margin: '0',
        fontSize: '22px',
        fontWeight: '600',
        color: this.theme?.text_color || '#1a1a1a',
        textAlign: 'center' as 'center',
        flexGrow: '1'
    });
    return titleElement;
  }

  /**
   * Creates a dynamic header for the onboarding modal or inline view.
   * If onBack is provided (i.e., hosted scenario), it will not render its own back button visual,
   * as the host (CopilotModal) is expected to provide it and use the onBack callback.
   */
  private static createDynamicHeader(
    checklist?: OnboardingChecklist, 
    defaultTitle: string = '', 
    onBack?: () => void // If onBack is present, we assume it's hosted and won't create a visual back button here
  ): HTMLElement {
    const headerDiv = document.createElement('div');
    headerDiv.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between; 
      padding: 16px; /* Adjusted padding for more space */
      border-bottom: 1px solid #e0e0e0;
      margin-bottom: 16px; /* Space below header */
      min-height: 30px; 
      position: relative; /* For absolute positioning of elements if needed */
    `;

    let titleText = defaultTitle;
    if (checklist) {
      titleText = checklist.title_text || checklist.name;
    } else if (!defaultTitle) {
      titleText = 'Onboarding Checklists';
    }

    // Left side (Logo or back button for hosted)
    const leftArea = document.createElement('div');
    leftArea.style.cssText = 'display: flex; align-items: center; min-width: 40px;'; // min-width to balance close button

    if (onBack) {
      // Hosted scenario: CopilotModal handles the back button visually and uses the onBack callback.
      // We don't add a visual back button here, but this area could be used by the host.
    } else if (checklist) {
      const logoUrl = checklist.logo_url || this.theme?.logo_url;
      if (logoUrl) {
        const logo = document.createElement('img');
        logo.src = logoUrl;
        logo.alt = 'Logo';
        logo.style.cssText = `
          height: 24px;
          width: auto;
          border-radius: 4px;
          flex-shrink: 0;
        `;
        logo.onerror = () => { logo.style.display = 'none'; };
        leftArea.appendChild(logo);
      }
    }
    headerDiv.appendChild(leftArea);

    // Center (Title)
    const titleElement = this.createHeaderTitleElement(titleText);
    titleElement.style.textAlign = 'center';
    titleElement.style.flexGrow = '1'; // Allow title to take up space and center
    titleElement.style.margin = '0 10px'; // Add some horizontal margin to prevent touching sides
    headerDiv.appendChild(titleElement);

    // Right side (Close button or placeholder)
    const rightArea = document.createElement('div');
    rightArea.style.cssText = 'display: flex; align-items: center; min-width: 40px; justify-content: flex-end;';

    if (!onBack) { 
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '&times;';
        Object.assign(closeButton.style, {
            background: 'none', border: 'none', fontSize: '28px', fontWeight: '300', 
            color: '#888', cursor: 'pointer', padding: '0', lineHeight: '1', width:'24px', height:'24px'
        });
        closeButton.setAttribute('aria-label', 'Close');
        closeButton.onclick = () => this.closeModal();
        rightArea.appendChild(closeButton);
    } 
    headerDiv.appendChild(rightArea);

    return headerDiv;
  }
} 