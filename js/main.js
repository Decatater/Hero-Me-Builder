// Main Application Coordination Module
// Initializes all modules and coordinates the application startup

// Initialize the entire application
function init() {
    console.log('Initializing Hero Me Builder...');
    
    try {
        // Initialize the 3D scene
        initScene();
        
        // Create UI elements
        createDownloadButton();
        createLoadBuildButton();
        createWrenchButton();

        // Initialize helper menu
        if (typeof initializeHelperMenu === 'function') {
            initializeHelperMenu();
        }

        // Setup event listeners
        setupEventListeners();
        
        // Initialize pattern tracking
        initializePatternTracking();
        
        // Load directory structure then start the application
        loadDirectoryStructure().then(() => {
            loadModel();
        }).catch(error => {
            console.error('Failed to load directory structure:', error);
            // Still try to load the model even if directory structure fails
            loadModel();
        });

        // Start the animation loop
        animate();
        
        console.log('Hero Me Builder initialization complete');
        
    } catch (error) {
        console.error('Error during initialization:', error);
        
        // Show error message to user
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.innerHTML = `
                <div class="loader"></div>
                <div class="loading-text">Error loading application: ${error.message}</div>
                <div class="loading-text" style="font-size: 14px; margin-top: 10px;">Please refresh the page to try again.</div>
            `;
        }
    }
}

// Application cleanup function (useful for testing or restarting)
function cleanup() {
    console.log('Cleaning up Hero Me Builder...');
    
    try {
        // Remove event listeners
        removeEventListeners();
        
        // Clear scene
        if (scene) {
            while (scene.children.length > 0) {
                scene.remove(scene.children[0]);
            }
        }
        
        // Clear attached models tracking
        attachedModels.clear();
        attachmentPoints.length = 0;
        
        // Clear pattern tracking
        usedPatterns.clear();
        usedHolePatterns.clear();
        
        // Reset UI state
        resetUIState();
        
        // Remove canvas from DOM
        if (renderer && renderer.domElement) {
            document.body.removeChild(renderer.domElement);
        }
        
        console.log('Cleanup complete');
        
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
}

// Restart the application
function restart() {
    cleanup();
    setTimeout(() => {
        init();
    }, 100);
}

// Module verification - check that all required modules are loaded
function verifyModules() {
    const requiredFunctions = [
        // State management
        'resetUIState',
        
        // Geometry utilities
        'calculateAlignment',
        'compareHolePatterns',
        
        // File system
        'loadDirectoryStructure',
        'loadGeometryData',
        
        // Scene management
        'initScene',
        'animate',
        'visualizeGeometryFeatures',
        
        // Models
        'loadModel',
        'createAttachmentPoints',
        'attachModelAtPoint',
        
        // UI management
        'createWrenchButton',
        'createDownloadButton',
        'toggleTranslationMode',
        
        // Event handlers
        'setupEventListeners',
        'onMouseMove',
        'onMouseClick',
        
        // Pattern tracking
        'markPatternAsUsed',
        'isPatternUsed',
        'resetPatterns'
    ];
    
    const missingFunctions = [];
    
    requiredFunctions.forEach(funcName => {
        if (typeof window[funcName] !== 'function') {
            missingFunctions.push(funcName);
        }
    });
    
    if (missingFunctions.length > 0) {
        console.error('Missing required functions:', missingFunctions);
        return false;
    }
    
    console.log('All required modules verified successfully');
    return true;
}

// Error handling for uncaught errors
function setupErrorHandling() {
    window.addEventListener('error', (event) => {
        console.error('Uncaught error:', event.error);
        
        // Show user-friendly error message
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background-color: #ff4444;
            color: white;
            padding: 15px;
            border-radius: 5px;
            z-index: 10000;
            max-width: 300px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        errorDiv.innerHTML = `
            <strong>Application Error</strong><br>
            ${event.error?.message || 'An unexpected error occurred'}<br>
            <small>Check console for details</small>
        `;
        
        document.body.appendChild(errorDiv);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    });
    
    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);
    });
}

// Initialize performance monitoring
function initPerformanceMonitoring() {
    if (performance && performance.mark) {
        performance.mark('app-init-start');
        
        window.addEventListener('load', () => {
            performance.mark('app-init-end');
            performance.measure('app-init-duration', 'app-init-start', 'app-init-end');
            
            const measures = performance.getEntriesByType('measure');
            measures.forEach(measure => {
                console.log(`Performance: ${measure.name} took ${measure.duration.toFixed(2)}ms`);
            });
        });
    }
}

// Application status and health check
function getApplicationStatus() {
    return {
        initialized: !!(scene && camera && renderer && controls),
        modelsLoaded: !!mainModel,
        attachmentPointsCreated: attachmentPoints.length > 0,
        attachedModelsCount: attachedModels.size,
        translationMode: isTranslationMode,
        patternTrackingActive: usedPatterns.size > 0 || usedHolePatterns.size > 0,
        timestamp: new Date().toISOString()
    };
}

// Development helper functions
const DevTools = {
    // Show application status
    status: () => {
        console.table(getApplicationStatus());
        return getApplicationStatus();
    },
    
    // Debug pattern tracking
    patterns: () => {
        debugPatternTracking();
        return validatePatternConsistency();
    },
    
    // Show scene stats
    scene: () => {
        if (scene) {
            console.log('Scene children:', scene.children.length);
            console.log('Attached models:', attachedModels.size);
            console.log('Attachment points:', attachmentPoints.length);
        }
    },
    
    // Cleanup orphaned patterns
    cleanup: () => {
        cleanupOrphanedPatterns();
        console.log('Pattern cleanup complete');
    },
    
    // Restart application
    restart: restart,
    
    // Export current state
    export: () => {
        const state = {
            attachedModels: Array.from(attachedModels.entries()).map(([point, model]) => ({
                attachmentType: point.userData?.attachmentType,
                modelPath: model.userData?.modelPath,
                position: model.position.toArray(),
                rotation: model.quaternion.toArray()
            })),
            usedPatterns: Object.fromEntries(usedPatterns),
            usedHolePatterns: Object.fromEntries(usedHolePatterns)
        };
        
        console.log('Current application state:', state);
        return state;
    }
};

// Make DevTools globally available for debugging
window.HeroMeDevTools = DevTools;

// Setup error handling and performance monitoring
setupErrorHandling();
initPerformanceMonitoring();

// Make init function globally accessible for startBuilder()
window.init = init;

// Don't auto-start - wait for user to click "Start Builder"
// The original app.js was loaded dynamically when the user clicked the button

// Export functions for use in other modules or testing
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        init,
        cleanup,
        restart,
        verifyModules,
        getApplicationStatus,
        DevTools
    };
}