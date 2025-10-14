// Pattern Tracking Module
// Functions for managing used patterns to prevent conflicts during model attachment

// Mark a pattern (hole or slide face) as used
function markPatternAsUsed(modelPath, pattern) {
    if (pattern.faceId !== undefined) {
        // For hole patterns
        if (!usedHolePatterns.has(modelPath)) {
            usedHolePatterns.set(modelPath, new Set());
        }
        usedHolePatterns.get(modelPath).add(pattern.faceId);
        // console.log(`Marked hole pattern ${pattern.faceId} as used for model ${modelPath}`);
    } else if (pattern.groupIndex !== undefined) {
        // For slide faces
        if (!usedPatterns.has(modelPath)) {
            usedPatterns.set(modelPath, { holes: new Set(), slides: new Set() });
        }
        usedPatterns.get(modelPath).slides.add(pattern.groupIndex);
        // console.log(`Marked slide face group ${pattern.groupIndex} as used for model ${modelPath}`);
    }
}

// Check if a pattern is already used
function isPatternUsed(modelPath, pattern) {
    if (!usedPatterns.has(modelPath)) return false;

    const modelPatterns = usedPatterns.get(modelPath);

    if (pattern.faceId !== undefined) {
        const isUsed = usedHolePatterns.has(modelPath) &&
            usedHolePatterns.get(modelPath).has(pattern.faceId);
        // console.log(`Checking if face ${pattern.faceId} is used for model ${modelPath}: ${isUsed}`);
        return isUsed;
    } else if (pattern.groupIndex !== undefined) {
        const isUsed = modelPatterns.slides.has(pattern.groupIndex);
        // console.log(`Checking if slide face group ${pattern.groupIndex} is used for model ${modelPath}: ${isUsed}`);
        return isUsed;
    }

    return false;
}

// Check specifically if a hole pattern is used
function isHolePatternUsed(modelPath, face) {
    const isUsed = usedHolePatterns.has(modelPath) &&
        usedHolePatterns.get(modelPath).has(face.faceId);
    // console.log(`Checking if face ${face.faceId} is used for model ${modelPath}: ${isUsed}`);
    return isUsed;
}

// Reset patterns for a model (when removing attachments)
function resetPatterns(modelPath, isParent = false) {
    // console.log(`Resetting patterns for model ${modelPath} (isParent: ${isParent})`);

    // Always clear direct patterns
    usedHolePatterns.delete(modelPath);
    usedPatterns.delete(modelPath);

    // For parent models, also clear patterns of all child models
    if (isParent) {
        attachedModels.forEach((model, point) => {
            if (point.userData.parentModel?.userData?.modelPath === modelPath) {
                // console.log('Clearing child patterns for:', model.userData.modelPath);
                usedHolePatterns.delete(model.userData.modelPath);
                usedPatterns.delete(model.userData.modelPath);
            }
        });
    }

    // console.log('Pattern tracking state after reset:', {
    //     usedHolePatterns: Object.fromEntries(usedHolePatterns),
    //     usedPatterns: Object.fromEntries(usedPatterns)
    // });
}

// Get all used patterns for a model
function getUsedPatterns(modelPath) {
    return usedHolePatterns.get(modelPath) || new Set();
}

// Clean up orphaned patterns (patterns for models that are no longer attached)
function cleanupOrphanedPatterns() {
    // console.log('Cleaning up orphaned patterns...');

    // Get list of currently attached model paths
    const activeModelPaths = new Set();
    activeModelPaths.add('heromedir/base/UniversalBase.stl'); // Always keep base model

    attachedModels.forEach((model, point) => {
        if (model.userData.modelPath) {
            activeModelPaths.add(model.userData.modelPath);
        }
    });

    // Remove patterns for models that are no longer attached
    const holePatternPaths = Array.from(usedHolePatterns.keys());
    holePatternPaths.forEach(modelPath => {
        if (!activeModelPaths.has(modelPath)) {
            // console.log(`Removing orphaned hole patterns for: ${modelPath}`);
            usedHolePatterns.delete(modelPath);
        }
    });

    const slidePatternsKeys = Array.from(usedPatterns.keys());
    slidePatternsKeys.forEach(modelPath => {
        if (!activeModelPaths.has(modelPath)) {
            // console.log(`Removing orphaned slide patterns for: ${modelPath}`);
            usedPatterns.delete(modelPath);
        }
    });

    // console.log('Pattern cleanup complete');
}

