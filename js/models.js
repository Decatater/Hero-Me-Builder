// Model Loading and Management Module
// Functions for loading STL models, creating attachment points, and managing model attachments

// Import specialized alignment modules
// Note: These will be loaded as separate script tags in HTML since we're not using a module bundler

// Global debug system - can be toggled from browser console
window.HeroMeDebug = {
    enabled: false,
    enableDebug: function() {
        this.enabled = true;
        console.log('🐛 HeroMe Debug Mode ENABLED - Enhanced logging activated');
    },
    disableDebug: function() {
        this.enabled = false;
        console.log('🐛 HeroMe Debug Mode DISABLED');
    },
    log: function(...args) {
        if (this.enabled) {
            console.log(...args);
        }
    }
};

// Make it easy to use from console
window.enableDebug = () => window.HeroMeDebug.enableDebug();
window.disableDebug = () => window.HeroMeDebug.disableDebug();

// Helper function to account for mainModel's rotation (-PI/2 around X-axis)
function transformToMainModelSpace(vector) {
    // mainModel has rotation.x = -Math.PI / 2, so we need to account for this
    const rotationMatrix = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    return vector.clone().applyMatrix4(rotationMatrix);
}

function transformFromMainModelSpace(vector) {
    // Inverse transform from mainModel space to world space
    const rotationMatrix = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    return vector.clone().applyMatrix4(rotationMatrix);
}

// Helper to get transformed normal from face data
function getTransformedNormal(face) {
    const originalNormal = new THREE.Vector3(face.normal.x, face.normal.y, face.normal.z);
    return transformToMainModelSpace(originalNormal);
}

// Load the main base model
function loadModel() {
    const loader = new THREE.STLLoader();
    loader.load('heromedir/base/UniversalBase.stl',
        async function (geometry) {
            const material = new THREE.MeshPhongMaterial({
                color: 0x00ff00,
                flatShading: false,
                transparent: true,
                opacity: 1
            });

            mainModel = new THREE.Mesh(geometry, material);
            geometry.computeBoundingBox();
            const center = geometry.boundingBox.getCenter(new THREE.Vector3());
            geometry.translate(-center.x, -center.y, -center.z);
            scene.add(mainModel);
            mainModel.rotation.x = -Math.PI / 2;

            // Create attachment points
            createAttachmentPoints(mainModel);

            // Load and visualize holes
            const geometryData = await loadGeometryData('heromedir/base/UniversalBase.stl');
            if (geometryData) {
                visualizeGeometryFeatures(geometryData, mainModel);
            }

            // Adjust camera
            const box = new THREE.Box3().setFromObject(mainModel);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            camera.position.z = maxDim * 3;
            controls.minDistance = maxDim * 0.5;
            controls.maxDistance = maxDim * 5;

            // Hide loading screen
            setTimeout(() => {
                const loadingScreen = document.getElementById('loadingScreen');
                loadingScreen.classList.add('fade-out');
                setTimeout(() => {
                    loadingScreen.style.display = 'none';
                }, 500);
            }, 1000);
        },
        function (progress) {
            console.log('Loading progress:', (progress.loaded / progress.total) * 100 + '%');
        },
        function (error) {
            console.error('Error loading model:', error);
        }
    );
}

// Create attachment points on the base model
async function createAttachmentPoints(object) {
    const sphereGeometry = new THREE.SphereGeometry(3.0, 32, 32);
    const sphereMaterial = new THREE.MeshPhongMaterial({
        color: 0x800080,
        transparent: true,
        opacity: 0.8,
        emissive: 0x800080,
        emissiveIntensity: 0.5,
        shininess: 50
    });

    // Remove only primary attachment points (those directly attached to the main model)
    // Keep secondary attachment points that are attached to other models
    const primaryPoints = attachmentPoints.filter(point => point.parent === object);
    const secondaryPoints = attachmentPoints.filter(point => point.parent !== object);
    
    primaryPoints.forEach(point => object.remove(point));
    attachmentPoints = secondaryPoints;

    // Load geometry data for the base model
    const geometryData = await loadGeometryData('heromedir/base/UniversalBase.stl');
    if (!geometryData?.faces) return;

    // Keep track of assigned faces to avoid duplicates
    const assignedFaces = new Set();

    // First, collect all existing attachments and their face patterns
    attachedModels.forEach((model, point) => {
        if (model.userData.patternMapping) {
            const { baseFaceId } = model.userData.patternMapping;
            assignedFaces.add(baseFaceId);
            
            // Mark the pattern as used in the tracking system
            markPatternAsUsed('heromedir/base/UniversalBase.stl', { faceId: baseFaceId });
        }
    });

    // Find faces by characteristics
    const findFaceByCharacteristics = (characteristics) => {
        return geometryData.faces.find(face => {
            if (assignedFaces.has(face.faceId)) return false;
            return Object.entries(characteristics).every(([key, value]) => {
                if (key === 'holeCount') return face.holes?.length === value;
                if (key === 'normal') {
                    const dot = face.normal.x * value.x + face.normal.y * value.y + face.normal.z * value.z;
                    return Math.abs(dot - 1) < 0.1; // Allow small deviation
                }
                return true;
            });
        });
    };

    // Helper function to create hotend attachment points
    function createHotendPoint(position, normal, suffix, faceId, holeCount) {
        const point = new THREE.Mesh(sphereGeometry, sphereMaterial.clone());
        const offsetPosition = position.clone().add(normal.clone().multiplyScalar(5)); // 5mm offset from face

        point.position.copy(offsetPosition);
        
        // Set color based on hole count for visual distinction
        let color = partColors['hotend'] || 0xff0000;
        if (holeCount === 2) {
            color = 0xff6600; // Orange for 2-hole hotend mounts
        } else if (holeCount === 4) {
            color = 0xff0000; // Red for 4-hole hotend mounts
        }
        
        point.material.color.setHex(color);
        point.material.emissive.setHex(color);
        
        point.userData = {
            attachmentType: 'hotend',
            attachmentName: 'hotend' + suffix,
            normal: normal,
            faceId: faceId,
            holeCount: holeCount,
            parentModel: null
        };

        // Check if this point already has a model attached
        let isAttached = false;
        attachedModels.forEach((model, existingPoint) => {
            if (existingPoint.userData.attachmentType === 'hotend' &&
                existingPoint.userData.faceId === faceId) {
                isAttached = true;
            }
        });

        // Only show point if no model is attached
        point.visible = !isAttached;
        
        object.add(point);
        attachmentPoints.push(point);
    }

    // Define the attachment points we need with their characteristics
    const attachmentDefinitions = [
        {
            type: 'hotend',
            characteristics: { normal: { x: 0, y: 0, z: 1 }, holeCount: 2 },  // Only 2-hole faces for hotend
            findMultiple: true  // Find all hotend faces, not just one
        },
        {
            type: 'skirt',
            characteristics: { normal: { x: 0, y: 0, z: -1 } }
        },
        {
            type: 'fanguard',
            characteristics: { normal: { x: 0, y: -1, z: 0 } }
        },
        {
            type: 'gantry',
            characteristics: { normal: { x: 0, y: 1, z: 0 }, holeCount: 4 }
        },
        {
            type: 'partcooling',
            characteristics: { normal: { x: -1, y: 0, z: 0 } },
            createOpposite: true
        },
        {
            type: 'wing',
            characteristics: { normal: { x: -1, y: 0, z: 0 } },
            createOpposite: true
        }
    ];

    // Create points based on definitions
    for (const def of attachmentDefinitions) {
        if (def.findMultiple) {
            // Find all faces matching the characteristics for hotends
            const faces = geometryData.faces.filter(face => {
                if (assignedFaces.has(face.faceId)) return false;
                return Object.entries(def.characteristics).every(([key, value]) => {
                    if (key === 'holeCount') return face.holes?.length === value;
                    if (key === 'normal') {
                        const dot = face.normal.x * value.x + face.normal.y * value.y + face.normal.z * value.z;
                        return Math.abs(dot - 1) < 0.1; // Allow small deviation
                    }
                    return true;
                });
            });
            
            console.log(`Found ${faces.length} faces for ${def.type} with characteristics:`, def.characteristics);
            faces.forEach(face => {
                console.log(`  Face ${face.faceId}: ${face.holes?.length || 0} holes, normal: (${face.normal.x?.toFixed(2)}, ${face.normal.y?.toFixed(2)}, ${face.normal.z?.toFixed(2)})`);
            });

            // Create attachment points for all matching faces
            faces.forEach((face, index) => {
                assignedFaces.add(face.faceId);
                const center = calculateHolePatternCenter(face.holes);
                const normal = new THREE.Vector3(face.normal.x, face.normal.y, face.normal.z);
                
                const suffix = faces.length > 1 ? `_${index + 1}` : '';
                createHotendPoint(center.clone(), normal, suffix, face.faceId, face.holes.length);
            });
        } else {
            const face = findFaceByCharacteristics(def.characteristics);
            if (!face) continue;

            assignedFaces.add(face.faceId);

            const center = calculateHolePatternCenter(face.holes);
            const normal = new THREE.Vector3(face.normal.x, face.normal.y, face.normal.z);

            // Create main point
            const createPoint = (position, normal, suffix = '', faceId = face.faceId) => {
                const point = new THREE.Mesh(sphereGeometry, sphereMaterial.clone());
                const offsetPosition = position.clone().add(normal.clone().multiplyScalar(5)); // 5mm offset from face

                point.position.copy(offsetPosition);
                
                // Set color based on type
                const color = partColors[def.type] || 0x800080;
                point.material.color.setHex(color);
                point.material.emissive.setHex(color);
                
                point.userData = {
                    attachmentType: def.type,
                    attachmentName: def.type + suffix,
                    normal: normal,
                    faceId: faceId,
                    parentModel: null
                };

                // Check if this point already has a model attached
                let isAttached = false;
                attachedModels.forEach((model, existingPoint) => {
                    if (existingPoint.userData.attachmentType === def.type &&
                        existingPoint.userData.attachmentName === (def.type + suffix)) {
                        isAttached = true;
                    }
                });

                // Only show point if no model is attached
                point.visible = !isAttached;
                
                object.add(point);
                attachmentPoints.push(point);
            };

            createPoint(center.clone(), normal);

            // Create opposite point if needed
            if (def.createOpposite) {
                const oppositeCenter = center.clone();
                oppositeCenter.x *= -1;
                const oppositeNormal = normal.clone();
                oppositeNormal.x *= -1;  // Flip the normal for the opposite side

                // Find matching face for opposite side
                const oppositeFace = geometryData.faces.find(f => 
                    !assignedFaces.has(f.faceId) &&
                    Math.abs(f.normal.x - (-face.normal.x)) < 0.1 &&
                    Math.abs(f.normal.y - face.normal.y) < 0.1 &&
                    Math.abs(f.normal.z - face.normal.z) < 0.1
                );

                if (oppositeFace) {
                    assignedFaces.add(oppositeFace.faceId);
                    const oppositeCenter = calculateHolePatternCenter(oppositeFace.holes);
                    createPoint(oppositeCenter, oppositeNormal, '_opposite', oppositeFace.faceId);
                }
            }
        }
    }

    console.log(`Created ${attachmentPoints.length} attachment points`);
}

