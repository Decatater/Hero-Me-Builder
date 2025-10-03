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
                // Move the model based on the arrow clicked
                const moveAmount = 1; // 1mm increment
                moveModel(selectedForTranslation, arrow.userData.axis, moveAmount);
                return;
            }
        }
        
        // Check if clicking on an attached model to select it for translation
        const attachedModelArray = Array.from(attachedModels.values());
        const modelIntersects = raycaster.intersectObjects(attachedModelArray, true);
        
        if (modelIntersects.length > 0) {
            const clickedModel = modelIntersects[0].object;
            let parentModel = clickedModel;
            
            // Find the root model
            while (parentModel.parent && !attachedModels.has(parentModel)) {
                parentModel = parentModel.parent;
            }
            
            // Find the model in our attachedModels map
            for (const [point, model] of attachedModels) {
                if (model === parentModel || model.children.includes(clickedModel)) {
                    selectedForTranslation = model;
                    createTranslationArrows(model);
                    console.log('Selected model for translation:', model.userData.attachmentType);
                    return;
                }
            }
        }
        
        // If clicking elsewhere, clear selection
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