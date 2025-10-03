# Hero Me Builder - Modular JavaScript Architecture

This directory contains the refactored Hero Me Builder application, split into modular components for better maintainability and easier debugging.

## Module Structure

### Core Modules (Load Order)

1. **`state.js`** - Global State Management
   - Global variables and application state
   - Category menu configurations
   - Part color mappings
   - State reset functions

2. **`geometry.js`** - Geometry Utilities
   - Hole pattern calculations
   - Face matching algorithms
   - Distance calculations
   - Alignment transformations
   - Validation functions

3. **`patterns.js`** - Pattern Tracking System
   - Used pattern tracking to prevent conflicts
   - Pattern marking and validation
   - Pattern cleanup and reset functions
   - Debugging utilities

4. **`filesystem.js`** - File System Management
   - Directory structure loading
   - File navigation and menu creation
   - STL and JSON file loading
   - Menu content generation

5. **`scene.js`** - 3D Scene Management
   - Three.js scene initialization
   - Lighting and camera setup
   - Visualization functions
   - Animation loop
   - Download functionality

6. **`models.js`** - Model Loading and Management
   - STL model loading
   - Attachment point creation
   - Model alignment algorithms
   - Secondary attachment points

7. **`ui.js`** - UI Management
   - Button creation and styling
   - Translation mode controls
   - Position arrows
   - Loading screens
   - UI state management

8. **`events.js`** - Event Handling
   - Mouse event handlers
   - Keyboard shortcuts
   - Window resize handling
   - Interaction logic

9. **`main.js`** - Application Coordination
   - Application initialization
   - Module coordination
   - Error handling
   - Development tools
   - Cleanup functions

## Key Benefits

### Maintainability
- **Separation of Concerns**: Each module has a specific responsibility
- **Easier Debugging**: Issues can be isolated to specific modules
- **Better Code Organization**: Related functions are grouped together
- **Reduced Complexity**: Smaller, focused files are easier to understand

### Developer Experience
- **Development Tools**: Built-in debugging utilities via `HeroMeDevTools`
- **Error Handling**: Comprehensive error handling and reporting
- **Performance Monitoring**: Built-in performance measurement
- **Module Verification**: Automatic checking of required functions

### Code Quality
- **Consistent Structure**: All modules follow the same export pattern
- **Documentation**: Each module is self-documenting with clear comments
- **Dependencies**: Clear module loading order and dependencies
- **Testing Ready**: Modular structure makes unit testing easier

## Development Tools

The application includes built-in development tools accessible via the browser console:

```javascript
// Show application status
HeroMeDevTools.status()

// Debug pattern tracking
HeroMeDevTools.patterns()

// Show scene statistics
HeroMeDevTools.scene()

// Clean up orphaned patterns
HeroMeDevTools.cleanup()

// Restart application
HeroMeDevTools.restart()

// Export current state
HeroMeDevTools.export()
```

## File Structure

```
js/
├── README.md           # This documentation
├── state.js           # Global state and configuration
├── geometry.js        # Geometric calculations
├── patterns.js        # Pattern tracking system
├── filesystem.js      # File and directory management
├── scene.js          # 3D scene and visualization
├── models.js         # Model loading and attachment
├── ui.js             # User interface elements
├── events.js         # Event handling
└── main.js           # Application coordination
```

## Backwards Compatibility

The original `app.js` has been replaced with a compatibility layer that automatically loads the modular system. The original code has been backed up as `app.js.backup`.

## Error Handling

Each module includes:
- Try-catch blocks around critical operations
- Graceful fallbacks for missing dependencies
- User-friendly error messages
- Console logging for debugging

## Performance Considerations

- **Lazy Loading**: Scripts are loaded sequentially to avoid conflicts
- **Memory Management**: Proper cleanup functions prevent memory leaks
- **Efficient Rendering**: Animation loop optimizations
- **Pattern Caching**: Optimized pattern tracking to avoid redundant calculations

## Future Enhancements

This modular structure makes it easier to:
- Add new attachment types
- Implement new visualization features
- Add unit tests
- Integrate build tools
- Add TypeScript support
- Implement hot reloading for development

## Migration Notes

If you need to revert to the original single-file structure:
1. Copy `app.js.backup` to `app.js`
2. Update `index.html` to load `app.js` instead of the modular scripts
3. Remove the `js/` directory

The modular version maintains 100% functional compatibility with the original application.