// Load and attach a model at the selected point
async function attachModelAtPoint(modelPath) {
    console.log('Attaching model:', modelPath);

    if (!selectedPoint || !modelPath) return;

    // Set attachment type based on filename for directdrive menu items
    const fileName = modelPath.split('/').pop().toLowerCase();
    if (selectedPoint.userData.originalType === 'directdrive' ||
        selectedPoint.userData.attachmentType === 'directdrive' ||
        selectedPoint.userData.attachmentType === 'spacer') {

        if (fileName.includes('riser')) {
            selectedPoint.userData.attachmentType = 'spacer';
        } else {
            selectedPoint.userData.attachmentType = 'directdrive';
        }
    }

    console.log('Selected attachment point:', {
        attachmentType: selectedPoint?.userData?.attachmentType,
        faceId: selectedPoint?.userData?.faceId,
        holeCount: selectedPoint?.userData?.holeCount,
        attachmentName: selectedPoint?.userData?.attachmentName,
        fileName: fileName
    });

    try {
        // Show loading state
        document.body.style.cursor = 'wait';

        // Set the global current attachment path for pattern matching
        window.currentAttachmentPath = modelPath;

        // Load geometry data
        const baseModelPath = selectedPoint.userData.parentModel?.userData.modelPath || 'heromedir/base/UniversalBase.stl';
        const baseGeometryData = await loadGeometryData(baseModelPath);
        const attachGeometryData = await loadGeometryData(modelPath);

        if (!baseGeometryData || !attachGeometryData) {
            console.error('Failed to load geometry data - model attachment cancelled');
            document.body.style.cursor = 'default'; // Reset cursor
            return;
        }

        // Check if this is an assembly reference
        if (attachGeometryData.isAssemblyReference) {
            console.log('Assembly reference detected, loading assembly instead of single model');

            // Remove existing model if present
            if (attachedModels.has(selectedPoint)) {
                const oldModel = attachedModels.get(selectedPoint);
                if (oldModel.userData.modelPath) {
                    resetPatterns(oldModel.userData.modelPath);
                }
                scene.remove(oldModel);
                attachedModels.delete(selectedPoint);
            }

            // Attach the assembly (pass the model path so we know the directory)
            const assembly = await attachAssemblyAtPoint(attachGeometryData, selectedPoint, baseGeometryData, modelPath);

            if (assembly) {
                // Hide the menu
                hideMenu();
                console.log('Assembly attached successfully');
            }

            document.body.style.cursor = 'default';
            return;
        }

        // Remove existing model if present
        if (attachedModels.has(selectedPoint)) {
            const oldModel = attachedModels.get(selectedPoint);
            if (oldModel.userData.modelPath) {
                resetPatterns(oldModel.userData.modelPath);
            }
            scene.remove(oldModel);
            attachedModels.delete(selectedPoint);
        }

        // Load the STL model
        const loader = new THREE.STLLoader();
        loader.load(modelPath,
            function (geometry) {
                // Create material with appropriate color
                const attachmentType = selectedPoint.userData.attachmentType;
                const originalType = selectedPoint.userData.originalType || attachmentType;

                // Determine if this is a riser/spacer for color purposes
                const isRiser = modelPath.toLowerCase().includes('riser');
                const actualType = isRiser ? 'spacer' : originalType;

                const color = partColors[actualType] || 0x808080;
                const material = new THREE.MeshPhongMaterial({
                    color: color,
                    flatShading: false,
                    transparent: true,
                    opacity: 1
                });

                const mesh = new THREE.Mesh(geometry, material);
                
                // Center the geometry
                geometry.computeBoundingBox();
                const center = geometry.boundingBox.getCenter(new THREE.Vector3());
                geometry.translate(-center.x, -center.y, -center.z);

                // Store model metadata
                mesh.userData.modelPath = modelPath;
                mesh.userData.attachmentType = attachmentType;
                mesh.userData.geometryData = attachGeometryData;

                // Align the model based on attachment type
                if (attachmentType === 'partcooling') {
                    alignPartCoolingModel(mesh, selectedPoint, baseGeometryData, attachGeometryData);
                } else {
                    alignGenericModel(mesh, selectedPoint, baseGeometryData, attachGeometryData);
                }

                // Add to appropriate parent (mainModel for primary attachments, parentModel for secondary)
                const parentModel = selectedPoint.userData.parentModel || mainModel;
                parentModel.add(mesh);
                attachedModels.set(selectedPoint, mesh);
                
                // Hide the selected attachment point
                selectedPoint.visible = false;

                // Visualize geometry features
                if (attachGeometryData) {
                    visualizeGeometryFeatures(attachGeometryData, mesh);
                }

                // Create position control arrows for adjustable parts
                if (['partcooling', 'probe'].includes(attachmentType)) {
                    const positionArrows = createPositionArrows(mesh);
                    mesh.userData.positionControls = positionArrows;
                    positionArrows.forEach(arrow => {
                        if (attachmentType === 'probe') {
                            // Probe arrows: add to the mesh itself (like live_app.js)
                            mesh.add(arrow);
                        } else {
                            // Part cooling arrows: add to mainModel (like live_app.js)
                            mainModel.add(arrow);
                        }
                    });
                }

                // Create secondary attachment points if this model supports them (like live_app.js)
                const menuConfig = categoryMenus[attachmentType];

                // Create points if this isn't a secondary attachment OR if it's a riser
                if (!menuConfig?.parentType || modelPath.toLowerCase().includes('riser')) {
                    createSecondaryAttachmentPoints(mesh).then(() => {
                        console.log('Secondary attachment points created for', attachmentType);
                    });
                }

                // Hide the menu
                hideMenu();
                
                console.log(`Successfully attached ${modelPath} to ${attachmentType} point`);
            },
            function (progress) {
                console.log('Loading progress:', (progress.loaded / progress.total) * 100 + '%');
            },
            function (error) {
                console.error('Error loading model:', error);
            }
        );

    } catch (error) {
        console.error('Error in attachModelAtPoint:', error);
    } finally {
        document.body.style.cursor = 'default';
    }
}

