import { ApiClient } from './apiClient';
import { ThemeOptions } from './types'; // Import from types.ts instead of uiComponents.ts
import hyphenboxSvg from '../assets/hyphenbox.svg'; // Import the SVG
import { OnboardingModal } from './onboardingChecklist';
import { ViewAllGuidesModal } from './viewAllGuides'; // Corrected import path

export class CopilotModal {
    private static activeModal: HTMLElement | null = null;
    private static apiClient: ApiClient | null = null; // To perform the search
    private static onGuideFound: (guideId: string) => void = () => {}; // Callback when guide found
    // private static onViewAllGuides: () => void = () => {}; // No longer needed, handled internally
    private static theme: ThemeOptions = {};
    private static searchLoadingIndicator: HTMLElement | null = null; // Specific loading indicator
    private static currentView: 'search' | 'list' | 'onboarding' = 'search'; // Track current view
    private static loadingDotsStyleAdded: boolean = false; // Ensure style is added only once

    // Pointers to the persistent containers within the modal
    private static modalHeaderContainer: HTMLElement | null = null;
    private static modalMainContentContainer: HTMLElement | null = null;
    private static modalFooterContainer: HTMLElement | null = null;

    static init(
        apiClient: ApiClient, 
        onGuideFound: (guideId: string) => void,
        theme: ThemeOptions = {}
    ) {
        this.apiClient = apiClient;
        this.onGuideFound = onGuideFound;
        this.theme = theme;
    }

