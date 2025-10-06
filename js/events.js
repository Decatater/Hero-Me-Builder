// Event Handlers Module
// Functions for handling mouse events, window events, and user interactions

// Mouse move handler - handles hover effects and highlighting
function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Check attachment points
    const pointIntersects = raycaster.intersectObjects(attachmentPoints, true);
    attachmentPoints.forEach(point => {
        if (point.visible) {
            point.material.emissiveIntensity = 0.5;
            point.scale.setScalar(1);
        }
    });

    if (pointIntersects.length > 0) {
        const point = pointIntersects[0].object;
        if (point.visible) {
            point.material.emissiveIntensity = 1;
            point.scale.setScalar(1.2);
        }
    }

    // Only check arrows if we're not currently moving one
    if (!isMovingPart) {
        const allArrows = [];
        attachedModels.forEach(model => {
            if (model.userData.positionControls) {
                allArrows.push(...model.userData.positionControls);
            }
        });

        const arrowIntersects = raycaster.intersectObjects(allArrows, true)
            .filter(hit => hit.object.userData.type === 'positionControl');

        allArrows.forEach(arrow => {
            arrow.material.emissiveIntensity = 0.5;
            arrow.scale.setScalar(1.0);
        });

        if (arrowIntersects.length > 0) {
            const arrow = arrowIntersects[0].object;
            arrow.material.emissiveIntensity = 1.0;
            arrow.scale.setScalar(1.2);
        }
    }

    // Add arrow highlighting for translation mode
    if (isTranslationMode && translationArrows.length > 0) {
        const arrowIntersects = raycaster.intersectObjects(translationArrows, true);
        
        // Reset all arrows
        for (const arrow of translationArrows) {
            arrow.children.forEach(child => {
                child.material.emissiveIntensity = 0.5;
                child.scale.setScalar(1.0);
            });
        }
        
        if (arrowIntersects.length > 0) {
            let hitArrow = arrowIntersects[0].object;
            
            // If we hit a child of the group, get the parent arrow group
            while (hitArrow.parent && !hitArrow.userData?.type) {
                hitArrow = hitArrow.parent;
            }
            
            if (hitArrow.userData?.type === 'translationArrow') {
                // Highlight the arrow
                hitArrow.children.forEach(child => {
                    child.material.emissiveIntensity = 1.0;
                    child.scale.setScalar(1.1);
                });
            }
        }
    }
}

// Helper function to check if an object is a descendant of a parent
function isDescendantOf(child, parent) {
    let current = child;
    while (current && current !== parent) {
        current = current.parent;
    }
    return current === parent;
}

// Touch event handlers for mobile support
let touchStartTime = 0;
let touchStartPos = { x: 0, y: 0 };
let isDragging = false;
let dragAxis = null;
let dragStartValue = 0;
let selectedArrowForDrag = null;

// Double tap detection for mobile
let lastTapTime = 0;
let tapCount = 0;
const DOUBLE_TAP_DELAY = 300; // ms

function onTouchStart(event) {
    if (event.touches.length === 1) {
        const touch = event.touches[0];
        touchStartTime = Date.now();
        touchStartPos.x = touch.clientX;
        touchStartPos.y = touch.clientY;

        // Reset drag state - we're going for tap-based movement now
        isDragging = false;
        selectedArrowForDrag = null;
        dragAxis = null;
    }
}

function onTouchMove(event) {
    // Simplified - no drag handling for move tool, just track movement for tap detection
    if (event.touches.length === 1) {
        const touch = event.touches[0];
        const deltaX = Math.abs(touch.clientX - touchStartPos.x);
        const deltaY = Math.abs(touch.clientY - touchStartPos.y);
        const moveDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // If user moved significantly, mark as dragging (for camera movement detection)
        if (moveDistance > 10) {
            isDragging = true;
        }
    }
}

