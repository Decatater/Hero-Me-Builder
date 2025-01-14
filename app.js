let scene, camera, renderer, mainModel, controls;
let selectedPoint = null;
let attachmentPoints = [];
let attachedModels = new Map(); // Map to track which points have models attached
let isMovingPart = false;
let isMouseDown = false;
let moveInterval = null;
let selectedArrow = null;
const usedPatterns = new Map(); // Map<modelPath, { holes: Set<faceId>, slides: Set<groupIndex> }>
const usedHolePatterns = new Map(); // Map<modelPath, Set<faceId>>
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
// State management for menu navigation
let currentMenuPath = [];
let menuState = new Map();
// First update the categoryMenus object with simplified paths
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
            
            // Set type based on whether it's a riser
            if (selectedPoint) {
                if (name.includes('riser')) {
                    selectedPoint.userData.attachmentType = 'spacer';
                } else {
                    selectedPoint.userData.attachmentType = 'directdrive';
                }
            }
            
            return true;
        },
        parentType: ['hotend', 'spacer']  // Spacers need to support direct drive mounts
    }
};
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
    'directdrive': 0xdfe081, // Pastellow
    'spacer': 0xb19cd9     // Light Purple
};
// Function to load and cache geometry data from JSON
async function loadGeometryData(modelPath) {
    const jsonPath = modelPath.replace('.stl', '.json');
    try {
        const response = await fetch(jsonPath);
        if (!response.ok) {
            console.log(`No JSON found for ${modelPath}, using default pattern`);
            // Return a default pattern structure for now
            return {
                faces: [{
                    faceId: 1,
                    normal: { x: 0, y: 0, z: 1 },
                    holes: [
                        {
                            id: 1,
                            diameter: 6.0,
                            position: { x: 0, y: 0, z: 0 }
                        }
                    ],
                    alignedDistances: []
                }]
            };
        }
        const data = await response.json();
        console.log('Loaded JSON data:', data);
        return data;
    } catch (error) {
        console.log(`Error loading geometry data for ${modelPath}, using default pattern:`, error);
        // Return same default pattern if there's an error
        return {
            faces: [{
                faceId: 1,
                normal: { x: 0, y: 0, z: 1 },
                holes: [
                    {
                        id: 1,
                        diameter: 6.0,
                        position: { x: 0, y: 0, z: 0 }
                    }
                ],
                alignedDistances: []
            }]
        };
    }
}

// Function to find matching hole patterns between two faces


function isValidPosition(pos) {
    return pos &&
        typeof pos.x === 'number' &&
        typeof pos.y === 'number' &&
        typeof pos.z === 'number';
}

function isValidHole(hole) {
    return hole &&
        typeof hole.diameter === 'number' &&
        isValidPosition(hole.position);
}

// Function to compare hole patterns between faces
function compareHolePatterns(face1, face2, isRiser = false) {
    if (!face1?.holes?.length || !face2?.holes?.length) {
        console.log('Missing holes in one or both faces');
        return 0;
    }

    // If number of holes doesn't match, patterns can't match
    if (face1.holes.length !== face2.holes.length) {
        console.log('Different number of holes:', face1.holes.length, 'vs', face2.holes.length);
        return 0;
    }

    // Calculate all inter-hole distances for both faces
    const distances1 = calculateInterHoleDistances(face1.holes);
    const distances2 = calculateInterHoleDistances(face2.holes);

    console.log('Distances in pattern 1:', distances1);
    console.log('Distances in pattern 2:', distances2);

    if (distances1.length !== distances2.length) {
        console.log('Different number of inter-hole distances');
        return 0;
    }

    // Try normal comparison first
    let bestMatchCount = 0;
    const tolerance = 1.0;

    // For risers, create a mirrored version of distances2
    if (isRiser) {
        // Mirror the second set of holes before calculating distances
        const mirroredHoles = face2.holes.map(hole => ({
            ...hole,
            position: {
                x: -hole.position.x,  // Mirror across YZ plane
                y: hole.position.y,
                z: hole.position.z
            }
        }));
        const mirroredDistances = calculateInterHoleDistances(mirroredHoles);
        
        let matchCount = 0;
        for (let i = 0; i < distances1.length; i++) {
            const diff = Math.abs(distances1[i] - mirroredDistances[i]);
            if (diff <= tolerance) {
                matchCount++;
            }
        }
        bestMatchCount = matchCount;
    } else {
        // Normal matching logic
        let matchCount = 0;
        for (let i = 0; i < distances1.length; i++) {
            const diff = Math.abs(distances1[i] - distances2[i]);
            if (diff <= tolerance) {
                matchCount++;
            }
        }
        bestMatchCount = matchCount;

        // Try rotating pattern for rectangular patterns
        if (distances1.length === 4) {
            const rotatedDistances2 = [distances2[2], distances2[3], distances2[0], distances2[1]];
            matchCount = 0;
            for (let i = 0; i < distances1.length; i++) {
                const diff = Math.abs(distances1[i] - rotatedDistances2[i]);
                if (diff <= tolerance) {
                    matchCount++;
                }
            }
            if (matchCount > bestMatchCount) {
                bestMatchCount = matchCount;
            }
        }
    }

    const score = bestMatchCount / distances1.length;
    console.log(`Best match score based on distances: ${score} (${bestMatchCount}/${distances1.length} matches)`);
    return score;
}
// Function to normalize paths for comparison
function normalizePath(path) {
    return path.toLowerCase().replace(/[\\\/]+/g, '/').trim();
}
function calculateInterHoleDistances(holes) {
    const distances = [];

    // Calculate distances between each pair of holes
    for (let i = 0; i < holes.length; i++) {
        for (let j = i + 1; j < holes.length; j++) {
            const h1 = holes[i];
            const h2 = holes[j];

            const distance = Math.sqrt(
                Math.pow(h1.position.x - h2.position.x, 2) +
                Math.pow(h1.position.y - h2.position.y, 2) +
                Math.pow(h1.position.z - h2.position.z, 2)
            );

            distances.push(distance);
        }
    }

    return distances.sort((a, b) => a - b);
}
function calculatePrimaryAxis(holes) {
    if (!holes || holes.length < 2) {
        return new THREE.Vector3(1, 0, 0);
    }

    // Sort holes by distance from first hole
    const sortedHoles = [...holes].sort((a, b) => {
        const distA = Math.sqrt(
            Math.pow(holes[0].position.x - a.position.x, 2) +
            Math.pow(holes[0].position.y - a.position.y, 2) +
            Math.pow(holes[0].position.z - a.position.z, 2)
        );
        const distB = Math.sqrt(
            Math.pow(holes[0].position.x - b.position.x, 2) +
            Math.pow(holes[0].position.y - b.position.y, 2) +
            Math.pow(holes[0].position.z - b.position.z, 2)
        );
        return distA - distB;
    });

    // Get vector between furthest holes
    const start = new THREE.Vector3(
        sortedHoles[0].position.x,
        sortedHoles[0].position.y,
        sortedHoles[0].position.z
    );
    const end = new THREE.Vector3(
        sortedHoles[sortedHoles.length - 1].position.x,
        sortedHoles[sortedHoles.length - 1].position.y,
        sortedHoles[sortedHoles.length - 1].position.z
    );

    // Calculate and normalize direction vector
    return end.sub(start).normalize();
}
// Function to calculate transformation for alignment
function calculateAlignment(baseFace, attachFace) {
    if (!baseFace || !attachFace) {
        console.error('Invalid faces for alignment');
        return null;
    }

    console.log('Calculating alignment between faces:',
        'Base:', baseFace,
        'Attach:', attachFace);

    // First align normals
    const baseNormal = new THREE.Vector3(
        baseFace.normal.x || 0,
        baseFace.normal.y || 0,
        baseFace.normal.z || 0
    );
    const attachNormal = new THREE.Vector3(
        attachFace.normal.x || 0,
        attachFace.normal.y || 0,
        attachFace.normal.z || 0
    );

    // Create initial rotation to align normals
    const normalRotation = new THREE.Quaternion();
    normalRotation.setFromUnitVectors(attachNormal, baseNormal);

    // Get the primary axis of the hole pattern for each face
    const baseAxis = calculatePrimaryAxis(baseFace.holes);
    const attachAxis = calculatePrimaryAxis(attachFace.holes);

    // Rotate the attachment axis by the normal alignment
    const rotatedAttachAxis = attachAxis.clone().applyQuaternion(normalRotation);

    // Calculate additional rotation needed to align the hole patterns
    const axisRotation = new THREE.Quaternion();
    axisRotation.setFromUnitVectors(rotatedAttachAxis, baseAxis);

    // Combine the rotations
    const finalRotation = axisRotation.multiply(normalRotation);

    // Calculate centers for position alignment
    const baseCenter = calculateHolePatternCenter(baseFace.holes);
    const attachCenter = calculateHolePatternCenter(attachFace.holes);

    // Apply rotation to attachment center
    const rotatedAttachCenter = attachCenter.clone().applyQuaternion(finalRotation);

    // Calculate offset
    const offset = baseCenter.clone().sub(rotatedAttachCenter);

    return {
        rotation: finalRotation,
        offset: offset
    };
}

