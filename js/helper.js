// Helper Menu Module
// Provides a checklist interface to help users track which parts they need to add

// Part type definitions with their requirements
const partTypeDefinitions = {
    base: {
        title: 'Base',
        min: 1,
        max: 1,
        optional: false,
        isParent: false,
        childTypes: []
    },
    hotend: {
        title: 'Hotend Mount',
        min: 0,  // Can have 0 hotends (using spacers instead)
        max: 1,
        optional: false,
        isParent: true,
        childTypes: ['spacer', 'directdrive']  // Both spacers and direct drives can attach
    },
    spacer: {
        title: 'Riser/Spacer',
        min: 0,
        max: 1,
        optional: true,
        isParent: true,
        parentTypes: ['hotend'],
        childTypes: ['directdrive']
    },
    skirt: {
        title: 'Hotend Skirt',
        min: 0,
        max: 1,
        optional: false,
        isParent: true,
        childTypes: ['adxl']
    },
    fanguard: {
        title: 'Fan Guard',
        min: 0,
        max: 1,
        optional: true,
        isParent: false,
        childTypes: []
    },
    partcooling: {
        title: 'Cooling Duct',
        min: 0,
        max: 2,  // Left and right
        optional: true,
        isParent: true,
        childTypes: ['adxl']
    },
    wing: {
        title: 'ABL Wing',
        min: 0,
        max: 1,  // Only one wing (excluding cable towers)
        optional: false,
        isParent: true,
        childTypes: ['probe']
    },
    probe: {
        title: 'Probe Mount',
        min: 0,
        max: 1,  // One probe mount for the wing
        optional: true,
        isParent: false,
        parentTypes: ['wing'],
        childTypes: []
    },
    gantry: {
        title: 'Gantry Adapter',
        min: 0,
        max: 1,
        optional: false,
        isParent: true,
        childTypes: ['gantryclip']
    },
    gantryclip: {
        title: 'Gantry Clip',
        min: 0,
        max: 1,
        optional: true,
        isParent: false,
        parentTypes: ['gantry'],
        childTypes: []
    },
    adxl: {
        title: 'ADXL Mount',
        min: 0,
        max: 1,
        optional: true,
        isParent: false,
        parentTypes: ['skirt', 'partcooling'],
        childTypes: []
    },
    directdrive: {
        title: 'Direct Drive Mount',
        min: 0,
        max: 1,
        optional: true,
        isParent: false,
        parentTypes: ['hotend', 'spacer'],  // Can attach to either hotend or spacer
        childTypes: []
    },
    cabletower: {
        title: 'Cable Tower',
        min: 0,
        max: 1,
        optional: true,
        isParent: false,
        childTypes: []
    }
};

// Track pulsing state
let pulsingPoints = [];
let pulseAnimationFrame = null;

// Store part descriptions
let partDescriptions = {};

// Track if helper has been used in this session
let helperUsedThisSession = false;

// Map part type keys to description file keys
const descriptionKeyMap = {
    'base': 'base',
    'hotend': 'hotendmount',
    'skirt': 'skirt',
    'fanguard': 'fanguard',
    'partcooling': 'partcooling',
    'wing': 'wings',
    'probe': 'probe',
    'gantry': 'gantryadapter',
    'gantryclip': 'clip',
    'adxl': 'adxl',
    'directdrive': 'directdrive',
    'spacer': 'riser',
    'cabletower': 'cabletower'
};

// Initialize the helper menu
function initializeHelperMenu() {
    loadPartDescriptions();
    updateHelperMenu();
}

// Load part descriptions from the text file
async function loadPartDescriptions() {
    try {
        const response = await fetch('part_descriptions.txt');
        const text = await response.text();

        // Parse the file - each line is "key: description"
        const lines = text.split('\n');
        lines.forEach(line => {
            const colonIndex = line.indexOf(':');
            if (colonIndex > -1) {
                const key = line.substring(0, colonIndex).trim();
                const description = line.substring(colonIndex + 1).trim();
                partDescriptions[key] = description;
            }
        });

        console.log('Part descriptions loaded:', Object.keys(partDescriptions).length, 'descriptions');
    } catch (error) {
        console.error('Failed to load part descriptions:', error);
    }
}