function onTouchEnd(event) {
    if (event.changedTouches.length === 1) {
        const touch = event.changedTouches[0];
        const touchEndTime = Date.now();
        const touchDuration = touchEndTime - touchStartTime;

        // Check if it was a quick tap (not a drag)
        const deltaX = Math.abs(touch.clientX - touchStartPos.x);
        const deltaY = Math.abs(touch.clientY - touchStartPos.y);
        const moveDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Reset drag state
        if (isDragging) {
            isDragging = false;
            selectedArrowForDrag = null;
            dragAxis = null;
            dragStartValue = 0;
            event.preventDefault();
            return;
        }

        // Only register as tap if it was quick and didn't move much
        if (touchDuration < 300 && moveDistance < 10) {
            event.preventDefault(); // Prevent mouse event emulation

            // Update mouse coordinates for raycasting
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;

            // Handle translation mode taps - both arrow clicks and model selection
            if (isTranslationMode) {
                console.log('Mobile tap in translation mode at:', mouse.x, mouse.y);
                raycaster.setFromCamera(mouse, camera);

                // First check for translation arrow taps
                if (translationArrows.length > 0) {
                    const arrowIntersects = raycaster.intersectObjects(translationArrows, true);

                    if (arrowIntersects.length > 0) {
                        // Find the clicked arrow
                        let arrow = arrowIntersects[0].object;

                        // If we hit a child of the group, get the parent arrow group
                        while (arrow.parent && !arrow.userData?.type) {
                            arrow = arrow.parent;
                        }

                        if (arrow.userData?.type === 'translationArrow' && selectedForTranslation) {
                            // Move the model based on the arrow direction - same as desktop
                            const moveAmount = 1; // 1mm increment
                            const direction = arrow.userData.direction;
                            const axis = arrow.userData.axis;

                            // Calculate movement based on the arrow's direction vector
                            let actualMoveAmount = moveAmount;
                            // Use the actual direction vector components, not the stored axis
                            if (direction.x !== 0) {
                                actualMoveAmount = moveAmount * direction.x;
                            } else if (direction.y !== 0) {
                                actualMoveAmount = moveAmount * direction.y;
                            } else if (direction.z !== 0) {
                                actualMoveAmount = moveAmount * direction.z * -1; // FLIP Z AXIS MOVEMENT
                            }

                            moveModel(selectedForTranslation, axis, actualMoveAmount);
                            console.log(`Mobile tap moved model ${actualMoveAmount}mm along ${axis}-axis`);
                            return; // Don't process as regular click
                        }
                    }
                }

                // Check for model selection if no arrow was clicked
                // Use scene.children to get all objects, then filter for STL models
                const allObjects = [];
                scene.traverse(object => {
                    // Look for STL mesh objects that have material (actual model geometry)
                    if (object.isMesh && object.material && object.visible) {
                        allObjects.push(object);
                    }
                });

                console.log('Checking for intersection with', allObjects.length, 'scene objects');
                const objectIntersects = raycaster.intersectObjects(allObjects, false);

                if (objectIntersects.length > 0) {
                    const clickedObject = objectIntersects[0].object;
                    console.log('Mobile tap hit object:', clickedObject);

                    // Traverse up the parent chain to find which attached model this belongs to
                    let currentObject = clickedObject;
                    while (currentObject) {
                        // Check if this object or any of its parents is an attached model
                        for (const [point, model] of attachedModels) {
                            if (model === currentObject ||
                                model.children.includes(currentObject) ||
                                isDescendantOf(clickedObject, model)) {
                                selectedForTranslation = model;
                                createTranslationArrows(model);
                                console.log('Mobile tap selected model for translation:', model.userData.attachmentType);
                                return;
                            }
                        }
                        currentObject = currentObject.parent;
                    }
                    console.log('Clicked object is not part of any attached model');
                } else {
                    console.log('Mobile tap hit no objects - clearing selection');
                }

                // Check if user clicked an attachment point - if so, exit move mode
                const pointIntersects = raycaster.intersectObjects(attachmentPoints, true);
                if (pointIntersects.length > 0) {
                    console.log('Mobile: Clicked attachment point in move mode - exiting move mode');
                    toggleTranslationMode(); // Exit move mode
                    return;
                }

                // If we get here, clear selection
                selectedForTranslation = null;
                clearTranslationArrows();
                return; // Don't process as regular click in translation mode
            }

            // Only call regular click handler if NOT in translation mode
            if (!isTranslationMode) {
                // Handle double tap detection for model removal
                const currentTime = Date.now();

                if (currentTime - lastTapTime < DOUBLE_TAP_DELAY) {
                    tapCount++;
                    if (tapCount === 2) {
                        // Double tap detected - call double click handler
                        console.log('Mobile double tap detected');
                        const syntheticEvent = {
                            clientX: touch.clientX,
                            clientY: touch.clientY,
                            target: renderer.domElement,
                            preventDefault: () => {},
                            stopPropagation: () => {}
                        };
                        onDoubleClick(syntheticEvent);
                        tapCount = 0;
                        return;
                    }
                } else {
                    tapCount = 1;
                }
                lastTapTime = currentTime;

                // Single tap - create a synthetic event for the click handler
                setTimeout(() => {
                    if (tapCount === 1) {
                        // Only process single tap if no second tap came
                        const syntheticEvent = {
                            clientX: touch.clientX,
                            clientY: touch.clientY,
                            target: renderer.domElement,
                            preventDefault: () => {},
                            stopPropagation: () => {}
                        };
                        onMouseClick(syntheticEvent);
                        tapCount = 0;
                    }
                }, DOUBLE_TAP_DELAY);
            }
        }
    }
}