// Debug function to show current pattern tracking state
function debugPatternTracking() {
    console.log('\n=== Pattern Tracking Debug ===');
    console.log('Current pattern tracking state:');

    // Show usedPatterns Map for slide faces
    usedPatterns.forEach((patterns, modelPath) => {
        if (patterns.slides.size > 0) {  // Only show if there are slide faces used
            console.log(`\nModel: ${modelPath}`);
            console.log('Used slide faces:', Array.from(patterns.slides));
        }
    });

    // Show usedHolePatterns Map for face IDs
    usedHolePatterns.forEach((patterns, modelPath) => {
        if (patterns.size > 0) {  // Only show if there are holes used
            console.log(`\nModel: ${modelPath}`);
            console.log('Used hole patterns:', Array.from(patterns));
        }
    });

    console.log('\nPattern tracking maps:');
    console.log('usedHolePatterns:', Object.fromEntries(usedHolePatterns));
    console.log('usedPatterns:', Object.fromEntries(usedPatterns));
    console.log('=== End Pattern Debug ===\n');
}

// Initialize pattern tracking system
function initializePatternTracking() {
    // Clear any existing pattern data
    usedHolePatterns.clear();
    usedPatterns.clear();

    // Mark base model patterns that are already occupied by existing attachments
    attachedModels.forEach((model, point) => {
        if (model.userData.patternMapping) {
            const { baseFaceId, attachFaceId } = model.userData.patternMapping;

            // Mark base model pattern as used
            markPatternAsUsed('heromedir/base/UniversalBase.stl', { faceId: baseFaceId });

            // Mark attachment model pattern as used
            if (model.userData.modelPath && attachFaceId) {
                markPatternAsUsed(model.userData.modelPath, { faceId: attachFaceId });
            }
        }
    });

    // console.log('Pattern tracking system initialized');
}

// Validate pattern consistency (useful for debugging)
function validatePatternConsistency() {
    let isConsistent = true;
    
    // Check that all attached models have corresponding pattern entries
    attachedModels.forEach((model, point) => {
        const modelPath = model.userData.modelPath;
        if (modelPath && !usedHolePatterns.has(modelPath) && !usedPatterns.has(modelPath)) {
            console.warn(`Attached model ${modelPath} has no pattern tracking entry`);
            isConsistent = false;
        }
    });
    
    // Check that all pattern entries correspond to attached models
    const attachedPaths = new Set();
    attachedPaths.add('heromedir/base/UniversalBase.stl'); // Base model is always "attached"
    
    attachedModels.forEach((model) => {
        if (model.userData.modelPath) {
            attachedPaths.add(model.userData.modelPath);
        }
    });
    
    usedHolePatterns.forEach((patterns, modelPath) => {
        if (!attachedPaths.has(modelPath)) {
            console.warn(`Pattern entry exists for unattached model: ${modelPath}`);
            isConsistent = false;
        }
    });
    
    if (isConsistent) {
        console.log('Pattern tracking is consistent');
    } else {
        console.warn('Pattern tracking inconsistencies detected');
    }
    
    return isConsistent;
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        markPatternAsUsed,
        isPatternUsed,
        isHolePatternUsed,
        resetPatterns,
        getUsedPatterns,
        cleanupOrphanedPatterns,
        debugPatternTracking,
        initializePatternTracking,
        validatePatternConsistency
    };
}