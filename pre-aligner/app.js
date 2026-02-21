/**
 * STL Pre-Aligner - Main Application
 * Multi-model STL assembly and alignment tool
 */

// Global variables
let scene, camera, renderer, orbitControls;
let modelManager, transformControl, circleDetector, exportManager, faceDetector;
let raycaster, mouse;
let currentMode = 'translate';

// Mode flags
let orientationFaceMode = false;
let circleDetectionMode = false;
let alignFaceMode = false;
let frontFaceMode = false;
let circleHoverHighlight = null;

// Front face storage (modelId -> faceData + highlight)
const frontFaces = new Map();

// Initialize application
function init() {
    // Setup Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Setup Camera
    const viewerElement = document.getElementById('viewer');
    const width = viewerElement.clientWidth;
    const height = viewerElement.clientHeight;

    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(50, 50, 50);
    camera.lookAt(0, 0, 0);

    // Setup Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    viewerElement.appendChild(renderer.domElement);

    // Add Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(1, 1, 1);
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-1, -1, -1);
    scene.add(directionalLight2);

    // Add grid helper
    const gridHelper = new THREE.GridHelper(100, 100, 0x888888, 0xcccccc);
    scene.add(gridHelper);

    // Add axes helper
    const axesHelper = new THREE.AxesHelper(20);
    scene.add(axesHelper);

    // Setup Orbit Controls
    orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.screenSpacePanning = true;

    // Initialize managers
    modelManager = new ModelManager(scene);
    transformControl = new TransformControlManager(camera, renderer, scene);
    faceDetector = new FaceDetector(scene);
    circleDetector = new CircleDetector(scene);
    exportManager = new ExportManager(modelManager, circleDetector, faceDetector, frontFaces);

    // Setup raycaster for clicking
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Transform control callbacks
    transformControl.onChange((position, rotation) => {
        const activeModel = modelManager.getActiveModel();
        if (activeModel) {
            modelManager.updateTransform(activeModel.id, position, rotation);
            updateModelList();
        }
    });

    transformControl.onDragging((isDragging) => {
        orbitControls.enabled = !isDragging;
    });

    // Event Listeners
    setupEventListeners();

    // Start animation loop
    animate();
}

function setupEventListeners() {
    // File inputs
    document.getElementById('addModel').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });

    document.getElementById('fileInput').addEventListener('change', handleFileSelect);

    document.getElementById('loadAssembly').addEventListener('click', () => {
        document.getElementById('assemblyInput').click();
    });

    document.getElementById('assemblyInput').addEventListener('change', handleAssemblyLoad);

    // Transform mode buttons
    document.getElementById('translateMode').addEventListener('click', () => {
        setTransformMode('translate');
    });

    document.getElementById('rotateMode').addEventListener('click', () => {
        setTransformMode('rotate');
    });

    // Snap settings
    document.getElementById('snapToGrid').addEventListener('change', (e) => {
        transformControl.setSnapToGrid(e.target.checked);
        updateStatus(e.target.checked ? 'Grid snap enabled (1mm)' : 'Grid snap disabled');
    });

    document.getElementById('snapAngle').addEventListener('change', (e) => {
        transformControl.setSnapAngle(e.target.checked);
        updateStatus(e.target.checked ? 'Angle snap enabled (15°)' : 'Angle snap disabled');
    });

    // Tool buttons
    document.getElementById('selectOrientationFace').addEventListener('click', toggleOrientationFaceMode);
    document.getElementById('selectFrontFace').addEventListener('click', toggleFrontFaceMode);
    document.getElementById('alignFaceMode').addEventListener('click', toggleAlignFaceMode);
    document.getElementById('detectCirclesMode').addEventListener('click', toggleCircleDetectionMode);
    document.getElementById('exportAssembly').addEventListener('click', exportAssembly);
    document.getElementById('resetView').addEventListener('click', resetView);
    document.getElementById('clearAll').addEventListener('click', clearAll);

    // Mouse events
    renderer.domElement.addEventListener('click', onCanvasClick);
    renderer.domElement.addEventListener('mousemove', onCanvasMouseMove);

    // Window resize
    window.addEventListener('resize', onWindowResize);

    // Keyboard shortcuts
    window.addEventListener('keydown', onKeyDown);
}