// Mouse click handler - handles selection and attachment
async function onMouseClick(event) {
    const menuElement = document.getElementById('modelSelect');
    if (event.target.closest('#modelSelect')) {
        if (event.target.closest('.menu-item') || event.target.closest('.back-button')) {
            event.preventDefault();
            event.stopPropagation();
        }
        return;
    }

    raycaster.setFromCamera(mouse, camera);

    // Handle position control arrow clicks
    const allArrows = [];
    scene.traverse(object => {
        if (object.userData?.type === 'positionControl') {
            allArrows.push(object);
        }
    });

    const arrowIntersects = raycaster.intersectObjects(allArrows);
    if (arrowIntersects.length > 0) {
        const selectedArrow = arrowIntersects[0].object;
        const targetModel = selectedArrow.userData.targetModel;
        const moveAmount = selectedArrow.userData.moveAmount || (selectedArrow.userData.direction === 'up' ? 0.5 : -0.5);

        if (targetModel && targetModel.userData.attachmentType === 'probe') {
            // Probe movement: Y-axis (like live_app.js)
            targetModel.position.y += moveAmount;

            // Keep arrows in their original relative positions
            targetModel.userData.positionControls.forEach(control => {
                control.position.copy(control.userData.originalPosition);
                control.position.y += moveAmount;
            });
            return;
        } else if (targetModel && targetModel.userData.attachmentType === 'partcooling') {
            // Part cooling movement: Z-axis (like live_app.js)
            const newZ = targetModel.position.z + moveAmount;
            if (newZ >= targetModel.userData.minZ && newZ <= targetModel.userData.initialZ) {
                targetModel.position.z = newZ;

                // Keep part cooling arrows in their original relative positions
                targetModel.userData.positionControls.forEach(control => {
                    const pos = control.userData.originalPosition.clone();
                    pos.z += (newZ - targetModel.userData.initialZ);
                    control.position.copy(pos);
                });
            }
            return;
        }
    }

    // Handle translation arrow clicks
    if (isTranslationMode) {
        const arrowIntersects = raycaster.intersectObjects(translationArrows, true);
        
        if (arrowIntersects.length > 0) {
            // Find the clicked arrow
            let arrow = arrowIntersects[0].object;
            
            // If we hit a child of the group, get the parent arrow group
            while (arrow.parent && !arrow.userData?.type) {
                arrow = arrow.parent;
            }
            
            if (arrow.userData?.type === 'translationArrow' && selectedForTranslation) {
                // Move the model based on the arrow direction
                const moveAmount = 1; // 1mm increment
                const direction = arrow.userData.direction;
                const axis = arrow.userData.axis;

                // Calculate movement based on the arrow's direction vector
                let actualMoveAmount = moveAmount;
                // Use the actual direction vector components, not the stored axis
                if (direction.x !== 0) {
                    actualMoveAmount = moveAmount * direction.x;
                } else if (direction.y !== 0) {
                    actualMoveAmount = moveAmount * direction.y;
                } else if (direction.z !== 0) {
                    actualMoveAmount = moveAmount * direction.z * -1; // FLIP Z AXIS MOVEMENT
                }

                moveModel(selectedForTranslation, axis, actualMoveAmount);
                return;
            }
        }
        
        // Check for model selection - use the same improved logic as mobile
        const allObjects = [];
        scene.traverse(object => {
            // Look for STL mesh objects that have material (actual model geometry)
            if (object.isMesh && object.material && object.visible) {
                allObjects.push(object);
            }
        });

        console.log('Desktop: Checking for intersection with', allObjects.length, 'scene objects');
        const objectIntersects = raycaster.intersectObjects(allObjects, false);

        if (objectIntersects.length > 0) {
            const clickedObject = objectIntersects[0].object;
            console.log('Desktop click hit object:', clickedObject);

            // Traverse up the parent chain to find which attached model this belongs to
            let currentObject = clickedObject;
            while (currentObject) {
                // Check if this object or any of its parents is an attached model
                for (const [point, model] of attachedModels) {
                    if (model === currentObject ||
                        model.children.includes(currentObject) ||
                        isDescendantOf(clickedObject, model)) {
                        selectedForTranslation = model;
                        createTranslationArrows(model);
                        console.log('Desktop click selected model for translation:', model.userData.attachmentType);
                        return;
                    }
                }
                currentObject = currentObject.parent;
            }
            console.log('Desktop: Clicked object is not part of any attached model');
        } else {
            console.log('Desktop: Click hit no objects - clearing selection');
        }

        // Check if user clicked an attachment point - if so, exit move mode
        const pointIntersects = raycaster.intersectObjects(attachmentPoints, true);
        if (pointIntersects.length > 0) {
            console.log('Desktop: Clicked attachment point in move mode - exiting move mode');
            toggleTranslationMode(); // Exit move mode
            return;
        }

        // If we get here, clear selection
        selectedForTranslation = null;
        clearTranslationArrows();
        return;
    }

    // Normal mode - check for attachment point clicks
    const pointIntersects = raycaster.intersectObjects(attachmentPoints, true);
    if (pointIntersects.length > 0) {
        selectedPoint = pointIntersects[0].object;

        // If this point was previously a directdrive menu point, preserve that
        if (!selectedPoint.userData.originalType &&
            (selectedPoint.userData.attachmentType === 'directdrive' ||
             selectedPoint.userData.attachmentType === 'spacer')) {
            selectedPoint.userData.originalType = 'directdrive';
        }

        // Create and show the attachment menu
        const attachmentType = selectedPoint.userData.attachmentType;
        console.log('Clicked attachment point:', attachmentType);
        
        try {
            const menuContent = await createDropdownForType(attachmentType);
            menuElement.innerHTML = menuContent;
            menuElement.style.display = 'block';
            
            // Position the menu near the click
            const rect = renderer.domElement.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            menuElement.style.left = Math.min(x, window.innerWidth - 400) + 'px';
            menuElement.style.top = Math.min(y, window.innerHeight - 300) + 'px';
            
        } catch (error) {
            console.error('Error creating menu:', error);
        }
    } else {
        // Clicking elsewhere closes the menu
        hideMenu();
    }
}

