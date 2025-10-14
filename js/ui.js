// UI Management Module
// Functions for creating and managing UI elements like buttons, arrows, and translation controls

// Create the move button for translation mode
function createWrenchButton() {
    // Create move/translate button
    const wrenchButton = document.createElement('button');
    wrenchButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l0 20"/><path d="m8 18 4 4 4-4"/><path d="m8 6 4-4 4 4"/><path d="M2 12l20 0"/><path d="m6 8 -4 4 4 4"/><path d="m18 8 4 4 -4 4"/></svg>';
    wrenchButton.id = 'wrenchButton';
    wrenchButton.title = 'Toggle Position Adjustment Mode';
    wrenchButton.style.position = 'fixed';
    wrenchButton.style.bottom = '20px';
    wrenchButton.style.right = '180px';
    wrenchButton.style.padding = '10px';
    wrenchButton.style.backgroundColor = '#5ccfca';
    wrenchButton.style.color = 'white';
    wrenchButton.style.border = 'none';
    wrenchButton.style.borderRadius = '5px';
    wrenchButton.style.cursor = 'pointer';
    wrenchButton.style.zIndex = '1000';
    wrenchButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    wrenchButton.style.transition = 'background-color 0.3s';
    wrenchButton.style.fontFamily = 'Arial, sans-serif';
    wrenchButton.style.display = 'flex';
    wrenchButton.style.alignItems = 'center';
    wrenchButton.style.justifyContent = 'center';

    wrenchButton.onmouseover = function() {
        if (!isTranslationMode) {
            this.style.backgroundColor = '#48bab5';
        }
    };

    wrenchButton.onmouseout = function() {
        this.style.backgroundColor = isTranslationMode ? '#e67e22' : '#5ccfca';
    };

    wrenchButton.onclick = toggleTranslationMode;
    document.body.appendChild(wrenchButton);
}

// Create the download button
function createDownloadButton() {
    const downloadButton = document.createElement('button');
    downloadButton.textContent = 'Download Assembly';
    downloadButton.style.position = 'fixed';
    downloadButton.style.bottom = '20px';
    downloadButton.style.right = '20px';
    downloadButton.style.padding = '10px 20px';
    downloadButton.style.backgroundColor = '#4CAF50';
    downloadButton.style.color = 'white';
    downloadButton.style.border = 'none';
    downloadButton.style.borderRadius = '5px';
    downloadButton.style.cursor = 'pointer';
    downloadButton.style.zIndex = '1000';
    downloadButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    downloadButton.style.transition = 'background-color 0.3s';
    downloadButton.style.fontFamily = 'Arial, sans-serif';
    downloadButton.style.fontSize = '14px';

    downloadButton.onmouseover = function() {
        this.style.backgroundColor = '#45a049';
    };

    downloadButton.onmouseout = function() {
        this.style.backgroundColor = '#4CAF50';
    };

    downloadButton.onclick = downloadSceneAsZip;
    document.body.appendChild(downloadButton);
}

// Create the load build button
function createLoadBuildButton() {
    const loadButton = document.createElement('button');
    loadButton.textContent = 'Load Build';
    loadButton.className = 'desktop-only-button';
    loadButton.style.position = 'fixed';
    loadButton.style.bottom = '70px'; // Position above download button
    loadButton.style.right = '20px';
    loadButton.style.padding = '10px 20px';
    loadButton.style.backgroundColor = '#2196F3';
    loadButton.style.color = 'white';
    loadButton.style.border = 'none';
    loadButton.style.borderRadius = '5px';
    loadButton.style.cursor = 'pointer';
    loadButton.style.zIndex = '1000';
    loadButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    loadButton.style.transition = 'background-color 0.3s';
    loadButton.style.fontFamily = 'Arial, sans-serif';
    loadButton.style.fontSize = '14px';

    loadButton.onmouseover = function() {
        this.style.backgroundColor = '#1976D2';
    };

    loadButton.onmouseout = function() {
        this.style.backgroundColor = '#2196F3';
    };

    loadButton.onclick = loadBuildFromZip;
    document.body.appendChild(loadButton);
}