function toggleOrientationFaceMode() {
    orientationFaceMode = !orientationFaceMode;
    const button = document.getElementById('selectOrientationFace');

    if (orientationFaceMode) {
        // Disable other modes
        if (circleDetectionMode) toggleCircleDetectionMode();
        if (alignFaceMode) toggleAlignFaceMode();
        if (frontFaceMode) toggleFrontFaceMode();

        button.classList.add('active');
        button.style.background = '#ff9800';
        updateStatus('Click a face to set as orientation face');
    } else {
        button.classList.remove('active');
        button.style.background = '';
        faceDetector.clearHighlight();
        updateStatus('Orientation face mode cancelled');
    }
}

function toggleFrontFaceMode() {
    frontFaceMode = !frontFaceMode;
    const button = document.getElementById('selectFrontFace');

    if (frontFaceMode) {
        // Disable other modes
        if (circleDetectionMode) toggleCircleDetectionMode();
        if (orientationFaceMode) toggleOrientationFaceMode();
        if (alignFaceMode) toggleAlignFaceMode();

        button.classList.add('active');
        button.style.background = '#ff4500';
        updateStatus('Click a face to set as front face for the selected model');
    } else {
        button.classList.remove('active');
        button.style.background = '';
        faceDetector.clearHighlight();
        updateStatus('Front face mode cancelled');
    }
}

function toggleAlignFaceMode() {
    alignFaceMode = !alignFaceMode;
    const button = document.getElementById('alignFaceMode');

    if (alignFaceMode) {
        // Disable other modes
        if (circleDetectionMode) toggleCircleDetectionMode();
        if (orientationFaceMode) toggleOrientationFaceMode();
        if (frontFaceMode) toggleFrontFaceMode();

        button.classList.add('active');
        button.style.background = '#9c27b0';
        updateStatus('Click a face to align it to the nearest axis plane (XY, XZ, or YZ)');
    } else {
        button.classList.remove('active');
        button.style.background = '';
        faceDetector.clearHighlight();
        updateStatus('Align face mode cancelled');
    }
}

function toggleCircleDetectionMode() {
    circleDetectionMode = !circleDetectionMode;
    const button = document.getElementById('detectCirclesMode');

    if (circleDetectionMode) {
        // Disable other modes
        if (orientationFaceMode) toggleOrientationFaceMode();
        if (alignFaceMode) toggleAlignFaceMode();
        if (frontFaceMode) toggleFrontFaceMode();

        button.classList.add('active');
        button.style.background = '#ff9800';
        updateStatus('Hover over holes to detect circles, click to add');
    } else {
        button.classList.remove('active');
        button.style.background = '';
        clearCircleHoverHighlight();
        updateStatus('Circle detection mode disabled');
    }
}

async function handleFileSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    updateStatus('Loading models...');

    for (const file of files) {
        try {
            const result = await modelManager.loadSTL(file);
            updateStatus(`Loaded: ${file.name}`);
            updateModelList();

            // If we're loading an assembly, apply the transform data
            if (window.assemblyData && window.assemblyModelsLoaded !== undefined) {
                applyAssemblyData(result.modelId, window.assemblyModelsLoaded);
            }

            // Attach transform controls to the new model if it's the first
            if (modelManager.models.size === 1) {
                const model = modelManager.getActiveModel();
                transformControl.attach(model.mesh);
            }
        } catch (error) {
            updateStatus(`Error loading ${file.name}: ${error.message}`);
        }
    }

    // Clear file input
    event.target.value = '';

    // Reset view to show all models
    if (!window.assemblyData) {
        resetView();
    }
}

