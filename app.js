let scene, camera, renderer, mainModel, controls;
let selectedPoint = null;
let attachmentPoints = [];
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const categoryMenus = {
    hotend: {
        title: "Hotend Mounts",
        folder: "heromedir/hotendmounts/Hotends"
    },
    skirt: {
        title: "Skirts",
        folder: "heromedir/hotendmounts/Skirts"
    },
    fanguard: {
        title: "Fan Guards",
        folder: "heromedir/options/Fan Guards"
    },
    partcooling: {
        title: "Part Cooling",
        folder: "heromedir/partcooling"
    },
    wing: {
        title: "Wings",
        folder: "heromedir/ablmounts/BL Touch-CR Touch-Most Probes Wings"
    },
    gantry: {
        title: "Gantry Adapter",
        folder: "heromedir/gantryadapters"
    }
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
        return await response.json();
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
    console.log('Finding matches between faces');
    let bestMatch = null;
    let maxScore = 0;
    let bestTransform = null;

    // For gantry adapters, filter to only consider 4-hole faces
    const facesToCheck = attachmentType === 'gantry' 
        ? attachmentFaces.filter(face => face.holes.length === 4)
        : attachmentFaces;

    for (const attachFace of facesToCheck) {
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
    if (bestMatch && bestTransform) {
        bestMatch.bestTransform = bestTransform;
        console.log('Best match found with score:', maxScore);
    }

    return maxScore > 0.6 ? bestMatch : null;
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

    // Instead of requiring exact match, find if smaller set is subset of larger
    const smallerSet = face1.holes.length <= face2.holes.length ? face1 : face2;
    const largerSet = face1.holes.length <= face2.holes.length ? face2 : face1;

    // Calculate distances for smaller set
    const smallerDistances = calculateInterHoleDistances(smallerSet.holes);

    // Try to find matching subset in larger set
    for (let i = 0; i < largerSet.holes.length - smallerSet.holes.length + 1; i++) {
        // Take a subset of holes equal to size of smaller set
        const subset = largerSet.holes.slice(i, i + smallerSet.holes.length);
        const subsetDistances = calculateInterHoleDistances(subset);

        // Compare distances with tolerance
        const tolerance = 1.0;
        let matchCount = 0;

        for (let j = 0; j < smallerDistances.length; j++) {
            const diff = Math.abs(smallerDistances[j] - subsetDistances[j]);
            if (diff <= tolerance) {
                matchCount++;
            }
        }

        const score = matchCount / smallerDistances.length;
        if (score > 0.6) {  // Using same threshold
            console.log(`Found matching subset with score: ${score}`);
            return score;
        }
    }

    console.log('No matching subset found');
    return 0;
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
    scene.background = new THREE.Color(0xf0f0f0);

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

    // Add event listeners
    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('click', onMouseClick, false);
    window.addEventListener('mousemove', onMouseMove, false);

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
function loadModel() {
    const loader = new THREE.STLLoader();
    loader.load('heromedir/base/UniversalBase.stl',
        async function (geometry) {
            const material = new THREE.MeshPhongMaterial({
                color: 0x00ff00,
                flatShading: false,
                transparent: true,
                opacity: 0.8
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



function createAttachmentPoints(object) {
    // Scale down the offset and sphere size to match model scale
    const offset = 25.0;  // Reduced from 250.0
    const sphereGeometry = new THREE.SphereGeometry(3.0, 32, 32);  // Reduced from 30.0
    const sphereMaterial = new THREE.MeshPhongMaterial({
        color: 0x800080,
        transparent: true,
        opacity: 0.8,
        emissive: 0x800080,
        emissiveIntensity: 0.5,
        shininess: 50
    });

    const positions = [
        { pos: new THREE.Vector3(0, 0, offset), name: 'top', type: 'hotend' },
        { pos: new THREE.Vector3(0, 0, -offset), name: 'bottom', type: 'skirt' },
        { pos: new THREE.Vector3(0, -offset, 0), name: 'front', type: 'fanguard' },
        { pos: new THREE.Vector3(0, offset, 0), name: 'back', type: 'gantry' },
        { pos: new THREE.Vector3(-offset, 0, -offset / 4), name: 'left_front', type: 'partcooling' },
        { pos: new THREE.Vector3(-offset, 17.5, -offset / 4), name: 'left_back', type: 'wing' },  // Adjusted from 175
        { pos: new THREE.Vector3(offset, 0, -offset / 4), name: 'right_front', type: 'partcooling' },
        { pos: new THREE.Vector3(offset, 17.5, -offset / 4), name: 'right_back', type: 'wing' }   // Adjusted from 175
    ];

    // Remove existing attachment points
    attachmentPoints.forEach(point => object.remove(point));
    attachmentPoints = [];

    // Create new attachment points
    positions.forEach(({ pos, name, type }) => {
        const point = new THREE.Mesh(sphereGeometry, sphereMaterial.clone());
        point.position.copy(pos);
        point.userData.attachmentType = type;
        point.userData.attachmentName = name;
        object.add(point);
        attachmentPoints.push(point);
    });
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
    console.log('Creating dropdown for type:', type);
    const menu = categoryMenus[type];
    if (!menu) {
        console.warn('No menu found for type:', type);
        return '';
    }

    const files = getFilesFromCache(menu.folder);
    console.log('Files for dropdown:', files);

    let html = `<select class="dropdown" onclick="event.stopPropagation();" onchange="attachModelAtPoint(this.value)">
            <option value="">${menu.title}...</option>`;

    files.forEach(file => {
        const fullPath = `${menu.folder}/${file}`;
        html += `<option value="${fullPath}">${file.replace('.stl', '')}</option>`;
    });

    html += '</select>';
    console.log('Generated HTML:', html);
    return html;
}

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(attachmentPoints, true);

    attachmentPoints.forEach(point => {
        point.material.emissiveIntensity = 0.5;
        point.scale.setScalar(1);
    });

    if (intersects.length > 0) {
        const point = intersects[0].object;
        point.material.emissiveIntensity = 1;
        point.scale.setScalar(1.2);
    }
}

async function onMouseClick(event) {
    if (!event.target.closest('#modelSelect')) {
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(attachmentPoints, true);

        if (intersects.length > 0) {
            selectedPoint = intersects[0].object;
            const modelSelect = document.getElementById('modelSelect');
            modelSelect.innerHTML = await createDropdownForType(selectedPoint.userData.attachmentType);
            modelSelect.style.display = 'block';
            modelSelect.style.left = event.clientX + 'px';
            modelSelect.style.top = event.clientY + 'px';
        } else {
            selectedPoint = null;
            document.getElementById('modelSelect').style.display = 'none';
        }
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
        const baseGeometryData = await loadGeometryData('heromedir/base/UniversalBase.stl');
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

        // Find matching faces
        const attachmentPointWorld = new THREE.Vector3();
        selectedPoint.getWorldPosition(attachmentPointWorld);
        const localPoint = attachmentPointWorld.clone()
            .applyMatrix4(mainModel.matrixWorld.clone().invert());

        let closestFace = null;
        let minDistance = Infinity;

        // Modified face selection logic for gantry adapters
        if (selectedPoint.userData.attachmentType === 'gantry') {
            // For gantry, first find faces with 4 holes
            for (const face of baseGeometryData.faces) {
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
            // Original face selection for other types
            for (const face of baseGeometryData.faces) {
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

        const matchingFace = findMatchingFaces(closestFace, attachGeometryData.faces, selectedPoint.userData.attachmentType);

        if (!matchingFace) {
            console.error('No matching face pattern found');
            return;
        }

        const loader = new THREE.STLLoader();
        loader.load(modelPath, function(geometry) {
            const material = new THREE.MeshPhongMaterial({
                color: 0xff0000,
                flatShading: false
            });

            const mesh = new THREE.Mesh(geometry, material);

            // Center the geometry
            geometry.computeBoundingBox();
            const center = geometry.boundingBox.getCenter(new THREE.Vector3());
            geometry.translate(-center.x, -center.y, -center.z);

            const baseHoles = closestFace.holes;
            const attachHoles = matchingFace.holes;

            if (baseHoles.length >= 2 && attachHoles.length >= 2) {
                // Calculate centers of hole patterns
                const baseCenter = calculateHolePatternCenter(baseHoles);
                const attachCenter = calculateHolePatternCenter(attachHoles);

                // Get face normals
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

                if (selectedPoint.userData.attachmentType === 'hotend') {
                    // First align mounting faces and holes
                    const normalQuat = new THREE.Quaternion();
                    normalQuat.setFromUnitVectors(attachNormal, baseNormal.clone().negate());
                    mesh.quaternion.copy(normalQuat);

                    // Check orientation face after hole alignment
                    const rotatedOrientation = attachOrientation.clone().applyQuaternion(normalQuat);

                    // If orientation face isn't pointing up, rotate 180° around base normal
                    if (rotatedOrientation.y < 0) {
                        const flipQuat = new THREE.Quaternion().setFromAxisAngle(baseNormal, Math.PI);
                        mesh.quaternion.premultiply(flipQuat);
                    }
                } else if (selectedPoint.userData.attachmentType === 'fanguard') {
                    // First align orientation faces to point up
                    const orientQuat = new THREE.Quaternion();
                    orientQuat.setFromUnitVectors(attachOrientation, new THREE.Vector3(0, 1, 0));
                    mesh.quaternion.copy(orientQuat);
                
                    // Then align the mounting faces/holes - mirrored
                    const rotatedAttachNormal = attachNormal.clone().applyQuaternion(orientQuat);
                    const normalQuat = new THREE.Quaternion();
                    normalQuat.setFromUnitVectors(rotatedAttachNormal, baseNormal.clone().negate());
                    mesh.quaternion.premultiply(normalQuat);
                
                    // Check if orientation is pointing down after all rotations
                    const finalOrientation = attachOrientation.clone().applyQuaternion(mesh.quaternion);
                    if (finalOrientation.y < 0) {
                        // Add 180° rotation around base normal to flip it up
                        const flipQuat = new THREE.Quaternion().setFromAxisAngle(baseNormal, Math.PI);
                        mesh.quaternion.premultiply(flipQuat);
                    }
                } else if (selectedPoint.userData.attachmentType === 'skirt') {
                    // First do the normal alignment that was working for the mounting holes
                    const normalQuat = new THREE.Quaternion();
                    normalQuat.setFromUnitVectors(attachNormal, baseNormal.clone().negate());
                    mesh.quaternion.copy(normalQuat);
                
                    // Check if orientation is pointing down after alignment
                    const finalOrientation = attachOrientation.clone().applyQuaternion(mesh.quaternion);
                    if (finalOrientation.y < 0) {
                        // Add 180° rotation around base normal to flip it up
                        const flipQuat = new THREE.Quaternion().setFromAxisAngle(baseNormal, Math.PI);
                        mesh.quaternion.premultiply(flipQuat);
                    }
                } else if (selectedPoint.userData.attachmentType === 'gantry') {
                    // Use wing-style alignment for gantry
                    const normalQuat = new THREE.Quaternion().setFromUnitVectors(attachNormal, baseNormal.clone().negate());
                    mesh.quaternion.copy(normalQuat);

                    const rightVec = new THREE.Vector3(1, 0, 0);
                    const upVec = new THREE.Vector3(0, 1, 0);

                    const rotatedUp = upVec.clone().applyQuaternion(mesh.quaternion);
                    const rotatedRight = rightVec.clone().applyQuaternion(mesh.quaternion);

                    const correctionQuat = new THREE.Quaternion().setFromUnitVectors(
                        rotatedRight,
                        rightVec
                    );
                    mesh.quaternion.premultiply(correctionQuat);

                    // Check if orientation needs to be flipped
                    const finalOrientation = attachOrientation.clone().applyQuaternion(mesh.quaternion);
                    if (finalOrientation.y < 0) {
                        const flipQuat = new THREE.Quaternion().setFromAxisAngle(baseNormal, Math.PI);
                        mesh.quaternion.premultiply(flipQuat);
                    }
                } else {
                    // Original alignment logic for other parts
                    const orientQuat = new THREE.Quaternion();
                    orientQuat.setFromUnitVectors(attachOrientation, baseOrientation);

                    const normalQuat = new THREE.Quaternion();
                    normalQuat.setFromUnitVectors(attachNormal, baseNormal.clone().negate());

                    const finalQuat = normalQuat.multiply(orientQuat);
                    mesh.quaternion.copy(finalQuat);
                }

                // Transform attachment center by our rotation
                const transformedAttachCenter = attachCenter.clone().applyQuaternion(mesh.quaternion);

                // Position based on pattern centers
                const offset = baseCenter.clone().sub(transformedAttachCenter);
                
                // Add offset to prevent intersection
                const offsetAmount = selectedPoint.userData.attachmentType === 'hotend' ? 5 : 2;
                const normalOffset = baseNormal.clone().multiplyScalar(offsetAmount);
                mesh.position.copy(offset.add(normalOffset));
            }

            mainModel.add(mesh);

            // Reset UI
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

    if (controls) {
        controls.update();
    }

    if (scene && camera && renderer) {
        renderer.render(scene, camera);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

init();