// Mouse down handler - handles dragging controls
function onMouseDown(event) {
    if (event.target.closest('#modelSelect')) return;

    raycaster.setFromCamera(mouse, camera);
    isMouseDown = true;

    const allArrows = [];
    scene.traverse(object => {
        if (object.userData?.type === 'positionControl') {
            allArrows.push(object);
        }
    });

    const intersects = raycaster.intersectObjects(allArrows);

    if (intersects.length > 0) {
        controls.enabled = false;
        isMovingPart = true;
        selectedArrow = intersects[0].object;

        const targetModel = selectedArrow.userData.targetModel;
        const direction = selectedArrow.userData.direction;

        // Single-click movement for probe mounts, continuous for others
        if (targetModel.userData.attachmentType === 'probe') {
            const moveAmount = direction === 'up' ? 1 : -1;
            targetModel.position.y += moveAmount;
            controls.enabled = true;
            isMovingPart = false;
            selectedArrow = null;
        } else {
            // Start continuous movement for part cooling
            moveInterval = setInterval(() => {
                if (selectedArrow && targetModel) {
                    const moveAmount = direction === 'up' ? 0.5 : -0.5;
                    const newZ = targetModel.position.z + moveAmount;
                    
                    // Limit movement range
                    const minZ = targetModel.userData.minZ || (targetModel.userData.initialZ - 8);
                    const maxZ = targetModel.userData.initialZ || targetModel.position.z + 8;
                    
                    targetModel.position.z = Math.max(minZ, Math.min(maxZ, newZ));
                }
            }, 16); // ~60fps
        }
    }
}