// Alignment functions for different model types
function alignPartCoolingModel(mesh, attachPoint, baseGeometryData, attachGeometryData) {
    if (!baseGeometryData.slideFaces || !attachGeometryData.slideFaces) {
        console.error('Missing slide face data for part cooling alignment');
        return;
    }

    console.log('🔧 Part Cooling Alignment: Starting alignment process');

    // Set the global current attachment path for pattern matching
    window.currentAttachmentPath = mesh.userData.modelPath;
    const baseModelPath = 'heromedir/base/UniversalBase.stl';

    // Check available slide faces to prevent conflicts (from working version)
    const availableBaseFaces = baseGeometryData.slideFaces.filter((group, index) =>
        !isPatternUsed(baseModelPath, { groupIndex: index })
    );

    const availableAttachFaces = attachGeometryData.slideFaces.filter((group, index) =>
        !isPatternUsed(mesh.userData.modelPath, { groupIndex: index })
    );

    console.log('Available base slide faces:', availableBaseFaces.length);
    console.log('Available attachment slide faces:', availableAttachFaces.length);

    // Get the orientation face normal (correct vector from working version)
    const attachOrientation = new THREE.Vector3(
        attachGeometryData.orientationFace.normal.x,
        attachGeometryData.orientationFace.normal.y,
        attachGeometryData.orientationFace.normal.z
    );
    console.log('🔧 Orientation face normal (before):', attachOrientation);

    const isDualDuct = attachGeometryData.slideFaces.length > 1;
    const isRightSide = attachPoint.userData.attachmentName?.includes('opposite');

    console.log('🔧 Part cooling type:', isDualDuct ? 'Dual duct' : 'Single duct');
    console.log('🔧 Side:', isRightSide ? 'Right' : 'Left');

    if (isDualDuct) {
        // Mark patterns as used for dual duct (exact copy from working version)
        markPatternAsUsed(baseModelPath, { groupIndex: 0 });
        markPatternAsUsed(baseModelPath, { groupIndex: 1 });
        markPatternAsUsed(mesh.userData.modelPath, { groupIndex: 0 });
        markPatternAsUsed(mesh.userData.modelPath, { groupIndex: 1 });

        // Calculate centers of both base groups (exact copy from working OLD/app.js)
        const baseCenterLeft = new THREE.Vector3(
            (baseGeometryData.slideFaces[1].faces[0].position.x + baseGeometryData.slideFaces[1].faces[1].position.x) / 2,
            (baseGeometryData.slideFaces[1].faces[0].position.y + baseGeometryData.slideFaces[1].faces[1].position.y) / 2,
            (baseGeometryData.slideFaces[1].faces[0].position.z + baseGeometryData.slideFaces[1].faces[1].position.z) / 2
        );
        const baseCenterRight = new THREE.Vector3(
            (baseGeometryData.slideFaces[0].faces[0].position.x + baseGeometryData.slideFaces[0].faces[1].position.x) / 2,
            (baseGeometryData.slideFaces[0].faces[0].position.y + baseGeometryData.slideFaces[0].faces[1].position.y) / 2,
            (baseGeometryData.slideFaces[0].faces[0].position.z + baseGeometryData.slideFaces[0].faces[1].position.z) / 2
        );
        const baseCenter = new THREE.Vector3().addVectors(baseCenterLeft, baseCenterRight).multiplyScalar(0.5);

        // Calculate centers of both attachment groups (exact copy from working OLD/app.js)
        const attachCenterLeft = new THREE.Vector3(
            (attachGeometryData.slideFaces[0].faces[0].position.x + attachGeometryData.slideFaces[0].faces[1].position.x) / 2,
            (attachGeometryData.slideFaces[0].faces[0].position.y + attachGeometryData.slideFaces[0].faces[1].position.y) / 2,
            (attachGeometryData.slideFaces[0].faces[0].position.z + attachGeometryData.slideFaces[0].faces[1].position.z) / 2
        );
        const attachCenterRight = new THREE.Vector3(
            (attachGeometryData.slideFaces[1].faces[0].position.x + attachGeometryData.slideFaces[1].faces[1].position.x) / 2,
            (attachGeometryData.slideFaces[1].faces[0].position.y + attachGeometryData.slideFaces[1].faces[1].position.y) / 2,
            (attachGeometryData.slideFaces[1].faces[0].position.z + attachGeometryData.slideFaces[1].faces[1].position.z) / 2
        );
        const attachCenter = new THREE.Vector3().addVectors(attachCenterLeft, attachCenterRight).multiplyScalar(0.5);

        // First align orientations to sky
        const upVector = new THREE.Vector3(0, 0, 1);
        const orientQuat = new THREE.Quaternion();
        orientQuat.setFromUnitVectors(attachOrientation, upVector);
        mesh.quaternion.copy(orientQuat);

        // Align normals between dual duct faces (apply orientation FIRST, then calculate normals)
        const baseNormalLeft = new THREE.Vector3(
            baseGeometryData.slideFaces[1].faces[0].normal.x,
            baseGeometryData.slideFaces[1].faces[0].normal.y,
            baseGeometryData.slideFaces[1].faces[0].normal.z
        );
        const attachNormalLeft = new THREE.Vector3(
            attachGeometryData.slideFaces[0].faces[0].normal.x,
            attachGeometryData.slideFaces[0].faces[0].normal.y,
            attachGeometryData.slideFaces[0].faces[0].normal.z
        ).applyQuaternion(orientQuat); // Apply the orientation quaternion to the attach normal

        // Ensure slide faces are properly opposed
        const normalQuat = new THREE.Quaternion();
        normalQuat.setFromUnitVectors(attachNormalLeft, baseNormalLeft.clone().negate());
        mesh.quaternion.premultiply(normalQuat);

        // Position using combined centers (exact copy from live_app.js)
        const transformedAttachCenter = attachCenter.clone().applyQuaternion(mesh.quaternion);
        const offset = baseCenter.clone().sub(transformedAttachCenter);
        mesh.position.copy(offset);

    } else {
        // Single duct logic - improved version from working OLD/app.js
        const baseGroupIndex = isRightSide ? 0 : 1;

        // Mark patterns as used (from working version)
        markPatternAsUsed(baseModelPath, { groupIndex: baseGroupIndex });
        markPatternAsUsed(mesh.userData.modelPath, { groupIndex: 0 }); // Always use the first group from attachment model

        // Get reference to base and attachment slide face groups
        const baseGroup = baseGeometryData.slideFaces[baseGroupIndex];
        const attachGroup = attachGeometryData.slideFaces[0]; // First slide face group in attachment

        // First align orientations to consistent reference frame
        const upVector = new THREE.Vector3(0, 0, 1);
        const orientQuat = new THREE.Quaternion();
        orientQuat.setFromUnitVectors(attachOrientation, upVector);
        mesh.quaternion.copy(orientQuat);

        // Extract normal vectors for alignment
        const baseNormal = new THREE.Vector3(
            baseGroup.faces[0].normal.x,
            baseGroup.faces[0].normal.y,
            baseGroup.faces[0].normal.z
        );
        const attachNormal = new THREE.Vector3(
            attachGroup.faces[0].normal.x,
            attachGroup.faces[0].normal.y,
            attachGroup.faces[0].normal.z
        ).applyQuaternion(orientQuat);

        const normalQuat = new THREE.Quaternion();
        normalQuat.setFromUnitVectors(attachNormal, baseNormal.clone().negate());
        mesh.quaternion.premultiply(normalQuat);

        // IMPROVED CENTER CALCULATION from working version - eliminate hardcoded offsets
        // Extract face center points from both models
        const baseFaceCenter1 = new THREE.Vector3(
            baseGroup.faces[0].position.x,
            baseGroup.faces[0].position.y,
            baseGroup.faces[0].position.z
        );
        const baseFaceCenter2 = new THREE.Vector3(
            baseGroup.faces[1].position.x,
            baseGroup.faces[1].position.y,
            baseGroup.faces[1].position.z
        );
        const attachFaceCenter1 = new THREE.Vector3(
            attachGroup.faces[0].position.x,
            attachGroup.faces[0].position.y,
            attachGroup.faces[0].position.z
        );
        const attachFaceCenter2 = new THREE.Vector3(
            attachGroup.faces[1].position.x,
            attachGroup.faces[1].position.y,
            attachGroup.faces[1].position.z
        );

        // Calculate correct base center with weighting toward the mounting interface (from live_app.js)
        const baseFaceDirection = baseFaceCenter2.clone().sub(baseFaceCenter1).normalize();
        const baseCenterWeighted = new THREE.Vector3().addVectors(
            baseFaceCenter1.clone().multiplyScalar(0.6),
            baseFaceCenter2.clone().multiplyScalar(0.4)
        );

        // Calculate correct attachment center with similar weighting (from live_app.js)
        const attachFaceDirection = attachFaceCenter2.clone().sub(attachFaceCenter1).normalize();
        const attachCenterWeighted = new THREE.Vector3().addVectors(
            attachFaceCenter1.clone().multiplyScalar(0.6),
            attachFaceCenter2.clone().multiplyScalar(0.4)
        );

        console.log('🔧 DEBUG: Base group index:', baseGroupIndex);
        console.log('🔧 DEBUG: Base face 1 position:', baseFaceCenter1.x.toFixed(2), baseFaceCenter1.y.toFixed(2), baseFaceCenter1.z.toFixed(2));
        console.log('🔧 DEBUG: Base face 2 position:', baseFaceCenter2.x.toFixed(2), baseFaceCenter2.y.toFixed(2), baseFaceCenter2.z.toFixed(2));
        console.log('🔧 DEBUG: Base weighted center:', baseCenterWeighted.x.toFixed(2), baseCenterWeighted.y.toFixed(2), baseCenterWeighted.z.toFixed(2));
        console.log('🔧 DEBUG: Attach face 1 position:', attachFaceCenter1.x.toFixed(2), attachFaceCenter1.y.toFixed(2), attachFaceCenter1.z.toFixed(2));
        console.log('🔧 DEBUG: Attach face 2 position:', attachFaceCenter2.x.toFixed(2), attachFaceCenter2.y.toFixed(2), attachFaceCenter2.z.toFixed(2));
        console.log('🔧 DEBUG: Attach weighted center:', attachCenterWeighted.x.toFixed(2), attachCenterWeighted.y.toFixed(2), attachCenterWeighted.z.toFixed(2));

        // Apply quaternion to attachment center (from live_app.js)
        const transformedAttachCenter = attachCenterWeighted.clone().applyQuaternion(mesh.quaternion);
        const offset = baseCenterWeighted.clone().sub(transformedAttachCenter);

        console.log('🔧 DEBUG: Transformed attach center:', transformedAttachCenter.x.toFixed(2), transformedAttachCenter.y.toFixed(2), transformedAttachCenter.z.toFixed(2));
        console.log('🔧 DEBUG: Final offset:', offset.x.toFixed(2), offset.y.toFixed(2), offset.z.toFixed(2));

        // Check if right side needs 180° rotation - AFTER all normals are defined (from working version)
        if (isRightSide) {
            const angle = attachNormal.angleTo(baseNormal);
            if (angle < Math.PI / 2) {
                const rotationQuat = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(0, 0, 1), // Z-axis rotation (from live_app.js)
                    Math.PI
                );
                mesh.quaternion.premultiply(rotationQuat);

                // Recalculate offset with new rotation using weighted centers (from live_app.js)
                const newTransformedCenter = attachCenterWeighted.clone().applyQuaternion(mesh.quaternion);
                offset.copy(baseCenterWeighted.clone().sub(newTransformedCenter));
            }
        }

        // Set final position (exact copy from live_app.js)
        mesh.position.copy(offset);
    }

    console.log('🔧 Part Cooling Alignment Complete');
}

