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
                    return !name.includes('left');
                } else {
                    return !name.includes('right');
                }
            }
            return true; // Show all folders
        }
    },
    wing: {
        title: "Wings",
        paths: ["heromedir/ablmounts"],
        filter: (item, userData) => {
            const name = item.name.toLowerCase();
            const excludedTerms = ['mount', 'spacer'];
            const isRightSide = userData?.attachmentName?.includes('opposite');
            
            if (item.type === 'file') {
                if (!name.endsWith('.stl') || excludedTerms.some(term => name.includes(term))) {
                    return false;
                }
                // Filter by side for STL files
                if (isRightSide) {
                    return name.includes('right');
                } else {
                    return name.includes('left');
                }
            }
            // For directories, just filter out excluded terms
            return !excludedTerms.some(term => name.includes(term));
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
        parentType: 'skirt' // Only attach to skirts
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
        title: "Direct Drive Mounts",
        paths: ["heromedir/directdrivemounts"],
        parentType: 'hotend' // Only attach to hotend mounts
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
    'directdrive': 0xdfe081 // Pastellow
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
function findMatchingFaces(baseFace, attachmentFaces, attachmentType) {
    console.log('\n=== Finding Matches Between Faces ===');
    console.log('Base face ID:', baseFace.faceId);
    console.log('Base face holes:', baseFace.holes.length);
    console.log('Available attachment faces:', attachmentFaces.map(face => ({
        id: face.faceId,
        holes: face.holes.length
    })));
    console.log('Attachment type:', attachmentType);
    console.log('Current model path:', window.currentAttachmentPath);
    debugPatternTracking();
    let bestMatch = null;
    let maxScore = 0;
    let bestTransform = null;

    // For gantries, prioritize 4-hole faces
    const facesToCheck = attachmentType === 'gantry' 
        ? attachmentFaces.filter(face => face.holes.length === 4)
        : attachmentFaces;

    // Filter out already used faces
    const availableFaces = facesToCheck.filter(face => 
        !isHolePatternUsed('currentAttachmentPath', face));
    
        console.log('Faces after filtering used ones:', availableFaces.map(face => ({
            id: face.faceId,
            holes: face.holes.length
        })));
    for (const attachFace of availableFaces) {
        // Try different rotation combinations
        const rotations = [
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: Math.PI / 2 },
            { x: 0, y: 0, z: Math.PI },
            { x: 0, y: 0, z: -Math.PI / 2 },
            { x: Math.PI / 2, y: 0, z: 0 },
            { x: -Math.PI / 2, y: 0, z: 0 },
            { x: 0, y: Math.PI / 2, z: 0 },
            { x: 0, y: -Math.PI / 2, z: 0 }
        ];

        for (const rotation of rotations) {
            // Create temporary quaternion for this rotation
            const tempQuat = new THREE.Quaternion();
            tempQuat.setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z));

            // Rotate the holes for comparison
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

            // Compare patterns with this rotation
            const score = compareHolePatterns(baseFace, rotatedFace);
            console.log(`Rotation (${rotation.x}, ${rotation.y}, ${rotation.z}) score: ${score}`);

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

    // More lenient threshold since we're only looking at distances
    if (bestMatch && bestTransform && maxScore > 0.6) {
        bestMatch.bestTransform = bestTransform;
        console.log('Best match found with score:', maxScore);
        
        // Mark both faces as used - using actual modelPath instead of placeholder
        markPatternAsUsed('heromedir/base/UniversalBase.stl', { faceId: baseFace.faceId });
        markPatternAsUsed(window.currentAttachmentPath || 'unknown', { faceId: bestMatch.faceId });
        return bestMatch;
    }
    return null;
}

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
function compareHolePatterns(face1, face2) {
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

    // First try original order
    const tolerance = 1.0;
    let matchCount = 0;
    for (let i = 0; i < distances1.length; i++) {
        const diff = Math.abs(distances1[i] - distances2[i]);
        console.log(`Distance comparison ${i}: ${distances1[i]} vs ${distances2[i]}, diff: ${diff}`);
        if (diff <= tolerance) {
            matchCount++;
        }
    }
    bestMatchCount = matchCount;

    // Then try rotating/swapping groups of distances
    // For a rectangular pattern, distances will come in pairs
    if (distances1.length === 4) { // For 4-hole rectangular patterns
        const rotatedDistances2 = [distances2[2], distances2[3], distances2[0], distances2[1]];
        matchCount = 0;
        for (let i = 0; i < distances1.length; i++) {
            const diff = Math.abs(distances1[i] - rotatedDistances2[i]);
            console.log(`Rotated comparison ${i}: ${distances1[i]} vs ${rotatedDistances2[i]}, diff: ${diff}`);
            if (diff <= tolerance) {
                matchCount++;
            }
        }
        if (matchCount > bestMatchCount) {
            bestMatchCount = matchCount;
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
function visualizeHoles(geometryData, parentMesh) {
    // Array of distinct colors for different faces
    const colors = [
        0xff0000, // red
        0x00ff00, // green
        0x0000ff, // blue
        0xff00ff, // magenta
        0xffff00, // yellow
        0x00ffff, // cyan
        0xff8000, // orange
        0x8000ff, // purple
        0x0080ff, // light blue
        0xff0080  // pink
    ];

    const holeGeometry = new THREE.CylinderGeometry(2, 2, 10, 16);

    geometryData.faces.forEach((face, faceIndex) => {
        // Create a material with unique color for this face
        const holeMaterial = new THREE.MeshPhongMaterial({
            color: colors[faceIndex % colors.length],
            transparent: true,
            opacity: 0.6
        });

        console.log(`Face ${faceIndex}:`);
        console.log('Normal:', face.normal);
        console.log('Number of holes:', face.holes.length);

        face.holes.forEach(hole => {
            const holeMesh = new THREE.Mesh(holeGeometry, holeMaterial);

            // Position the hole
            holeMesh.position.set(
                hole.position.x,
                hole.position.y,
                hole.position.z
            );

            // Only do the normal alignment, no extra rotation
            const normal = new THREE.Vector3(face.normal.x, face.normal.y, face.normal.z);
            holeMesh.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                normal
            );

            // Store metadata
            holeMesh.userData.holeData = hole;
            holeMesh.userData.faceData = face;
            holeMesh.userData.groupIndex = faceIndex;

            parentMesh.add(holeMesh);

            // Log hole position
            console.log('Hole position:', hole.position);
        });

        // Log distances between holes in this group if there are multiple holes
        if (face.holes.length > 1) {
            for (let i = 0; i < face.holes.length; i++) {
                for (let j = i + 1; j < face.holes.length; j++) {
                    const h1 = face.holes[i];
                    const h2 = face.holes[j];
                    const distance = Math.sqrt(
                        Math.pow(h1.position.x - h2.position.x, 2) +
                        Math.pow(h1.position.y - h2.position.y, 2) +
                        Math.pow(h1.position.z - h2.position.z, 2)
                    );
                    console.log(`Distance between hole ${i} and ${j}: ${distance.toFixed(2)}mm`);
                }
            }
        }
        console.log('-------------------');
    });
}
function visualizeSlideFaces(geometryData, parentMesh) {
    if (!geometryData.slideFaces || !Array.isArray(geometryData.slideFaces)) {
        console.log('No slide faces found in geometry data');
        return;
    }

    const slideMaterial = new THREE.MeshPhongMaterial({
        color: 0xff4400,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        emissive: 0x331100,
        emissiveIntensity: 0.3
    });

    geometryData.slideFaces.forEach((group, groupIndex) => {
        console.log(`Processing slide face group ${groupIndex + 1}`);

        group.faces.forEach((face, faceIndex) => {
            console.log(`Face ${faceIndex} dimensions:`, face.dimensions);
            console.log(`Face ${faceIndex} position:`, face.position);
            console.log(`Face ${faceIndex} rotation:`, face.rotation);

            const planeGeometry = new THREE.PlaneGeometry(
                face.dimensions.width,
                face.dimensions.height
            );

            // Center the geometry on its origin point
            planeGeometry.translate(
                face.dimensions.center2D.x,
                face.dimensions.center2D.y,
                0
            );

            const slideMesh = new THREE.Mesh(planeGeometry, slideMaterial.clone());

            // Position the face
            slideMesh.position.set(
                face.position.x,
                face.position.y,
                face.position.z
            );
            // Create a small offset vector based on the face normal
            const offsetDistance = 0.1; // 0.1mm offset
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
            // Apply rotation in degrees to radians
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

            parentMesh.add(slideMesh);

            console.log(`Added slide face ${faceIndex} to group ${groupIndex}`);
            console.log('Final mesh position:', slideMesh.position);
            console.log('Final mesh rotation:', slideMesh.rotation);
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
function findDirectoryByPath(path, structure) {
    const normalizedSearchPath = normalizePath(path);
    
    function search(items) {
        if (!items) return null;
        
        for (const item of items) {
            const normalizedItemPath = normalizePath(item.path);
            
            if (item.type === 'directory') {
                if (normalizedItemPath === normalizedSearchPath) {
                    return item.children;
                }
                
                const found = search(item.children);
                if (found) return found;
            }
        }
        return null;
    }
    
    return search(structure);
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
    
    // Add directories first
    const directories = current.folder.filter(item => item.type === 'directory');
    directories.forEach(dir => {
        const fullPath = `${current.basePath}/${dir.name}`.replace(/^\/+/, '');
        const folderId = createFolderId(fullPath);
        
        menuState.set(folderId, {
            folder: dir.children,
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
    const files = current.folder.filter(item => 
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
    
    currentMenuPath.push(folderData);
    const menuElement = document.getElementById('modelSelect');
    updateMenuContent(menuElement);
    menuElement.style.display = 'block'; // Ensure menu stays visible
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

    // First, find specific patterns we want to match
    const findFaceByCharacteristics = (characteristics) => {
        return geometryData.faces.find(face => {
            if (assignedFaces.has(face)) return false;
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

        assignedFaces.add(face);
        
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
            createPoint(oppositeCenter, oppositeNormal, '_opposite');
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
    console.log('Creating menu for type:', type);
    
    menuState.clear();
    const menu = categoryMenus[type];
    if (!menu) return '';
    
    // Recursive function to filter directory contents
    const filterContents = (directory, userData) => {
        if (!directory) return [];
        
        return directory.map(item => {
            if (item.type === 'directory' && item.children) {
                return {
                    ...item,
                    children: filterContents(item.children, userData)
                };
            }
            return item;
        }).filter(item => menu.filter ? menu.filter(item, userData) : true);
    };
    
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
    // If clicking inside the menu, handle menu-specific logic
    const menuElement = document.getElementById('modelSelect');
    if (event.target.closest('#modelSelect')) {
        if (event.target.closest('.menu-item') || event.target.closest('.back-button')) {
            event.preventDefault();
            event.stopPropagation();
        }
        return;
    }

    // Update raycaster
    raycaster.setFromCamera(mouse, camera);

    // Check for arrow intersections first
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
        
        // Single step movement
        const newZ = model.position.z + moveAmount;
        
        if (newZ >= model.userData.minZ && newZ <= model.userData.initialZ) {
            model.position.z = newZ;
            
            // Update arrow positions correctly based on model position
            model.userData.positionControls.forEach(control => {
                // Calculate offset based on which arrow it is
                const offset = control.userData.direction === 'up' ? 10 : -10;
                control.position.copy(model.position);
                control.position.z += offset;
            });
        }

        event.preventDefault();
        event.stopPropagation();
        return;
    }

    // Check for attachment point clicks
    const intersects = raycaster.intersectObjects(attachmentPoints, true);

    if (intersects.length > 0) {
        selectedPoint = intersects[0].object;
        menuElement.innerHTML = await createDropdownForType(selectedPoint.userData.attachmentType);
        menuElement.style.display = 'block';
        
        // Position menu near cursor with smart viewport positioning
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
function alignMountType(mesh, attachmentType, baseNormal, baseVec, attachNormal, attachVec) {
    switch (attachmentType) {
        case 'wing':
            // First align faces
            const normalQuat = new THREE.Quaternion().setFromUnitVectors(attachNormal, baseNormal.clone().negate());
            mesh.quaternion.copy(normalQuat);

            // Get world vectors after face alignment
            const rightVec = new THREE.Vector3(1, 0, 0);
            const upVec = new THREE.Vector3(0, 1, 0);

            // Create rotation to align wing along X axis with Y up
            const wingQuat = new THREE.Quaternion();
            const rotatedUp = upVec.clone().applyQuaternion(mesh.quaternion);
            const rotatedRight = rightVec.clone().applyQuaternion(mesh.quaternion);

            const correctionQuat = new THREE.Quaternion().setFromUnitVectors(
                rotatedRight,
                rightVec
            );
            mesh.quaternion.premultiply(correctionQuat);
            break;

        case 'hotend':
            // Start by pointing down (-Y)
            const downQuat = new THREE.Quaternion().setFromUnitVectors(
                attachNormal,
                new THREE.Vector3(0, -1, 0)
            );
            mesh.quaternion.copy(downQuat);

            // Get the rotated hole vector
            const rotatedAttachVec = attachVec.clone().applyQuaternion(downQuat);
            const rotatedBaseVec = baseVec.clone();

            // Calculate angle between hole vectors on XZ plane
            const angleQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, -1, 0),
                Math.atan2(
                    rotatedBaseVec.z * rotatedAttachVec.x - rotatedBaseVec.x * rotatedAttachVec.z,
                    rotatedBaseVec.x * rotatedAttachVec.x + rotatedBaseVec.z * rotatedAttachVec.z
                )
            );
            mesh.quaternion.premultiply(angleQuat);
            break;

        case 'fanguard':
            // First align mounting faces
            const fanNormalQuat = new THREE.Quaternion().setFromUnitVectors(attachNormal, baseNormal);
            mesh.quaternion.copy(fanNormalQuat);

            // Add 180° rotation around the base normal
            const rotationQuat = new THREE.Quaternion().setFromAxisAngle(baseNormal, Math.PI);
            mesh.quaternion.premultiply(rotationQuat);

            // Add alignment to keep fan guard vertical
            const upVector = new THREE.Vector3(0, 1, 0);
            const currentUp = upVector.clone().applyQuaternion(mesh.quaternion);
            const alignQuat = new THREE.Quaternion();
            alignQuat.setFromUnitVectors(currentUp, upVector);
            mesh.quaternion.premultiply(alignQuat);
            break;

        default:
            const defaultQuat = new THREE.Quaternion().setFromUnitVectors(attachNormal, baseNormal.clone().negate());
            mesh.quaternion.copy(defaultQuat);
            break;
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
                resetUsedPatterns(oldModel.userData.modelPath);
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
        loader.load(modelPath, function(geometry) {
            const material = new THREE.MeshPhongMaterial({
                color: partColors[selectedPoint.userData.attachmentType] || 0xff0000,
                flatShading: false,
                transparent: true, 
                opacity: 1
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData.modelPath = modelPath;
            mesh.userData.attachmentType = selectedPoint.userData.attachmentType;
            mesh.userData.usedPatterns = {
                holes: new Set([...getUsedPatterns(baseModelPath)]),
                slides: new Set([...(usedPatterns.get(baseModelPath)?.slides || [])])
            };

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
             
                        // Check if right side needs 180° rotation
                        if (isRightSide) {
                            const angle = attachNormal.angleTo(baseNormal);
                            if (angle < Math.PI/2) {
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

                window.currentAttachmentPath = modelPath;
                const matchingFace = findMatchingFaces(closestFace, attachGeometryData.faces, selectedPoint.userData.attachmentType);
                if (!matchingFace) {
                    console.error('No matching face pattern found');
                    return;
                }

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
                        selectedPoint.userData.attachmentType === 'directdrive') {
                        const normalQuat = new THREE.Quaternion();
                        normalQuat.setFromUnitVectors(attachNormal, baseNormal.clone().negate());
                        mesh.quaternion.copy(normalQuat);
                        if (selectedPoint.userData.attachmentType === 'directdrive') {
                            const rotateQuat = new THREE.Quaternion().setFromAxisAngle(baseNormal, Math.PI);
                            mesh.quaternion.premultiply(rotateQuat);
                        }
                        const rotatedOrientation = attachOrientation.clone().applyQuaternion(normalQuat);
                        if (rotatedOrientation.y < 0) {
                            const flipQuat = new THREE.Quaternion().setFromAxisAngle(baseNormal, Math.PI);
                            mesh.quaternion.premultiply(flipQuat);
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
                    } else if (selectedPoint.userData.attachmentType === 'gantry' || 
                             selectedPoint.userData.attachmentType === 'gantryclip') {
                        const normalQuat = new THREE.Quaternion().setFromUnitVectors(attachNormal, baseNormal.clone().negate());
                        mesh.quaternion.copy(normalQuat);

                        const rotatedOrientation = attachOrientation.clone().applyQuaternion(mesh.quaternion);
                        const dotX = Math.abs(rotatedOrientation.x);
                        const dotY = Math.abs(rotatedOrientation.y);
                        const dotZ = Math.abs(rotatedOrientation.z);

                        if (dotX > dotY && dotX > dotZ) {
                            const rotQuat = new THREE.Quaternion().setFromAxisAngle(
                                baseNormal,
                                rotatedOrientation.x > 0 ? -Math.PI/2 : Math.PI/2
                            );
                            mesh.quaternion.premultiply(rotQuat);
                        }
                    } else if (selectedPoint.userData.attachmentType === 'probe' || 
                             selectedPoint.userData.attachmentType === 'adxl') {
                        // Use standard alignment for secondary attachments
                        const normalQuat = new THREE.Quaternion();
                        normalQuat.setFromUnitVectors(attachNormal, baseNormal.clone().negate());
                        mesh.quaternion.copy(normalQuat);
                    } else {
                        const orientQuat = new THREE.Quaternion();
                        orientQuat.setFromUnitVectors(attachOrientation, baseOrientation);
                        const normalQuat = new THREE.Quaternion();
                        normalQuat.setFromUnitVectors(attachNormal, baseNormal.clone().negate());
                        const finalQuat = normalQuat.multiply(orientQuat);
                        mesh.quaternion.copy(finalQuat);
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
            if (!menuConfig?.parentType) {  // Only create points if this isn't already a secondary attachment
                createSecondaryAttachmentPoints(mesh).then(() => {
                    // Reset UI after points are created
                    const dropdown = document.querySelector('.dropdown');
                    if (dropdown) dropdown.value = '';
                    document.getElementById('modelSelect').style.display = 'none';
                    selectedPoint = null;
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
    
    // Check for arrow intersections first
    const allArrows = [];
    attachedModels.forEach(model => {
        if (model.userData.positionControls) {
            allArrows.push(...model.userData.positionControls);
        }
    });

    // If we hit an arrow, don't process the double click
    const arrowIntersects = raycaster.intersectObjects(allArrows)
        .filter(hit => hit.object.userData.type === 'positionControl');
    if (arrowIntersects.length > 0) {
        return;
    }
    
    // Original model removal logic
    const attachedModelArray = Array.from(attachedModels.values());
    const intersects = raycaster.intersectObjects(attachedModelArray, true);

    if (intersects.length > 0) {
        let targetMesh = intersects[0].object;
        while (targetMesh.parent && targetMesh.parent !== mainModel) {
            targetMesh = targetMesh.parent;
        }

        for (let [point, model] of attachedModels) {
            if (model === targetMesh) {
                point.visible = true;
                mainModel.remove(model);
                if (model.userData.positionControls) {
                    model.userData.positionControls.forEach(arrow => {
                        mainModel.remove(arrow);
                    });
                }

                // Clear corresponding patterns
                if (model.userData.usedHoles) {
                    const baseHolePatterns = usedHolePatterns.get('heromedir/base/UniversalBase.stl');
                    if (baseHolePatterns) {
                        model.userData.usedHoles.forEach(id => baseHolePatterns.delete(id));
                    }
                }
                
                if (model.userData.usedSlides) {
                    const baseSlidePatterns = usedPatterns.get('heromedir/base/UniversalBase.stl');
                    if (baseSlidePatterns?.slides) {
                        model.userData.usedSlides.forEach(id => baseSlidePatterns.slides.delete(id));
                    }
                }

                // Clear model's patterns
                usedHolePatterns.delete(model.userData.modelPath);
                usedPatterns.delete(model.userData.modelPath);

                attachedModels.delete(point);
                break;
            }
        }
    }
}
function findMatchingSlideFaces(baseFaces, attachmentFaces, baseOrientation, attachOrientation, isRightSide = false) {
    console.log('Finding matching slide faces');
    
    // First determine if this is a dual-sided duct by counting groups
    const isDualSided = attachmentFaces.length > 1;
    console.log(`Attachment is ${isDualSided ? 'dual-sided' : 'single-sided'}`);
    
    // Get the appropriate groups based on side
    let targetBaseGroup = isRightSide ? baseFaces[1] : baseFaces[0];
    const targetAttachGroup = attachmentFaces[0]; // Always use first group, we'll mirror if needed
    
    // Orient both models upward first
    const upVector = new THREE.Vector3(0, 1, 0);
    const baseOrientQuat = new THREE.Quaternion().setFromUnitVectors(baseOrientation, upVector);
    const attachOrientQuat = new THREE.Quaternion().setFromUnitVectors(attachOrientation, upVector);

    const score = compareSlideFaceGroups(targetBaseGroup, targetAttachGroup);
    console.log('Match score:', score);

    if (score > 0.6) {
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
        color: 0x00ff00,
        transparent: true,
        opacity: 0.8,
        emissive: 0x00ff00,
        emissiveIntensity: 0.5,
        depthTest: false,
        depthWrite: false
    });

    // Store initial position as max height
    attachedModel.userData.initialZ = attachedModel.position.z;
    attachedModel.userData.minZ = attachedModel.position.z - 8;

    const upArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
    const downArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());

    // Set fixed positions that never change - adding to scene directly
    upArrow.position.set(attachedModel.position.x, attachedModel.position.y, attachedModel.position.z + 50);
    downArrow.position.set(attachedModel.position.x, attachedModel.position.y, attachedModel.position.z - 50);
    
    upArrow.rotation.x = -Math.PI/2;
    downArrow.rotation.x = Math.PI/2;

    upArrow.userData = {
        type: 'positionControl',
        direction: 'up',
        targetModel: attachedModel,
        moveAmount: 0.5
    };

    downArrow.userData = {
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

        if (!moveInterval) {
            moveInterval = setInterval(() => {
                if (selectedArrow) {
                    const model = selectedArrow.userData.targetModel;
                    const newZ = model.position.z + selectedArrow.userData.moveAmount;
                    
                    if (newZ >= model.userData.minZ && newZ <= model.userData.initialZ) {
                        model.position.z = newZ;
                        
                        // Update arrow positions
                        model.userData.positionControls.forEach(arrow => {
                            arrow.position.copy(model.position);
                            if (arrow.userData.direction === 'up') {
                                arrow.position.z += 30;
                            } else {
                                arrow.position.z -= 30;
                            }
                        });
                    }
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
function resetPatterns(modelPath) {
    console.log(`Resetting all patterns for model ${modelPath}`);
    usedHolePatterns.delete(modelPath);
    usedPatterns.delete(modelPath);
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
    const compatibleTypes = Object.entries(categoryMenus)
        .filter(([_, menu]) => menu.parentType === parentType)
        .map(([type, _]) => type);

    if (compatibleTypes.length === 0) return;

    // Filter out faces that are already in use
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
init();