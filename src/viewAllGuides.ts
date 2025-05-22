import { ThemeOptions } from './types';
import { ApiClient } from './apiClient';
// OnboardingModal and CopilotModal imports are not needed here anymore for the core rendering logic
// but CopilotModal might be needed if we call its methods (e.g. for closing, though not ideal)

// Helper to adjust color brightness (can be made a static private method or kept as a utility)
function adjustColor(color: string, amount: number): string {
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
        const paddedColor = "000000".slice(newColor.length) + newColor;
        return (usePound ? "#" : "") + paddedColor;
    } catch (e) {
        return color; 
    }
}

export class ViewAllGuidesModal {
    // No static properties like apiClient, onGuideSelected, theme, modalElement needed here anymore
    // as they will be passed into renderInContainer or are specific to the old modal structure.
    private static allGuides: any[] = []; // Cache for guides, specific to this view logic.

    // Removed init, showModal, hideModal, createModal methods as they are no longer used.

    public static async renderInContainer(
        container: HTMLElement,
        apiClient: ApiClient,
        onGuideSelected: (guideId: string) => void,
        _onBack: () => void, // onBack is now handled by CopilotModal's persistent header, mark as unused
        theme: ThemeOptions = {}
    ): Promise<void> {
        container.innerHTML = ''; // Clear previous content from the main content area of CopilotModal

        // Header and Footer are no longer rendered by this method.
        // CopilotModal provides a persistent header and footer.

        const listSearchInput = document.createElement('input');
        listSearchInput.type = 'text';
        listSearchInput.placeholder = 'Filter guides...';
        Object.assign(listSearchInput.style, {
            width: '100%',
            padding: '10px 14px',
            border: `1px solid ${theme?.search_border_color || '#e0e0e0'}`,
            borderRadius: '8px',
            fontSize: '14px',
            outline: 'none',
            marginBottom: '16px',
            boxSizing: 'border-box' as 'border-box'
        });
        container.appendChild(listSearchInput);

        const guideListArea = document.createElement('div');
        guideListArea.id = 'hyphen-view-all-guides-list-area'; 
        Object.assign(guideListArea.style, {
            // Adjusted maxHeight: Assumes the container is the main content area of CopilotModal.
            // The search input above takes some space (approx 40px height + 16px margin = 56px).
            // The container itself has padding. This calculation might need tweaking based on final layout.
            maxHeight: 'calc(100% - 56px)', // Or a more robust calculation if possible
            overflowY: 'auto' as 'auto',
            border: `1px solid ${theme?.search_border_color || '#f0f0f0'}`,
            borderRadius: '8px',
            // marginBottom is removed as the persistent footer in CopilotModal handles spacing below.
        });
        container.appendChild(guideListArea);

        const loadingMessageElement = document.createElement('div');
        loadingMessageElement.style.cssText = 'padding: 20px; text-align: center; color: #888; font-style: italic;';
        loadingMessageElement.textContent = 'Loading guides...';
        guideListArea.appendChild(loadingMessageElement);

        // The simple text footer is also removed.

        try {
            if (!ViewAllGuidesModal.allGuides || ViewAllGuidesModal.allGuides.length === 0) {
                console.log('[ViewAllGuidesModal] Fetching all guides...');
                ViewAllGuidesModal.allGuides = await apiClient.getRecordings();
            }

            loadingMessageElement.style.display = 'none';

            if (!ViewAllGuidesModal.allGuides || ViewAllGuidesModal.allGuides.length === 0) {
                guideListArea.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">No guides available.</div>';
                return;
            }

            const renderListItems = (guides: any[]) => {
                guideListArea.innerHTML = '';
                if (guides.length === 0) {
                    guideListArea.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">No guides match your filter.</div>';
                    return;
                }
                guides.forEach(guide => {
                    const item = document.createElement('div');
                    item.textContent = guide.name || 'Untitled Guide';
                    Object.assign(item.style, {
                        padding: '12px 18px',
                        cursor: 'pointer',
                        borderBottom: `1px solid ${theme?.search_border_color || '#f0f0f0'}`,
                        fontSize: '15px',
                        transition: 'background-color 0.2s ease',
                        color: theme?.text_color || '#333'
                    });
                    item.addEventListener('mouseover', () => item.style.backgroundColor = theme?.modal_bg_color ? adjustColor(theme.modal_bg_color, -10) : '#f9f9f9');
                    item.addEventListener('mouseout', () => item.style.backgroundColor = '');
                    item.addEventListener('click', () => {
                        onGuideSelected(guide.id);
                    });
                    guideListArea.appendChild(item);
                });
                const lastItem = guideListArea.lastElementChild as HTMLElement;
                if (lastItem) {
                    lastItem.style.borderBottom = 'none';
                }
            };

            renderListItems(ViewAllGuidesModal.allGuides);

            listSearchInput.addEventListener('input', (e) => {
                const query = (e.target as HTMLInputElement).value.toLowerCase();
                const filteredGuides = ViewAllGuidesModal.allGuides.filter(guide =>
                    (guide.name || '').toLowerCase().includes(query) ||
                    (guide.description || '').toLowerCase().includes(query)
                );
                renderListItems(filteredGuides);
            });

        } catch (error) {
            console.error('[ViewAllGuidesModal] Failed to fetch or render guides:', error);
            guideListArea.innerHTML = '<div style="padding: 20px; text-align: center; color: #dc3545;">Failed to load guides.</div>';
        }
    }
    // Removed the old createPoweredByFooter as it relied on hyphenboxSvg import which is better handled by CopilotModal
    // The renderInContainer method will create a simple text footer for now.
} 