function alignProbeModel(mesh, attachPoint, baseGeometryData, attachGeometryData) {
    // Probe mount alignment using slide faces - align slide face to slide face
    if (!baseGeometryData.slideFaces || !attachGeometryData.slideFaces) {
        console.error('Missing slide face data for probe alignment');
        return;
    }

    // Get the slide face group index from the attachment point
    const faceId = attachPoint.userData.faceId;
    const groupIndex = parseInt(faceId.replace('slide_', ''));
    const baseSlideGroup = baseGeometryData.slideFaces[groupIndex];
    const attachSlideGroup = attachGeometryData.slideFaces[0]; // First slide group in probe

    if (!baseSlideGroup || !attachSlideGroup) {
        console.error('Could not find slide face groups for probe alignment');
        return;
    }

    // Get slide face centers and normals
    const baseSlideFace = baseSlideGroup.faces[0];
    const attachSlideFace = attachSlideGroup.faces[0];

    // Use base slide face position and normal in local coordinates
    // No need to apply parent transforms - position will be relative to parent
    const baseCenter = new THREE.Vector3(baseSlideFace.position.x, baseSlideFace.position.y, baseSlideFace.position.z);
    const attachCenter = new THREE.Vector3(attachSlideFace.position.x, attachSlideFace.position.y, attachSlideFace.position.z);

    // Use base normal in local coordinates
    const baseNormal = new THREE.Vector3(baseSlideFace.normal.x, baseSlideFace.normal.y, baseSlideFace.normal.z);

    const attachNormal = new THREE.Vector3(attachSlideFace.normal.x, attachSlideFace.normal.y, attachSlideFace.normal.z);

    // Align normals - slide faces should be opposite each other
    const normalQuat = new THREE.Quaternion();
    normalQuat.setFromUnitVectors(attachNormal, baseNormal.clone().negate());
    mesh.quaternion.copy(normalQuat);

    // Position so slide faces are flush
    const transformedAttachCenter = attachCenter.clone().applyQuaternion(mesh.quaternion);
    const offset = baseCenter.clone().sub(transformedAttachCenter);
    mesh.position.copy(offset);
    
    // Make sure the mesh has the correct userData
    mesh.userData.attachmentType = 'probe';

    // Create position arrows using the working function
    const positionArrows = createPositionArrows(mesh);
    mesh.userData.positionControls = positionArrows;
    positionArrows.forEach(arrow => scene.add(arrow));
    
    // Add probe mount to attachedModels so position controls work
    attachedModels.set(attachPoint, mesh);
}