function calculateHolePatternCenter(holes) {
    if (!holes || holes.length === 0) {
        return new THREE.Vector3();
    }

    const center = new THREE.Vector3();
    holes.forEach(hole => {
        center.add(new THREE.Vector3(
            hole.position.x,
            hole.position.y,
            hole.position.z
        ));
    });

    return center.divideScalar(holes.length);
}

function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9c9c9c);

    // Setup camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 0, 10);

    // Create renderer with proper parameters
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);
    // Add event listeners
    window.addEventListener('mousedown', (e) => {
        console.log("Raw mousedown event fired");
        console.log("Target:", e.target);
    }, true);
    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('mousedown', onMouseDown, true); // Use capture phase
    window.addEventListener('mouseup', onMouseUp, true);    // Use capture phase
    window.addEventListener('mousemove', onMouseMove, false);
    window.addEventListener('click', onMouseClick, false);
    window.addEventListener('dblclick', onDoubleClick, false);
    // Setup controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 2;
    controls.maxDistance = 20;
    controls.maxPolarAngle = Math.PI;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040, 1);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Load directory structure before loading model
    loadDirectoryStructure().then(() => {
        loadModel();
    });



    // Start animation loop
    animate();
}
function visualizeGeometryFeatures(geometryData, parentMesh) {
    // Clean up any existing visualizations
    parentMesh.children = parentMesh.children.filter(child =>
        !child.userData.isVisualization
    );

    // Get parent model's world transform if it exists
    let parentWorldMatrix = new THREE.Matrix4();
    let parentWorldQuaternion = new THREE.Quaternion();
    if (parentMesh.userData.parentModel) {
        parentWorldMatrix = parentMesh.userData.parentModel.matrixWorld;
        parentMesh.userData.parentModel.getWorldQuaternion(parentWorldQuaternion);
    }

    // Visualize holes
    if (geometryData.faces) {
        const holeGeometry = new THREE.CylinderGeometry(2, 2, 10, 16);
        const colors = [
            0xff0000, 0x00ff00, 0x0000ff, 0xff00ff,
            0xffff00, 0x00ffff, 0xff8000, 0x8000ff,
            0x0080ff, 0xff0080
        ];

        geometryData.faces.forEach((face, faceIndex) => {
            const holeMaterial = new THREE.MeshPhongMaterial({
                color: colors[faceIndex % colors.length],
                transparent: true,
                opacity: 0.6
            });

            face.holes?.forEach(hole => {
                const holeMesh = new THREE.Mesh(holeGeometry, holeMaterial);

                // Position hole
                holeMesh.position.set(
                    hole.position.x,
                    hole.position.y,
                    hole.position.z
                );

                // Align with face normal
                const normal = new THREE.Vector3(face.normal.x, face.normal.y, face.normal.z);
                holeMesh.quaternion.setFromUnitVectors(
                    new THREE.Vector3(0, 1, 0),
                    normal
                );

                // For secondary attachments, apply parent transforms
                if (parentMesh.userData.parentModel) {
                    holeMesh.position.applyMatrix4(parentWorldMatrix);
                    holeMesh.quaternion.premultiply(parentWorldQuaternion);
                }

                // Store metadata
                holeMesh.userData = {
                    isVisualization: true,
                    type: 'hole',
                    holeData: hole,
                    faceData: face,
                    groupIndex: faceIndex,
                    parentModel: parentMesh
                };

                parentMesh.add(holeMesh);
            });
        });
    }

    // Visualize slide faces
    if (geometryData.slideFaces?.length) {
        const slideMaterial = new THREE.MeshPhongMaterial({
            color: 0xff4400,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
            emissive: 0x331100,
            emissiveIntensity: 0.3
        });

        geometryData.slideFaces.forEach((group, groupIndex) => {
            group.faces?.forEach((face, faceIndex) => {
                const planeGeometry = new THREE.PlaneGeometry(
                    face.dimensions.width,
                    face.dimensions.height
                );

                // Center geometry
                planeGeometry.translate(
                    face.dimensions.center2D.x,
                    face.dimensions.center2D.y,
                    0
                );

                const slideMesh = new THREE.Mesh(planeGeometry, slideMaterial.clone());

                // Position and orient slide face
                const offsetDistance = 0.1;
                const normalVector = new THREE.Vector3(
                    face.normal.x,
                    face.normal.y,
                    face.normal.z
                ).normalize();

                slideMesh.position.set(
                    face.position.x + (normalVector.x * offsetDistance),
                    face.position.y + (normalVector.y * offsetDistance),
                    face.position.z + (normalVector.z * offsetDistance)
                );

                // Apply rotation
                const euler = new THREE.Euler(
                    face.rotation.x * Math.PI / 180,
                    face.rotation.y * Math.PI / 180,
                    face.rotation.z * Math.PI / 180,
                    'XYZ'
                );
                slideMesh.setRotationFromEuler(euler);

                // For secondary attachments, apply parent transforms
                if (parentMesh.userData.parentModel) {
                    slideMesh.position.applyMatrix4(parentWorldMatrix);
                    slideMesh.quaternion.premultiply(parentWorldQuaternion);
                }

                // Store metadata
                slideMesh.userData = {
                    isVisualization: true,
                    type: 'slide',
                    slideGroup: groupIndex,
                    faceIndex: faceIndex,
                    dimensions: face.dimensions,
                    parentModel: parentMesh
                };

                parentMesh.add(slideMesh);
            });
        });
    }
}

function visualizeHoles(geometryData, parentMesh) {
    const colors = [
        0xff0000, 0x00ff00, 0x0000ff, 0xff00ff,
        0xffff00, 0x00ffff, 0xff8000, 0x8000ff,
        0x0080ff, 0xff0080
    ];

    const holeGeometry = new THREE.CylinderGeometry(2, 2, 10, 16);

    geometryData.faces?.forEach((face, faceIndex) => {
        const holeMaterial = new THREE.MeshPhongMaterial({
            color: colors[faceIndex % colors.length],
            transparent: true,
            opacity: 0.6
        });

        face.holes?.forEach(hole => {
            const holeMesh = new THREE.Mesh(holeGeometry, holeMaterial);

            // Position hole
            holeMesh.position.set(
                hole.position.x,
                hole.position.y,
                hole.position.z
            );

            // Align with face normal
            const normal = new THREE.Vector3(face.normal.x, face.normal.y, face.normal.z);
            holeMesh.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                normal
            );

            // Store metadata
            holeMesh.userData.holeData = hole;
            holeMesh.userData.faceData = face;
            holeMesh.userData.groupIndex = faceIndex;
            holeMesh.userData.parentModel = parentMesh;

            parentMesh.add(holeMesh);
        });
    });
}