async function handleAssemblyLoad(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const jsonData = JSON.parse(e.target.result);

                // Validate the JSON structure
                if (!jsonData || !jsonData.models || !Array.isArray(jsonData.models)) {
                    updateStatus('Error: Invalid assembly file format');
                    return;
                }

                if (jsonData.models.length === 0) {
                    updateStatus('Error: No models found in assembly file');
                    return;
                }

                // Store the assembly data temporarily
                window.assemblyData = jsonData;
                window.assemblyModelsToLoad = jsonData.models.length;
                window.assemblyModelsLoaded = 0;

                // Clear existing
                modelManager.clear();
                circleDetector.clearAll();
                faceDetector.clearAll();
                updateModelList();
                updateCircleList();
                updateOrientationInfo();

                updateStatus(`Assembly loaded. Please load ${jsonData.models.length} STL file(s) in the same order as exported.`);

                // Show which models need to be loaded
                const modelNames = jsonData.models.map(m => m.name).join(', ');
                updateStatus(`Load these files: ${modelNames}`);
            } catch (error) {
                updateStatus(`Error parsing assembly file: ${error.message}`);
                console.error('Assembly load error:', error);
            }
        };
        reader.readAsText(file);
    } catch (error) {
        updateStatus(`Error loading assembly: ${error.message}`);
        console.error('File read error:', error);
    }

    event.target.value = '';
}

function applyAssemblyData(modelId, modelIndex) {
    if (!window.assemblyData || !window.assemblyData.models[modelIndex]) return;

    const assemblyModel = window.assemblyData.models[modelIndex];
    const model = modelManager.getModel(modelId);

    if (!model) return;

    // Apply transform
    const pos = assemblyModel.transform.position;
    const rot = assemblyModel.transform.rotation;

    model.mesh.position.set(pos.x, pos.y, pos.z);
    model.mesh.rotation.set(rot.x, rot.y, rot.z);

    modelManager.updateTransform(modelId,
        new THREE.Vector3(pos.x, pos.y, pos.z),
        new THREE.Euler(rot.x, rot.y, rot.z)
    );

    // Restore circles
    if (assemblyModel.faces) {
        assemblyModel.faces.forEach(face => {
            face.holes.forEach(hole => {
                const circle = {
                    center: new THREE.Vector3(hole.position.x, hole.position.y, hole.position.z),
                    radius: hole.diameter / 2,
                    diameter: hole.diameter,
                    normal: new THREE.Vector3(face.normal.x, face.normal.y, face.normal.z),
                    quality: 1.0
                };
                circleDetector.addCircle(modelId, circle);
            });
        });
    }

    window.assemblyModelsLoaded++;

    if (window.assemblyModelsLoaded >= window.assemblyModelsToLoad) {
        // Restore orientation faces
        if (window.assemblyData.orientationFaces) {
            window.assemblyData.orientationFaces.forEach(orientFace => {
                const model = modelManager.getModel(orientFace.modelId);
                if (model) {
                    const basis = faceDetector.createLocalBasis(
                        new THREE.Vector3(orientFace.normal.x, orientFace.normal.y, orientFace.normal.z)
                    );

                    const faceData = {
                        normal: new THREE.Vector3(orientFace.normal.x, orientFace.normal.y, orientFace.normal.z),
                        center: new THREE.Vector3(orientFace.center.x, orientFace.center.y, orientFace.center.z),
                        basis: basis,
                        dimensions: orientFace.dimensions
                    };

                    faceDetector.setOrientationFace(orientFace.modelId, faceData);
                }
            });
        }

        updateStatus(`Assembly restored! Loaded ${window.assemblyModelsLoaded} models.`);
        updateCircleList();

        // Select first model to show its orientation face
        const firstModel = modelManager.getAllModels()[0];
        if (firstModel) {
            selectModel(firstModel.id);
        }

        delete window.assemblyData;
        delete window.assemblyModelsToLoad;
        delete window.assemblyModelsLoaded;
        resetView();
    } else {
        updateStatus(`Model ${window.assemblyModelsLoaded}/${window.assemblyModelsToLoad} loaded. Continue loading...`);
    }
}

function setTransformMode(mode) {
    currentMode = mode;
    transformControl.setMode(mode);

    // Update button states
    document.getElementById('translateMode').classList.toggle('active', mode === 'translate');
    document.getElementById('rotateMode').classList.toggle('active', mode === 'rotate');

    // Update snap settings display
    updateSnapUI();
}