// Toggle the helper menu open/closed
function toggleHelperMenu() {
    const menu = document.getElementById('helperMenu');
    const button = document.querySelector('.helper-icon-button');

    if (menu.classList.contains('open')) {
        menu.classList.remove('open');
        button.classList.remove('open');
        stopPulsingAllPoints();
        closeHelperDescription(); // Close description box when closing helper menu
    } else {
        menu.classList.add('open');
        button.classList.add('open');
        updateHelperMenu();

        // Track helper usage in Google Analytics (once per session)
        if (!helperUsedThisSession) {
            if (typeof gtag === 'function') {
                gtag('event', 'helper_menu_opened', {
                    'event_category': 'Helper',
                    'event_label': 'First Use This Session'
                });
                console.log('GA Event: helper_menu_opened');
                helperUsedThisSession = true;
            } else {
                console.warn('gtag not available for helper_menu_opened event');
            }
        }
    }
}

// Update the helper menu content based on current build state
function updateHelperMenu() {
    const content = document.getElementById('helperMenuContent');
    if (!content) return;

    // Count current parts
    const partCounts = countCurrentParts();

    // Build the menu HTML
    let html = '';

    // Determine which parts to show
    const partsToShow = getPartsToShow(partCounts);

    partsToShow.forEach(partType => {
        const def = partTypeDefinitions[partType];
        if (!def) return;

        const count = partCounts[partType] || 0;
        const isChild = def.parentTypes && def.parentTypes.length > 0;
        const isSatisfied = count > 0;  // Green if at least one has been added
        const isOptional = def.optional;

        // Determine class names
        let classNames = ['helper-part-item'];
        if (isChild) classNames.push('child-part');
        if (isSatisfied) {
            classNames.push('satisfied');
        } else {
            classNames.push('needed');
        }
        if (isOptional) classNames.push('optional');

        // Build the item HTML with click handler
        html += `<div class="${classNames.join(' ')}" data-part-type="${partType}" onmouseenter="onHelperItemHover('${partType}')" onmouseleave="onHelperItemLeave()" onclick="showPartDescription('${partType}')">`;
        html += `<span class="helper-part-name">${isChild ? '> ' : ''}${def.title}</span>`;
        html += `<div style="display: flex; align-items: center;">`;
        if (isOptional) {
            html += `<span class="helper-optional-badge">OPT</span>`;
        }
        html += `<span class="helper-part-count">${count}/${def.max}</span>`;
        html += `</div>`;
        html += `</div>`;
    });

    content.innerHTML = html;
}

// Count how many of each part type is currently attached
function countCurrentParts() {
    const counts = {
        base: 1  // Base is always present
    };

    // Count attached models
    attachedModels.forEach((model, point) => {
        const type = point.userData?.attachmentType || model.userData?.attachmentType;
        if (type) {
            counts[type] = (counts[type] || 0) + 1;
        }
    });

    return counts;
}

// Determine which parts should be shown in the helper menu
function getPartsToShow(partCounts) {
    const partsToShow = [];

    // Always show base parts
    const alwaysShow = ['base', 'hotend', 'skirt', 'fanguard', 'partcooling', 'wing', 'gantry', 'cabletower'];
    partsToShow.push(...alwaysShow);

    // Check parent-child relationships and show children only if parent exists
    Object.keys(partTypeDefinitions).forEach(partType => {
        const def = partTypeDefinitions[partType];

        // If this part has parent types, only show it if at least one parent exists
        if (def.parentTypes && def.parentTypes.length > 0) {
            const hasParent = def.parentTypes.some(parentType => {
                return (partCounts[parentType] || 0) > 0;
            });

            if (hasParent && !partsToShow.includes(partType)) {
                partsToShow.push(partType);
            }
        }
    });

    return partsToShow;
}