function visualizeSlideFaces(geometryData, parentMesh) {
    if (!geometryData.slideFaces?.length) return;

    const slideMaterial = new THREE.MeshPhongMaterial({
        color: 0xff4400,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        emissive: 0x331100,
        emissiveIntensity: 0.3
    });

    geometryData.slideFaces.forEach((group, groupIndex) => {
        group.faces?.forEach((face, faceIndex) => {
            const planeGeometry = new THREE.PlaneGeometry(
                face.dimensions.width,
                face.dimensions.height
            );

            // Center geometry
            planeGeometry.translate(
                face.dimensions.center2D.x,
                face.dimensions.center2D.y,
                0
            );

            const slideMesh = new THREE.Mesh(planeGeometry, slideMaterial.clone());

            // Apply small offset based on normal
            const offsetDistance = 0.1;
            const normalVector = new THREE.Vector3(
                face.normal.x,
                face.normal.y,
                face.normal.z
            ).normalize();

            slideMesh.position.set(
                face.position.x + (normalVector.x * offsetDistance),
                face.position.y + (normalVector.y * offsetDistance),
                face.position.z + (normalVector.z * offsetDistance)
            );

            // Apply rotation
            const euler = new THREE.Euler(
                face.rotation.x * Math.PI / 180,
                face.rotation.y * Math.PI / 180,
                face.rotation.z * Math.PI / 180,
                'XYZ'
            );
            slideMesh.setRotationFromEuler(euler);

            // Store metadata
            slideMesh.userData.slideGroup = groupIndex;
            slideMesh.userData.faceIndex = faceIndex;
            slideMesh.userData.dimensions = face.dimensions;
            slideMesh.userData.parentModel = parentMesh;

            parentMesh.add(slideMesh);
        });
    });
}
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

            // Create the mesh
            mainModel = new THREE.Mesh(geometry, material);

            // Compute bounding box and center
            geometry.computeBoundingBox();
            const center = geometry.boundingBox.getCenter(new THREE.Vector3());

            // Center the geometry
            geometry.translate(-center.x, -center.y, -center.z);

            // Add to scene before any transformations
            scene.add(mainModel);

            // Apply rotation after adding to scene
            mainModel.rotation.x = -Math.PI / 2;

            // Create attachment points
            createAttachmentPoints(mainModel);

            // Load and visualize holes
            const geometryData = await loadGeometryData('heromedir/base/UniversalBase.stl');
            if (geometryData) {
                visualizeHoles(geometryData, mainModel);
                visualizeSlideFaces(geometryData, mainModel);
            }

            // Adjust camera based on actual model size
            const box = new THREE.Box3().setFromObject(mainModel);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);

            // Set camera position to a good viewing distance
            camera.position.z = maxDim * 3;

            // Update controls
            controls.minDistance = maxDim * 0.5;
            controls.maxDistance = maxDim * 5;

            // Force a render
            renderer.render(scene, camera);
        },
        xhr => console.log((xhr.loaded / xhr.total * 100) + '% loaded'),
        error => console.error('Error loading model:', error)
    );
}
function findClosestFace(faces, point) {
    let closestFace = null;
    let minDistance = Infinity;

    faces.forEach(face => {
        if (face.holes && face.holes.length > 0) {
            const center = calculateHolePatternCenter(face.holes);
            const distance = point.distanceTo(new THREE.Vector3(center.x, center.y, center.z));

            if (distance < minDistance) {
                minDistance = distance;
                closestFace = face;
            }
        }
    });

    return closestFace;
}
// Function to find directory by path in structure
function findDirectoryByPath(paths, structure) {
    if (!Array.isArray(paths)) {
        paths = [paths];
    }

    const normalizedSearchPaths = paths.map(path => normalizePath(path));
    let allContents = [];

    function search(items, searchPath) {
        if (!items) return null;

        let contents = [];

        for (const item of items) {
            const normalizedItemPath = normalizePath(item.path);

            if (item.type === 'directory') {
                if (normalizedItemPath === searchPath) {
                    // Found the target directory, collect all contents recursively
                    function collectContents(dirItems) {
                        let results = [];
                        if (!dirItems) return results;

                        dirItems.forEach(dirItem => {
                            results.push(dirItem);
                            if (dirItem.type === 'directory' && dirItem.children) {
                                results = results.concat(collectContents(dirItem.children));
                            }
                        });
                        return results;
                    }
                    return collectContents(item.children);
                }

                // Continue searching in subdirectories
                const found = search(item.children, searchPath);
                if (found) contents = contents.concat(found);
            }
        }
        return contents.length > 0 ? contents : null;
    }

    // Search for each path and combine results
    normalizedSearchPaths.forEach(searchPath => {
        const contents = search(structure, searchPath);
        if (contents) {
            allContents = [...allContents, ...contents];
        }
    });

    return allContents.length > 0 ? allContents : null;
}
async function getFileList(targetFolder) {
    try {
        const response = await fetch('/list-files');
        if (!response.ok) throw new Error('Network response was not ok');
        const structure = await response.json();
        console.log('Directory structure received:', structure);

        // Direct search for the target folder
        function findDirectoryContents(items) {
            for (const item of items) {
                // Format paths consistently
                const normalizedItemPath = item.path.replace(/\\/g, '/');
                const normalizedTargetPath = targetFolder.replace(/\\/g, '/');

                // Log when we find a potential match
                if (item.type === 'directory') {
                    console.log('Checking directory:', normalizedItemPath, 'against target:', normalizedTargetPath);
                }

                // If we found our target directory, return its STL files
                if (item.type === 'directory' && normalizedItemPath === normalizedTargetPath) {
                    console.log('Found matching directory:', item.path);
                    console.log('Directory contents:', item.children);

                    const stlFiles = item.children
                        .filter(child => child.type === 'file' && child.name.toLowerCase().endsWith('.stl'))
                        .map(child => child.name);

                    console.log('STL files found:', stlFiles);
                    return stlFiles;
                }

                // If this directory has children, search them
                if (item.children) {
                    const result = findDirectoryContents(item.children);
                    if (result) return result;
                }
            }
            return null;
        }

        const files = findDirectoryContents(structure) || [];
        console.log('Final file list for', targetFolder, ':', files);
        return files;
    } catch (error) {
        console.error('Error fetching file list:', error);
        return [];
    }
}
// Function to create a safe id for folders
function createFolderId(path) {
    return btoa(path).replace(/[=\/+]/g, '');
}
// Function to update menu content based on current path

function updateMenuContent(menuElement) {
    const current = currentMenuPath[currentMenuPath.length - 1];
    if (!current || !current.folder) return;

    let html = `
        <div class="menu-container">
            <div class="menu-header">
                ${currentMenuPath.length > 1 ?
            `<button class="back-button" onclick="navigateBack()">
                        <span class="back-arrow"></span>
                        <span>Back</span>
                     </button>` :
            `<div class="menu-title">${current.title}</div>`}
            </div>
            <div class="menu-content">`;

    if (current.isCustomMenu) {
        // Handle custom menu items
        current.folder.forEach(dir => {
            const folderId = createFolderId(dir.customData.path);
            menuState.set(folderId, {
                customData: dir.customData,
                title: dir.customData.title
            });

            html += `
                <div class="menu-item folder" onclick="event.stopPropagation(); navigateToFolder('${folderId}')">
                    <span class="folder-icon"></span>
                    ${dir.customData.title}
                </div>`;
        });
    } else {
        // Get the normalized current base path
        const currentBasePath = current.basePath.replace(/\\/g, '/');

        // Filter items to only show direct children
        const currentLevelItems = current.folder.filter(item => {
            if (!item.path) return false;

            const itemPath = item.path.replace(/\\/g, '/');
            const relPath = itemPath.replace(currentBasePath, '').replace(/^\/+/, '');

            // Only include items that are direct children (no additional path separators)
            return !relPath.includes('/');
        });

        // Add directories first
        const directories = currentLevelItems.filter(item => item.type === 'directory');
        directories.forEach(dir => {
            const fullPath = `${current.basePath}/${dir.name}`.replace(/^\/+/, '');
            const folderId = createFolderId(fullPath);

            menuState.set(folderId, {
                folder: dir.children || [],
                basePath: fullPath,
                title: dir.name
            });

            html += `
                <div class="menu-item folder" onclick="event.stopPropagation(); navigateToFolder('${folderId}')">
                    <span class="folder-icon"></span>
                    ${dir.name}
                </div>`;
        });

        // Then add STL files
        const files = currentLevelItems.filter(item =>
            item.type === 'file' &&
            item.name.toLowerCase().endsWith('.stl')
        );

        files.forEach(file => {
            const fullPath = `${current.basePath}/${file.name}`.replace(/^\/+/, '');
            html += `
                <div class="menu-item file" onclick="event.stopPropagation(); attachModelAtPoint('${fullPath}')">
                    <span class="file-icon"></span>
                    <span class="file-name">${file.name.replace('.stl', '')}</span>
                </div>`;
        });
    }

    html += `
            </div>
        </div>`;

    menuElement.innerHTML = html;
}
function hideMenu() {
    document.getElementById('modelSelect').style.display = 'none';
    selectedPoint = null;
}
// Function to navigate to a folder
// Updated navigation functions
function navigateToFolder(folderId) {
    const folderData = menuState.get(folderId);
    if (!folderData) {
        console.error('No folder data found for ID:', folderId);
        return;
    }

    // Get current menu info
    const currentMenu = currentMenuPath[currentMenuPath.length - 1];
    const currentUserData = selectedPoint?.userData;
    
    if (folderData.customData) {
    // Handle custom menu navigation
    const directory = findDirectoryByPath(folderData.customData.path, directoryStructure);
    if (!directory) return;

    const filteredContents = folderData.customData.filter ?
        directory.filter(item => folderData.customData.filter(item, currentUserData)) :
        directory;

    // Update selectedPoint's attachmentType if one was specified in the custom menu
    if (folderData.customData.attachmentType && selectedPoint) {
        selectedPoint.userData.attachmentType = folderData.customData.attachmentType;
    }

    currentMenuPath.push({
        folder: filteredContents,
        basePath: folderData.customData.path,
        title: folderData.customData.title,
        filter: folderData.customData.filter,
        userData: {
            ...currentUserData,
            attachmentType: folderData.customData.attachmentType || currentUserData?.attachmentType
        }
    });
    } else {
        // Check if we're in a regular menu or custom menu path
        const menuType = selectedPoint?.userData?.attachmentType;
        const menuConfig = categoryMenus[menuType];

        // For regular menu navigation
        if (menuConfig?.filter) {
            // Apply the current menu's filter (handles part cooling)
            const filteredContents = filterContents(folderData.folder, currentUserData);
            
            currentMenuPath.push({
                ...folderData,
                folder: filteredContents,
                basePath: folderData.basePath,
                title: folderData.title,
                filter: menuConfig.filter,
                userData: currentUserData
            });
        } else if (currentMenu?.filter) {
            // Apply custom menu's filter (handles wing/custom menus)
            const filteredContents = folderData.folder.filter(item => 
                currentMenu.filter(item, currentUserData)
            );
            
            currentMenuPath.push({
                ...folderData,
                folder: filteredContents,
                basePath: folderData.basePath,
                title: folderData.title,
                filter: currentMenu.filter,
                userData: currentUserData
            });
        } else {
            currentMenuPath.push(folderData);
        }
    }

    const menuElement = document.getElementById('modelSelect');
    updateMenuContent(menuElement);
    menuElement.style.display = 'block';
}