function alignGenericModel(mesh, attachPoint, baseGeometryData, attachGeometryData) {
    // Handle probe mounts (slide faces) first, before looking for hole pattern faces
    if (attachPoint.userData.parentModel && attachPoint.userData.attachmentType === 'probe') {
        // Check if we have the necessary slide face data
        if (!baseGeometryData?.slideFaces?.[0] || !attachGeometryData?.slideFaces?.[0]) {
            console.error('Missing slide face data for probe alignment');
            console.error('Base slide faces:', baseGeometryData?.slideFaces);
            console.error('Attach slide faces:', attachGeometryData?.slideFaces);
            return;
        }

        // Probe alignment - EXACT copy from OLD/app.js
        const attachOrientation = new THREE.Vector3(
            attachGeometryData.orientationFace.normal.x,
            attachGeometryData.orientationFace.normal.y,
            attachGeometryData.orientationFace.normal.z
        );
        const upVector = new THREE.Vector3(0, 0, 1);
        const baseGroupIndex = 0;
        markPatternAsUsed(baseGeometryData.modelPath || 'heromedir/base/UniversalBase.stl', { groupIndex: baseGroupIndex });
        markPatternAsUsed(attachGeometryData.modelPath, { groupIndex: 0 });

        const baseGroup = baseGeometryData.slideFaces[0];
        const attachGroup = attachGeometryData.slideFaces[0];

        // First align orientations to sky
        console.log('🔧 PROBE DEBUG: attachOrientation:', attachOrientation);
        console.log('🔧 PROBE DEBUG: upVector:', upVector);
        const orientQuat = new THREE.Quaternion();
        orientQuat.setFromUnitVectors(attachOrientation, upVector);
        mesh.quaternion.copy(orientQuat);
        console.log('🔧 PROBE DEBUG: orientation quaternion:', orientQuat);

        // Then align slide face normals
        const baseNormal = new THREE.Vector3(
            baseGroup.faces[0].normal.x,
            baseGroup.faces[0].normal.y,
            baseGroup.faces[0].normal.z
        );
        const attachNormal = new THREE.Vector3(
            attachGroup.faces[0].normal.x,
            attachGroup.faces[0].normal.y,
            attachGroup.faces[0].normal.z
        ).applyQuaternion(orientQuat);

        const normalQuat = new THREE.Quaternion();
        normalQuat.setFromUnitVectors(attachNormal, baseNormal.clone().negate());
        mesh.quaternion.premultiply(normalQuat);

        // Calculate centers for positioning
        // For probe mounts, use slide face position from wing geometry (like OLD app.js)
        const baseCenter = new THREE.Vector3(
            baseGroup.faces[0].position.x,
            baseGroup.faces[0].position.y,
            baseGroup.faces[0].position.z
        );
        const attachCenter = new THREE.Vector3(
            attachGroup.faces[0].position.x,
            attachGroup.faces[0].position.y,
            attachGroup.faces[0].position.z
        );

        // Position using centers
        const transformedAttachCenter = attachCenter.clone().applyQuaternion(mesh.quaternion);
        const offset = baseCenter.clone().sub(transformedAttachCenter);
        mesh.position.copy(offset);

        return; // Exit early for probe mounts
    }

    // Use the specific face assigned to this attachment point (for hole pattern attachments)
    const closestFace = baseGeometryData.faces.find(face => face.faceId === attachPoint.userData.faceId);
    if (!closestFace) {
        console.error('No suitable face found for attachment point with faceId:', attachPoint.userData.faceId);
        return;
    }
    
    console.log(`Using assigned face ${closestFace.faceId} with ${closestFace.holes?.length || 0} holes for ${attachPoint.userData.attachmentType}`);

    const matchingFace = findMatchingFaces(closestFace, attachGeometryData.faces, attachPoint.userData.attachmentType);
    if (!matchingFace) {
        console.error('No matching face pattern found');
        return;
    }

    // Calculate baseCenter from hole pattern center (like OLD app.js)
    const baseCenter = calculateHolePatternCenter(closestFace.holes);
    const baseNormal = new THREE.Vector3(
        closestFace.normal.x,
        closestFace.normal.y,
        closestFace.normal.z
    );

    console.log('🔧 DEBUG: Attachment point position:', attachPoint.position);
    console.log('🔧 DEBUG: Face center from holes:', baseCenter);
    console.log('🔧 DEBUG: Face normal:', baseNormal);
    console.log('🔧 DEBUG: Attachment type:', attachPoint.userData.attachmentType);
    console.log('🔧 DEBUG: Parent model:', attachPoint.userData.parentModel);

    // Handle specific attachment type alignments - EXACT LOGIC FROM OLD_APP.JS
    if (attachPoint.userData.attachmentType === 'hotend' ||
        attachPoint.userData.attachmentType === 'directdrive' ||
        attachPoint.userData.attachmentType === 'spacer') {
        
        HeroMeDebug.log('🚨🚨🚨 USING UNIFIED MOUNT ALIGNMENT');
    
        if (attachGeometryData.frontFace && attachGeometryData.orientationFace) {
            HeroMeDebug.log('Using explicit front and orientation faces for alignment');

            // Check if we have enhanced face data (new format) or legacy format
            const hasEnhancedData = attachGeometryData.orientationFace.position &&
                                  attachGeometryData.orientationFace.dimensions &&
                                  attachGeometryData.frontFace.position &&
                                  attachGeometryData.frontFace.dimensions;

            // Get the front normal vector and normalize it
            const frontNormal = new THREE.Vector3(
                attachGeometryData.frontFace.normal.x,
                attachGeometryData.frontFace.normal.y,
                attachGeometryData.frontFace.normal.z
            ).normalize();

            // Extract orientation normal and rotation
            const orientNormal = new THREE.Vector3(
                attachGeometryData.orientationFace.normal.x,
                attachGeometryData.orientationFace.normal.y,
                attachGeometryData.orientationFace.normal.z
            ).normalize();

            const orientRotation = attachGeometryData.orientationFace.rotation;

            if (hasEnhancedData) {
                console.log('🟢 ENHANCED DATA: Using enhanced face data with position and dimensions for', mesh.userData.modelPath);
                console.log('🟢 Enhanced data check:', {
                    orientationFacePosition: !!attachGeometryData.orientationFace.position,
                    orientationFaceDimensions: !!attachGeometryData.orientationFace.dimensions,
                    frontFacePosition: !!attachGeometryData.frontFace.position,
                    frontFaceDimensions: !!attachGeometryData.frontFace.dimensions
                });
            } else {
                console.log('🔴 LEGACY DATA: Using legacy face data (normal + rotation only) for', mesh.userData.modelPath);
                console.log('🔴 Enhanced data check:', {
                    orientationFacePosition: !!attachGeometryData.orientationFace?.position,
                    orientationFaceDimensions: !!attachGeometryData.orientationFace?.dimensions,
                    frontFacePosition: !!attachGeometryData.frontFace?.position,
                    frontFaceDimensions: !!attachGeometryData.frontFace?.dimensions
                });
            }
            
            // Define target vectors
            const targetUp = new THREE.Vector3(0, 0, 1);
            
            HeroMeDebug.log('Mount data:', {
                orientNormal,
                orientRotation,
                modelPath: mesh.userData.modelPath
            });
            
            // Create initial rotation based on orientation face rotation
            const initialRotation = new THREE.Euler(
                orientRotation.x * Math.PI / 180,
                orientRotation.y * Math.PI / 180,
                orientRotation.z * Math.PI / 180
            );
            const initialQuat = new THREE.Quaternion().setFromEuler(initialRotation);
            mesh.quaternion.copy(initialQuat);
            
            // Enhanced alignment logic with backwards compatibility
            const baseQuat = new THREE.Quaternion();
            
            if (hasEnhancedData) {
                // Use enhanced face data with position and dimensions
                HeroMeDebug.log('Enhanced alignment for', attachPoint.userData.attachmentType);

                // For direct drive, spacers, and hotend mounts:
                // - Orientation face should be above the first group of holes
                // - Front face should be ahead of them (closer to camera in default position)

                if (attachPoint.userData.attachmentType === 'spacer' ||
                    attachPoint.userData.attachmentType === 'directdrive' ||
                    attachPoint.userData.attachmentType === 'hotend') {

                    console.log('🎯 ENHANCED ALIGNMENT: Using simplified enhanced alignment for', attachPoint.userData.attachmentType);

                    // Make orientation face normal always point up (global +Z), regardless of JSON
                    const parentModel = attachPoint.userData.parentModel || mainModel;
                    const parentWorldQuat = new THREE.Quaternion();
                    parentModel.getWorldQuaternion(parentWorldQuat);
                    const parentInverseQuat = parentWorldQuat.clone().invert();

                    // Get orientation face normal from JSON (whatever direction it points)
                    const orientNormal = new THREE.Vector3(
                        attachGeometryData.orientationFace.normal.x,
                        attachGeometryData.orientationFace.normal.y,
                        attachGeometryData.orientationFace.normal.z
                    );

                    // ALWAYS make orientation face point up (+Y) regardless of JSON direction
                    const targetUp = new THREE.Vector3(0, 1, 0);

                    // Transform target to parent's local space
                    const localTargetUp = targetUp.clone().applyQuaternion(parentInverseQuat);

                    // Step 1: Rotate mesh so its orientation face normal aligns with local up
                    const orientQuat = new THREE.Quaternion();
                    orientQuat.setFromUnitVectors(orientNormal, localTargetUp);
                    mesh.quaternion.copy(orientQuat);

                    // Step 2: Also align front face to point toward camera (-Y)
                    const frontNormal = new THREE.Vector3(
                        attachGeometryData.frontFace.normal.x,
                        attachGeometryData.frontFace.normal.y,
                        attachGeometryData.frontFace.normal.z
                    );

                    // Apply the orientation rotation to the front normal
                    const rotatedFrontNormal = frontNormal.clone().applyQuaternion(orientQuat);

                    // Target front direction (+Z toward camera) in parent's local space
                    const targetFront = new THREE.Vector3(0, 0, 1);
                    const localTargetFront = targetFront.clone().applyQuaternion(parentInverseQuat);

                    // Additional rotation to align front face
                    const frontQuat = new THREE.Quaternion();
                    frontQuat.setFromUnitVectors(rotatedFrontNormal, localTargetFront);
                    mesh.quaternion.premultiply(frontQuat);

                    // Position to align holes in parent space
                    const baseHoleCenter = calculateHolePatternCenter(closestFace.holes);
                    const attachHoleCenter = calculateHolePatternCenter(matchingFace.holes);
                    const transformedAttachCenter = attachHoleCenter.clone().applyQuaternion(mesh.quaternion);

                    mesh.position.copy(baseHoleCenter.clone().sub(transformedAttachCenter));

                } else {
                    // Enhanced alignment for other attachment types (use same logic as spacer/directdrive/hotend)
                    console.log('🎯 ENHANCED ALIGNMENT (CATCH-ALL): Using enhanced alignment for attachment type:', attachPoint.userData.attachmentType);

                    // Step 1: Align the mounting face normals (holes face to face)
                    const mountingNormal = new THREE.Vector3(
                        matchingFace.normal.x,
                        matchingFace.normal.y,
                        matchingFace.normal.z
                    );
                    const normalQuat = new THREE.Quaternion();
                    normalQuat.setFromUnitVectors(mountingNormal, baseNormal.clone().negate());
                    mesh.quaternion.copy(normalQuat);

                    // Step 2: Universal position-based front face alignment
                    const frontFacePos = attachGeometryData.frontFace.position;
                    const firstHolePos = matchingFace.holes[0].position;

                    const currentFrontNormal = frontNormal.clone().applyQuaternion(normalQuat);
                    const targetForward = new THREE.Vector3(0, -1, 0);

                    // Check if the front face normal wants to point toward camera or away
                    const frontNormalTowardCamera = Math.abs(frontNormal.y + 1) < 0.1; // Close to (0,-1,0)

                    if (frontNormalTowardCamera) {
                        // Front face should point toward camera, check positions to see if it's correctly positioned
                        const frontFaceInFront = frontFacePos.y < firstHolePos.y; // More negative Y = more toward front

                        if (!frontFaceInFront) {
                            // Front face is behind but should point forward - flip the whole part
                            const frontAlignQuat = new THREE.Quaternion();
                            frontAlignQuat.setFromUnitVectors(currentFrontNormal, targetForward.clone().negate());
                            mesh.quaternion.premultiply(frontAlignQuat);
                        } else {
                            // Normal case - front face in front and should point forward
                            const frontAlignQuat = new THREE.Quaternion();
                            frontAlignQuat.setFromUnitVectors(currentFrontNormal, targetForward);
                            mesh.quaternion.premultiply(frontAlignQuat);
                        }
                    } else {
                        // Front face normal points in other direction, just align it toward camera
                        const frontAlignQuat = new THREE.Quaternion();
                        frontAlignQuat.setFromUnitVectors(currentFrontNormal, targetForward);
                        mesh.quaternion.premultiply(frontAlignQuat);
                    }

                    HeroMeDebug.log('Enhanced alignment complete for other attachment type');
                }

            } else {
                // Legacy alignment logic (backwards compatibility)
                console.log('🔴 LEGACY ALIGNMENT: Using legacy alignment for', attachPoint.userData.attachmentType, 'on model', mesh.userData.modelPath);
                
                if (attachPoint.userData.attachmentType === 'spacer' || attachPoint.userData.attachmentType === 'directdrive') {
                    // Do normal orientation and alignment first
                    baseQuat.setFromUnitVectors(orientNormal, orientRotation.x === 0 ? targetUp.clone().negate() : targetUp);
                    mesh.quaternion.copy(baseQuat);
                
                    // DO THE INITIAL FRONT ALIGNMENT
                    let rotatedFrontVec = frontNormal.clone().applyQuaternion(mesh.quaternion);
                    let frontAlignAngle = Math.atan2(rotatedFrontVec.x, -rotatedFrontVec.y);
                    //Flip Horizontally for weird hotends
                    const needsHorFlip = baseGeometryData.orientationFace && baseGeometryData.orientationFace.rotation && baseGeometryData.orientationFace.rotation.z !== 0;
                    console.log("Needs horizontal flip: ",needsHorFlip)
                    if (needsHorFlip) {
                        // Create a quaternion for 180-degree rotation around Z axis
                        const flipQuaternion = new THREE.Quaternion();
                        flipQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

                        // Combine the original rotation with the flip
                        mesh.quaternion.multiply(flipQuaternion);
                    }
                    // If we need to flip, just add PI to the angle. THAT'S IT.
                    const needsFlip = baseGeometryData.frontFace && baseGeometryData.frontFace.rotation && baseGeometryData.frontFace.rotation.x < 0;
                    console.log("Needs flip: ",needsFlip)
                    if (needsFlip) {
                        frontAlignAngle += Math.PI;
                    }
                
                    let frontAlignQuat = new THREE.Quaternion().setFromAxisAngle(targetUp, frontAlignAngle);
                    mesh.quaternion.premultiply(frontAlignQuat);
                } else {
                    // Original logic for hotends and other types
                    baseQuat.setFromUnitVectors(orientNormal, orientRotation.x === 0 ? targetUp : targetUp.clone().negate());
                    
                    // Align front
                    let rotatedFrontVec = frontNormal.clone().applyQuaternion(mesh.quaternion);
                    let frontAlignAngle = Math.atan2(rotatedFrontVec.x, -rotatedFrontVec.y);
                    let frontAlignQuat = new THREE.Quaternion().setFromAxisAngle(targetUp, frontAlignAngle);
                    mesh.quaternion.premultiply(frontAlignQuat);

                    // Now rotate the front face to align with -Y (forward)
                    const rotatedFront = frontNormal.clone().applyQuaternion(mesh.quaternion);
                    const frontAngle = Math.atan2(rotatedFront.x, -rotatedFront.y);
                    const alignQuat = new THREE.Quaternion().setFromAxisAngle(targetUp, frontAngle);
                    mesh.quaternion.premultiply(alignQuat);
                }
                
                // Apply baseQuat - CRITICAL from original line 2309 (inside legacy block)
                mesh.quaternion.premultiply(baseQuat);
            }
            
            // Remove custom fixes - let enhanced alignment handle everything
            
            // Position based on pattern centers - EXACT copy from OLD
            const attachCenter = calculateHolePatternCenter(matchingFace.holes);
            const transformedAttachCenter = attachCenter.clone().applyQuaternion(mesh.quaternion);
            const offset = baseCenter.clone().sub(transformedAttachCenter);
            mesh.position.copy(offset);
            
        } else {
            console.log('No frontFace/orientationFace data - using fallback alignment');
            // Apply the basic alignment calculation as fallback
            const alignment = calculateAlignment(closestFace, matchingFace);
            if (alignment) {
                mesh.quaternion.copy(alignment.rotation);
                
                const mountCenter = calculateHolePatternCenter(matchingFace.holes);
                const transformedMountCenter = mountCenter.clone().applyQuaternion(mesh.quaternion);
                const offset = baseCenter.clone().sub(transformedMountCenter);
                mesh.position.copy(offset);
                
                const normalOffset = baseNormal.clone().multiplyScalar(-5);
                mesh.position.add(normalOffset);
            }
        }
    } else {
        // For non-hotend attachments, use alignment based on type
        if (attachPoint.userData.attachmentType === 'skirt') {
            // Skirt alignment - EXACT copy from OLD/app.js
            const attachNormal = new THREE.Vector3(
                matchingFace.normal.x,
                matchingFace.normal.y,
                matchingFace.normal.z
            );

            // First align normals
            const normalQuat = new THREE.Quaternion();
            normalQuat.setFromUnitVectors(attachNormal, baseNormal.clone().negate());
            mesh.quaternion.copy(normalQuat);

            // Find holes facing forward (Y-axis) on both models
            const findForwardHoles = (face) => {
                return face.holes.filter(hole => {
                    const holePos = new THREE.Vector3(hole.position.x, hole.position.y, hole.position.z);
                    return Math.abs(holePos.y) > 10; // Assuming forward holes are at least 10mm along Y axis
                });
            };

            const baseForwardHoles = findForwardHoles(closestFace);
            const attachForwardHoles = findForwardHoles(matchingFace);

            if (baseForwardHoles.length > 0 && attachForwardHoles.length > 0) {
                // Check Y direction of forward holes
                const baseY = baseForwardHoles[0].position.y;
                const attachY = attachForwardHoles[0].position.y;

                // Transform attach Y to world space
                const transformedAttachPos = new THREE.Vector3(0, attachY, 0).applyQuaternion(mesh.quaternion);

                // If signs don't match, we need to rotate 180°
                if ((baseY * transformedAttachPos.y) < 0) {
                    console.log('Skirt orientation mismatch detected - rotating 180°');
                    const flipQuat = new THREE.Quaternion().setFromAxisAngle(baseNormal, Math.PI);
                    mesh.quaternion.premultiply(flipQuat);
                }
            }

            // Position using holes center - exact copy from live_app.js
            const mountCenter = calculateHolePatternCenter(matchingFace.holes);
            const transformedMountCenter = mountCenter.clone().applyQuaternion(mesh.quaternion);
            const offset = baseCenter.clone().sub(transformedMountCenter);
            mesh.position.copy(offset);

        } else if (attachPoint.userData.attachmentType === 'adxl') {
            // ADXL mount alignment - EXACT copy from live_app.js lines 2493-2498
            const attachNormal = new THREE.Vector3(
                matchingFace.normal.x,
                matchingFace.normal.y,
                matchingFace.normal.z
            );

            // Use standard alignment for secondary attachments
            const normalQuat = new THREE.Quaternion();
            normalQuat.setFromUnitVectors(attachNormal, baseNormal.clone().negate());
            mesh.quaternion.copy(normalQuat);

        } else if (attachPoint.userData.attachmentType === 'fanguard') {
            // Fan guard alignment - EXACT copy from working OLD/app.js
            console.log('🔧 Fan guard - Base face ID:', attachPoint.userData.faceId);
            console.log('🔧 Fan guard - Base center:', baseCenter);
            console.log('🔧 Fan guard - Base normal:', baseNormal);
            const attachOrientation = new THREE.Vector3(
                attachGeometryData.orientationFace.normal.x,
                attachGeometryData.orientationFace.normal.y,
                attachGeometryData.orientationFace.normal.z
            );
            const attachNormal = new THREE.Vector3(
                matchingFace.normal.x,
                matchingFace.normal.y,
                matchingFace.normal.z
            );

            const orientQuat = new THREE.Quaternion();
            orientQuat.setFromUnitVectors(attachOrientation, new THREE.Vector3(0, 1, 0));
            mesh.quaternion.copy(orientQuat);

            const rotatedAttachNormal = attachNormal.clone().applyQuaternion(orientQuat);
            const normalQuat = new THREE.Quaternion();
            normalQuat.setFromUnitVectors(rotatedAttachNormal, baseNormal.clone().negate());
            mesh.quaternion.premultiply(normalQuat);

            const finalOrientation = attachOrientation.clone().applyQuaternion(mesh.quaternion);
            if (finalOrientation.y < 0) {
                const flipQuat = new THREE.Quaternion().setFromAxisAngle(baseNormal, Math.PI);
                mesh.quaternion.premultiply(flipQuat);
            }

            // Position based on pattern centers - EXACT copy from OLD
            const attachCenter = calculateHolePatternCenter(matchingFace.holes);
            const transformedAttachCenter = attachCenter.clone().applyQuaternion(mesh.quaternion);
            const offset = baseCenter.clone().sub(transformedAttachCenter);
            mesh.position.copy(offset);


        } else if (attachPoint.userData.attachmentType === 'gantry') {
            // Gantry adapter alignment - EXACT copy from live_app.js
            const attachOrientation = new THREE.Vector3(
                attachGeometryData.orientationFace.normal.x,
                attachGeometryData.orientationFace.normal.y,
                attachGeometryData.orientationFace.normal.z
            );
            const attachNormal = new THREE.Vector3(
                matchingFace.normal.x,
                matchingFace.normal.y,
                matchingFace.normal.z
            );

            // Original gantry adapter alignment - this was working correctly
            const normalQuat = new THREE.Quaternion().setFromUnitVectors(attachNormal, baseNormal.clone().negate());
            mesh.quaternion.copy(normalQuat);

            const rotatedOrientation = attachOrientation.clone().applyQuaternion(mesh.quaternion);
            const dotX = Math.abs(rotatedOrientation.x);
            const dotY = Math.abs(rotatedOrientation.y);
            const dotZ = Math.abs(rotatedOrientation.z);

            // If we need to flip
            const needsFlip = attachGeometryData.orientationFace.normal.x === 0 && attachGeometryData.orientationFace.normal.y < 0;
            console.log("Gantry adapter needs flip: ", needsFlip);
            if (needsFlip) {
                const flipQuaternion = new THREE.Quaternion();
                flipQuaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
                // Combine the original rotation with the flip
                mesh.quaternion.multiply(flipQuaternion);
            }

            if (dotX > dotY && dotX > dotZ) {
                const rotQuat = new THREE.Quaternion().setFromAxisAngle(
                    baseNormal,
                    rotatedOrientation.x > 0 ? -Math.PI / 2 : Math.PI / 2
                );
                mesh.quaternion.premultiply(rotQuat);
            }

            // Position using holes center
            const mountCenter = calculateHolePatternCenter(matchingFace.holes);
            const transformedMountCenter = mountCenter.clone().applyQuaternion(mesh.quaternion);
            const offset = baseCenter.clone().sub(transformedMountCenter);
            mesh.position.copy(offset);

        } else if (attachPoint.userData.attachmentType === 'gantryclip') {
            // Gantry clip alignment - EXACT copy from live_app.js
            const attachOrientation = new THREE.Vector3(
                attachGeometryData.orientationFace.normal.x,
                attachGeometryData.orientationFace.normal.y,
                attachGeometryData.orientationFace.normal.z
            );
            const attachNormal = new THREE.Vector3(
                matchingFace.normal.x,
                matchingFace.normal.y,
                matchingFace.normal.z
            );

            // First align the mounting holes perfectly
            const normalQuat = new THREE.Quaternion().setFromUnitVectors(attachNormal, baseNormal.clone().negate());
            mesh.quaternion.copy(normalQuat);

            // Get two holes from each pattern to establish orientation
            const baseHoles = closestFace.holes;
            const attachHoles = matchingFace.holes;
            const baseHole1 = baseHoles[0];
            const baseHole2 = baseHoles[1];
            const attachHole1 = attachHoles[0];
            const attachHole2 = attachHoles[1];

            // Calculate vectors between holes
            const baseVector = new THREE.Vector3(
                baseHole2.position.x - baseHole1.position.x,
                baseHole2.position.y - baseHole1.position.y,
                baseHole2.position.z - baseHole1.position.z
            ).normalize();

            const attachVector = new THREE.Vector3(
                attachHole2.position.x - attachHole1.position.x,
                attachHole2.position.y - attachHole1.position.y,
                attachHole2.position.z - attachHole1.position.z
            ).normalize();

            // Rotate the attachment vector by the normal quaternion
            const rotatedAttachVector = attachVector.clone().applyQuaternion(normalQuat);

            // Calculate angle between the vectors on the mounting plane
            const angle = Math.atan2(
                baseVector.x * rotatedAttachVector.z - baseVector.z * rotatedAttachVector.x,
                baseVector.x * rotatedAttachVector.x + baseVector.z * rotatedAttachVector.z
            );

            // Create and apply rotation around the base normal
            const alignQuat = new THREE.Quaternion().setFromAxisAngle(baseNormal, angle);
            mesh.quaternion.premultiply(alignQuat);

            // After hole alignment, check if orientation vector is pointing up
            const finalOrientation = attachOrientation.clone().applyQuaternion(mesh.quaternion);
            if (finalOrientation.y < 0) {
                const flipQuat = new THREE.Quaternion().setFromAxisAngle(baseNormal, Math.PI);
                mesh.quaternion.premultiply(flipQuat);
            }

            // Position using holes center
            const mountCenter = calculateHolePatternCenter(matchingFace.holes);
            const transformedMountCenter = mountCenter.clone().applyQuaternion(mesh.quaternion);
            const offset = baseCenter.clone().sub(transformedMountCenter);
            mesh.position.copy(offset);

        } else if (attachPoint.userData.attachmentType === 'wing') {
            // Wing alignment - EXACT copy of backup alignment from OLD/app.js
            console.log('🚨🚨🚨 USING BACKUP ALIGNMENT (for wings)');

            const attachOrientation = new THREE.Vector3(
                attachGeometryData.orientationFace.normal.x,
                attachGeometryData.orientationFace.normal.y,
                attachGeometryData.orientationFace.normal.z
            );
            const attachNormal = new THREE.Vector3(
                matchingFace.normal.x,
                matchingFace.normal.y,
                matchingFace.normal.z
            );
            const baseOrientation = new THREE.Vector3(
                baseGeometryData.orientationFace.normal.x,
                baseGeometryData.orientationFace.normal.y,
                baseGeometryData.orientationFace.normal.z
            );

            // First align the mount face normals
            const normalQuat = new THREE.Quaternion();
            normalQuat.setFromUnitVectors(attachNormal, baseNormal.clone().negate());
            mesh.quaternion.copy(normalQuat);

            // Then align orientation after normal alignment
            const orientQuat = new THREE.Quaternion();
            const rotatedAttachOrientation = attachOrientation.clone().applyQuaternion(normalQuat);
            orientQuat.setFromUnitVectors(rotatedAttachOrientation, baseOrientation);
            mesh.quaternion.premultiply(orientQuat);

            // Position using holes center - same as backup alignment
            const mountCenter = calculateHolePatternCenter(matchingFace.holes);
            const transformedMountCenter = mountCenter.clone().applyQuaternion(mesh.quaternion);
            const offset = baseCenter.clone().sub(transformedMountCenter);
            mesh.position.copy(offset);

        } else {
            console.log('Using fallback alignment');
            const alignment = calculateAlignment(closestFace, matchingFace);
            if (alignment) {
                mesh.quaternion.copy(alignment.rotation);
            }
        }
        
        // Position non-special attachment types (skirts, wings, fanguards, gantry, and gantryclip handle their own positioning)
        if (attachPoint.userData.attachmentType !== 'skirt' &&
            attachPoint.userData.attachmentType !== 'wing' &&
            attachPoint.userData.attachmentType !== 'fanguard' &&
            attachPoint.userData.attachmentType !== 'gantry' &&
            attachPoint.userData.attachmentType !== 'gantryclip') {
            const mountCenter = calculateHolePatternCenter(matchingFace.holes);
            const transformedMountCenter = mountCenter.clone().applyQuaternion(mesh.quaternion);
            const offset = baseCenter.clone().sub(transformedMountCenter);
            mesh.position.copy(offset);

            // Apply offset based on attachment type - EXACT copy from live_app.js lines 2546-2548
            const offsetAmount = (attachPoint.userData.attachmentType === 'hotend') ? 0 : 0;
            const normalOffset = baseNormal.clone().multiplyScalar(offsetAmount);
            mesh.position.add(normalOffset);
        }
    }
    
    // Mark patterns as used to prevent conflicts
    markPatternAsUsed(baseGeometryData.modelPath || 'heromedir/base/UniversalBase.stl', { faceId: closestFace.faceId });
    markPatternAsUsed(mesh.userData.modelPath, { faceId: matchingFace.faceId });
}