function updateSnapUI() {
    const snapGrid = document.getElementById('snapToGrid');
    const snapAngle = document.getElementById('snapAngle');

    snapGrid.checked = transformControl.snapToGrid;
    snapAngle.checked = transformControl.snapAngle;
}

function updateModelList() {
    const modelListElement = document.getElementById('modelList');
    modelListElement.innerHTML = '';

    const models = modelManager.getAllModels();

    models.forEach((model, index) => {
        const modelItem = document.createElement('div');
        modelItem.className = 'model-item';
        if (model.id === modelManager.activeModelId) {
            modelItem.classList.add('active');
        }

        modelItem.innerHTML = `
            <div class="model-info">
                <div class="model-name">${model.name}</div>
                <div class="model-transform">
                    Pos: (${model.transform.position.x.toFixed(1)},
                          ${model.transform.position.y.toFixed(1)},
                          ${model.transform.position.z.toFixed(1)})
                </div>
            </div>
            <div class="model-controls">
                <button class="icon-button" title="Toggle Visibility">
                    <i class="fas fa-eye${model.visible ? '' : '-slash'}"></i>
                </button>
                <button class="icon-button" title="Delete Model">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        // Click to select
        modelItem.addEventListener('click', (e) => {
            if (!e.target.closest('.model-controls')) {
                selectModel(model.id);
            }
        });

        // Visibility toggle
        const visibilityBtn = modelItem.querySelector('.model-controls button:first-child');
        visibilityBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            modelManager.toggleVisibility(model.id);
            updateModelList();
        });

        // Delete button
        const deleteBtn = modelItem.querySelector('.model-controls button:last-child');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Delete ${model.name}?`)) {
                circleDetector.clearModel(model.id);
                faceDetector.clearOrientationFace(model.id);
                modelManager.removeModel(model.id);
                updateModelList();
                updateCircleList();
                updateOrientationInfo();

                if (model.id === modelManager.activeModelId) {
                    transformControl.detach();
                }
            }
        });

        modelListElement.appendChild(modelItem);
    });
}

function selectModel(modelId) {
    modelManager.setActiveModel(modelId);
    const model = modelManager.getActiveModel();

    if (model) {
        transformControl.attach(model.mesh);
    } else {
        transformControl.detach();
    }

    updateModelList();
    updateOrientationInfo();
}

function onCanvasClick(event) {
    const activeModel = modelManager.getActiveModel();
    if (!activeModel) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(activeModel.mesh);

    if (intersects.length > 0) {
        const intersect = intersects[0];

        // Handle orientation face selection
        if (orientationFaceMode) {
            const faceData = faceDetector.getHighlightedFaceData();
            if (faceData) {
                faceDetector.setOrientationFace(activeModel.id, faceData);
                const rotation = faceDetector.calculateRotation(faceData.normal);
                updateStatus(`Orientation face set - Normal: (${rotation.x}°, ${rotation.y}°, ${rotation.z}°), Size: ${faceData.dimensions.width.toFixed(2)}×${faceData.dimensions.height.toFixed(2)}mm`);
                updateOrientationInfo();
            }
            toggleOrientationFaceMode();
            return;
        }

        // Handle front face selection
        if (frontFaceMode) {
            const faceData = faceDetector.getHighlightedFaceData();
            if (faceData) {
                setFrontFace(activeModel.id, faceData);
                const rotation = faceDetector.calculateRotation(faceData.normal);
                updateStatus(`Front face set - Normal: (${rotation.x}°, ${rotation.y}°, ${rotation.z}°), Size: ${faceData.dimensions.width.toFixed(2)}×${faceData.dimensions.height.toFixed(2)}mm`);
                updateOrientationInfo();
            }
            toggleFrontFaceMode();
            return;
        }

        // Handle face alignment
        if (alignFaceMode) {
            const faceData = faceDetector.getHighlightedFaceData();
            if (faceData) {
                alignFaceToNearestPlane(activeModel, faceData);
            }
            toggleAlignFaceMode();
            return;
        }

        // Handle circle detection
        if (circleDetectionMode) {
            const faceNormal = intersect.face.normal.clone();
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(activeModel.mesh.matrixWorld);
            faceNormal.applyMatrix3(normalMatrix).normalize();

            const circle = circleDetector.detectCircleAtPoint(activeModel, intersect.point, faceNormal);

            if (circle) {
                const circleData = circleDetector.addCircle(activeModel.id, circle);
                if (circleData) {
                    updateStatus(`Circle added: Ø${circle.diameter.toFixed(2)}mm`);
                    updateCircleList();
                } else {
                    updateStatus('Circle already exists at this location');
                }
            } else {
                updateStatus('No circle detected at this point');
            }
            return;
        }
    }
}