function navigateBack() {
    if (currentMenuPath.length > 1) {
        currentMenuPath.pop();
        const menuElement = document.getElementById('modelSelect');
        updateMenuContent(menuElement);
        menuElement.style.display = 'block'; // Ensure menu stays visible
    }
}
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

    // Remove existing attachment points
    attachmentPoints.forEach(point => object.remove(point));
    attachmentPoints = [];

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

    // First, find specific patterns we want to match
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

    // Define the attachment points we need with their characteristics
    const attachmentDefinitions = [
        {
            type: 'hotend',
            characteristics: { normal: { x: 0, y: 0, z: 1 } }
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
        const face = findFaceByCharacteristics(def.characteristics);
        if (!face) continue;

        assignedFaces.add(face.faceId);

        const center = calculateHolePatternCenter(face.holes);
        const normal = new THREE.Vector3(face.normal.x, face.normal.y, face.normal.z);

        // Create main point
        const createPoint = (position, normal, suffix = '') => {
            const point = new THREE.Mesh(sphereGeometry, sphereMaterial.clone());
            position.add(normal.clone().multiplyScalar(5)); // 5mm offset from face

            point.position.copy(position);
            point.userData.attachmentType = def.type;
            point.userData.attachmentName = def.type + suffix;
            point.userData.normal = normal;
            point.userData.faceId = face.faceId; // Store the face ID

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
                createPoint(oppositeCenter, oppositeNormal, '_opposite');
            }
        }
    }
}
// Load directory structure at startup
async function loadDirectoryStructure() {
    try {
        const response = await fetch('/list-files');
        if (!response.ok) throw new Error('Network response was not ok');
        directoryStructure = await response.json();
        console.log('Directory structure loaded:', directoryStructure);
    } catch (error) {
        console.error('Error loading directory structure:', error);
    }
}
// Global directory structure cache
let directoryStructure = null;
// Function to get files from cached directory structure
function getFilesFromCache(targetFolder) {
    console.log('Getting files for folder:', targetFolder);
    console.log('Current directory structure:', directoryStructure);

    if (!directoryStructure) {
        console.warn('Directory structure not loaded yet');
        return [];
    }

    function findDirectoryContents(items) {
        for (const item of items) {
            const normalizedPath = item.path.replace(/\\/g, '/');
            const normalizedTarget = targetFolder.replace(/\\/g, '/');

            console.log('Checking path:', normalizedPath, 'against target:', normalizedTarget);

            if (item.type === 'directory' && normalizedPath === normalizedTarget) {
                console.log('Found matching directory:', item);
                return item.children
                    .filter(child => child.type === 'file' && child.name.toLowerCase().endsWith('.stl'))
                    .map(child => child.name);
            }
            if (item.children) {
                const result = findDirectoryContents(item.children);
                if (result) return result;
            }
        }
        return null;
    }

    const results = findDirectoryContents(directoryStructure) || [];
    console.log('Files found:', results);
    return results;
}
async function createDropdownForType(type) {
    // Use the original type if it exists, otherwise use the current type
    const menuType = selectedPoint?.userData?.originalType || type;
    console.log('Creating menu for type:', menuType);

    menuState.clear();
    const menu = categoryMenus[menuType];
    if (!menu) return '';

    if (menu.isCustomMenu) {
        const customMenu = menu.createCustomMenu(selectedPoint?.userData);
        if (customMenu.type === 'category') {
            currentMenuPath = [{
                folder: customMenu.items.map(item => ({
                    type: 'directory',
                    name: item.title,
                    customData: item
                })),
                basePath: '',
                title: menu.title,
                isCustomMenu: true
            }];
        }
    } else {
        // Original directory-based menu code
        const directory = findDirectoryByPath(menu.paths[0], directoryStructure);
        if (!directory) return '';

        const filteredContents = menu.filter ?
            filterContents(directory, selectedPoint?.userData) :
            directory;

        currentMenuPath = [{
            folder: filteredContents,
            basePath: menu.paths[0],
            title: menu.title
        }];
    }

    const menuElement = document.createElement('div');
    updateMenuContent(menuElement);
    return menuElement.innerHTML;
}

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

        const arrowIntersects = raycaster.intersectObjects(allArrows)
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
}


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

    const allArrows = [];
    attachedModels.forEach(model => {
        if (model.userData.positionControls) {
            allArrows.push(...model.userData.positionControls);
        }
    });

    const arrowIntersects = raycaster.intersectObjects(allArrows)
        .filter(hit => hit.object.userData.type === 'positionControl');

    if (arrowIntersects.length > 0) {
        const arrow = arrowIntersects[0].object;
        const model = arrow.userData.targetModel;
        const moveAmount = arrow.userData.moveAmount;

        if (model.userData.attachmentType === 'probe') {
            // Move along Y axis for probes
            const newY = model.position.y + moveAmount;
            model.position.y = newY;

            // Keep arrows in their original relative positions
            model.userData.positionControls.forEach(control => {
                control.position.copy(control.userData.originalPosition);
                control.position.y += moveAmount;  // Move with the model
            });
        } else {
            // Move along Z axis for part cooling
            const newZ = model.position.z + moveAmount;
            if (newZ >= model.userData.minZ && newZ <= model.userData.initialZ) {
                model.position.z = newZ;
                // Keep part cooling arrows in their original relative positions
                model.userData.positionControls.forEach(control => {
                    const pos = control.userData.originalPosition.clone();
                    pos.z += (newZ - model.userData.initialZ);  // Offset from initial Z
                    control.position.copy(pos);
                });
            }
        }

        event.preventDefault();
        event.stopPropagation();
        return;
    }

    const intersects = raycaster.intersectObjects(attachmentPoints, true);

    if (intersects.length > 0) {
        selectedPoint = intersects[0].object;
        // If this point was previously a directdrive menu point, preserve that
        if (!selectedPoint.userData.originalType && 
            (selectedPoint.userData.attachmentType === 'directdrive' || 
             selectedPoint.userData.attachmentType === 'spacer')) {
            selectedPoint.userData.originalType = 'directdrive';
        }
        menuElement.innerHTML = await createDropdownForType(selectedPoint.userData.attachmentType);
        menuElement.style.display = 'block';

        const menuWidth = 300;
        const menuHeight = Math.min(400, window.innerHeight * 0.8);

        const spaceRight = window.innerWidth - event.clientX;
        const spaceBottom = window.innerHeight - event.clientY;

        let x = event.clientX;
        if (spaceRight < menuWidth) {
            x = Math.max(0, window.innerWidth - menuWidth);
        }

        let y = event.clientY;
        if (spaceBottom < menuHeight) {
            y = Math.max(0, window.innerHeight - menuHeight);
        }

        menuElement.style.left = x + 'px';
        menuElement.style.top = y + 'px';
    } else if (!event.target.closest('#modelSelect')) {
        selectedPoint = null;
        menuElement.style.display = 'none';
    }
}
async function attachModelAtPoint(modelPath) {
    if (!selectedPoint || !modelPath) return;

    try {
        // For secondary attachments, load parent model's geometry instead of base
        const baseModelPath = selectedPoint.userData.parentModel?.userData.modelPath || 'heromedir/base/UniversalBase.stl';
        console.log('Selected point:', selectedPoint.userData);
        console.log('Parent model:', selectedPoint.userData.parentModel?.userData);
        console.log('Loading geometry from:', baseModelPath);
        const baseGeometryData = await loadGeometryData(baseModelPath);
        const attachGeometryData = await loadGeometryData(modelPath);

        if (!baseGeometryData || !attachGeometryData) {
            console.error('Failed to load geometry data');
            return;
        }
        
        // Get orientation from both models
        const baseOrientation = new THREE.Vector3(
            baseGeometryData.orientationFace.normal.x,
            baseGeometryData.orientationFace.normal.y,
            baseGeometryData.orientationFace.normal.z
        ).normalize();

        const attachOrientation = new THREE.Vector3(
            attachGeometryData.orientationFace.normal.x,
            attachGeometryData.orientationFace.normal.y,
            attachGeometryData.orientationFace.normal.z
        ).normalize();

        // When removing a model, reset its used patterns
        if (attachedModels.has(selectedPoint)) {
            const oldModel = attachedModels.get(selectedPoint);
            if (oldModel.userData.modelPath) {
                resetPatterns(oldModel.userData.modelPath);
            }
            mainModel.remove(oldModel);
            if (oldModel.userData.positionControls) {
                oldModel.userData.positionControls.forEach(arrow => {
                    mainModel.remove(arrow);
                });
            }
            attachedModels.delete(selectedPoint);
        }

        const loader = new THREE.STLLoader();
        loader.load(modelPath, function (geometry) {
            
            // Get the original type or current type
            const originalType = selectedPoint.userData.originalType || selectedPoint.userData.attachmentType;
            // Determine if this is a riser/spacer FIRST
            const isRiser = modelPath.toLowerCase().includes('riser');
            
            // Set the actual type based on whether it's a riser
            const actualType = isRiser ? 'spacer' : originalType;
            
            const material = new THREE.MeshPhongMaterial({
                color: partColors[actualType] || 0xff0000,
                flatShading: false,
                transparent: true,
                opacity: 1
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData.modelPath = modelPath;
            mesh.userData.attachmentType = actualType;
            mesh.userData.originalType = originalType;  // Store the original type
            mesh.userData.usedPatterns = {
                holes: new Set([...getUsedPatterns(baseModelPath)]),
                slides: new Set([...(usedPatterns.get(baseModelPath)?.slides || [])])
            };
            console.log('🚨 CREATED MESH:', {
                type: selectedPoint.userData.attachmentType,
                modelPath: modelPath,
                color: partColors[selectedPoint.userData.attachmentType] || 0xff0000
            });
            // Store used patterns based on attachment type
            if (selectedPoint.userData.attachmentType === 'partcooling') {
                mesh.userData.usedSlides = new Set([...(usedPatterns.get(baseModelPath)?.slides || [])]);
            } else {
                mesh.userData.usedHoles = new Set([...(usedHolePatterns.get(baseModelPath) || [])]);
            }

            // Center the geometry
            geometry.computeBoundingBox();
            const center = geometry.boundingBox.getCenter(new THREE.Vector3());
            geometry.translate(-center.x, -center.y, -center.z);

            if (selectedPoint.userData.attachmentType === 'partcooling') {
                if (baseGeometryData.slideFaces && attachGeometryData.slideFaces) {
                    const isDualDuct = attachGeometryData.slideFaces.length > 1;
                    window.currentAttachmentPath = modelPath;

                    const availableBaseFaces = baseGeometryData.slideFaces.filter((group, index) =>
                        !isPatternUsed(baseModelPath, { groupIndex: index })
                    );

                    const availableAttachFaces = attachGeometryData.slideFaces.filter((group, index) =>
                        !isPatternUsed(modelPath, { groupIndex: index })
                    );

                    console.log('Available base slide faces:', availableBaseFaces.length);
                    console.log('Available attachment slide faces:', availableAttachFaces.length);

                    if (isDualDuct) {
                        markPatternAsUsed(baseModelPath, { groupIndex: 0 });
                        markPatternAsUsed(baseModelPath, { groupIndex: 1 });
                        markPatternAsUsed(modelPath, { groupIndex: 0 });
                        markPatternAsUsed(modelPath, { groupIndex: 1 });

                        // Calculate centers of both base groups
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

                        // Calculate centers of both attachment groups
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

                        // Align normals between dual duct faces
                        const baseNormalLeft = new THREE.Vector3(
                            baseGeometryData.slideFaces[1].faces[0].normal.x,
                            baseGeometryData.slideFaces[1].faces[0].normal.y,
                            baseGeometryData.slideFaces[1].faces[0].normal.z
                        );
                        const attachNormalLeft = new THREE.Vector3(
                            attachGeometryData.slideFaces[0].faces[0].normal.x,
                            attachGeometryData.slideFaces[0].faces[0].normal.y,
                            attachGeometryData.slideFaces[0].faces[0].normal.z
                        ).applyQuaternion(orientQuat);

                        const normalQuat = new THREE.Quaternion();
                        normalQuat.setFromUnitVectors(attachNormalLeft, baseNormalLeft.clone().negate());
                        mesh.quaternion.premultiply(normalQuat);

                        // Position using combined centers
                        const transformedAttachCenter = attachCenter.clone().applyQuaternion(mesh.quaternion);
                        const offset = baseCenter.clone().sub(transformedAttachCenter);
                        mesh.position.copy(offset);

                    } else {
                        // Single duct logic
                        const isRightSide = selectedPoint.userData.attachmentName.includes('opposite');
                        const baseGroupIndex = isRightSide ? 0 : 1;

                        markPatternAsUsed(baseModelPath, { groupIndex: baseGroupIndex });
                        markPatternAsUsed(window.currentAttachmentPath, { groupIndex: 1 });

                        const baseGroup = isRightSide ? baseGeometryData.slideFaces[0] : baseGeometryData.slideFaces[1];
                        const attachGroup = attachGeometryData.slideFaces[0];

                        // First align orientations to sky
                        const upVector = new THREE.Vector3(0, 0, 1);
                        const orientQuat = new THREE.Quaternion();
                        orientQuat.setFromUnitVectors(attachOrientation, upVector);
                        mesh.quaternion.copy(orientQuat);

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
                        const baseCenter = new THREE.Vector3(
                            (baseGroup.faces[0].position.x + baseGroup.faces[1].position.x) / 2,
                            (baseGroup.faces[0].position.y + baseGroup.faces[1].position.y) / 2 - (isRightSide ? 1.5 : 2),
                            (baseGroup.faces[0].position.z + baseGroup.faces[1].position.z) / 2
                        );
                        const attachCenter = new THREE.Vector3(
                            (attachGroup.faces[0].position.x + attachGroup.faces[1].position.x) / 2,
                            (attachGroup.faces[0].position.y + attachGroup.faces[1].position.y) / 2,
                            (attachGroup.faces[0].position.z + attachGroup.faces[1].position.z) / 2
                        );

                        // Position using centers
                        const transformedAttachCenter = attachCenter.clone().applyQuaternion(mesh.quaternion);
                        const offset = baseCenter.clone().sub(transformedAttachCenter);

                        // Check if right side needs 180° rotation - AFTER all normals are defined
                        if (isRightSide) {
                            const angle = attachNormal.angleTo(baseNormal);
                            if (angle < Math.PI / 2) {
                                const rotationQuat = new THREE.Quaternion().setFromAxisAngle(
                                    new THREE.Vector3(0, 0, 1),
                                    Math.PI
                                );
                                mesh.quaternion.premultiply(rotationQuat);
                            }
                        }

                        mesh.position.copy(offset);


                    }
                }
            } else if (selectedPoint.userData.parentModel && selectedPoint.userData.attachmentType === 'probe') {
                window.currentAttachmentPath = modelPath;

                const baseGroupIndex = 0;
                markPatternAsUsed(baseModelPath, { groupIndex: baseGroupIndex });
                markPatternAsUsed(window.currentAttachmentPath, { groupIndex: 0 });

                const baseGroup = baseGeometryData.slideFaces[0];
                const attachGroup = attachGeometryData.slideFaces[0];

                // First align orientations to sky
                const upVector = new THREE.Vector3(0, 0, 1);
                const orientQuat = new THREE.Quaternion();
                orientQuat.setFromUnitVectors(attachOrientation, upVector);
                mesh.quaternion.copy(orientQuat);

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

                if (attachGeometryData) {
                    mesh.userData.parentModel = selectedPoint.userData.parentModel;
                    visualizeHoles(attachGeometryData, mesh);
                    visualizeSlideFaces(attachGeometryData, mesh);
                }
                // In the probe mount section of attachModelAtPoint()
                if (selectedPoint.userData.attachmentType === 'probe') {
                    // Add position control arrows
                    const positionArrows = createPositionArrows(mesh);
                    mesh.userData.positionControls = positionArrows;
                    // Change mainModel.add to mesh.add
                    positionArrows.forEach(arrow => mesh.add(arrow));
                }
            } else {
                // Handle other attachment types with hole patterns
                const attachmentPointWorld = new THREE.Vector3();
                selectedPoint.getWorldPosition(attachmentPointWorld);

                // For secondary attachments, transform point relative to parent model
                const localPoint = attachmentPointWorld.clone()
                    .applyMatrix4((selectedPoint.userData.parentModel || mainModel).matrixWorld.clone().invert());

                let closestFace = null;
                let minDistance = Infinity;

                // For secondary attachments, use the face specified in the attachment point
                if (selectedPoint.userData.parentModel && selectedPoint.userData.faceId) {
                    closestFace = baseGeometryData.faces.find(face => face.faceId === selectedPoint.userData.faceId);
                } else {
                    // Find appropriate face based on attachment type

                    if (selectedPoint.userData.attachmentType === 'gantry' ||
                        selectedPoint.userData.attachmentType === 'gantryclip') {
                        const availableFaces = baseGeometryData.faces.filter(face =>
                            !isHolePatternUsed(baseModelPath, face));

                        for (const face of availableFaces) {
                            if (face.holes && face.holes.length === 4) {
                                const center = calculateHolePatternCenter(face.holes);
                                const distance = localPoint.distanceTo(
                                    new THREE.Vector3(center.x, center.y, center.z)
                                );
                                if (distance < minDistance) {
                                    minDistance = distance;
                                    closestFace = face;
                                }
                            }
                        }
                    } else {
                        const availableFaces = baseGeometryData.faces.filter(face =>
                            !isHolePatternUsed(baseModelPath, face));

                        for (const face of availableFaces) {
                            if (face.holes && face.holes.length > 0) {
                                const center = calculateHolePatternCenter(face.holes);
                                const distance = localPoint.distanceTo(
                                    new THREE.Vector3(center.x, center.y, center.z)
                                );
                                if (distance < minDistance) {
                                    minDistance = distance;
                                    closestFace = face;
                                }
                            }
                        }
                    }
                }
                if (attachGeometryData) {
                    if (selectedPoint.userData.parentModel) {
                        mesh.userData.parentModel = selectedPoint.userData.parentModel;
                    }
                    window.currentAttachmentPath = modelPath;
                    visualizeHoles(attachGeometryData, mesh);
                    visualizeSlideFaces(attachGeometryData, mesh);
                }
                window.currentAttachmentPath = modelPath;
                const matchingFace = findMatchingFaces(closestFace, attachGeometryData.faces, selectedPoint.userData.attachmentType);
                if (!matchingFace) {
                    console.error('No matching face pattern found');
                    return;
                }
                mesh.userData.patternMapping = matchingFace.patternMapping;
                const baseHoles = closestFace.holes;
                const attachHoles = matchingFace.holes;

                if (baseHoles.length >= 2 && attachHoles.length >= 2) {
                    const baseCenter = calculateHolePatternCenter(baseHoles);
                    const attachCenter = calculateHolePatternCenter(attachHoles);
                    const baseNormal = new THREE.Vector3(
                        closestFace.normal.x,
                        closestFace.normal.y,
                        closestFace.normal.z
                    );
                    const attachNormal = new THREE.Vector3(
                        matchingFace.normal.x,
                        matchingFace.normal.y,
                        matchingFace.normal.z
                    );

                    // Handle specific attachment type alignments
                    if (selectedPoint.userData.attachmentType === 'hotend' ||
                        selectedPoint.userData.attachmentType === 'directdrive' ||
                        selectedPoint.userData.attachmentType === 'spacer') {
                        
                        console.log('🚨🚨🚨 USING HOTEND/DIRECTDRIVE ALIGNMENT');
                        
                        // First align normals
                        const normalQuat = new THREE.Quaternion();
                        normalQuat.setFromUnitVectors(attachNormal, baseNormal.clone().negate());
                        mesh.quaternion.copy(normalQuat);
                        
                        
                        // Check and correct orientation if needed
                        const rotatedOrientation = attachOrientation.clone().applyQuaternion(mesh.quaternion);
                        if (rotatedOrientation.y < 0) {
                            const flipQuat = new THREE.Quaternion().setFromAxisAngle(baseNormal, Math.PI);
                            // Apply flip around pattern center
                            const flipPoint = baseCenter.clone();
                            mesh.position.sub(flipPoint);
                            mesh.position.applyQuaternion(flipQuat);
                            mesh.position.add(flipPoint);
                            mesh.quaternion.premultiply(flipQuat);
                        }
                        
                        // Add 180-degree rotation around Z-axis for direct drive mounts
                        // Check if this is a direct drive mount by examining the original type and ensuring it's not a riser
                        const originalType = selectedPoint.userData.originalType || selectedPoint.userData.attachmentType;
                        const isDirectDrive = originalType === 'directdrive' && !modelPath.toLowerCase().includes('riser');
                        
                        if (isDirectDrive) {
                            console.log('Applying 180-degree rotation for direct drive mount');
                            const rotationAxis = new THREE.Vector3(0, 0, 1);  // Z-axis
                            const rotationQuat = new THREE.Quaternion().setFromAxisAngle(rotationAxis, Math.PI);
                            
                            // Rotate around the pattern center
                            const rotationPoint = baseCenter.clone();
                            mesh.position.sub(rotationPoint);
                            mesh.position.applyQuaternion(rotationQuat);
                            mesh.position.add(rotationPoint);
                            mesh.quaternion.premultiply(rotationQuat);
                        }
                    } else if (selectedPoint.userData.attachmentType === 'fanguard') {
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
                    } else if (selectedPoint.userData.attachmentType === 'skirt') {
                        const normalQuat = new THREE.Quaternion();
                        normalQuat.setFromUnitVectors(attachNormal, baseNormal.clone().negate());
                        mesh.quaternion.copy(normalQuat);

                        const finalOrientation = attachOrientation.clone().applyQuaternion(mesh.quaternion);
                        if (finalOrientation.y < 0) {
                            const flipQuat = new THREE.Quaternion().setFromAxisAngle(baseNormal, Math.PI);
                            mesh.quaternion.premultiply(flipQuat);
                        }
                    } else if (selectedPoint.userData.attachmentType === 'gantry') {
                        // Original gantry adapter alignment - this was working correctly
                        const normalQuat = new THREE.Quaternion().setFromUnitVectors(attachNormal, baseNormal.clone().negate());
                        mesh.quaternion.copy(normalQuat);

                        const rotatedOrientation = attachOrientation.clone().applyQuaternion(mesh.quaternion);
                        const dotX = Math.abs(rotatedOrientation.x);
                        const dotY = Math.abs(rotatedOrientation.y);
                        const dotZ = Math.abs(rotatedOrientation.z);

                        if (dotX > dotY && dotX > dotZ) {
                            const rotQuat = new THREE.Quaternion().setFromAxisAngle(
                                baseNormal,
                                rotatedOrientation.x > 0 ? -Math.PI / 2 : Math.PI / 2
                            );
                            mesh.quaternion.premultiply(rotQuat);
                        }
                    } else if (selectedPoint.userData.attachmentType === 'gantryclip') {
                        // First align the mounting holes perfectly
                        const normalQuat = new THREE.Quaternion().setFromUnitVectors(attachNormal, baseNormal.clone().negate());
                        mesh.quaternion.copy(normalQuat);

                        // Get two holes from each pattern to establish orientation
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
                    } else if (selectedPoint.userData.attachmentType === 'adxl') {
                        // Use standard alignment for secondary attachments
                        const normalQuat = new THREE.Quaternion();
                        normalQuat.setFromUnitVectors(attachNormal, baseNormal.clone().negate());
                        mesh.quaternion.copy(normalQuat);
                    } else {
                        console.log('🚨🚨🚨 USING BACKUP ALIGMNMENT');
                        // First align the mount face normals
                        const normalQuat = new THREE.Quaternion();
                        normalQuat.setFromUnitVectors(attachNormal, baseNormal.clone().negate());
                        mesh.quaternion.copy(normalQuat);

                        // Then align orientation after normal alignment
                        const orientQuat = new THREE.Quaternion();
                        const rotatedAttachOrientation = attachOrientation.clone().applyQuaternion(normalQuat);
                        orientQuat.setFromUnitVectors(rotatedAttachOrientation, baseOrientation);
                        mesh.quaternion.premultiply(orientQuat);
                    }
                    
                    // Position based on pattern centers
                    const transformedAttachCenter = attachCenter.clone().applyQuaternion(mesh.quaternion);
                    const offset = baseCenter.clone().sub(transformedAttachCenter);
                    const offsetAmount = (selectedPoint.userData.attachmentType === 'hotend') ? -2 : 0;
                    const normalOffset = baseNormal.clone().multiplyScalar(offsetAmount);
                    mesh.position.copy(offset.add(normalOffset));


                }
            }

            // Add to appropriate parent
            const parentModel = selectedPoint.userData.parentModel || mainModel;
            console.log("Attaching to parent:", {
                isSecondary: !!selectedPoint.userData.parentModel,
                parentModel: parentModel,
                parentInScene: mainModel.getObjectById(parentModel.id) !== undefined,
                pointData: selectedPoint.userData
            });
            parentModel.add(mesh);
            attachedModels.set(selectedPoint, mesh);
            selectedPoint.visible = false;

            // Add position control arrows for part cooling
            if (selectedPoint.userData.attachmentType === 'partcooling') {
                const positionArrows = createPositionArrows(mesh);
                mesh.userData.positionControls = positionArrows;
                positionArrows.forEach(arrow => mainModel.add(arrow));
            }

            // Create secondary attachment points if applicable
            const menuConfig = categoryMenus[selectedPoint.userData.attachmentType];
            
            // Create points if this isn't a secondary attachment OR if it's a riser
            // When creating secondary attachment points, pass the original type
            if (!menuConfig?.parentType || isRiser) {
                createSecondaryAttachmentPoints(mesh, originalType).then(() => {
                    resetUIState();
                    renderer.render(scene, camera);
                });
            } else {
                // Reset UI immediately if no secondary points needed
                const dropdown = document.querySelector('.dropdown');
                if (dropdown) dropdown.value = '';
                document.getElementById('modelSelect').style.display = 'none';
                selectedPoint = null;
                renderer.render(scene, camera);
            }
            // Initial render
            const dropdown = document.querySelector('.dropdown');
            if (dropdown) dropdown.value = '';
            document.getElementById('modelSelect').style.display = 'none';
            selectedPoint = null;

            renderer.render(scene, camera);
        });

    } catch (error) {
        console.error('Error in attachModelAtPoint:', error);
    }
}

function animate() {
    requestAnimationFrame(animate);

    // Update controls if they exist
    if (controls) {
        controls.update();
    }

    // Only render if we have all components
    if (scene && camera && renderer) {
        renderer.render(scene, camera);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
// Add double click handler to remove models
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

            // Remove arrows first
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

                    // Remove child's arrows
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
function findMatchingFaces(baseFace, attachmentFaces, attachmentType) {
    console.log('\n=== Finding Matches Between Faces ===');
    console.log('Base face ID:', baseFace.faceId);
    console.log('Base face holes:', baseFace.holes.length);
    console.log('Current model path:', window.currentAttachmentPath);
    console.log('Attachment type:', attachmentType);

    // Get the original type if it exists
    const originalType = selectedPoint?.userData?.originalType || attachmentType;
    
    // Handle spacers while preserving original type
    if (window.currentAttachmentPath.toLowerCase().includes('riser')) {
        console.log('🚨🚨🚨 SPACER IN FINDMATCHINGFACES');
        // Find first available face with right number of holes
        const attachFace = attachmentFaces.find(face => 
            face.holes?.length === baseFace.holes.length &&
            !isHolePatternUsed(window.currentAttachmentPath, face));

        if (!attachFace) {
            console.error('No available face found for spacer');
            return null;
        }

        // Set up pattern mapping for tracking
        const patternMapping = {
            baseFaceId: baseFace.faceId,
            attachmentFaceId: attachFace.faceId,
            baseModelPath: selectedPoint?.userData?.parentModel?.userData?.modelPath,
            attachmentModelPath: window.currentAttachmentPath,
            originalType: originalType  // Preserve the original type
        };

        // Mark the patterns as used
        markPatternAsUsed(patternMapping.baseModelPath, { faceId: patternMapping.baseFaceId });
        markPatternAsUsed(patternMapping.attachmentModelPath, { faceId: patternMapping.attachmentFaceId });

        // For spacers, don't bother with complex transforms - just copy parent and flip
        attachFace.bestTransform = {
            rotation: new THREE.Quaternion(),  // Will be ignored, parent transform used instead
            score: 1.0
        };

        attachFace.patternMapping = patternMapping;
        return attachFace;
    }

    // Original face matching logic for all other types
    let bestMatch = null;
    let maxScore = 0;
    let bestTransform = null;

    const availableFaces = attachmentFaces.filter(face =>
        !isHolePatternUsed(window.currentAttachmentPath, face));

    const isRiser = window.currentAttachmentPath.toLowerCase().includes('riser');

    for (const attachFace of availableFaces) {
        const rotations = [
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: Math.PI / 2 },
            { x: 0, y: 0, z: Math.PI },
            { x: 0, y: 0, z: -Math.PI / 2 }
        ];

        for (const rotation of rotations) {
            const tempQuat = new THREE.Quaternion();
            tempQuat.setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z));

            const rotatedHoles = attachFace.holes.map(hole => {
                const pos = new THREE.Vector3(hole.position.x, hole.position.y, hole.position.z);
                pos.applyQuaternion(tempQuat);
                return {
                    ...hole,
                    position: {
                        x: pos.x,
                        y: pos.y,
                        z: pos.z
                    }
                };
            });

            const rotatedFace = {
                ...attachFace,
                holes: rotatedHoles
            };

            const score = compareHolePatterns(baseFace, rotatedFace, isRiser);
            if (score > maxScore) {
                maxScore = score;
                bestMatch = attachFace;
                bestTransform = {
                    rotation: tempQuat,
                    score: score
                };
            }
        }
    }

    if (bestMatch && bestTransform && maxScore > 0.6) {
        bestMatch.bestTransform = bestTransform;
        bestMatch.patternMapping = {
            baseFaceId: baseFace.faceId,
            attachmentFaceId: bestMatch.faceId,
            baseModelPath: selectedPoint?.userData?.parentModel?.userData?.modelPath || 'heromedir/base/UniversalBase.stl',
            attachmentModelPath: window.currentAttachmentPath,
            originalType: originalType  // Preserve the original type
        };

        markPatternAsUsed(bestMatch.patternMapping.baseModelPath, { faceId: bestMatch.patternMapping.baseFaceId });
        markPatternAsUsed(bestMatch.patternMapping.attachmentModelPath, { faceId: bestMatch.patternMapping.attachmentFaceId });

        return bestMatch;
    }

    return null;
}

function compareSlideFaceGroups(group1, group2, orientQuat1, orientQuat2) {
    if (!group1.faces || !group2.faces) {
        console.log('Missing faces in one or both groups');
        return 0;
    }

    if (group1.faces.length !== group2.faces.length) {
        console.log('Different number of faces:', group1.faces.length, 'vs', group2.faces.length);
        return 0;
    }

    // Compare distances between faces
    if (group1.distances && group2.distances) {
        // Both groups should have same number of distances
        if (group1.distances.length !== group2.distances.length) {
            console.log('Different number of distances');
            return 0;
        }

        let distanceScore = 0;
        const tolerance = 2; // 2mm tolerance

        // Compare each distance
        group1.distances.forEach(dist1 => {
            const matchingDist = group2.distances.find(dist2 =>
                Math.abs(dist1.distance - dist2.distance) < tolerance
            );
            if (matchingDist) {
                distanceScore += 1;
            }
            console.log(`Distance comparison: ${dist1.distance} vs ${matchingDist?.distance}`);
        });

        const score = distanceScore / group1.distances.length;
        console.log('Distance match score:', score);
        return score;
    }

    console.log('Missing distances in one or both groups');
    return 0;
}
function createPositionArrows(attachedModel) {
    const arrowGeometry = new THREE.CylinderGeometry(2, 0, 8, 16);
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
        upArrow.rotation.x = -Math.PI / 2;
        downArrow.rotation.x = Math.PI / 2;

        // Wider spacing for probe arrows
        upArrow.position.set(0, 0, 25);
        downArrow.position.set(0, 0, -25);
    } else {
        // Part cooling positioning
        upArrow.rotation.x = -Math.PI / 2;
        downArrow.rotation.x = Math.PI / 2;

        // Calculate center of the duct using bounding box
        const bbox = new THREE.Box3().setFromObject(attachedModel);
        const center = bbox.getCenter(new THREE.Vector3());

        // Position arrows with backward offset and wider spacing
        upArrow.position.copy(center);
        downArrow.position.copy(center);

        // Base position: backward 30mm in Y, down 20mm in Z, then spread from there
        upArrow.position.y -= 30;
        downArrow.position.y -= 30;
        upArrow.position.z -= 20;      // Move down
        downArrow.position.z -= 20;    // Move down

        // Then add the up/down spread
        upArrow.position.z += 35;      // Spread up from base position
        downArrow.position.z -= 35;    // Spread down from base position
    }

    // Store original positions
    upArrow.userData.originalPosition = upArrow.position.clone();
    downArrow.userData.originalPosition = downArrow.position.clone();

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

    attachedModel.add(upArrow);
    attachedModel.add(downArrow);

    return [upArrow, downArrow];
}
function onMouseDown(event) {
    if (event.target.closest('#modelSelect')) return;

    raycaster.setFromCamera(mouse, camera);
    isMouseDown = true;

    const allArrows = [];
    attachedModels.forEach(model => {
        if (model.userData.positionControls) {
            allArrows.push(...model.userData.positionControls);
        }
    });

    const intersects = raycaster.intersectObjects(allArrows)
        .filter(hit => hit.object.userData.type === 'positionControl');

    if (intersects.length > 0) {
        selectedArrow = intersects[0].object;
        controls.enabled = false;
        isMovingPart = true;

        if (moveInterval) {
            moveInterval = setInterval(() => {
                if (selectedArrow) {
                    const model = selectedArrow.userData.targetModel;
                    const moveAxis = model.userData.moveAxis.clone();
                    moveAxis.applyQuaternion(model.quaternion);

                    const moveVector = moveAxis.multiplyScalar(selectedArrow.userData.moveAmount);
                    model.position.add(moveVector);
                }
            }, 16);
        }
    }
}