// Function to create attachment points on secondary models
async function createSecondaryAttachmentPoints(model) {
    const geometryData = await loadGeometryData(model.userData.modelPath);
    if (!geometryData?.faces) return;

    const sphereGeometry = new THREE.SphereGeometry(3.0, 32, 32);
    const sphereMaterial = new THREE.MeshPhongMaterial({
        color: 0x800080,
        transparent: true,
        opacity: 0.8,
        emissive: 0x800080,
        emissiveIntensity: 0.5,
        shininess: 50
    });

    // Find compatible secondary attachment types based on parent type
    const parentType = model.userData.attachmentType;
    const modelPath = model.userData.modelPath.toLowerCase();
    const isRiser = modelPath.includes('riser');
    const isPartCooling = parentType === 'partcooling';

    // Determine compatible types
    let compatibleTypes = [];
    if (isRiser) {
        // If it's a riser, it can always accept direct drive mounts
        compatibleTypes = ['directdrive'];
    } else if (isPartCooling && geometryData.circleGroups?.length > 0) {
        // For part cooling with circle groups, allow ADXL mounts
        compatibleTypes = ['adxl'];
    } else {
        // Otherwise use normal compatibility logic
        compatibleTypes = Object.entries(categoryMenus)
            .filter(([type, menu]) => {
                if (Array.isArray(menu.parentType)) {
                    return menu.parentType.includes(parentType);
                }
                return menu.parentType === parentType;
            })
            .map(([type, _]) => type);
    }

    if (compatibleTypes.length === 0) return;

    if (isPartCooling && geometryData.circleGroups) {
        // Create attachment points for each circle group
        geometryData.circleGroups.forEach(group => {
            if (isHolePatternUsed(model.userData.modelPath, { faceId: group.id })) return;

            const center = new THREE.Vector3(group.center.x, group.center.y, group.center.z);
            const normal = new THREE.Vector3(group.normal.x, group.normal.y, group.normal.z);

            // Create attachment point
            const point = new THREE.Mesh(sphereGeometry, sphereMaterial.clone());
            center.add(normal.clone().multiplyScalar(5)); // 5mm offset
            point.position.copy(center);

            // Assign properties
            point.userData = {
                attachmentType: 'adxl',
                attachmentName: 'adxl',
                normal,
                parentModel: model,
                faceId: group.id
            };

            model.add(point);
            attachmentPoints.push(point);
        });
    } else {
        // Standard attachment point creation for non-part cooling or parts without circle groups
        const availableFaces = geometryData.faces.filter(face =>
            !isHolePatternUsed(model.userData.modelPath, face) &&
            face.holes?.length > 0
        );

        availableFaces.forEach(face => {
            const center = calculateHolePatternCenter(face.holes);
            const normal = new THREE.Vector3(face.normal.x, face.normal.y, face.normal.z);

            // Create attachment point
            const point = new THREE.Mesh(sphereGeometry, sphereMaterial.clone());
            center.add(normal.clone().multiplyScalar(5)); // 5mm offset
            point.position.copy(center);

            // Assign properties for the first compatible type
            const attachmentType = compatibleTypes[0];
            point.userData = {
                attachmentType,
                attachmentName: attachmentType,
                normal,
                parentModel: model,
                faceId: face.faceId
            };

            model.add(point);
            attachmentPoints.push(point);
        });
    }
}

