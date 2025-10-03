// State Management Module
// Global variables and application state

// Three.js core objects
let scene, camera, renderer, mainModel, controls;

// Selection and interaction state
let selectedPoint = null;
let attachmentPoints = [];
let attachedModels = new Map(); // Map to track which points have models attached

// Part movement state
let isMovingPart = false;
let isMouseDown = false;
let moveInterval = null;

// Translation mode state
let selectedArrow = null;
let isTranslationMode = false;
let selectedForTranslation = null;
let translationArrows = [];

// Pattern tracking state
const usedPatterns = new Map(); // Map<modelPath, { holes: Set<faceId>, slides: Set<groupIndex> }>
const usedHolePatterns = new Map(); // Map<modelPath, Set<faceId>>

// Three.js utilities
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Menu navigation state
let currentMenuPath = [];
let menuState = new Map();

// Directory structure cache
let directoryStructure = null;

// Category menu configuration
const categoryMenus = {
    hotend: {
        title: "Hotend Mounts",
        paths: ["heromedir/hotendmounts/Hotends"]
    },
    skirt: {
        title: "Skirts",
        paths: ["heromedir/hotendmounts/Skirts"]
    },
    fanguard: {
        title: "Fan Guards",
        paths: ["heromedir/options/Fan Guards"]
    },
    partcooling: {
        title: "Part Cooling",
        paths: ["heromedir/partcooling"],
        filter: (item, userData) => {
            const name = item.name.toLowerCase();
            const isRightSide = userData?.attachmentName?.includes('opposite');
            
            if (item.type === 'file' && name.endsWith('.stl')) {
                if (isRightSide) {
                    // For right side, show if it has 'right' OR doesn't specify a side
                    return name.includes('right') || (!name.includes('left') && !name.includes('right'));
                } else {
                    // For left side, show if it has 'left' OR doesn't specify a side
                    return name.includes('left') || (!name.includes('left') && !name.includes('right'));
                }
            }
            return true; // Show all folders
        }
    },
    wing: {
        title: "Wing Options",
        isCustomMenu: true,
        createCustomMenu: (userData) => {
            const isRightSide = userData?.attachmentName?.includes('opposite');
            let hasProbeWing = false;
            let hasCableManagement = false;

            attachedModels.forEach((model, point) => {
                if (point.userData?.attachmentType === 'wing') {
                    const modelPath = model.userData.modelPath.toLowerCase();
                    if (modelPath.includes('cablemanagement')) {
                        hasCableManagement = true;
                    } else {
                        hasProbeWing = true;
                    }
                }
            });

            const items = [];

            if (!hasProbeWing) {
                items.push({
                    title: "Probe Wings",
                    path: "heromedir/ablmounts",
                    filter: (item) => {
                        const name = item.name.toLowerCase();
                        
                        if (item.type === 'directory') {
                            // Only exclude specific mount folders
                            const excludedFolders = ['crtouch mounts', 'bltouch mounts'];
                            return !excludedFolders.includes(name);
                        }

                        if (item.type === 'file' && name.endsWith('.stl')) {
                            return isRightSide ?
                                (name.includes('right') || (!name.includes('left') && !name.includes('right'))) :
                                (name.includes('left') || (!name.includes('left') && !name.includes('right')));
                        }
                        return false;
                    }
                });
            }

            if (!hasCableManagement) {
                items.push({
                    title: "Cable Management",
                    path: "heromedir/cablemanagement",
                    filter: (item) => {
                        const name = item.name.toLowerCase();
                        if (item.type === 'file') {
                            if (!name.endsWith('.stl')) return false;
                            return isRightSide ? name.includes('right') : name.includes('left');
                        }
                        return true;
                    }
                });
            }

            return {
                type: 'category',
                items: items
            };
        }
    },
    gantry: {
        title: "Gantry Adapter",
        paths: ["heromedir/gantryadapters"]
    },
    probe: {
        title: "Probe Mounts",
        paths: ["heromedir/ablmounts"],
        filter: (item, userData) => {
            const name = item.name.toLowerCase();
            // Only show files with 'mount' in the name and show all folders
            if (item.type === 'file') {
                return name.endsWith('.stl') && name.includes('mount');
            }
            return true;
        },
        parentType: 'wing' // Only attach to wings
    },
    adxl: {
        title: "ADXL345 Mounts",
        paths: ["heromedir/adxl345"],
        parentType: ['skirt', 'partcooling'] 
    },
    gantryclip: {
        title: "Gantry Clips",
        paths: ["heromedir/gantryadapters"],
        filter: (item) => {
            const name = item.name.toLowerCase();
            return item.type === 'directory' || (name.endsWith('.stl') && name.includes('clip'));
        },
        parentType: 'gantry' // Only attach to gantry adapters
    },
    directdrive: {
        title: "Direct Drive & Spacer Options",
        paths: ["heromedir/directdrivemounts"],
        filter: (item, userData) => {
            // Store the original type to ensure menu consistency
            if (selectedPoint && !selectedPoint.userData.originalType) {
                selectedPoint.userData.originalType = 'directdrive';
            }
            
            const name = item.name.toLowerCase();
            
            // Always show directories
            if (item.type === 'directory') return true;
            
            // Only process STL files
            if (!name.endsWith('.stl')) return false;
            
            // Note: Attachment type will be set in attachModelAtPoint based on the specific filename being attached
            
            return true;
        },
        parentType: ['hotend', 'spacer']  // Spacers need to support direct drive mounts
    }
};