function onCanvasMouseMove(event) {
    const activeModel = modelManager.getActiveModel();

    const rect = renderer.domElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Show coordinates
    document.getElementById('hoverInfo').textContent = `(${x.toFixed(0)}, ${y.toFixed(0)})`;

    if (!activeModel) {
        faceDetector.clearHighlight();
        clearCircleHoverHighlight();
        return;
    }

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(activeModel.mesh);

    if (intersects.length > 0) {
        const intersect = intersects[0];

        // Show face highlight in orientation mode
        if (orientationFaceMode) {
            faceDetector.showFaceHighlight(activeModel.mesh, intersect, 0x4CAF50);
        } else if (frontFaceMode) {
            // Show face highlight in orange for front face mode
            faceDetector.showFaceHighlight(activeModel.mesh, intersect, 0xff4500);
        } else if (alignFaceMode) {
            // Show face highlight in purple for align mode
            faceDetector.showFaceHighlight(activeModel.mesh, intersect, 0x9c27b0);
        } else {
            faceDetector.clearHighlight();
        }

        // Show circle preview in circle detection mode
        if (circleDetectionMode) {
            previewCircleAtPoint(activeModel, intersect);
        } else {
            clearCircleHoverHighlight();
        }
    } else {
        faceDetector.clearHighlight();
        clearCircleHoverHighlight();
    }
}

function previewCircleAtPoint(model, intersect) {
    clearCircleHoverHighlight();

    const faceNormal = intersect.face.normal.clone();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(model.mesh.matrixWorld);
    faceNormal.applyMatrix3(normalMatrix).normalize();

    const circle = circleDetector.detectCircleAtPoint(model, intersect.point, faceNormal);

    if (circle) {
        // Check if circle already exists nearby
        const circles = circleDetector.getCircles(model.id);
        const exists = circles.some(c => c.center.distanceTo(circle.center) < 2);

        if (!exists) {
            createCircleHoverHighlight(circle);
        }
    }
}

function createCircleHoverHighlight(circle) {
    const ringGeometry = new THREE.RingGeometry(
        circle.radius - 0.05,
        circle.radius + 0.05,
        32
    );

    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });

    circleHoverHighlight = new THREE.Mesh(ringGeometry, ringMaterial);
    circleHoverHighlight.position.copy(circle.center);

    const basis = circleDetector.createLocalBasis(circle.normal);
    const rotMatrix = new THREE.Matrix4();
    rotMatrix.makeBasis(basis.tangent, basis.bitangent, basis.normal);
    circleHoverHighlight.setRotationFromMatrix(rotMatrix);

    scene.add(circleHoverHighlight);
}

function clearCircleHoverHighlight() {
    if (circleHoverHighlight) {
        scene.remove(circleHoverHighlight);
        circleHoverHighlight = null;
    }
}

function setFrontFace(modelId, faceData) {
    // Remove old front face highlight if exists
    const oldFrontFace = frontFaces.get(modelId);
    if (oldFrontFace && oldFrontFace.highlight) {
        scene.remove(oldFrontFace.highlight);
    }

    // Create permanent highlight for front face (orange color)
    const highlight = faceDetector.createFaceHighlight(faceData, 0xff4500, 0.3);

    frontFaces.set(modelId, {
        ...faceData,
        highlight: highlight
    });

    scene.add(highlight);
}

