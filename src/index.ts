import CursorFlow from './cursorFlow';
import { CursorFlowOptions, CursorFlowState, ThemeOptions } from './types';
import { ApiClient } from './apiClient';
import { StateManager } from './manageState';

// Export the main class
export default CursorFlow;

// Export types so consumers can use them
export {
  CursorFlowOptions,
  CursorFlowState,
  ThemeOptions,
  ApiClient,
  StateManager
};