function onMouseUp(event) {
    controls.enabled = true;
    isMovingPart = false;
    selectedArrow = null;

    if (moveInterval) {
        clearInterval(moveInterval);
        moveInterval = null;
    }
}
// Function to mark a pattern as used
function markPatternAsUsed(modelPath, pattern) {
    if (pattern.faceId !== undefined) {
        // For hole patterns
        if (!usedHolePatterns.has(modelPath)) {
            usedHolePatterns.set(modelPath, new Set());
        }
        usedHolePatterns.get(modelPath).add(pattern.faceId);
        console.log(`Marked hole pattern ${pattern.faceId} as used for model ${modelPath}`);
    } else if (pattern.groupIndex !== undefined) {
        // For slide faces
        if (!usedPatterns.has(modelPath)) {
            usedPatterns.set(modelPath, { holes: new Set(), slides: new Set() });
        }
        usedPatterns.get(modelPath).slides.add(pattern.groupIndex);
        console.log(`Marked slide face group ${pattern.groupIndex} as used for model ${modelPath}`);
    }
    debugPatternTracking();
}
// Function to check if a hole pattern is already used
function isPatternUsed(modelPath, pattern) {
    if (!usedPatterns.has(modelPath)) return false;

    const modelPatterns = usedPatterns.get(modelPath);

    if (pattern.faceId !== undefined) {
        const isUsed = usedHolePatterns.has(modelPath) &&
            usedHolePatterns.get(modelPath).has(pattern.faceId);
        console.log(`Checking if face ${pattern.faceId} is used for model ${modelPath}: ${isUsed}`);
        return isUsed;
    } else if (pattern.groupIndex !== undefined) {
        const isUsed = modelPatterns.slides.has(pattern.groupIndex);
        console.log(`Checking if slide face group ${pattern.groupIndex} is used for model ${modelPath}: ${isUsed}`);
        return isUsed;
    }

    return false;
}
// Function to reset used patterns for a model
function resetPatterns(modelPath, isParent = false) {
    console.log(`Resetting patterns for model ${modelPath} (isParent: ${isParent})`);

    // Always clear direct patterns
    usedHolePatterns.delete(modelPath);
    usedPatterns.delete(modelPath);

    // For parent models, also clear patterns of all child models
    if (isParent) {
        attachedModels.forEach((model, point) => {
            if (point.userData.parentModel?.userData?.modelPath === modelPath) {
                console.log('Clearing child patterns for:', model.userData.modelPath);
                usedHolePatterns.delete(model.userData.modelPath);
                usedPatterns.delete(model.userData.modelPath);
            }
        });
    }

    debugPatternTracking();
}
// Function to get all used patterns for a model
function getUsedPatterns(modelPath) {
    return usedHolePatterns.get(modelPath) || new Set();
}
// Debugs Pattern Tracking for secondary nodes
function debugPatternTracking() {
    console.log('\n=== Pattern Tracking Debug ===');
    console.log('Current pattern tracking state:');

    // Only show usedPatterns Map for slide faces
    usedPatterns.forEach((patterns, modelPath) => {
        if (patterns.slides.size > 0) {  // Only show if there are slide faces used
            console.log(`\nModel: ${modelPath}`);
            console.log('Used slide faces:', Array.from(patterns.slides));
        }
    });

    // Only show usedHolePatterns Map for face IDs
    usedHolePatterns.forEach((patterns, modelPath) => {
        if (patterns.size > 0) {  // Only show if there are holes used
            console.log(`\nModel: ${modelPath}`);
            console.log('Used Hole Groups:', Array.from(patterns));
        }
    });
    console.log('========================\n');
}
// Helper function for finding matching slide faces with pattern tracking
function findMatchingSlideFaces(baseFaces, attachmentFaces, baseOrientation, attachOrientation, isRightSide = false) {
    console.log('Finding matching slide faces');

    const isDualSided = attachmentFaces.length > 1;
    console.log(`Attachment is ${isDualSided ? 'dual-sided' : 'single-sided'}`);

    // Filter out used slide faces
    const availableBaseFaces = baseFaces.filter((group, index) =>
        !isPatternUsed('heromedir/base/UniversalBase.stl', { groupIndex: index })
    );

    const availableAttachFaces = attachmentFaces.filter((group, index) =>
        !isPatternUsed(window.currentAttachmentPath, { groupIndex: index })
    );

    console.log('Available base slide faces:', availableBaseFaces.length);
    console.log('Available attachment slide faces:', availableAttachFaces.length);

    // Get the appropriate groups based on side
    let targetBaseGroup = isRightSide ? availableBaseFaces[1] : availableBaseFaces[0];
    const targetAttachGroup = availableAttachFaces[0];

    if (!targetBaseGroup || !targetAttachGroup) {
        console.log('No available slide faces found');
        return null;
    }

    const upVector = new THREE.Vector3(0, 1, 0);
    const baseOrientQuat = new THREE.Quaternion().setFromUnitVectors(baseOrientation, upVector);
    const attachOrientQuat = new THREE.Quaternion().setFromUnitVectors(attachOrientation, upVector);

    const score = compareSlideFaceGroups(targetBaseGroup, targetAttachGroup);
    console.log('Match score:', score);

    if (score > 0.6) {
        // Mark slide faces as used if we found a match
        const baseGroupIndex = isRightSide ? 1 : 0;
        markPatternAsUsed('heromedir/base/UniversalBase.stl', { groupIndex: baseGroupIndex });
        markPatternAsUsed(window.currentAttachmentPath, { groupIndex: 0 });

        return {
            baseGroup: targetBaseGroup,
            attachGroup: targetAttachGroup,
            baseOrientQuat,
            attachOrientQuat,
            score,
            isRightSide
        };
    }

    return null;
}