function alignFaceToNearestPlane(model, faceData) {
    const normal = faceData.normal.clone();

    // Six cardinal directions (positive and negative X, Y, Z)
    const cardinalDirections = [
        { axis: '+X', vector: new THREE.Vector3(1, 0, 0) },
        { axis: '-X', vector: new THREE.Vector3(-1, 0, 0) },
        { axis: '+Y', vector: new THREE.Vector3(0, 1, 0) },
        { axis: '-Y', vector: new THREE.Vector3(0, -1, 0) },
        { axis: '+Z', vector: new THREE.Vector3(0, 0, 1) },
        { axis: '-Z', vector: new THREE.Vector3(0, 0, -1) }
    ];

    // Find which cardinal direction is closest to the face normal
    let closestDirection = null;
    let maxDot = -Infinity;

    cardinalDirections.forEach(dir => {
        const dot = normal.dot(dir.vector);
        if (dot > maxDot) {
            maxDot = dot;
            closestDirection = dir;
        }
    });

    // Calculate the angle between current normal and target
    const angle = Math.acos(maxDot);
    const angleDegrees = angle * (180 / Math.PI);

    if (angleDegrees < 0.1) {
        updateStatus(`Face already aligned (${angleDegrees.toFixed(2)}° off)`);
        return;
    }

    // Calculate rotation axis (perpendicular to both normals)
    const rotationAxis = new THREE.Vector3().crossVectors(normal, closestDirection.vector).normalize();

    // Create quaternion for rotation
    const quaternion = new THREE.Quaternion().setFromAxisAngle(rotationAxis, angle);

    // Apply rotation to the model
    model.mesh.quaternion.premultiply(quaternion);

    // Update the model's transform data
    const newRotation = model.mesh.rotation.clone();
    modelManager.updateTransform(model.id, model.mesh.position, newRotation);

    // Update UI
    updateModelList();

    // Update any circles/orientation faces that are attached to this model
    const circles = circleDetector.getCircles(model.id);
    circles.forEach(circle => {
        circle.marker.quaternion.premultiply(quaternion);
    });

    const orientationFace = faceDetector.getOrientationFace(model.id);
    if (orientationFace && orientationFace.highlight) {
        orientationFace.highlight.quaternion.premultiply(quaternion);
    }

    const frontFace = frontFaces.get(model.id);
    if (frontFace && frontFace.highlight) {
        frontFace.highlight.quaternion.premultiply(quaternion);
    }

    updateStatus(`Face aligned to ${closestDirection.axis} plane (was ${angleDegrees.toFixed(2)}° off)`);
}

function updateCircleList() {
    const circlesElement = document.getElementById('detectedCircles');
    circlesElement.innerHTML = '<h3>Detected Circles</h3>';

    const allCircles = circleDetector.getAllCircles();

    if (allCircles.length === 0) {
        circlesElement.innerHTML += '<p>No circles detected</p>';
        return;
    }

    allCircles.forEach(circle => {
        const model = modelManager.getModel(circle.modelId);
        const circleDiv = document.createElement('div');
        circleDiv.className = 'circle-item';

        const rotation = circleDetector.calculateRotation(circle.normal);

        circleDiv.innerHTML = `
            <div class="circle-info">
                <strong>${model.name}</strong> - Circle ${circle.id}<br>
                Ø ${circle.diameter.toFixed(2)}mm<br>
                Pos: (${circle.center.x.toFixed(2)}, ${circle.center.y.toFixed(2)}, ${circle.center.z.toFixed(2)})<br>
                Rot: (${rotation.x.toFixed(1)}°, ${rotation.y.toFixed(1)}°, ${rotation.z.toFixed(1)}°)
            </div>
            <button class="icon-button delete-circle" title="Delete">
                <i class="fas fa-times"></i>
            </button>
        `;

        circleDiv.querySelector('.delete-circle').addEventListener('click', () => {
            circleDetector.removeCircle(circle.modelId, circle.id);
            updateCircleList();
            updateStatus('Circle removed');
        });

        circlesElement.appendChild(circleDiv);
    });
}