// Align secondary models (like probe mounts on wings)
function alignSecondaryModel(mesh, attachPoint, baseGeometryData, attachGeometryData) {
    const parentModel = attachPoint.userData.parentModel;

    // Find the face we're attaching to
    const attachToFace = baseGeometryData.faces.find(f => f.faceId === attachPoint.userData.faceId);
    if (!attachToFace) return;

    // Find matching face on attachment
    const matchingFace = findMatchingFaces(attachToFace, attachGeometryData.faces, attachPoint.userData.attachmentType);
    if (!matchingFace) return;

    // Calculate centers and normals
    const baseCenter = calculateHolePatternCenter(attachToFace.holes);
    const attachCenter = calculateHolePatternCenter(matchingFace.holes);

    const baseNormal = new THREE.Vector3(
        attachToFace.normal.x,
        attachToFace.normal.y,
        attachToFace.normal.z
    );

    const attachNormal = new THREE.Vector3(
        matchingFace.normal.x,
        matchingFace.normal.y,
        matchingFace.normal.z
    );

    // Align normals
    const normalQuat = new THREE.Quaternion();
    normalQuat.setFromUnitVectors(attachNormal, baseNormal.clone().negate());
    mesh.quaternion.copy(normalQuat);

    // Position based on hole pattern centers
    const transformedAttachCenter = attachCenter.clone().applyQuaternion(mesh.quaternion);
    const offset = baseCenter.clone().sub(transformedAttachCenter);
    mesh.position.copy(offset);

    // Positioning complete - mesh is already added to parent by main loading function
    // No need to add again, just positioning and rotation are handled here
}