// Check if device is mobile for larger arrow sizes
function isMobileDevice() {
    return window.innerWidth <= 1023 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Toggle translation mode on/off
function toggleTranslationMode() {
    isTranslationMode = !isTranslationMode;
    
    const wrenchButton = document.getElementById('wrenchButton');
    if (wrenchButton) {
        wrenchButton.style.backgroundColor = isTranslationMode ? '#e67e22' : '#5ccfca';
    }
    
    if (!isTranslationMode) {
        // Clean up translation arrows when exiting mode
        clearTranslationArrows();
        selectedForTranslation = null;
    } else {
        // Update cursor to indicate selection mode
        document.body.style.cursor = 'pointer';
    }
    
    console.log('Translation mode:', isTranslationMode);
}

// Exit translation mode
function exitTranslationMode() {
    isTranslationMode = false;
    clearTranslationArrows();
    selectedForTranslation = null;
    
    const wrenchButton = document.getElementById('wrenchButton');
    if (wrenchButton) {
        wrenchButton.style.backgroundColor = '#5ccfca';
    }
    
    document.body.style.cursor = 'default';
}

// Create translation arrows for fine-tuning model positions
function createTranslationArrows(model) {
    clearTranslationArrows();
    
    if (!model) return;
    
    // Calculate the center of the model's bounding box
    const bbox = new THREE.Box3().setFromObject(model);
    const center = bbox.getCenter(new THREE.Vector3());
    
    // Create arrows - bigger on mobile for easier touch
    const mobile = isMobileDevice();
    const arrowLength = mobile ? 40 : 30;
    const arrowRadius = mobile ? 3 : 2;
    const arrowHeadLength = mobile ? 15 : 10;
    const arrowHeadRadius = mobile ? 7 : 5;
    const offset = mobile ? 50 : 40; // Distance from center
    
    // Check if this is a probe mount
    const isProbeMount = model.userData.attachmentType === 'probe';

    // Create pairs of arrows for each axis (positive and negative directions)

    // X axis arrows (red) - left/right
    const xArrowPos = createArrow(
        new THREE.Vector3(center.x + offset, center.y, center.z),
        new THREE.Vector3(1, 0, 0),
        0xff0000,
        'x',
        arrowLength,
        arrowRadius,
        arrowHeadLength,
        arrowHeadRadius
    );

    const xArrowNeg = createArrow(
        new THREE.Vector3(center.x - offset, center.y, center.z),
        new THREE.Vector3(-1, 0, 0),
        0xcc0000, // Slightly darker red for negative direction
        'x',
        arrowLength,
        arrowRadius,
        arrowHeadLength,
        arrowHeadRadius
    );

    // Y axis arrows (green) - up/down
    const yArrowPos = createArrow(
        new THREE.Vector3(center.x, center.y + offset, center.z),
        new THREE.Vector3(0, 1, 0),
        0x00ff00,
        isProbeMount ? 'y' : 'z', // Probe mounts use Y for up/down
        arrowLength,
        arrowRadius,
        arrowHeadLength,
        arrowHeadRadius
    );

    const yArrowNeg = createArrow(
        new THREE.Vector3(center.x, center.y - offset, center.z),
        new THREE.Vector3(0, -1, 0),
        0x00cc00, // Slightly darker green for negative direction
        isProbeMount ? 'y' : 'z',
        arrowLength,
        arrowRadius,
        arrowHeadLength,
        arrowHeadRadius
    );

    // Z axis arrows (blue) - forward/back
    const zArrowPos = createArrow(
        new THREE.Vector3(center.x, center.y, center.z + offset),
        new THREE.Vector3(0, 0, 1),
        0x0000ff,
        isProbeMount ? 'z' : 'y', // Probe mounts use Z for forward/back
        arrowLength,
        arrowRadius,
        arrowHeadLength,
        arrowHeadRadius
    );

    const zArrowNeg = createArrow(
        new THREE.Vector3(center.x, center.y, center.z - offset),
        new THREE.Vector3(0, 0, -1),
        0x0000cc, // Slightly darker blue for negative direction
        isProbeMount ? 'z' : 'y',
        arrowLength,
        arrowRadius,
        arrowHeadLength,
        arrowHeadRadius
    );

    translationArrows = [xArrowPos, xArrowNeg, yArrowPos, yArrowNeg, zArrowPos, zArrowNeg];
    translationArrows.forEach(arrow => {
        scene.add(arrow);
    });
    
    console.log('Translation arrows created for', model.userData.attachmentType);
}

// Create a single arrow mesh
function createArrow(position, direction, color, axis, length, radius, headLength, headRadius) {
    // Create arrow group
    const arrowGroup = new THREE.Group();

    // Create arrow shaft geometry
    const shaftGeometry = new THREE.CylinderGeometry(radius, radius, length, 12);
    shaftGeometry.translate(0, length/2, 0);

    // Create arrow head geometry
    const headGeometry = new THREE.ConeGeometry(headRadius, headLength, 12);
    headGeometry.translate(0, length + headLength/2, 0);
    
    // Create materials
    const material = new THREE.MeshPhongMaterial({
        color: color,
        transparent: true,
        opacity: 0.8,
        emissive: color,
        emissiveIntensity: 0.5
    });
    
    // Create meshes
    const shaft = new THREE.Mesh(shaftGeometry, material);
    const head = new THREE.Mesh(headGeometry, material);
    
    // Add to group
    arrowGroup.add(shaft);
    arrowGroup.add(head);
    
    // Position and orient the arrow
    arrowGroup.position.copy(position);
    
    // Orient arrow based on direction
    if (direction.x !== 0) {
        arrowGroup.rotateZ(-Math.PI / 2 * Math.sign(direction.x));
    } else if (direction.z !== 0) {
        // Z direction: positive Z should point away from camera, negative Z toward camera
        if (direction.z > 0) {
            arrowGroup.rotateX(Math.PI / 2); // Point forward (away from camera)
        } else {
            arrowGroup.rotateX(-Math.PI / 2); // Point backward (toward camera)
        }
    } else if (direction.y !== 0) {
        // Y direction: positive Y is default up, negative Y needs 180 degree rotation
        if (direction.y < 0) {
            arrowGroup.rotateZ(Math.PI); // Flip 180 degrees to point down
        }
        // Positive Y needs no rotation (default up)
    }
    
    // Store metadata
    arrowGroup.userData = {
        type: 'translationArrow',
        axis: axis,
        direction: direction.clone(),
        originalColor: color
    };
    
    return arrowGroup;
}

// Clear all translation arrows
function clearTranslationArrows() {
    for (const arrow of translationArrows) {
        scene.remove(arrow);
    }
    translationArrows = [];
}

// Move the selected model along an axis
function moveModel(model, axis, amount) {
    if (!model) return;
    
    // Apply movement
    switch(axis) {
        case 'x':
            model.position.x += amount;
            break;
        case 'y':
            model.position.y += amount;
            break;
        case 'z':
            model.position.z += amount;
            break;
    }
    
    // Update translation arrows position
    if (selectedForTranslation === model && translationArrows.length > 0) {
        createTranslationArrows(model);
    }
    
    console.log(`Moved model ${amount}mm along ${axis}-axis`);
}

// Create position arrows for adjustable parts (part cooling, probe mounts)
function createPositionArrows(attachedModel) {
    // Make arrows bigger on mobile for easier touch
    const mobile = isMobileDevice();
    const arrowRadius = mobile ? 3 : 2;
    const arrowHeight = mobile ? 12 : 8;

    const arrowGeometry = new THREE.CylinderGeometry(arrowRadius, 0, arrowHeight, 16);
    const arrowMaterial = new THREE.MeshPhongMaterial({
        color: 0x03fcec,
        transparent: false,
        emissive: 0x03fcec,
        emissiveIntensity: 0.5
    });

    attachedModel.userData.initialZ = attachedModel.position.z;
    attachedModel.userData.minZ = attachedModel.position.z - 8;

    const upArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
    const downArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());

    if (attachedModel.userData.attachmentType === 'probe') {
        // Probe arrows should point up and down (vertical) - EXACT copy from live_app.js
        upArrow.rotation.x = -Math.PI / 2;  // Points up
        downArrow.rotation.x = Math.PI / 2; // Points down

        // Position arrows above and below the probe mount - wider spacing on mobile
        const spacing = mobile ? 35 : 25;
        upArrow.position.set(0, 0, spacing);
        downArrow.position.set(0, 0, -spacing);
    } else {
        // Part cooling arrows should point up and down (vertical) - EXACT copy from live_app.js
        upArrow.rotation.x = -Math.PI / 2;  // Points up
        downArrow.rotation.x = Math.PI / 2; // Points down

        // Calculate center of the duct using bounding box
        const bbox = new THREE.Box3().setFromObject(attachedModel);
        const center = bbox.getCenter(new THREE.Vector3());

        // Position arrows with backward offset and wider spacing (EXACT copy from live_app.js)
        upArrow.position.copy(center);
        downArrow.position.copy(center);

        // Base position: backward 30mm in Y, down 20mm in Z, then spread from there
        upArrow.position.y -= 30;
        downArrow.position.y -= 30;
        upArrow.position.z -= 20;      // Move down
        downArrow.position.z -= 20;    // Move down

        // Then add the up/down spread - wider spacing on mobile
        const spread = mobile ? 45 : 35;
        upArrow.position.z += spread;      // Spread up from base position
        downArrow.position.z -= spread;    // Spread down from base position
    }

    // Store original positions (like live_app.js)
    upArrow.userData.originalPosition = upArrow.position.clone();
    downArrow.userData.originalPosition = downArrow.position.clone();

    // Store metadata for interaction (like live_app.js)
    upArrow.userData = {
        ...upArrow.userData,
        type: 'positionControl',
        direction: 'up',
        targetModel: attachedModel,
        moveAmount: 0.5
    };

    downArrow.userData = {
        ...downArrow.userData,
        type: 'positionControl',
        direction: 'down',
        targetModel: attachedModel,
        moveAmount: -0.5
    };

    return [upArrow, downArrow];
}

// Show loading screen
function showLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.style.display = 'flex';
        loadingScreen.classList.remove('fade-out');
    }
}

// Hide loading screen with fade effect
function hideLoadingScreen() {
    setTimeout(() => {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.classList.add('fade-out');
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 500);
        }
    }, 1000);
}

// Update UI state based on current mode
function updateUIState() {
    const wrenchButton = document.getElementById('wrenchButton');
    
    if (isTranslationMode) {
        document.body.style.cursor = 'pointer';
        if (wrenchButton) {
            wrenchButton.style.backgroundColor = '#e67e22';
            wrenchButton.title = 'Exit Position Adjustment Mode';
        }
    } else {
        document.body.style.cursor = 'default';
        if (wrenchButton) {
            wrenchButton.style.backgroundColor = '#5ccfca';
            wrenchButton.title = 'Enter Position Adjustment Mode';
        }
    }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        createWrenchButton,
        createDownloadButton,
        createLoadBuildButton,
        toggleTranslationMode,
        exitTranslationMode,
        createTranslationArrows,
        createArrow,
        clearTranslationArrows,
        moveModel,
        createPositionArrows,
        showLoadingScreen,
        hideLoadingScreen,
        updateUIState
    };
}