    /**
     * Create a button to show the copilot modal
     */
    static createCopilotButton(container: HTMLElement, buttonText: string = 'Help & Guides', customClass?: string): HTMLButtonElement {
        const button = document.createElement('button');
        button.textContent = buttonText;
        button.className = customClass || 'hyphen-copilot-button';
        
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
            this.showSearchModal();
        });
        
        container.appendChild(button);
        return button;
    }

    static showSearchModal() {
        this.closeSearchModal(); // Close existing modal first
        this.currentView = 'search';
        this.addLoadingDotsStyle();

        const overlay = document.createElement('div');
        overlay.id = 'hyphen-search-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background-color: rgba(0, 0, 0, 0.7); z-index: 10000;
            display: flex; justify-content: center; align-items: center;
            opacity: 0; transition: opacity 0.3s ease;
        `;

        const modal = document.createElement('div');
        modal.id = 'hyphen-search-modal';
        modal.style.cssText = `
            background-color: #ffffff; padding: 0; border-radius: 16px;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.15); width: 90%; max-width: 500px;
            max-height: 80vh; transform: translateY(20px); transition: transform 0.3s ease;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex; flex-direction: column; overflow: hidden;
        `;

        // Create persistent containers
        this.modalHeaderContainer = document.createElement('div');
        this.modalHeaderContainer.id = 'hyphen-modal-header-content';
        this.modalHeaderContainer.style.padding = '24px 24px 0px 24px'; // Padding for header elements

        this.modalMainContentContainer = document.createElement('div');
        this.modalMainContentContainer.id = 'hyphen-modal-main-content'; // This is where app content goes
        this.modalMainContentContainer.style.cssText = `
            padding: 16px 24px; /* Standard padding for main content area */
            flex-grow: 1; 
            overflow-y: auto; 
        `;

        this.modalFooterContainer = document.createElement('div');
        this.modalFooterContainer.id = 'hyphen-modal-footer-content';
        // Footer styling will be applied by createFooter, but we can add base padding if needed.
        // this.modalFooterContainer.style.padding = '0 24px 24px 24px';

        modal.appendChild(this.modalHeaderContainer);
        modal.appendChild(this.modalMainContentContainer);
        modal.appendChild(this.modalFooterContainer);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        this.activeModal = modal;

        // Initial render: Search view for header and main content, and the persistent footer
        this.renderSearchView(); 
        this.renderPersistentFooter();

        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            modal.style.transform = 'translateY(0)';
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closeSearchModal();
            }
        });
    }

    private static renderPersistentHeader(viewTitle: string, showBackButton: boolean) {
        if (!this.modalHeaderContainer) return;
        this.modalHeaderContainer.innerHTML = ''; // Clear previous header

        // Only create title element if viewTitle is not empty
        let titleEl: HTMLElement | null = null;
        if (viewTitle.trim()) {
            titleEl = document.createElement('h2');
            titleEl.textContent = viewTitle;
            Object.assign(titleEl.style, {
                color: this.theme?.text_color || '#333',
                margin: '0', 
                fontSize: showBackButton ? '20px' : '24px', 
                fontWeight: '600',
                textAlign: showBackButton ? 'left' : 'center' as 'center',
                flexGrow: '1'
            });
        }

        if (showBackButton) {
            const backButton = document.createElement('button');
            backButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`;
            backButton.setAttribute('aria-label', 'Back');
            Object.assign(backButton.style, { background: 'none', border: 'none', padding: '0 10px 0 0', cursor: 'pointer', color: this.theme?.text_color || '#555', display: 'flex', alignItems: 'center' });
            backButton.onclick = () => {
                this.renderSearchView(); 
            };

            const headerRow = document.createElement('div');
            headerRow.style.display = 'flex';
            headerRow.style.alignItems = 'center';
            headerRow.appendChild(backButton);
            
            // Only add title if it exists
            if (titleEl) {
                headerRow.appendChild(titleEl);
            }
            
            this.modalHeaderContainer.appendChild(headerRow);
        } else if (titleEl) {
            // No back button, just title (only if title exists)
            this.modalHeaderContainer.appendChild(titleEl);
        }
    }

    private static renderPersistentFooter() {
        if (!this.modalFooterContainer) return;
        // The footer is now always the same, with nav links
        const footerElement = this.createFooter(); // No view parameter needed, or can be ignored
        this.modalFooterContainer.innerHTML = ''; // Clear previous
        this.modalFooterContainer.appendChild(footerElement);
    }

    private static renderSearchView() {
        if (!this.modalMainContentContainer || !this.modalHeaderContainer) return;
        this.currentView = 'search';
        
        this.renderPersistentHeader('How can I help you today?', false); // No back button for main search view
        this.modalMainContentContainer.innerHTML = ''; // Clear previous main content

        // Search container styling (from previous renderSearchView)
        const searchSection = document.createElement('div'); // Use a section for content within main
        Object.assign(searchSection.style, {
             // Optional: add specific padding for search section if needed, otherwise relies on modalMainContentContainer padding
        });

        const searchContainer = document.createElement('div');
        Object.assign(searchContainer.style, { /* ... search bar container styles ... */ 
            display: 'flex', alignItems: 'center', marginBottom: '25px',
            border: this.theme?.search_border_color ? `1px solid ${this.theme.search_border_color}` : '1px solid #ddd',
            borderRadius: '8px', padding: '5px'
        });

        const input = document.createElement('input');
        // ... input styles and event listeners ...
        input.type = 'text';
        input.placeholder = 'Ask a question or describe your task...';
        input.id = 'hyphen-search-input'; 
        Object.assign(input.style, { 
            flexGrow: '1', padding: '12px 15px', border: 'none', 
            outline: 'none', fontSize: '16px', backgroundColor: 'transparent' 
        });

        const searchButton = document.createElement('button');
        // ... search button styles, SVG, and event listener ...
        searchButton.id = 'hyphen-search-submit';
        searchButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
        searchButton.setAttribute('aria-label', 'Search');
        Object.assign(searchButton.style, { 
            padding: '10px', border: 'none', backgroundColor: 'transparent', 
            color: this.theme?.search_icon_color || '#555', cursor: 'pointer', 
            display: 'flex', alignItems: 'center', justifyContent: 'center' 
        });
        searchButton.onclick = () => this.handleSearch(input.value);
        input.onkeydown = (e) => { if (e.key === 'Enter') searchButton.click(); };

        searchContainer.appendChild(input);
        searchContainer.appendChild(searchButton);
        searchSection.appendChild(searchContainer);

        const resultsArea = document.createElement('div');
        resultsArea.id = 'hyphen-search-results';
        // ... resultsArea styling ...
        Object.assign(resultsArea.style, { 
            minHeight: '40px', textAlign: 'center' as 'center', fontSize: '14px', color: '#666',
            marginTop: '8px', marginBottom: '0px', /* No bottom margin, footer handles spacing */
            display: 'flex', flexDirection: 'column' as 'column', 
            alignItems: 'center' as 'center', justifyContent: 'center' as 'center', gap: '10px'
        });
        searchSection.appendChild(resultsArea);
        this.modalMainContentContainer.appendChild(searchSection);

        requestAnimationFrame(() => input.focus());
        // Footer is persistent and rendered by renderPersistentFooter
    }

    // createFooter now always creates the main footer with nav links
    private static createFooter(): HTMLElement {
        const footerArea = document.createElement('div');
        footerArea.style.cssText = `
            display: flex; justify-content: space-between; align-items: center;
            border-top: 1px solid #f0f0f0; padding: 16px 24px; /* Add padding here */
            margin-top: 0; /* Footer is positioned by its container */
        `;

        const leftSide = document.createElement('div');
        leftSide.style.cssText = `display: flex; gap: 12px; align-items: center;`;

        const allGuidesButton = document.createElement('button');
        allGuidesButton.textContent = 'View All Guides';
        Object.assign(allGuidesButton.style, { /* styles */ 
            background: 'none', border: 'none', color: this.theme?.link_color || '#007bff',
            fontSize: '14px', cursor: 'pointer', padding: '5px', textDecoration: 'underline'
        });
        allGuidesButton.onclick = () => {
            // Access modal containers dynamically instead of capturing in closure
            if (!this.modalMainContentContainer || !this.apiClient || !this.modalHeaderContainer) {
                console.warn('[CopilotModal] Modal containers not available for View All Guides - reinitializing modal');
                // Containers are missing, probably cleared by cleanup. Reinitialize modal.
                setTimeout(() => {
                    this.showSearchModal(); // Reopen modal
                    setTimeout(() => {
                        // Retry the action after modal is reinitialized
                        if (this.modalMainContentContainer && this.modalHeaderContainer && this.apiClient) {
                            this.currentView = 'list';
                            this.renderPersistentHeader('All Guides', true);
                            ViewAllGuidesModal.renderInContainer(
                                this.modalMainContentContainer, 
                                this.apiClient, 
                                (guideId: string) => { 
                                    this.closeSearchModal(); 
                                    this.onGuideFound(guideId); 
                                }, 
                                () => { this.renderSearchView(); }
                            );
                        }
                    }, 100); // Small delay for modal to fully initialize
                }, 50);
                return;
            }
            this.currentView = 'list';
            this.renderPersistentHeader('All Guides', true);
            ViewAllGuidesModal.renderInContainer(
                this.modalMainContentContainer, 
                this.apiClient, 
                (guideId: string) => { 
                    this.closeSearchModal(); 
                    this.onGuideFound(guideId); 
                }, 
                () => { this.renderSearchView(); }
            );
        };
        leftSide.appendChild(allGuidesButton);
            
        const onboardingButton = document.createElement('button');
        onboardingButton.textContent = 'Onboarding';
        Object.assign(onboardingButton.style, { /* styles */ 
            background: 'none', border: 'none', color: this.theme?.link_color || '#007bff',
            fontSize: '14px', cursor: 'pointer', padding: '5px', textDecoration: 'underline'
        });
        onboardingButton.onclick = () => {
            // Access modal containers dynamically instead of capturing in closure
            if (!this.modalMainContentContainer || !this.apiClient || !this.modalHeaderContainer) {
                console.warn('[CopilotModal] Modal containers not available for Onboarding - reinitializing modal');
                // Containers are missing, probably cleared by cleanup. Reinitialize modal.
                setTimeout(() => {
                    this.showSearchModal(); // Reopen modal
                    setTimeout(() => {
                        // Retry the action after modal is reinitialized
                        if (this.modalMainContentContainer && this.modalHeaderContainer && this.apiClient) {
                            this.currentView = 'onboarding';
                            this.renderPersistentHeader('', true);
                            OnboardingModal.renderInExistingModal(this.modalMainContentContainer, () => { 
                                this.renderSearchView(); 
                            });
                        }
                    }, 100); // Small delay for modal to fully initialize
                }, 50);
                return;
            }
            this.currentView = 'onboarding';
            this.renderPersistentHeader('', true);
            OnboardingModal.renderInExistingModal(this.modalMainContentContainer, () => { 
                this.renderSearchView(); 
            });
        };
        leftSide.appendChild(onboardingButton);

        const poweredByFooter = this.createPoweredByFooter();
        footerArea.appendChild(leftSide);
        footerArea.appendChild(poweredByFooter);
        return footerArea;
    }

    // renderOnboardingLoadingState is removed, OnboardingModal.renderInExistingModal handles its own loading
    // and CopilotModal just needs to set the header and call it.

    // ... other methods like closeSearchModal, handleSearch, updateResultsMessage, showSearchLoading, hideSearchLoading, addLoadingDotsStyle, adjustColor, createPoweredByFooter remain largely the same ...
    // Minor adjustments might be needed in updateResultsMessage if its container changes due to new structure.

    // Close modal also needs to clear these new static refs
    static closeSearchModal() {
        this.hideSearchLoading(); 
        const overlay = document.getElementById('hyphen-search-overlay');
        const modal = this.activeModal;

        if (overlay && modal) {
            // ... animation and removal ...
            overlay.style.opacity = '0';
            modal.style.transform = 'translateY(20px)';
            setTimeout(() => {
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                }
                this.activeModal = null;
                this.modalHeaderContainer = null;      // Clear ref
                this.modalMainContentContainer = null; // Clear ref
                this.modalFooterContainer = null;      // Clear ref
                
                // Trigger full cleanup after modal is closed to clean up any
                // UI elements that were skipped during flow completion
                try {
                    if ((window as any).CursorFlowUI) {
                        (window as any).CursorFlowUI.cleanupAllUI(false, true);
                    }
                } catch (error) {
                    console.warn('[CopilotModal] Error during post-modal cleanup:', error);
                }
            }, 300);
        } else if (overlay && document.body.contains(overlay)) {
            document.body.removeChild(overlay);
        }
        this.activeModal = null;
        this.modalHeaderContainer = null;      // Clear ref
        this.modalMainContentContainer = null; // Clear ref
        this.modalFooterContainer = null;      // Clear ref
    }

    private static async handleSearch(query: string) {
        if (!query.trim() || !this.apiClient) {
            this.updateResultsMessage('Please enter a question or task.', 'warning');
            return;
        }

        this.showSearchLoading(); // Show loading indicator

        try {
            const match = await this.apiClient.semanticSearch(query);
            this.hideSearchLoading(); // Hide indicator after API call

            if (match && match.id) {
                console.log(`Semantic search found match: ${match.name} (${match.id})`);
                // Display message and "Start Guide" button
                this.updateResultsMessage(`Found guide: "${match.name || 'Untitled'}"`, 'success', true, match.id);
            } else {
                console.log('Semantic search found no high-confidence match.');
                this.updateResultsMessage(
                    'Sorry, no exact match found. Try rephrasing or view all guides.',
                    'info'
                );
            }
        } catch (error) {
            this.hideSearchLoading(); // Ensure indicator is hidden on error
            console.error('Error during semantic search:', error);
            this.updateResultsMessage('Search failed. Please try again later.', 'error');
        }
    }

    // Updated updateResultsMessage to handle adding the button
    private static updateResultsMessage(message: string, type: 'info' | 'warning' | 'error' | 'success' | '' = 'info', showStartButton: boolean = false, guideId: string | null = null) {
        if (this.currentView !== 'search') return;

        const resultsArea = document.getElementById('hyphen-search-results');
        if (resultsArea) {
            resultsArea.innerHTML = ''; // Clear previous content (including potential loading indicator)

            // Message Span
            const messageSpan = document.createElement('span');
            messageSpan.textContent = message;
            messageSpan.style.color = type === 'error' ? '#dc3545' :
                                      type === 'warning' ? '#ffc107' :
                                      type === 'success' ? '#28a745' :
                                      '#666';
            resultsArea.appendChild(messageSpan);

            // Add Start Guide Button if needed
            if (showStartButton && guideId) {
                const startButton = document.createElement('button');
                startButton.textContent = 'Start Guide';
                startButton.style.cssText = `
                    margin-left: 10px; /* Space from message */
                    padding: 6px 12px;
                    border: none;
                    border-radius: 6px;
                    background-color: ${this.theme.buttonColor || '#007bff'}; /* Use theme color */
                    color: white;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: background-color 0.2s ease;
                `;
                startButton.addEventListener('mouseover', () => startButton.style.backgroundColor = this.adjustColor(this.theme.buttonColor || '#007bff', -20));
                startButton.addEventListener('mouseout', () => startButton.style.backgroundColor = this.theme.buttonColor || '#007bff');
                startButton.addEventListener('click', () => {
                    this.closeSearchModal();
                    this.onGuideFound(guideId);
                });
                resultsArea.appendChild(startButton); // Append button next to message
            }

            // Add small animation
            resultsArea.style.opacity = '0';
            requestAnimationFrame(() => {
                resultsArea.style.transition = 'opacity 0.3s';
                resultsArea.style.opacity = '1';
            });
        }
    }

    // Renamed from showThinking
    private static showSearchLoading() {
        this.hideSearchLoading(); // Ensure previous state is cleared

        const input = document.getElementById('hyphen-search-input') as HTMLInputElement | null;
        const searchButton = document.getElementById('hyphen-search-submit') as HTMLButtonElement | null;
        if (input) input.disabled = true;
        if (searchButton) searchButton.disabled = true;

        const resultsArea = document.getElementById('hyphen-search-results');
        if (resultsArea) {
             // Clear previous content and add loading indicator
             resultsArea.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; gap: 5px; color: #888;">
                    <span>Figuring out the guide</span>
                    <span class="copilot-loading-dots"><span>.</span><span>.</span><span>.</span></span>
                </div>
            `;
            this.searchLoadingIndicator = resultsArea.firstElementChild as HTMLElement;
        }
    }

    // Renamed from hideThinking
    private static hideSearchLoading() {
         const input = document.getElementById('hyphen-search-input') as HTMLInputElement | null;
         const searchButton = document.getElementById('hyphen-search-submit') as HTMLButtonElement | null;
         if (input) input.disabled = false;
         if (searchButton) searchButton.disabled = false;

        // Remove the specific loading indicator if it exists
        if (this.searchLoadingIndicator && this.searchLoadingIndicator.parentElement) {
            this.searchLoadingIndicator.parentElement.innerHTML = ''; // Clear results area content
        }
        this.searchLoadingIndicator = null;
    }

    // Add CSS for loading dots (only once)
    private static addLoadingDotsStyle() {
        if (this.loadingDotsStyleAdded) return;
        const style = document.createElement('style');
        style.textContent = `
            .copilot-loading-dots span {
                animation: copilot-dots 1.4s infinite;
                animation-fill-mode: both;
                opacity: 0;
            }
            .copilot-loading-dots span:nth-child(2) {
                animation-delay: 0.2s;
            }
            .copilot-loading-dots span:nth-child(3) {
                animation-delay: 0.4s;
            }
            @keyframes copilot-dots {
                0%, 80%, 100% { opacity: 0; }
                40% { opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        this.loadingDotsStyleAdded = true;
    }

    // Helper to reuse color adjustment logic if needed
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

    // Re-create the powered by footer logic here or import if possible
    private static createPoweredByFooter(): HTMLElement {
        const footer = document.createElement('div');
        footer.style.cssText = `display: flex; align-items: center; justify-content: center; gap: 4px; color: #666; font-size: 12px; line-height: 1;`;

        const poweredByText = document.createElement('span');
        poweredByText.textContent = 'powered by';
        poweredByText.style.cssText = `opacity: 0.7; display: flex; align-items: center; height: 18px;`;

        // Create Anchor Tag for the link
        const logoLink = document.createElement('a');
        logoLink.href = 'https://hyphenbox.com'; // TODO: Should this link be configurable?
        logoLink.target = '_blank';
        logoLink.rel = 'noopener noreferrer';
        logoLink.style.display = 'flex'; // Make link a flex container
        logoLink.style.alignItems = 'center';
        logoLink.style.textDecoration = 'none'; // Remove underline from link

        const logoContainer = document.createElement('div');
        logoContainer.style.cssText = `display: flex; align-items: center; justify-content: center; height: 18px; width: 55px; position: relative; transform: translateY(1px); cursor: pointer;`; // Added cursor: pointer
        
        // Footer logo is ALWAYS Hyphenbox logo
        console.log('[CopilotModal Footer] Using Hyphenbox logo.');
        logoContainer.innerHTML = hyphenboxSvg;
        this.styleFallbackSvg(logoContainer.querySelector('svg')); // Use helper to style it

        // Add hover effect to SVG via link
        const svgElement = logoContainer.querySelector('svg');
        if(svgElement) {
            logoLink.addEventListener('mouseover', () => { svgElement.style.opacity = '1'; });
            logoLink.addEventListener('mouseout', () => { svgElement.style.opacity = '0.7'; });
        }

        // Append logo container to the link
        logoLink.appendChild(logoContainer);

        // Append text and link to footer
        footer.appendChild(poweredByText);
        footer.appendChild(logoLink);

        return footer;
    }

    // Helper to style the fallback SVG consistently - Keep this for styling hyphenboxSvg
    private static styleFallbackSvg(svg: SVGElement | null): void {
        if (svg) {
            svg.style.cssText = `
                width: 100%;
                height: 100%;
                opacity: 0.7;
                display: block;
                transition: opacity 0.2s ease;
            `;
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            svg.setAttribute('viewBox', '0 0 3163 849');
        } else {
             console.warn('[Hyphen CopilotModal] Fallback SVG element not found in container.');
        }
    }
} 