// Mouse up handler - stops dragging
function onMouseUp(event) {
    controls.enabled = true;
    isMovingPart = false;
    selectedArrow = null;

    if (moveInterval) {
        clearInterval(moveInterval);
        moveInterval = null;
    }
}

// Double click handler - removes models
function onDoubleClick(event) {
    raycaster.setFromCamera(mouse, camera);

    const allArrows = [];
    attachedModels.forEach(model => {
        if (model.userData.positionControls) {
            allArrows.push(...model.userData.positionControls);
        }
    });

    const arrowIntersects = raycaster.intersectObjects(allArrows)
        .filter(hit => hit.object.userData.type === 'positionControl');
    if (arrowIntersects.length > 0) return;

    const attachedModelArray = Array.from(attachedModels.values());
    const intersects = raycaster.intersectObjects(attachedModelArray, true);

    if (intersects.length > 0) {
        let targetMesh = intersects[0].object;
        
        // Don't remove if clicking on position control arrows
        if (targetMesh.userData?.type === 'positionControl') return;

        // Find the first parent that has a modelPath
        while (targetMesh.parent && !targetMesh.userData?.modelPath) {
            targetMesh = targetMesh.parent;
        }

        // Find the attachment point for this model
        let targetPoint = null;
        for (let [point, model] of attachedModels) {
            if (model === targetMesh) {
                targetPoint = point;
                break;
            }
        }

        if (targetPoint) {
            console.log('Removing model:', {
                path: targetMesh.userData.modelPath,
                type: targetMesh.userData.attachmentType,
                isSecondary: !!targetMesh.userData.parentModel
            });

            // Remove arrows first (use parent removal like live_app.js)
            if (targetMesh.userData.positionControls) {
                targetMesh.userData.positionControls.forEach(arrow => {
                    if (arrow.parent) arrow.parent.remove(arrow);
                });
            }

            // Handle primary model removal
            if (!targetMesh.userData.parentModel) {
                // Remove all child models first
                const childrenToRemove = [];
                attachedModels.forEach((childModel, childPoint) => {
                    if (childPoint.userData.parentModel === targetMesh) {
                        childrenToRemove.push({ model: childModel, point: childPoint });
                    }
                });

                // Remove each child
                childrenToRemove.forEach(({ model: childModel, point: childPoint }) => {
                    console.log('Removing child:', childModel.userData.modelPath);

                    // Remove child's arrows (use parent removal like live_app.js)
                    if (childModel.userData.positionControls) {
                        childModel.userData.positionControls.forEach(arrow => {
                            if (arrow.parent) arrow.parent.remove(arrow);
                        });
                    }

                    // Reset child's patterns
                    if (childModel.userData.modelPath) {
                        resetPatterns(childModel.userData.modelPath, false);
                    }

                    // Remove child from scene
                    if (childModel.parent) {
                        childModel.parent.remove(childModel);
                    }

                    // Show attachment point and clean up tracking
                    childPoint.visible = true;
                    attachedModels.delete(childPoint);
                });

                // Reset parent's patterns (including child pattern cleanup)
                resetPatterns(targetMesh.userData.modelPath, true);
            } else {
                // Secondary model - just reset its own patterns
                resetPatterns(targetMesh.userData.modelPath, false);
            }

            // Remove the model itself
            if (targetMesh.parent) {
                targetMesh.parent.remove(targetMesh);
            }

            // Show attachment point and remove from tracking
            targetPoint.visible = true;
            attachedModels.delete(targetPoint);

            // For primary models, recreate attachment points
            if (!targetMesh.userData.parentModel) {
                createAttachmentPoints(mainModel);
            }

            cleanupOrphanedPatterns();
        }
    }
}