// Handle hovering over a helper menu item
function onHelperItemHover(partType) {
    // Some part types share the same attachment points:
    // - Spacers and direct drives share 'directdrive' points
    // - Cable towers and ABL wings share 'wing' points
    let typesToCheck = [partType];

    if (partType === 'spacer') {
        typesToCheck = ['spacer', 'directdrive'];
    } else if (partType === 'cabletower') {
        typesToCheck = ['cabletower', 'wing'];
    }

    // Find all attachment points of this type and make them pulse
    const pointsToPulse = attachmentPoints.filter(point => {
        return typesToCheck.includes(point.userData?.attachmentType) && point.visible;
    });

    startPulsingPoints(pointsToPulse);
}

// Handle leaving a helper menu item
function onHelperItemLeave() {
    stopPulsingAllPoints();
}

// Start pulsing animation for the given points
function startPulsingPoints(points) {
    // Stop any existing pulse
    stopPulsingAllPoints();

    pulsingPoints = points;

    if (pulsingPoints.length === 0) return;

    // Store original properties
    pulsingPoints.forEach(point => {
        if (!point.userData.originalScale) {
            point.userData.originalScale = point.scale.clone();
        }
        if (!point.userData.originalEmissiveIntensity) {
            point.userData.originalEmissiveIntensity = point.material.emissiveIntensity;
        }
    });

    // Start animation
    let time = 0;
    const animate = () => {
        time += 0.1;

        // Pulsing effect: scale and brightness oscillate
        const scale = 1 + 0.3 * Math.sin(time);
        const intensity = 0.5 + 0.5 * Math.sin(time);

        pulsingPoints.forEach(point => {
            if (point.userData.originalScale) {
                point.scale.copy(point.userData.originalScale).multiplyScalar(scale);
            }
            if (point.material) {
                point.material.emissiveIntensity = intensity;
            }
        });

        pulseAnimationFrame = requestAnimationFrame(animate);
    };

    animate();
}

// Stop pulsing all points
function stopPulsingAllPoints() {
    if (pulseAnimationFrame) {
        cancelAnimationFrame(pulseAnimationFrame);
        pulseAnimationFrame = null;
    }

    // Restore original properties
    pulsingPoints.forEach(point => {
        if (point.userData.originalScale) {
            point.scale.copy(point.userData.originalScale);
        }
        if (point.material && point.userData.originalEmissiveIntensity !== undefined) {
            point.material.emissiveIntensity = point.userData.originalEmissiveIntensity;
        }
    });

    pulsingPoints = [];
}

// Show part description in the description box
function showPartDescription(partType) {
    const def = partTypeDefinitions[partType];
    if (!def) return;

    const descriptionBox = document.getElementById('helperDescriptionBox');
    const titleElement = document.getElementById('helperDescriptionTitle');
    const contentElement = document.getElementById('helperDescriptionContent');

    if (!descriptionBox || !titleElement || !contentElement) return;

    // Get the description using the mapping
    const descKey = descriptionKeyMap[partType];
    const description = partDescriptions[descKey] || 'No description available for this part type.';

    // Update the content
    titleElement.textContent = def.title;
    contentElement.textContent = description;

    // Show the description box
    descriptionBox.classList.add('open');
}

// Close the description box
function closeHelperDescription() {
    const descriptionBox = document.getElementById('helperDescriptionBox');
    if (descriptionBox) {
        descriptionBox.classList.remove('open');
    }
}

// Hook into the existing model attachment system to update the helper menu
function onModelAttached() {
    if (document.getElementById('helperMenu')?.classList.contains('open')) {
        updateHelperMenu();
    }
}

function onModelDetached() {
    if (document.getElementById('helperMenu')?.classList.contains('open')) {
        updateHelperMenu();
    }
}

// Export functions for global access
window.initializeHelperMenu = initializeHelperMenu;
window.toggleHelperMenu = toggleHelperMenu;
window.updateHelperMenu = updateHelperMenu;
window.onHelperItemHover = onHelperItemHover;
window.onHelperItemLeave = onHelperItemLeave;
window.showPartDescription = showPartDescription;
window.closeHelperDescription = closeHelperDescription;
window.onModelAttached = onModelAttached;
window.onModelDetached = onModelDetached;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initializeHelperMenu,
        toggleHelperMenu,
        updateHelperMenu,
        onHelperItemHover,
        onHelperItemLeave,
        showPartDescription,
        closeHelperDescription,
        onModelAttached,
        onModelDetached,
        partTypeDefinitions
    };
}