// Function to check if a hole pattern is already used
function isHolePatternUsed(modelPath, face) {
    const isUsed = usedHolePatterns.has(modelPath) &&
        usedHolePatterns.get(modelPath).has(face.faceId);
    console.log(`Checking if face ${face.faceId} is used for model ${modelPath}: ${isUsed}`);
    return isUsed;
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

    // Apply parent model's transform
    mesh.position.applyMatrix4(parentModel.matrixWorld);
    const parentQuat = new THREE.Quaternion();
    parentModel.getWorldQuaternion(parentQuat);
    mesh.quaternion.premultiply(parentQuat);
}
function resetUIState() {
    const dropdown = document.querySelector('.dropdown');
    if (dropdown) dropdown.value = '';
    document.getElementById('modelSelect').style.display = 'none';
    selectedPoint = null;
}
function cleanupOrphanedPatterns() {
    const activeModelPaths = new Set();

    // Collect all active model paths
    mainModel.traverse((obj) => {
        if (obj.userData?.modelPath) {
            activeModelPaths.add(obj.userData.modelPath);
        }
    });

    console.log('Active models:', Array.from(activeModelPaths));

    // Clean up hole patterns
    for (const [modelPath] of usedHolePatterns) {
        if (!activeModelPaths.has(modelPath)) {
            console.log('Cleaning up hole patterns for:', modelPath);
            usedHolePatterns.delete(modelPath);
        }
    }

    // Clean up slide patterns
    for (const [modelPath] of usedPatterns) {
        if (!activeModelPaths.has(modelPath)) {
            console.log('Cleaning up slide patterns for:', modelPath);
            usedPatterns.delete(modelPath);
        }
    }

    // Clean up attachedModels references
    for (const [point, model] of attachedModels) {
        if (!activeModelPaths.has(model.userData.modelPath)) {
            console.log('Cleaning up attachedModels entry for:', model.userData.modelPath);
            attachedModels.delete(point);
            point.visible = true;
        }
    }
}
// Function to filter directory contents based on menu configuration
function filterContents(contents, userData) {
    if (!contents) return [];

    console.log('=== Filter Debug Info ===');
    console.log('Filtering with userData:', userData);
    console.log('Selected point userData:', selectedPoint?.userData);
    console.log('Menu type:', selectedPoint?.userData?.attachmentType);

    return contents.filter(item => {
        // If it's a directory, always include it
        if (item.type === 'directory') {
            console.log('Directory, including:', item.name);
            return true;
        }

        // Filter out non-STL files
        if (!item.name.toLowerCase().endsWith('.stl')) {
            console.log('Not an STL, excluding:', item.name);
            return false;
        }

        // Get menu configuration for the current type
        const menu = categoryMenus[selectedPoint?.userData?.attachmentType];
        if (!menu?.filter) {
            console.log('No filter defined, including:', item.name);
            return true;
        }

        // Debug each filter call
        const filterResult = menu.filter(item, userData);
        console.log(`Filtering ${item.name} - Result:`, filterResult);
        console.log('Used criteria:', {
            isRightSide: userData?.attachmentName?.includes('opposite'),
            name: item.name.toLowerCase()
        });
        return filterResult;
    });
}
init();