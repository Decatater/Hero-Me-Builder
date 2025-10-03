// Hero Me Builder - Modular Version
// This file has been split into multiple modules for better maintainability
// Original app.js has been backed up as app.js.backup

console.warn('app.js has been refactored into modular components!');
console.info('The application now loads from the following modules:');
console.info('- js/state.js - Global state management');
console.info('- js/geometry.js - Geometry calculations and utilities');
console.info('- js/patterns.js - Pattern tracking system');
console.info('- js/filesystem.js - File system and directory management');
console.info('- js/scene.js - 3D scene setup and visualization');
console.info('- js/models.js - Model loading and attachment');
console.info('- js/ui.js - UI elements and controls');
console.info('- js/events.js - Event handling');
console.info('- js/main.js - Application coordination and initialization');
console.info('');
console.info('Original app.js backed up as app.js.backup');
console.info('Use HeroMeDevTools in browser console for debugging');

// For backwards compatibility, redirect any direct app.js loads to the modular system
if (typeof window !== 'undefined') {
    console.log('Loading modular Hero Me Builder...');
    
    // If this file was loaded directly, load the modular system
    const scripts = [
        'js/state.js',
        'js/geometry.js',
        'js/patterns.js', 
        'js/filesystem.js',
        'js/scene.js',
        'js/models.js',
        'js/ui.js',
        'js/events.js',
        'js/main.js'
    ];
    
    let loadedCount = 0;
    
    function loadNextScript() {
        if (loadedCount >= scripts.length) {
            console.log('All modular scripts loaded successfully');
            return;
        }
        
        const script = document.createElement('script');
        script.src = scripts[loadedCount];
        script.onload = function() {
            console.log(`Loaded: ${scripts[loadedCount]}`);
            loadedCount++;
            loadNextScript();
        };
        script.onerror = function() {
            console.error(`Failed to load: ${scripts[loadedCount]}`);
            loadedCount++;
            loadNextScript();
        };
        document.body.appendChild(script);
    }
    
    loadNextScript();
}