function updateOrientationInfo() {
    const infoElement = document.getElementById('orientationInfo');
    const activeModel = modelManager.getActiveModel();

    if (!activeModel) {
        infoElement.innerHTML = '';
        return;
    }

    const orientationFace = faceDetector.getOrientationFace(activeModel.id);
    const frontFace = frontFaces.get(activeModel.id);

    let html = '';

    if (orientationFace) {
        const rotation = faceDetector.calculateRotation(orientationFace.normal);
        html += `
            <h3>Orientation Face (${activeModel.name})</h3>
            <div style="font-size: 12px; line-height: 1.6;">
                Normal: (${rotation.x.toFixed(1)}°, ${rotation.y.toFixed(1)}°, ${rotation.z.toFixed(1)}°)<br>
                Size: ${orientationFace.dimensions.width.toFixed(2)} × ${orientationFace.dimensions.height.toFixed(2)}mm<br>
                Center: (${orientationFace.center.x.toFixed(2)}, ${orientationFace.center.y.toFixed(2)}, ${orientationFace.center.z.toFixed(2)})
            </div>
        `;
    }

    if (frontFace) {
        const rotation = faceDetector.calculateRotation(frontFace.normal);
        html += `
            <h3 style="margin-top: ${orientationFace ? '15px' : '0'};">Front Face (${activeModel.name})</h3>
            <div style="font-size: 12px; line-height: 1.6; color: #ff4500;">
                Normal: (${rotation.x.toFixed(1)}°, ${rotation.y.toFixed(1)}°, ${rotation.z.toFixed(1)}°)<br>
                Size: ${frontFace.dimensions.width.toFixed(2)} × ${frontFace.dimensions.height.toFixed(2)}mm<br>
                Center: (${frontFace.center.x.toFixed(2)}, ${frontFace.center.y.toFixed(2)}, ${frontFace.center.z.toFixed(2)})
            </div>
        `;
    }

    infoElement.innerHTML = html;
}

async function exportAssembly() {
    try {
        const assemblyName = document.getElementById('assemblyName').value.trim() || 'assembly';
        const author = document.getElementById('authorName').value.trim();
        const downloadLink = document.getElementById('downloadLink').value.trim();

        await exportManager.exportToZip(assemblyName, author, downloadLink);
        updateStatus(`Exported ${assemblyName}.zip with ${modelManager.models.size} model JSONs`);
    } catch (error) {
        updateStatus(`Export failed: ${error.message}`);
    }
}

function resetView() {
    const models = modelManager.getAllModels();

    if (models.length === 0) {
        camera.position.set(50, 50, 50);
        camera.lookAt(0, 0, 0);
        orbitControls.target.set(0, 0, 0);
        orbitControls.update();
        return;
    }

    // Calculate bounding box of all models
    const box = new THREE.Box3();

    models.forEach(model => {
        if (model.visible) {
            const modelBox = new THREE.Box3().setFromObject(model.mesh);
            box.union(modelBox);
        }
    });

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.5;

    camera.position.copy(center);
    camera.position.x += cameraDistance * 0.5;
    camera.position.y += cameraDistance * 0.5;
    camera.position.z += cameraDistance * 0.5;

    orbitControls.target.copy(center);
    orbitControls.update();

    updateStatus('View reset');
}

function clearAll() {
    if (!confirm('Clear all models and circles?')) return;

    transformControl.detach();
    circleDetector.clearAll();
    faceDetector.clearAll();
    modelManager.clear();

    updateModelList();
    updateCircleList();
    updateOrientationInfo();
    updateStatus('All cleared');
}

function onWindowResize() {
    const viewerElement = document.getElementById('viewer');
    const width = viewerElement.clientWidth;
    const height = viewerElement.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
}

function onKeyDown(event) {
    // Don't handle keyboard shortcuts if user is typing in an input field
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
    }

    // Only handle ESC to cancel modes
    if (event.key === 'Escape') {
        if (orientationFaceMode) toggleOrientationFaceMode();
        if (circleDetectionMode) toggleCircleDetectionMode();
        if (alignFaceMode) toggleAlignFaceMode();
    }
}

function updateStatus(message) {
    const statusElement = document.getElementById('status');
    statusElement.textContent = message;
    console.log(message);
}

function animate() {
    requestAnimationFrame(animate);
    orbitControls.update();
    renderer.render(scene, camera);
}

// Start the application
init();