// Part color mapping
const partColors = {
    'hotend': 0xff0000,    // Red
    'skirt': 0x02ed87,     // Mint
    'fanguard': 0x0000ff,  // Blue
    'partcooling': 0xf531b7, // Pink
    'wing': 0xffff00,      // Yellow
    'gantry': 0x00ffff,     // Cyan
    'probe': 0xff8c00,     // Orange
    'adxl': 0xa159e4,      // Pastel Purple
    'gantryclip': 0x91cdcf, // Light Blue
    'directdrive': 0xff6600, // Bright Orange
    'spacer': 0xb19cd9     // Light Purple
};


// State management functions
function resetUIState() {
    selectedPoint = null;
    selectedArrow = null;
    isTranslationMode = false;
    selectedForTranslation = null;
    translationArrows = [];
    currentMenuPath = [];
    isMovingPart = false;
    isMouseDown = false;
    if (moveInterval) {
        clearInterval(moveInterval);
        moveInterval = null;
    }
}

// Make all critical state variables globally accessible
window.scene = scene;
window.camera = camera;
window.renderer = renderer;
window.mainModel = mainModel;
window.controls = controls;
window.selectedPoint = selectedPoint;
window.attachmentPoints = attachmentPoints;
window.attachedModels = attachedModels;
window.isMovingPart = isMovingPart;
window.isMouseDown = isMouseDown;
window.moveInterval = moveInterval;
window.selectedArrow = selectedArrow;
window.isTranslationMode = isTranslationMode;
window.selectedForTranslation = selectedForTranslation;
window.translationArrows = translationArrows;
window.usedPatterns = usedPatterns;
window.usedHolePatterns = usedHolePatterns;
window.raycaster = raycaster;
window.mouse = mouse;
window.currentMenuPath = currentMenuPath;
window.menuState = menuState;
window.directoryStructure = directoryStructure;
window.categoryMenus = categoryMenus;
window.partColors = partColors;

// Export all state variables and functions
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        scene, camera, renderer, mainModel, controls,
        selectedPoint, attachmentPoints, attachedModels,
        isMovingPart, isMouseDown, moveInterval,
        selectedArrow, isTranslationMode, selectedForTranslation, translationArrows,
        usedPatterns, usedHolePatterns, raycaster, mouse,
        currentMenuPath, menuState, directoryStructure,
        categoryMenus, partColors, resetUIState
    };
}