// Window resize handler
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Keyboard event handlers
function onKeyDown(event) {
    // ESC key - exit translation mode or close menu
    if (event.key === 'Escape') {
        if (isTranslationMode) {
            exitTranslationMode();
        } else {
            hideMenu();
        }
    }
    
    // Arrow keys for fine movement in translation mode
    if (isTranslationMode && selectedForTranslation) {
        const moveAmount = event.shiftKey ? 5 : 1; // 5mm with Shift, 1mm without
        
        switch (event.key) {
            case 'ArrowLeft':
                moveModel(selectedForTranslation, 'x', -moveAmount);
                event.preventDefault();
                break;
            case 'ArrowRight':
                moveModel(selectedForTranslation, 'x', moveAmount);
                event.preventDefault();
                break;
            case 'ArrowUp':
                moveModel(selectedForTranslation, 'y', moveAmount);
                event.preventDefault();
                break;
            case 'ArrowDown':
                moveModel(selectedForTranslation, 'y', -moveAmount);
                event.preventDefault();
                break;
            case 'PageUp':
                moveModel(selectedForTranslation, 'z', moveAmount);
                event.preventDefault();
                break;
            case 'PageDown':
                moveModel(selectedForTranslation, 'z', -moveAmount);
                event.preventDefault();
                break;
        }
    }
}

// Setup all event listeners
function setupEventListeners() {
    // Mouse events
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('mousemove', onMouseMove, false);
    window.addEventListener('click', onMouseClick, false);
    window.addEventListener('dblclick', onDoubleClick, false);

    // Touch events for mobile support
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
    renderer.domElement.addEventListener('touchend', onTouchEnd, { passive: false });

    // Window events
    window.addEventListener('resize', onWindowResize, false);
    
    // Keyboard events
    window.addEventListener('keydown', onKeyDown, false);
    
    console.log('Event listeners setup complete');
}

// Clean up event listeners (useful for testing)
function removeEventListeners() {
    window.removeEventListener('mousedown', onMouseDown, true);
    window.removeEventListener('mouseup', onMouseUp, true);
    window.removeEventListener('mousemove', onMouseMove, false);
    window.removeEventListener('click', onMouseClick, false);
    window.removeEventListener('dblclick', onDoubleClick, false);

    // Remove touch events
    if (renderer && renderer.domElement) {
        renderer.domElement.removeEventListener('touchstart', onTouchStart, { passive: false });
        renderer.domElement.removeEventListener('touchmove', onTouchMove, { passive: false });
        renderer.domElement.removeEventListener('touchend', onTouchEnd, { passive: false });
    }

    window.removeEventListener('resize', onWindowResize, false);
    window.removeEventListener('keydown', onKeyDown, false);
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        onMouseMove,
        onMouseClick,
        onMouseDown,
        onMouseUp,
        onDoubleClick,
        onWindowResize,
        onKeyDown,
        setupEventListeners,
        removeEventListeners
    };
}