// Remove a model from the scene
function removeModel(model) {
    if (attachedModels.has(model)) {
        // Reset pattern usage
        if (model.userData.modelPath) {
            resetPatterns(model.userData.modelPath);
        }

        // Remove position controls (use parent removal like live_app.js)
        if (model.userData.positionControls) {
            model.userData.positionControls.forEach(arrow => {
                if (arrow.parent) arrow.parent.remove(arrow);
            });
        }

        // Remove any secondary models attached to this model
        const modelsToRemove = [];
        for (const [point, attachedModel] of attachedModels) {
            if (point.userData.parentModel === model) {
                modelsToRemove.push([point, attachedModel]);
            }
        }

        // Recursively remove secondary models
        modelsToRemove.forEach(([point, secondaryModel]) => {
            removeModel(secondaryModel);
        });

        // Remove from scene and tracking
        scene.remove(model);

        // Find and remove from attachedModels
        for (const [point, attachedModel] of attachedModels) {
            if (attachedModel === model) {
                attachedModels.delete(point);
                // Also make the attachment point visible again
                point.visible = true;
                break;
            }
        }

        console.log('Model removed successfully');
    }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        loadModel,
        createAttachmentPoints,
        attachModelAtPoint,
        alignPartCoolingModel,
        alignProbeModel,
        alignGenericModel,
        alignSecondaryModel,
        createSecondaryAttachmentPoints,
        removeModel
    };
}