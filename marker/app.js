let scene, camera, renderer, controls;
let model = null;
let detectedCircles = [];
let raycaster, mouse;
let hoverMarker = null;
let hoveredPoint = null;
let topFaceIndex = null;
let topFaceSelectionMode = false;    // Replace existing selectionMode with this
let frontFaceSelectionMode = false;
let highlightedFace = null;
let topFaceNormal = null;
let topFacePoint = null;
let topFaceHighlight = null;
let slideFacesMode = false;
let slideFaces = [];  // Just a simple array of faces
let currentSlideGroup = null;
let slideFaceHighlights = [];
let frontFaceIndex = null;
let frontFaceNormal = null;
let frontFacePoint = null;
let frontFaceHighlight = null;
let facePickingMode = false;
let highlightedFaceGeometry = null;
let circleHoverHighlight = null;
init();
animate();

function init() {
    // Setup Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Setup Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth * 0.8 / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    // Setup Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth * 0.8, window.innerHeight);
    document.getElementById('viewer').appendChild(renderer.domElement);

    // Add Lights
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Setup Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Setup Raycaster
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Event Listeners
    renderer.domElement.addEventListener('click', onModelClick);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onWindowResize);
    document.getElementById('fileInput').addEventListener('change', loadSTL);
    document.getElementById('jsonInput').addEventListener('change', loadJSON);
    document.getElementById('resetView').addEventListener('click', resetView);
    document.getElementById('exportData').addEventListener('click', exportCircleData);
    document.getElementById('loadJson').addEventListener('click', () => document.getElementById('jsonInput').click());
    document.getElementById('resetAll').addEventListener('click', resetAll);
    document.getElementById('selectFace').addEventListener('click', toggleFaceSelection);
    document.getElementById('selectFrontFace').addEventListener('click', toggleFrontFaceSelection);
    // Add new event listener for slide faces button
    document.getElementById('selectSlideFaces').addEventListener('click', toggleSlideFacesMode);
}
// Add new function for slide face selection mode
function toggleSlideFacesMode() {
    slideFacesMode = !slideFacesMode;
    const button = document.getElementById('selectSlideFaces');
    
    if (slideFacesMode) {
        button.style.background = '#ff4444';
        button.textContent = 'Cancel Slide Face Selection';
        updateStatus('Click faces to select slide faces');
        clearCircleHoverHighlight(); // Clear circle preview when selecting faces
    } else {
        button.style.background = '#2196f3';
        button.textContent = 'Select Slide Faces';
        updateStatus('Slide face selection cancelled');
        
        if (highlightedFace) {
            scene.remove(highlightedFace);
            highlightedFace = null;
        }
    }
}

// Function to handle finishing a slide face group
function finishSlideGroup(event) {
    if (!slideFacesMode || event.key !== 'Enter' || !currentSlideGroup?.length) return;
    
    slideFaces.push([...currentSlideGroup]);
    currentSlideGroup = [];
    
    updateStatus('Slide face group added. Start new group or toggle off to finish.');
    updateSlideList();
}

// Function to add a face to the current slide group
function addSlideface(normal, point) {
    const highlight = createFaceHighlight(normal, point, 0x4169E1, 0.15);
    
    if (highlight && highlight.userData.dimensions) {
        const face = {
            normal: normal.clone(),
            point: point.clone(),
            highlight: highlight,
            dimensions: highlight.userData.dimensions
        };

        slideFaces.push(face);
        scene.add(highlight);
        updateSlideList();
        updateStatus(`Face added: ${face.dimensions.width.toFixed(2)}mm × ${face.dimensions.height.toFixed(2)}mm`);
    } else {
        updateStatus('Failed to detect face dimensions');
    }
}

// Enhanced function to add slide face with complete face data
function addSlidefaceWithData(faceData) {
    // Create permanent highlight for the slide face
    const highlight = createFaceBoundaryHighlight(faceData);
    
    const face = {
        normal: faceData.normal.clone(),
        point: faceData.center.clone(),
        highlight: highlight,
        dimensions: {
            width: faceData.dimensions.width,
            height: faceData.dimensions.height,
            center2D: {
                x: faceData.dimensions.centerX,
                y: faceData.dimensions.centerY
            },
            bounds2D: {
                min: { 
                    x: faceData.dimensions.centerX - faceData.dimensions.width/2, 
                    y: faceData.dimensions.centerY - faceData.dimensions.height/2 
                },
                max: { 
                    x: faceData.dimensions.centerX + faceData.dimensions.width/2, 
                    y: faceData.dimensions.centerY + faceData.dimensions.height/2 
                }
            }
        }
    };

    slideFaces.push(face);
    scene.add(highlight);
    updateSlideList();
}
// New function to calculate face dimensions
function calculateFaceDimensions(normal, point) {
    const positions = model.geometry.attributes.position;
    const worldMatrix = model.matrixWorld;
    const vertex = new THREE.Vector3();
    const points = [];
    const tolerance = 0.1;

    // Collect points on this face
    for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i);
        vertex.applyMatrix4(worldMatrix);

        const toPoint = vertex.clone().sub(point);
        const dist = Math.abs(toPoint.dot(normal));

        if (dist < tolerance) {
            points.push(vertex);
        }
    }

    if (points.length > 0) {
        const basis = createLocalBasis(normal);
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        points.forEach(p => {
            const localPoint = p.clone().sub(point);
            const x = localPoint.dot(basis.tangent);
            const y = localPoint.dot(basis.bitangent);

            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        });

        return {
            width: Math.round((maxX - minX) * 100) / 100,
            height: Math.round((maxY - minY) * 100) / 100,
            center2D: {
                x: Math.round(((maxX + minX) / 2) * 100) / 100,
                y: Math.round(((maxY + minY) / 2) * 100) / 100
            },
            bounds2D: {
                min: { x: Math.round(minX * 100) / 100, y: Math.round(minY * 100) / 100 },
                max: { x: Math.round(maxX * 100) / 100, y: Math.round(maxY * 100) / 100 }
            }
        };
    }

    return null;
}

// Helper function to create face highlight mesh
function createFaceHighlight(normal, point, color, opacity) {
    if (!model || !model.geometry) return null;
    
    const raycaster = new THREE.Raycaster();
    raycaster.ray.origin.copy(camera.position);
    raycaster.ray.direction.subVectors(point, camera.position).normalize();
    
    const intersects = raycaster.intersectObject(model);
    if (!intersects.length) return null;

    const basis = createLocalBasis(normal);
    const samplePoints = new Set();
    const checkedPoints = new Set();
    const pointsToCheck = new Set();
    
    // Use different sampling parameters based on context
    let gridSize, normalDotThreshold, planeTolerance, maxSampleRadius;
    if (slideFacesMode) {
        // Precise sampling for slide faces
        gridSize = 0.15;  // Finer grid sampling
        normalDotThreshold = 0.995;  // Stricter normal alignment
        planeTolerance = 0.05;  // Tighter plane tolerance
        maxSampleRadius = 7.5;  // Limit sampling radius to prevent bridging
    } else {
        // Standard sampling for top/front faces
        gridSize = 0.25;
        normalDotThreshold = 0.99;
        planeTolerance = 0.1;
        maxSampleRadius = 50;  // Larger radius for orientation faces
    }
    
    // Add initial point with its face normal
    const initialPoint = {
        x: 0,
        y: 0,
        point: point.clone(),
        normal: intersects[0].face.normal.clone()
    };
    pointsToCheck.add(JSON.stringify(initialPoint));
    
    // Flood fill sampling
    while (pointsToCheck.size > 0) {
        const currentPointStr = pointsToCheck.values().next().value;
        pointsToCheck.delete(currentPointStr);
        
        const current = JSON.parse(currentPointStr);
        const checkedKey = `${current.x},${current.y}`;
        if (checkedPoints.has(checkedKey)) continue;
        checkedPoints.add(checkedKey);
        
        // Test this point
        const testPoint = point.clone()
            .add(basis.tangent.clone().multiplyScalar(current.x * gridSize))
            .add(basis.bitangent.clone().multiplyScalar(current.y * gridSize));
        
        // Check if point is within sampling radius limit
        const distanceFromCenter = testPoint.distanceTo(point);
        if (distanceFromCenter > maxSampleRadius) continue;
        
        // Cast ray at this point
        raycaster.ray.origin.copy(testPoint.clone().add(normal.clone().multiplyScalar(0.5)));
        raycaster.ray.direction.copy(normal).negate();
        
        const hit = raycaster.intersectObject(model);
        if (hit.length > 0) {
            const hitNormal = hit[0].face.normal.clone().normalize();
            const normalAlignment = hitNormal.dot(normal);
            const distToPlane = Math.abs(hit[0].point.distanceTo(testPoint));

            if (normalAlignment > normalDotThreshold && distToPlane < planeTolerance) {
                // Valid point on our face
                samplePoints.add(JSON.stringify({
                    x: current.x * gridSize,
                    y: current.y * gridSize,
                    point: hit[0].point
                }));
                
                // Add neighbors to check
                const neighbors = [
                    { x: current.x + 1, y: current.y },
                    { x: current.x - 1, y: current.y },
                    { x: current.x, y: current.y + 1 },
                    { x: current.x, y: current.y - 1 }
                ];
                
                for (const neighbor of neighbors) {
                    const key = `${neighbor.x},${neighbor.y}`;
                    if (!checkedPoints.has(key)) {
                        pointsToCheck.add(JSON.stringify({
                            ...neighbor,
                            normal: hitNormal
                        }));
                    }
                }
            }
        }
        
        if (checkedPoints.size > 10000) break;
    }

    if (samplePoints.size < 3) return null;

    // Find bounds of sampled points
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const pointStr of samplePoints) {
        const p = JSON.parse(pointStr);
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
    }

    // Calculate dimensions
    const width = maxX - minX;
    const height = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Create highlight group
    const highlightGroup = new THREE.Group();
    const planeGeom = new THREE.PlaneGeometry(width, height);
    const planeMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        side: THREE.DoubleSide,
        depthTest: true
    });
    const highlight = new THREE.Mesh(planeGeom, planeMat);
    
    // Add border
    const edgeGeom = new THREE.EdgesGeometry(planeGeom);
    const edgeMat = new THREE.LineBasicMaterial({
        color: 0x000000,
        linewidth: 2,
        opacity: 0.8,
        transparent: true
    });
    const edges = new THREE.LineSegments(edgeGeom, edgeMat);

    highlightGroup.add(highlight);
    highlightGroup.add(edges);

    // Position highlight
    const centerPoint = point.clone().add(
        basis.tangent.clone().multiplyScalar(centerX)
    ).add(
        basis.bitangent.clone().multiplyScalar(centerY)
    );
    highlightGroup.position.copy(centerPoint);

    // Orient highlight
    const rotMatrix = new THREE.Matrix4();
    rotMatrix.makeBasis(basis.tangent, basis.bitangent, basis.normal);
    highlightGroup.setRotationFromMatrix(rotMatrix);

    // Store dimensions
    const dimensions = {
        width: Math.abs(width),
        height: Math.abs(height),
        center2D: { x: centerX, y: centerY },
        bounds2D: {
            min: { x: minX, y: minY },
            max: { x: maxX, y: maxY }
        }
    };
    highlightGroup.userData.dimensions = dimensions;

    return highlightGroup;
}
// Function to update the UI with slide faces
function updateSlideList() {
    const container = document.getElementById('slideFaces');
    if (!container) return;
    
    container.innerHTML = '<h3>Slide Faces:</h3>';
    
    slideFaces.forEach((face, index) => {
        const faceDiv = document.createElement('div');
        faceDiv.className = 'slide-face';
        
        const rotation = calculateRotation(face.normal);
        faceDiv.innerHTML = `
            Face ${index + 1}<br>
            Normal: (${face.normal.x.toFixed(2)}, 
                    ${face.normal.y.toFixed(2)}, 
                    ${face.normal.z.toFixed(2)})<br>
            Rotation: (${rotation.x}°, ${rotation.y}°, ${rotation.z}°)<br>
            Size: ${face.dimensions.width.toFixed(2)}mm × ${face.dimensions.height.toFixed(2)}mm
        `;
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.onclick = () => deleteSlideface(index);
        
        faceDiv.appendChild(deleteBtn);
        container.appendChild(faceDiv);
    });
}

// Function to delete a slide face
function deleteSlideface(index) {
    const face = slideFaces[index];
    if (face.highlight) {
        scene.remove(face.highlight);
    }
    
    slideFaces.splice(index, 1);
    updateSlideList();
    updateStatus('Slide face deleted');
}
function toggleFaceSelection() {
    topFaceSelectionMode = !topFaceSelectionMode;
    const button = document.getElementById('selectFace');
    
    if (topFaceSelectionMode) {
        button.style.background = '#ff4444';
        button.textContent = 'Cancel Top Face Selection';
        updateStatus('Click any face to set it as top face');
        clearCircleHoverHighlight(); // Clear circle preview when selecting faces
    } else {
        button.style.background = '#2196f3';
        button.textContent = 'Select Top Face';
        updateStatus('Top face selection cancelled');
    }
    
    if (highlightedFace) {
        scene.remove(highlightedFace);
        highlightedFace = null;
    }
}
function loadSTL(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const loader = new THREE.STLLoader();
        const geometry = loader.parse(e.target.result);

        if (model) scene.remove(model);

        const material = new THREE.MeshPhongMaterial({
            color: 0x909090,
            specular: 0x333333,
            shininess: 30,
            side: THREE.DoubleSide
        });

        model = new THREE.Mesh(geometry, material);
        model.geometry.computeVertexNormals();
        scene.add(model);

        resetView();

        // If we have loaded JSON data, recreate the highlights now that we have a model
        if (topFaceNormal) {
            createTopFaceHighlight(topFacePoint);
        }
        if (frontFaceNormal) {
            createFrontFaceHighlight(frontFacePoint);
        }

        // Update circle list to show face information properly
        if (detectedCircles.length > 0) {
            updateCircleList();
            updateStatus(`Model loaded successfully. Remapped ${detectedCircles.length} holes from JSON data.`);
        } else {
            updateStatus('Model loaded successfully');
        }
    };
    reader.readAsArrayBuffer(file);
}

function getViewRay(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    return raycaster;
}

function onMouseMove(event) {
    if (!model) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(model);

    if (intersects.length > 0) {
        const intersect = intersects[0];

        if (topFaceSelectionMode || frontFaceSelectionMode || slideFacesMode) {
            // Use proper face detection and highlighting
            highlightActualFace(intersect);
        } else {
            if (highlightedFace) {
                scene.remove(highlightedFace);
                highlightedFace = null;
            }

            // Try to detect circle at hover position for preview
            previewCircleAtPoint(intersect);

            hoveredPoint = intersect.point;
            const vector = hoveredPoint.clone();
            vector.project(camera);

            const hoverGuide = document.getElementById('hoverGuide');
            const x = (vector.x + 1) / 2 * rect.width + rect.left;
            const y = -(vector.y - 1) / 2 * rect.height + rect.top;

            const size = 10 / intersect.distance * 20;

            hoverGuide.style.display = 'block';
            hoverGuide.style.left = (x - size / 2) + 'px';
            hoverGuide.style.top = (y - size / 2) + 'px';
            hoverGuide.style.width = size + 'px';
            hoverGuide.style.height = size + 'px';
        }
    } else {
        if (highlightedFace) {
            scene.remove(highlightedFace);
            highlightedFace = null;
        }
        clearCircleHoverHighlight();
        hoveredPoint = null;
        document.getElementById('hoverGuide').style.display = 'none';
    }
}

function highlightPreciseFace(intersect) {
    // Get the face that was intersected
    const face = intersect.face;
    const faceIndex = intersect.faceIndex;
    
    // Get face normal in world space
    const faceNormal = face.normal.clone();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(model.matrixWorld);
    faceNormal.applyMatrix3(normalMatrix).normalize();

    // Remove old highlight
    if (highlightedFace) {
        scene.remove(highlightedFace);
        highlightedFace = null;
    }

    // Create precise face highlight using connected faces
    const highlight = createPreciseFaceHighlight(intersect.point, faceNormal, faceIndex);
    if (highlight) {
        highlightedFace = highlight;
        scene.add(highlightedFace);
    }
}

function createPreciseFaceHighlight(clickPoint, normal, faceIndex) {
    if (!model || !model.geometry) return null;

    const geometry = model.geometry;
    const positions = geometry.attributes.position;
    const indices = geometry.index;
    
    // Find all faces with similar normals (coplanar faces)
    const coplanarFaces = [];
    const normalTolerance = 0.99; // Very tight tolerance for same face
    const planeTolerance = 0.1; // 0.1mm tolerance for being on same plane
    
    // Get face count
    const faceCount = indices ? indices.count / 3 : positions.count / 3;
    
    for (let i = 0; i < faceCount; i++) {
        // Get face vertices
        let a, b, c;
        if (indices) {
            a = indices.getX(i * 3);
            b = indices.getX(i * 3 + 1);
            c = indices.getX(i * 3 + 2);
        } else {
            a = i * 3;
            b = i * 3 + 1;
            c = i * 3 + 2;
        }

        // Get vertex positions
        const v1 = new THREE.Vector3().fromBufferAttribute(positions, a);
        const v2 = new THREE.Vector3().fromBufferAttribute(positions, b);
        const v3 = new THREE.Vector3().fromBufferAttribute(positions, c);
        
        // Transform to world space
        v1.applyMatrix4(model.matrixWorld);
        v2.applyMatrix4(model.matrixWorld);
        v3.applyMatrix4(model.matrixWorld);

        // Calculate face normal
        const edge1 = v2.clone().sub(v1);
        const edge2 = v3.clone().sub(v1);
        const faceNormal = edge1.cross(edge2).normalize();

        // Check if normals are similar
        const normalAlignment = Math.abs(faceNormal.dot(normal));
        
        if (normalAlignment > normalTolerance) {
            // Check if face is on the same plane
            const toFace = v1.clone().sub(clickPoint);
            const distanceToPlane = Math.abs(toFace.dot(normal));
            
            if (distanceToPlane < planeTolerance) {
                coplanarFaces.push({
                    vertices: [v1, v2, v3],
                    normal: faceNormal
                });
            }
        }
    }

    if (coplanarFaces.length === 0) return null;

    // Create geometry from coplanar faces
    const highlightGeometry = new THREE.BufferGeometry();
    const vertices = [];
    const faceIndices = [];
    let vertexIndex = 0;

    coplanarFaces.forEach(face => {
        // Add vertices
        face.vertices.forEach(vertex => {
            vertices.push(vertex.x, vertex.y, vertex.z);
        });
        
        // Add indices for this triangle
        faceIndices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2);
        vertexIndex += 3;
    });

    highlightGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    highlightGeometry.setIndex(faceIndices);
    highlightGeometry.computeVertexNormals();

    // Create highlight material
    const material = new THREE.MeshBasicMaterial({
        color: topFaceSelectionMode ? 0x4CAF50 : (frontFaceSelectionMode ? 0xff4500 : 0x4169E1),
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthTest: true
    });

    return new THREE.Mesh(highlightGeometry, material);
}

function calculateFaceCenter(clickPoint, normal) {
    // If we have a highlighted face geometry, use its center
    if (highlightedFace && highlightedFace.geometry) {
        const geometry = highlightedFace.geometry;
        const positions = geometry.attributes.position;
        
        if (positions) {
            // Calculate the center of the highlighted geometry
            let centerX = 0, centerY = 0, centerZ = 0;
            const vertexCount = positions.count;
            
            for (let i = 0; i < vertexCount; i++) {
                centerX += positions.getX(i);
                centerY += positions.getY(i);
                centerZ += positions.getZ(i);
            }
            
            return new THREE.Vector3(
                centerX / vertexCount,
                centerY / vertexCount,
                centerZ / vertexCount
            );
        }
    }
    
    // Fallback to click point
    return clickPoint.clone();
}

function highlightActualFace(intersect) {
    // Get face normal in world space
    const faceNormal = intersect.face.normal.clone();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(model.matrixWorld);
    faceNormal.applyMatrix3(normalMatrix).normalize();

    // Remove old highlight
    if (highlightedFace) {
        scene.remove(highlightedFace);
        highlightedFace = null;
    }

    // Use different detection methods based on selection mode
    let faceData;
    if (slideFacesMode) {
        // Use precise detection for slide faces to prevent bridging
        faceData = detectPreciseSlideFace(intersect.point, faceNormal);
    } else {
        // Use standard detection for top/front faces
        faceData = detectCompleteFace(intersect.point, faceNormal);
    }
    
    if (faceData) {
        // Create highlight geometry from the actual face boundary
        highlightedFace = createFaceBoundaryHighlight(faceData);
        if (highlightedFace) {
            scene.add(highlightedFace);
        }
    }
}

function detectPreciseSlideFace(clickPoint, normal) {
    const positions = model.geometry.attributes.position;
    const indices = model.geometry.index;
    const faceCount = indices ? indices.count / 3 : positions.count / 3;
    
    // Very strict tolerances for slide face detection
    const tolerance = 0.03; // Ultra-tight tolerance - 0.03mm
    const normalTolerance = 0.998; // Very strict normal alignment
    const maxFaceSize = 15; // Maximum face dimension in mm to prevent bridging
    
    // Find all triangles that belong to this specific face
    const coplanarTriangles = [];
    
    for (let i = 0; i < faceCount; i++) {
        // Get triangle vertices
        let a, b, c;
        if (indices) {
            a = indices.getX(i * 3);
            b = indices.getX(i * 3 + 1);
            c = indices.getX(i * 3 + 2);
        } else {
            a = i * 3;
            b = i * 3 + 1;
            c = i * 3 + 2;
        }

        const v1 = new THREE.Vector3().fromBufferAttribute(positions, a).applyMatrix4(model.matrixWorld);
        const v2 = new THREE.Vector3().fromBufferAttribute(positions, b).applyMatrix4(model.matrixWorld);
        const v3 = new THREE.Vector3().fromBufferAttribute(positions, c).applyMatrix4(model.matrixWorld);

        // Calculate triangle normal
        const edge1 = v2.clone().sub(v1);
        const edge2 = v3.clone().sub(v1);
        const triNormal = edge1.cross(edge2).normalize();

        // Check strict normal alignment
        const normalAlignment = Math.abs(triNormal.dot(normal));
        if (normalAlignment < normalTolerance) continue;

        // Check if all vertices are on the same plane with very tight tolerance
        const dist1 = Math.abs(v1.clone().sub(clickPoint).dot(normal));
        const dist2 = Math.abs(v2.clone().sub(clickPoint).dot(normal));
        const dist3 = Math.abs(v3.clone().sub(clickPoint).dot(normal));
        
        if (dist1 < tolerance && dist2 < tolerance && dist3 < tolerance) {
            coplanarTriangles.push({ v1, v2, v3 });
        }
    }

    if (coplanarTriangles.length === 0) return null;

    // Use connectivity analysis with distance limit to find only the connected face region
    const connectedTriangles = findConnectedTrianglesWithLimit(coplanarTriangles, clickPoint, maxFaceSize);
    
    if (connectedTriangles.length === 0) return null;

    // Create local coordinate system
    const basis = createLocalBasis(normal);
    
    // Extract all unique vertices from connected triangles
    const uniqueVertices = new Map();
    connectedTriangles.forEach(tri => {
        [tri.v1, tri.v2, tri.v3].forEach(vertex => {
            const key = `${vertex.x.toFixed(6)},${vertex.y.toFixed(6)},${vertex.z.toFixed(6)}`;
            uniqueVertices.set(key, vertex);
        });
    });

    // Convert to 2D coordinates on the face plane
    const points2D = Array.from(uniqueVertices.values()).map(v => {
        const localPoint = v.clone().sub(clickPoint);
        return {
            x: localPoint.dot(basis.tangent),
            y: localPoint.dot(basis.bitangent),
            vertex3D: v.clone()
        };
    });

    // Use convex hull to get precise face boundary
    const boundary = findConvexHull(points2D);
    
    if (boundary.length < 3) return null;

    // Calculate bounds from convex hull
    const bounds = calculateBoundsFromHull(boundary);
    
    if (!bounds || bounds.width < 0.3 || bounds.height < 0.3) return null;
    
    // Additional check: prevent faces that are too large (likely bridged)
    if (bounds.width > maxFaceSize || bounds.height > maxFaceSize) return null;

    // Calculate face center from actual geometry
    const center3D = clickPoint.clone().add(
        basis.tangent.clone().multiplyScalar(bounds.centerX)
    ).add(
        basis.bitangent.clone().multiplyScalar(bounds.centerY)
    );

    return {
        normal: normal.clone(),
        center: center3D,
        boundary: boundary,
        basis: basis,
        dimensions: {
            width: bounds.width,
            height: bounds.height,
            centerX: bounds.centerX,
            centerY: bounds.centerY
        }
    };
}

function detectCompleteFace(clickPoint, normal) {
    const positions = model.geometry.attributes.position;
    const vertices = [];
    const tolerance = 0.15; // More forgiving tolerance - 0.15mm for coplanar detection
    
    // Find all vertices that lie on this plane
    for (let i = 0; i < positions.count; i++) {
        const vertex = new THREE.Vector3();
        vertex.fromBufferAttribute(positions, i);
        vertex.applyMatrix4(model.matrixWorld);

        // Check if vertex is on the same plane
        const toVertex = vertex.clone().sub(clickPoint);
        const distanceToPlane = Math.abs(toVertex.dot(normal));

        if (distanceToPlane < tolerance) {
            vertices.push(vertex);
        }
    }

    if (vertices.length < 3) return null;

    // Create local coordinate system for the face
    const basis = createLocalBasis(normal);
    
    // Convert to 2D coordinates on the face plane
    const points2D = vertices.map(v => {
        const localPoint = v.clone().sub(clickPoint);
        return {
            x: localPoint.dot(basis.tangent),
            y: localPoint.dot(basis.bitangent),
            vertex3D: v.clone()
        };
    });

    // Simple bounding box approach instead of convex hull
    const bounds = calculateSimpleBounds2D(points2D);
    
    if (!bounds || bounds.width < 0.5 || bounds.height < 0.5) return null;

    // Calculate face center
    const center3D = clickPoint.clone().add(
        basis.tangent.clone().multiplyScalar(bounds.centerX)
    ).add(
        basis.bitangent.clone().multiplyScalar(bounds.centerY)
    );

    // Create a simple rectangular boundary for consistent highlighting
    const boundary = [
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
        { x: bounds.minX, y: bounds.maxY }
    ];

    return {
        normal: normal.clone(),
        center: center3D,
        boundary: boundary,
        basis: basis,
        dimensions: {
            width: bounds.width,
            height: bounds.height,
            centerX: bounds.centerX,
            centerY: bounds.centerY
        }
    };
}

function findConvexHull(points) {
    if (points.length < 3) return points;

    // Simple convex hull using gift wrapping algorithm
    const hull = [];
    
    // Find the leftmost point
    let leftmost = 0;
    for (let i = 1; i < points.length; i++) {
        if (points[i].x < points[leftmost].x) {
            leftmost = i;
        }
    }

    let current = leftmost;
    do {
        hull.push(points[current]);
        let next = (current + 1) % points.length;
        
        for (let i = 0; i < points.length; i++) {
            if (orientation(points[current], points[i], points[next]) === 2) {
                next = i;
            }
        }
        
        current = next;
    } while (current !== leftmost && hull.length < points.length);

    return hull;
}

function orientation(p, q, r) {
    const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    if (Math.abs(val) < 1e-6) return 0; // Collinear
    return (val > 0) ? 1 : 2; // Clockwise or Counterclockwise
}

function findConnectedTrianglesWithLimit(triangles, clickPoint, maxDistance) {
    if (triangles.length === 0) return [];
    
    // Find the triangle closest to click point
    let closestTriangle = null;
    let closestDistance = Infinity;
    
    triangles.forEach(tri => {
        const center = tri.v1.clone().add(tri.v2).add(tri.v3).divideScalar(3);
        const distance = center.distanceTo(clickPoint);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestTriangle = tri;
        }
    });
    
    if (!closestTriangle) return [];
    
    // Use flood-fill to find connected triangles within distance limit
    const connected = new Set();
    const toCheck = [closestTriangle];
    connected.add(closestTriangle);
    
    while (toCheck.length > 0) {
        const current = toCheck.pop();
        const currentCenter = current.v1.clone().add(current.v2).add(current.v3).divideScalar(3);
        
        // Only consider triangles within the maximum distance from click point
        if (currentCenter.distanceTo(clickPoint) > maxDistance) continue;
        
        // Find adjacent triangles (sharing vertices)
        triangles.forEach(tri => {
            if (connected.has(tri)) return;
            
            const triCenter = tri.v1.clone().add(tri.v2).add(tri.v3).divideScalar(3);
            if (triCenter.distanceTo(clickPoint) > maxDistance) return;
            
            // Check if triangles share vertices (are adjacent)
            const currentVerts = [current.v1, current.v2, current.v3];
            const triVerts = [tri.v1, tri.v2, tri.v3];
            
            let sharedVertices = 0;
            currentVerts.forEach(cv => {
                triVerts.forEach(tv => {
                    if (cv.distanceTo(tv) < 0.001) { // Very small tolerance for vertex matching
                        sharedVertices++;
                    }
                });
            });
            
            // If triangles share at least 2 vertices, they're adjacent
            if (sharedVertices >= 2) {
                connected.add(tri);
                toCheck.push(tri);
            }
        });
    }
    
    return Array.from(connected);
}

function calculateBoundsFromHull(hull) {
    if (hull.length === 0) return null;
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    hull.forEach(point => {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    });

    const width = maxX - minX;
    const height = maxY - minY;

    return {
        minX, maxX, minY, maxY,
        width: width,
        height: height,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2
    };
}

function calculateSimpleBounds2D(points2D) {
    if (points2D.length === 0) return null;
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    points2D.forEach(point => {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    });

    const width = maxX - minX;
    const height = maxY - minY;

    return {
        minX, maxX, minY, maxY,
        width: width,
        height: height,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2
    };
}

function calculateFaceBounds2D(boundary) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    boundary.forEach(point => {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    });

    return {
        minX, maxX, minY, maxY,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2
    };
}

function createFaceBoundaryHighlight(faceData) {
    // Create simple rectangular highlight
    const geometry = new THREE.PlaneGeometry(faceData.dimensions.width, faceData.dimensions.height);

    // Choose color based on selection mode
    let color = 0x4CAF50; // Green for top
    if (frontFaceSelectionMode) color = 0xff4500; // Orange for front
    if (slideFacesMode) color = 0x4169E1; // Blue for slide

    const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthTest: true
    });

    const highlight = new THREE.Mesh(geometry, material);
    
    // Position and orient the highlight
    highlight.position.copy(faceData.center);
    
    const rotMatrix = new THREE.Matrix4();
    rotMatrix.makeBasis(faceData.basis.tangent, faceData.basis.bitangent, faceData.basis.normal);
    highlight.setRotationFromMatrix(rotMatrix);
    
    // Store face data for later use
    highlight.userData.faceData = faceData;
    
    return highlight;
}

function previewCircleAtPoint(intersect) {
    // Clear existing circle hover highlight
    clearCircleHoverHighlight();
    
    // Get face normal for circle detection
    const faceNormal = intersect.face.normal.clone();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(model.matrixWorld);
    faceNormal.applyMatrix3(normalMatrix).normalize();
    
    // Try to detect a circle at this point
    const circle = detectCircle(intersect.point, faceNormal, model.geometry);
    
    if (circle && !isNearExistingCircle(circle)) {
        // Create a preview highlight for the detected circle
        createCircleHoverHighlight(circle);
    }
}

function createCircleHoverHighlight(circle) {
    // Create a thin ring to show the detected circle
    const ringGeometry = new THREE.RingGeometry(
        circle.radius - 0.05, // Inner radius slightly smaller
        circle.radius + 0.05, // Outer radius slightly larger
        32, // Segments
        1
    );
    
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00, // Bright green for preview
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });
    
    circleHoverHighlight = new THREE.Mesh(ringGeometry, ringMaterial);
    circleHoverHighlight.position.copy(circle.center);
    
    // Orient the ring to match the circle's normal
    const basis = createLocalBasis(circle.normal);
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

function findConnectedVerticesOnFace(vertices, clickPoint, normal) {
    // Use a connectivity search to find only vertices that form a connected surface
    // starting from the click point
    
    const connected = new Set();
    const queue = [];
    const maxDistance = 2.0; // Maximum distance between connected vertices (2mm)
    
    // Find the closest vertex to the click point as starting point
    let closestVertex = vertices[0];
    let closestDistance = clickPoint.distanceTo(closestVertex);
    
    vertices.forEach(vertex => {
        const distance = clickPoint.distanceTo(vertex);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestVertex = vertex;
        }
    });
    
    // Start BFS from closest vertex
    queue.push(closestVertex);
    connected.add(closestVertex);
    
    while (queue.length > 0) {
        const current = queue.shift();
        
        // Find neighbors within maxDistance
        vertices.forEach(vertex => {
            if (!connected.has(vertex)) {
                const distance = current.distanceTo(vertex);
                if (distance < maxDistance) {
                    connected.add(vertex);
                    queue.push(vertex);
                }
            }
        });
    }
    
    return Array.from(connected);
}

function createSizedFaceHighlight(normal, center, dimensions, color) {
    // Create a highlight with specific dimensions
    const geometry = new THREE.PlaneGeometry(dimensions.width, dimensions.height);
    const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthTest: true
    });
    
    const highlight = new THREE.Mesh(geometry, material);
    highlight.position.copy(center);
    
    // Orient the highlight using the normal
    const basis = createLocalBasis(normal);
    const rotMatrix = new THREE.Matrix4();
    rotMatrix.makeBasis(basis.tangent, basis.bitangent, basis.normal);
    highlight.setRotationFromMatrix(rotMatrix);
    
    return highlight;
}
function calculateFaceBounds(point, normal, geometry) {
    // Project points onto the face plane and find bounds
    const positions = geometry.attributes.position;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    const basis = createLocalBasis(normal);
    const vertex = new THREE.Vector3();
    const projected = new THREE.Vector3();

    for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i);
        vertex.applyMatrix4(model.matrixWorld);

        // Project point onto plane
        const toPoint = vertex.clone().sub(point);
        const dist = toPoint.dot(normal);
        if (Math.abs(dist) > 0.1) continue; // Only consider points near the plane

        projected.copy(vertex).sub(normal.multiplyScalar(dist));

        // Convert to local 2D coordinates
        const x = projected.clone().sub(point).dot(basis.tangent);
        const y = projected.clone().sub(point).dot(basis.bitangent);

        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    }

    return {
        width: maxX - minX + 0.5,  // Add small padding
        height: maxY - minY + 0.5
    };
}

function calculateRotation(normal) {
    // Create basis vectors
    const basis = createLocalBasis(normal);

    // Convert to Euler angles
    const rotationMatrix = new THREE.Matrix4();
    rotationMatrix.makeBasis(basis.tangent, basis.bitangent, basis.normal);

    const euler = new THREE.Euler();
    euler.setFromRotationMatrix(rotationMatrix, 'XYZ');

    // Convert to degrees and round
    return {
        x: Math.round(euler.x * (180 / Math.PI) * 100) / 100,
        y: Math.round(euler.y * (180 / Math.PI) * 100) / 100,
        z: Math.round(euler.z * (180 / Math.PI) * 100) / 100
    };
}
function calculateDistances(circles) {
    const distances = [];
    for (let i = 0; i < circles.length; i++) {
        for (let j = i + 1; j < circles.length; j++) {
            const dist = circles[i].center.distanceTo(circles[j].center);
            distances.push({
                from: i + 1,
                to: j + 1,
                distance: Math.round(dist * 100) / 100
            });
        }
    }
    return distances;
}
// Helper function to find connected vertices
function findConnectedVertices(startIndex, positions, normal, tolerance) {
    const connected = new Set([startIndex]);
    const toCheck = [startIndex];
    const vertex = new THREE.Vector3();
    const checkVertex = new THREE.Vector3();
    const worldMatrix = model.matrixWorld;
    
    while (toCheck.length > 0) {
        const currentIndex = toCheck.pop();
        vertex.fromBufferAttribute(positions, currentIndex);
        vertex.applyMatrix4(worldMatrix);

        // Check nearby vertices
        for (let i = 0; i < positions.count; i++) {
            if (connected.has(i)) continue;

            checkVertex.fromBufferAttribute(positions, i);
            checkVertex.applyMatrix4(worldMatrix);

            // Check if vertex is on the same plane
            const toPoint = checkVertex.clone().sub(vertex);
            const dist = Math.abs(toPoint.dot(normal));

            if (dist < tolerance) {
                const distance = vertex.distanceTo(checkVertex);
                if (distance < 2) { // Adjust this threshold as needed
                    connected.add(i);
                    toCheck.push(i);
                }
            }
        }
    }

    return connected;
}
// Reconstructed deleteCircle function
function deleteCircle(index) {
    if (index < 0 || index >= detectedCircles.length) return;

    // Remove the visual marker from the scene
    if (detectedCircles[index].marker) {
        scene.remove(detectedCircles[index].marker);
    }

    // Remove the circle from our array
    detectedCircles.splice(index, 1);

    // Update the UI
    updateCircleList();
    updateStatus('Circle deleted');
}

function detectCircle(point, normal, geometry) {
    // Create local coordinate system
    const basis = createLocalBasis(normal);
    const searchRadius = 5;  // Slightly larger search radius

    // Pre-allocate vectors for reuse
    const vertex = new THREE.Vector3();
    const vertNormal = new THREE.Vector3();
    const toPoint = new THREE.Vector3();
    const projectedPoint = new THREE.Vector3();

    // Build point cloud
    const candidatePoints = [];
    const positions = geometry.attributes.position;
    const vertexNormals = geometry.attributes.normal;

    // Collect points near the click
    for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i);
        vertex.applyMatrix4(model.matrixWorld);

        const distance = vertex.distanceTo(point);
        if (distance > searchRadius) continue;

        vertNormal.fromBufferAttribute(vertexNormals, i);
        vertNormal.applyMatrix3(model.normalMatrix);
        vertNormal.normalize();

        toPoint.copy(vertex).sub(point);
        const distanceToPlane = toPoint.dot(normal);

        // More forgiving plane distance
        if (Math.abs(distanceToPlane) > 0.8) continue;

        // Project point to plane
        projectedPoint.copy(vertex).sub(normal.clone().multiplyScalar(distanceToPlane));

        // Convert to 2D coordinates on plane using the basis vectors
        const localX = projectedPoint.clone().sub(point).dot(basis.tangent);
        const localY = projectedPoint.clone().sub(point).dot(basis.bitangent);

        candidatePoints.push({
            x: localX,
            y: localY,
            original: vertex.clone(),
            normal: vertNormal.clone()
        });
    }

    console.log(`Found ${candidatePoints.length} candidate points`);
    if (candidatePoints.length < 15) return null;  // Require fewer points

    // Try to find circular patterns using RANSAC-like approach
    let bestCircle = null;
    let bestScore = 0;
    const maxAttempts = 100;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Pick three random points to define a circle
        const indices = [];
        while (indices.length < 3) {
            const idx = Math.floor(Math.random() * candidatePoints.length);
            if (!indices.includes(idx)) indices.push(idx);
        }

        const p1 = candidatePoints[indices[0]];
        const p2 = candidatePoints[indices[1]];
        const p3 = candidatePoints[indices[2]];

        // Calculate circle through these points
        const temp = p2.x * p2.x + p2.y * p2.y;
        const bc = (p1.x * p1.x + p1.y * p1.y - temp) / 2.0;
        const cd = (temp - p3.x * p3.x - p3.y * p3.y) / 2.0;
        const det = (p1.x - p2.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p2.y);

        if (Math.abs(det) < 1e-6) continue;

        const cx = (bc * (p2.y - p3.y) - cd * (p1.y - p2.y)) / det;
        const cy = ((p1.x - p2.x) * cd - (p2.x - p3.x) * bc) / det;
        const radius = Math.sqrt((p1.x - cx) * (p1.x - cx) + (p1.y - cy) * (p1.y - cy));

        // Wider radius range
        if (radius < 1.2 || radius > 5.5) continue;

        let pointsOnCircle = 0;
        const angles = new Set();
        const tolerance = 0.3;  // More forgiving tolerance

        for (const p of candidatePoints) {
            const dx = p.x - cx;
            const dy = p.y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (Math.abs(dist - radius) < tolerance) {
                const angle = Math.floor((Math.atan2(dy, dx) + Math.PI) * 16 / (2 * Math.PI));
                angles.add(angle);
                pointsOnCircle++;
            }
        }

        const score = (pointsOnCircle / candidatePoints.length) * (angles.size / 16);

        if (score > bestScore && angles.size >= 8) {  // Require fewer angles
            bestScore = score;
            bestCircle = { x: cx, y: cy, radius: radius };
        }
    }

    if (!bestCircle || bestScore < 0.25) {
        console.log(`No good circle found. Best score: ${bestScore}`);
        return null;
    }

    console.log(`Found circle with radius ${bestCircle.radius}mm and score ${bestScore}`);

    // Convert back to 3D using basis vectors
    const center3D = point.clone()
        .add(basis.tangent.multiplyScalar(bestCircle.x))
        .add(basis.bitangent.multiplyScalar(bestCircle.y));

    return {
        center: center3D,
        radius: bestCircle.radius,
        normal: normal.clone(),
        quality: bestScore
    };
}
function createLocalBasis(normal) {
    // Create a proper orthonormal basis aligned with the face
    const tangent = new THREE.Vector3();
    const bitangent = new THREE.Vector3();

    // Find the smallest component to use for tangent calculation
    if (Math.abs(normal.x) < Math.abs(normal.y) && Math.abs(normal.x) < Math.abs(normal.z)) {
        tangent.set(0, -normal.z, normal.y);
    } else if (Math.abs(normal.y) < Math.abs(normal.z)) {
        tangent.set(-normal.z, 0, normal.x);
    } else {
        tangent.set(-normal.y, normal.x, 0);
    }

    tangent.normalize();
    bitangent.crossVectors(normal, tangent).normalize();
    tangent.crossVectors(bitangent, normal).normalize();

    return {
        tangent: tangent,
        bitangent: bitangent,
        normal: normal
    };
}

function isNearExistingCircle(newCircle) {
    const minDistance = 2; // 2mm minimum distance between circle centers
    return detectedCircles.some(circle => 
        circle.center.distanceTo(newCircle.center) < minDistance
    );
}

function onModelClick(event) {
    if (!model) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(model);

    if (intersects.length > 0) {
        const point = intersects[0].point;
        const faceNormal = intersects[0].face.normal.clone();
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(model.matrixWorld);
        faceNormal.applyMatrix3(normalMatrix).normalize();

        // Handle front face selection
        if (frontFaceSelectionMode) {
            const faceData = highlightedFace?.userData?.faceData;
            if (highlightedFace) {
                scene.remove(highlightedFace);
                highlightedFace = null;
            }

            if (faceData) {
                setFrontFace(faceData.normal, faceData.center, faceData.dimensions);
                const rotation = calculateRotation(faceData.normal);
                updateStatus(`Front face set - Normal: (${rotation.x}°, ${rotation.y}°, ${rotation.z}°), Size: ${faceData.dimensions.width.toFixed(2)}×${faceData.dimensions.height.toFixed(2)}mm`);
            } else {
                setFrontFace(faceNormal, point);
                const rotation = calculateRotation(faceNormal);
                updateStatus(`Front face set - Normal: (${rotation.x}°, ${rotation.y}°, ${rotation.z}°)`);
            }

            frontFaceSelectionMode = false;
            const button = document.getElementById('selectFrontFace');
            button.style.background = '#2196f3';
            button.textContent = 'Select Front Face';
            return;
        }
        if (topFaceSelectionMode) {
            const faceData = highlightedFace?.userData?.faceData;
            if (highlightedFace) {
                scene.remove(highlightedFace);
                highlightedFace = null;
            }
        
            if (faceData) {
                setTopFace(faceData.normal, faceData.center, faceData.dimensions);
                const rotation = calculateRotation(faceData.normal);
                updateStatus(`Top face set - Normal: (${rotation.x}°, ${rotation.y}°, ${rotation.z}°), Size: ${faceData.dimensions.width.toFixed(2)}×${faceData.dimensions.height.toFixed(2)}mm`);
            } else {
                setTopFace(faceNormal, point);
                const rotation = calculateRotation(faceNormal);
                updateStatus(`Top face set - Normal: (${rotation.x}°, ${rotation.y}°, ${rotation.z}°)`);
            }
        
            // Exit selection mode
            topFaceSelectionMode = false;
            const button = document.getElementById('selectFace');
            button.style.background = '#2196f3';
            button.textContent = 'Select Top Face';
            return;
        }

        if (slideFacesMode) {
            // Handle slide face selection with full face data
            const faceData = highlightedFace?.userData?.faceData;
            if (highlightedFace) {
                scene.remove(highlightedFace);
                highlightedFace = null;
            }

            if (faceData) {
                addSlidefaceWithData(faceData);
                updateStatus(`Slide face added - Size: ${faceData.dimensions.width.toFixed(2)}×${faceData.dimensions.height.toFixed(2)}mm`);
            } else {
                addSlideface(faceNormal, point);
                updateStatus('Slide face added (basic detection)');
            }
            return;
        }

        // Normal circle detection logic
        const circle = detectCircle(point, faceNormal, model.geometry);

        if (circle && !isNearExistingCircle(circle)) {
            const markerGeometry = new THREE.TorusGeometry(
                circle.radius,
                0.1,
                32,
                32
            );
            const markerMaterial = new THREE.MeshBasicMaterial({
                color: 0x4CAF50,
                opacity: 0.8,
                transparent: true
            });
            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
            marker.position.copy(circle.center);

            // Create local basis for orientation
            const basis = createLocalBasis(circle.normal);

            // Create rotation matrix from basis vectors
            const rotMatrix = new THREE.Matrix4();
            rotMatrix.makeBasis(
                basis.tangent,
                basis.bitangent,
                basis.normal
            );

            // Apply rotation to marker
            marker.setRotationFromMatrix(rotMatrix);

            scene.add(marker);
            circle.marker = marker;

            detectedCircles.push(circle);
            updateCircleList();
            updateStatus('Circle detected');
        } else if (circle) {
            updateStatus('Circle already detected in this location');
        } else {
            updateStatus('No circle detected at this location');
        }
    }
}
function clearAllCircles() {
    detectedCircles.forEach(circle => {
        if (circle.marker) {
            scene.remove(circle.marker);
        }
    });
    detectedCircles = [];
    updateCircleList();
    updateStatus('All circles cleared');
}

function resetAll() {
    // Clear all circles
    detectedCircles.forEach(circle => {
        if (circle.marker) {
            scene.remove(circle.marker);
        }
    });
    detectedCircles = [];

    // Clear all slide faces
    slideFaces.forEach(face => {
        if (face.highlight) {
            scene.remove(face.highlight);
        }
    });
    slideFaces = [];

    // Clear top face
    if (topFaceHighlight) {
        scene.remove(topFaceHighlight);
        topFaceHighlight = null;
    }
    topFaceNormal = null;
    topFacePoint = null;
    topFaceIndex = null;

    // Clear front face
    if (frontFaceHighlight) {
        scene.remove(frontFaceHighlight);
        frontFaceHighlight = null;
    }
    frontFaceNormal = null;
    frontFacePoint = null;
    frontFaceIndex = null;

    // Clear highlighted face
    if (highlightedFace) {
        scene.remove(highlightedFace);
        highlightedFace = null;
    }

    // Clear circle hover highlight
    clearCircleHoverHighlight();

    // Clear the STL model
    if (model) {
        scene.remove(model);
        model = null;
    }

    // Reset selection modes
    topFaceSelectionMode = false;
    frontFaceSelectionMode = false;
    slideFacesMode = false;

    // Reset button states
    const selectFaceBtn = document.getElementById('selectFace');
    selectFaceBtn.style.background = '#2196f3';
    selectFaceBtn.textContent = 'Select Top Face';

    const selectFrontBtn = document.getElementById('selectFrontFace');
    selectFrontBtn.style.background = '#2196f3';
    selectFrontBtn.textContent = 'Select Front Face';

    const selectSlideBtn = document.getElementById('selectSlideFaces');
    selectSlideBtn.style.background = '#2196f3';
    selectSlideBtn.textContent = 'Select Slide Faces';

    // Clear file inputs
    document.getElementById('fileInput').value = '';
    document.getElementById('jsonInput').value = '';

    // Update UI
    updateCircleList();
    updateSlideList();
    updateStatus('Everything reset - canvas cleared');
}
function groupSlideFaces(faces) {
    const groups = [];
    const normalTolerance = 0.05;
    const planeDistanceTolerance = 0.5;

    faces.forEach((face) => {
        let foundGroup = false;

        for (const group of groups) {
            const firstFace = group[0];
            
            if (firstFace.normal.dot(face.normal) > 0.99) {
                const toPoint = face.point.clone().sub(firstFace.point);
                const distanceToPlane = Math.abs(toPoint.dot(firstFace.normal));

                if (distanceToPlane < planeDistanceTolerance) {
                    group.push(face);
                    foundGroup = true;
                    break;
                }
            }
        }

        if (!foundGroup) {
            groups.push([face]);
        }
    });

    // Calculate distances between faces in each group
    groups.forEach(group => {
        if (group.length > 1) {
            group.distances = [];
            for (let i = 0; i < group.length; i++) {
                for (let j = i + 1; j < group.length; j++) {
                    // Calculate distance between faces
                    const face1 = group[i];
                    const face2 = group[j];
                    
                    // Create basis for face1
                    const basis = createLocalBasis(face1.normal);
                    
                    // Project face2's center into face1's plane
                    const face2Point = face2.point.clone().sub(face1.point);
                    const face2Center = {
                        x: face2Point.dot(basis.tangent),
                        y: face2Point.dot(basis.bitangent)
                    };
                    
                    // Calculate minimum distance between any edges
                    const face1Edges = [
                        { x1: face1.dimensions.bounds2D.min.x, y1: face1.dimensions.bounds2D.min.y, 
                          x2: face1.dimensions.bounds2D.max.x, y2: face1.dimensions.bounds2D.min.y },
                        { x1: face1.dimensions.bounds2D.max.x, y1: face1.dimensions.bounds2D.min.y,
                          x2: face1.dimensions.bounds2D.max.x, y2: face1.dimensions.bounds2D.max.y },
                        { x1: face1.dimensions.bounds2D.max.x, y1: face1.dimensions.bounds2D.max.y,
                          x2: face1.dimensions.bounds2D.min.x, y2: face1.dimensions.bounds2D.max.y },
                        { x1: face1.dimensions.bounds2D.min.x, y1: face1.dimensions.bounds2D.max.y,
                          x2: face1.dimensions.bounds2D.min.x, y2: face1.dimensions.bounds2D.min.y }
                    ];
                    
                    const face2Edges = [
                        { x1: face2Center.x - face2.dimensions.width/2, y1: face2Center.y - face2.dimensions.height/2,
                          x2: face2Center.x + face2.dimensions.width/2, y2: face2Center.y - face2.dimensions.height/2 },
                        { x1: face2Center.x + face2.dimensions.width/2, y1: face2Center.y - face2.dimensions.height/2,
                          x2: face2Center.x + face2.dimensions.width/2, y2: face2Center.y + face2.dimensions.height/2 },
                        { x1: face2Center.x + face2.dimensions.width/2, y1: face2Center.y + face2.dimensions.height/2,
                          x2: face2Center.x - face2.dimensions.width/2, y2: face2Center.y + face2.dimensions.height/2 },
                        { x1: face2Center.x - face2.dimensions.width/2, y1: face2Center.y + face2.dimensions.height/2,
                          x2: face2Center.x - face2.dimensions.width/2, y2: face2Center.y - face2.dimensions.height/2 }
                    ];
                    
                    let minDist = Infinity;
                    
                    // Compare all edges
                    for (const edge1 of face1Edges) {
                        for (const edge2 of face2Edges) {
                            const dist = Math.min(
                                Math.sqrt(Math.pow(edge1.x1 - edge2.x1, 2) + Math.pow(edge1.y1 - edge2.y1, 2)),
                                Math.sqrt(Math.pow(edge1.x1 - edge2.x2, 2) + Math.pow(edge1.y1 - edge2.y2, 2)),
                                Math.sqrt(Math.pow(edge1.x2 - edge2.x1, 2) + Math.pow(edge1.y2 - edge2.y1, 2)),
                                Math.sqrt(Math.pow(edge1.x2 - edge2.x2, 2) + Math.pow(edge1.y2 - edge2.y2, 2))
                            );
                            minDist = Math.min(minDist, dist);
                        }
                    }

                    group.distances.push({
                        from: i + 1,
                        to: j + 1,
                        distance: Math.round(minDist * 100) / 100
                    });
                }
            }
        }
    });

    return groups;
}
function groupHolesByFace(holes) {
    const groups = [];
    const normalTolerance = 0.05; // Tolerance for normal alignment
    const planeDistanceTolerance = 0.5; // mm tolerance for being on same plane

    holes.forEach((hole, index) => {
        let foundGroup = false;

        for (const group of groups) {
            const firstHole = group[0];

            // Check if normals are aligned
            if (firstHole.normal.dot(hole.normal) > 0.99) { // More strict normal check
                // Calculate distance to the plane of the first hole
                const toPoint = hole.center.clone().sub(firstHole.center);
                const distanceToPlane = toPoint.dot(firstHole.normal);

                // Check if hole lies in the same plane
                if (Math.abs(distanceToPlane) < planeDistanceTolerance) {
                    // Calculate if hole is connected to any hole in the group
                    let isConnected = false;
                    for (const existingHole of group) {
                        // Project both holes onto the plane
                        const v = hole.center.clone().sub(existingHole.center);
                        const projectedDist = v.length();
                        const heightDiff = Math.abs(v.dot(firstHole.normal));

                        // Consider holes connected if they're close enough and at same "height"
                        if (projectedDist < 50 && heightDiff < planeDistanceTolerance) { // 50mm max separation
                            isConnected = true;
                            break;
                        }
                    }

                    if (isConnected) {
                        group.push(hole);
                        foundGroup = true;
                        break;
                    }
                }
            }
        }

        if (!foundGroup) {
            groups.push([hole]);
        }
    });

    // Sort holes within each group by position
    groups.forEach(group => {
        const normal = group[0].normal;

        // Create basis for sorting
        const basis = createLocalBasis(normal);

        group.sort((a, b) => {
            // Project holes onto the face plane and sort by x, then y
            const aLocal = {
                x: a.center.clone().sub(group[0].center).dot(basis.tangent),
                y: a.center.clone().sub(group[0].center).dot(basis.bitangent)
            };
            const bLocal = {
                x: b.center.clone().sub(group[0].center).dot(basis.tangent),
                y: b.center.clone().sub(group[0].center).dot(basis.bitangent)
            };

            // Sort by x first, then y if x is equal
            if (Math.abs(aLocal.x - bLocal.x) > 0.1) {
                return aLocal.x - bLocal.x;
            }
            return aLocal.y - bLocal.y;
        });
    });

    return groups;
}
function calculateAlignedDistances(holes) {
    const distances = [];
    const alignmentTolerance = 0.1; // mm tolerance for considering holes aligned

    // For each pair of holes on the same face
    for (let i = 0; i < holes.length; i++) {
        for (let j = i + 1; j < holes.length; j++) {
            const hole1 = holes[i];
            const hole2 = holes[j];

            // Calculate vector between hole centers
            const dx = hole2.center.x - hole1.center.x;
            const dy = hole2.center.y - hole1.center.y;
            const dz = hole2.center.z - hole1.center.z;

            // Find the dominant axis
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            const absDz = Math.abs(dz);
            const maxDist = Math.max(absDx, absDy, absDz);

            // Check if holes are aligned on an axis
            if (maxDist === absDx && absDy < alignmentTolerance && absDz < alignmentTolerance) {
                distances.push({
                    from: holes[i],
                    to: holes[j],
                    distance: Math.abs(dx),
                    axis: 'X'
                });
            } else if (maxDist === absDy && absDx < alignmentTolerance && absDz < alignmentTolerance) {
                distances.push({
                    from: holes[i],
                    to: holes[j],
                    distance: Math.abs(dy),
                    axis: 'Y'
                });
            } else if (maxDist === absDz && absDx < alignmentTolerance && absDy < alignmentTolerance) {
                distances.push({
                    from: holes[i],
                    to: holes[j],
                    distance: Math.abs(dz),
                    axis: 'Z'
                });
            }
        }
    }

    return distances;
}

function updateCircleList() {
    const container = document.getElementById('detectedCircles');
    container.innerHTML = '<h3>Detected Circles:</h3>';

    const faceGroups = groupHolesByFace(detectedCircles);

    faceGroups.forEach((group, faceIndex) => {
        const faceDiv = document.createElement('div');
        faceDiv.className = 'face-group';

        const faceHeader = document.createElement('div');
        faceHeader.className = 'face-controls';

        const faceTitle = document.createElement('h4');
        faceTitle.style.margin = '0';
        faceTitle.textContent = `Face ${faceIndex + 1}`;
        if (faceIndex === topFaceIndex) {
            faceTitle.textContent += ' (Top Face)';
            faceTitle.style.color = '#ffd700';
        }
        if (faceIndex === frontFaceIndex) {
            faceTitle.textContent += ' (Front Face)';
            faceTitle.style.color = '#ff4500';
        }

        faceHeader.appendChild(faceTitle);
        faceDiv.appendChild(faceHeader);

        group.forEach((circle, index) => {
            const div = document.createElement('div');
            div.className = 'detected-circle';

            const rotation = calculateRotation(circle.normal);
            const info = document.createElement('div');
            info.innerHTML = `
                Hole ${index + 1}<br>
                Diameter: ${(circle.radius * 2).toFixed(2)}mm<br>
                Position: (${circle.center.x.toFixed(2)}, 
                          ${circle.center.y.toFixed(2)}, 
                          ${circle.center.z.toFixed(2)})<br>
                Rotation: (${rotation.x}°, ${rotation.y}°, ${rotation.z}°)
            `;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '×';
            deleteBtn.onclick = () => deleteCircle(detectedCircles.indexOf(circle));

            div.appendChild(info);
            div.appendChild(deleteBtn);
            faceDiv.appendChild(div);
        });

        // Add aligned distances for this face
        const distances = calculateAlignedDistances(group);
        if (distances.length > 0) {
            const distanceDiv = document.createElement('div');
            distanceDiv.className = 'distance-info';
            distanceDiv.innerHTML = '<b>Aligned Distances:</b><br>';
            distances.forEach(d => {
                const fromIndex = group.indexOf(d.from);
                const toIndex = group.indexOf(d.to);
                distanceDiv.innerHTML += `
                    Holes ${fromIndex + 1} to ${toIndex + 1}: 
                    ${d.distance.toFixed(2)}mm (${d.axis}-axis)<br>
                `;
            });
            faceDiv.appendChild(distanceDiv);
        }

        container.appendChild(faceDiv);
    });
}
function setTopFace(normal, point, dimensions = null) {
    topFaceNormal = normal.clone();
    topFacePoint = point.clone();
    if (dimensions) {
        topFacePoint.userData = { dimensions: dimensions };
    }

    // Remove old highlight if it exists
    if (topFaceHighlight) {
        scene.remove(topFaceHighlight);
    }

    // Create new highlight plane
    const planeGeom = new THREE.PlaneGeometry(1, 1);
    const planeMat = new THREE.MeshBasicMaterial({
        color: 0x4CAF50,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
        depthTest: true
    });
    topFaceHighlight = new THREE.Mesh(planeGeom, planeMat);

    // Calculate face bounds
    const basis = createLocalBasis(normal);
    const positions = model.geometry.attributes.position;
    const worldMatrix = model.matrixWorld;
    const vertex = new THREE.Vector3();
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i);
        vertex.applyMatrix4(worldMatrix);

        const toPoint = vertex.clone().sub(point);
        const dist = Math.abs(toPoint.dot(normal));

        if (dist < 0.1) {
            const localPoint = vertex.clone().sub(point);
            const x = localPoint.dot(basis.tangent);
            const y = localPoint.dot(basis.bitangent);

            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
    }

    // Position and scale the highlight
    topFaceHighlight.position.copy(point);
    topFaceHighlight.scale.set(
        maxX - minX + 1,
        maxY - minY + 1,
        1
    );

    // Orient highlight to match face
    const rotMatrix = new THREE.Matrix4();
    rotMatrix.makeBasis(
        basis.tangent,
        basis.bitangent,
        basis.normal
    );
    topFaceHighlight.setRotationFromMatrix(rotMatrix);

    scene.add(topFaceHighlight);
    updateCircleList();
}

function loadJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            // Reset everything first
            resetAll();
            
            // Load circles/holes from JSON
            if (data.faces && Array.isArray(data.faces)) {
                data.faces.forEach(face => {
                    if (face.holes && Array.isArray(face.holes)) {
                        face.holes.forEach(hole => {
                            const circle = {
                                center: new THREE.Vector3(hole.position.x, hole.position.y, hole.position.z),
                                radius: hole.diameter / 2,
                                normal: new THREE.Vector3(face.normal.x, face.normal.y, face.normal.z),
                                quality: 1.0
                            };

                            // Create visual marker
                            const markerGeometry = new THREE.TorusGeometry(
                                circle.radius,
                                0.1,
                                32,
                                32
                            );
                            const markerMaterial = new THREE.MeshBasicMaterial({
                                color: 0x4CAF50,
                                opacity: 0.8,
                                transparent: true
                            });
                            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
                            marker.position.copy(circle.center);

                            // Orient marker
                            const basis = createLocalBasis(circle.normal);
                            const rotMatrix = new THREE.Matrix4();
                            rotMatrix.makeBasis(
                                basis.tangent,
                                basis.bitangent,
                                basis.normal
                            );
                            marker.setRotationFromMatrix(rotMatrix);

                            scene.add(marker);
                            circle.marker = marker;
                            detectedCircles.push(circle);
                        });
                    }
                });
            }

            // Load orientation face
            if (data.orientationFace) {
                topFaceNormal = new THREE.Vector3(
                    data.orientationFace.normal.x,
                    data.orientationFace.normal.y,
                    data.orientationFace.normal.z
                );
                
                // Use position from JSON if available, otherwise find from hole data
                if (data.orientationFace.position) {
                    topFacePoint = new THREE.Vector3(
                        data.orientationFace.position.x,
                        data.orientationFace.position.y,
                        data.orientationFace.position.z
                    );
                    // Store dimensions if available
                    if (data.orientationFace.dimensions) {
                        topFacePoint.userData = { dimensions: data.orientationFace.dimensions };
                    }
                } else {
                    // Find a point on the top face from the first hole on face 1 if available
                    topFacePoint = null;
                    if (data.faces && data.faces.length > 0) {
                        const firstFace = data.faces.find(face => 
                            Math.abs(face.normal.x - data.orientationFace.normal.x) < 0.01 &&
                            Math.abs(face.normal.y - data.orientationFace.normal.y) < 0.01 &&
                            Math.abs(face.normal.z - data.orientationFace.normal.z) < 0.01
                        );
                        if (firstFace && firstFace.holes && firstFace.holes.length > 0) {
                            topFacePoint = new THREE.Vector3(
                                firstFace.holes[0].position.x,
                                firstFace.holes[0].position.y,
                                firstFace.holes[0].position.z
                            );
                        }
                    }
                }
                
                // Create a visual highlight for the top face
                if (model) {
                    createTopFaceHighlight(topFacePoint);
                }
            }

            // Load front face
            if (data.frontFace) {
                frontFaceNormal = new THREE.Vector3(
                    data.frontFace.normal.x,
                    data.frontFace.normal.y,
                    data.frontFace.normal.z
                );
                
                // Use position from JSON if available, otherwise find from hole data
                if (data.frontFace.position) {
                    frontFacePoint = new THREE.Vector3(
                        data.frontFace.position.x,
                        data.frontFace.position.y,
                        data.frontFace.position.z
                    );
                    // Store dimensions if available
                    if (data.frontFace.dimensions) {
                        frontFacePoint.userData = { dimensions: data.frontFace.dimensions };
                    }
                } else {
                    // Find a point on the front face from holes with matching normals
                    frontFacePoint = null;
                    if (data.faces && data.faces.length > 0) {
                        const frontFace = data.faces.find(face => 
                            Math.abs(face.normal.x - data.frontFace.normal.x) < 0.01 &&
                            Math.abs(face.normal.y - data.frontFace.normal.y) < 0.01 &&
                            Math.abs(face.normal.z - data.frontFace.normal.z) < 0.01
                        );
                        if (frontFace && frontFace.holes && frontFace.holes.length > 0) {
                            frontFacePoint = new THREE.Vector3(
                                frontFace.holes[0].position.x,
                                frontFace.holes[0].position.y,
                                frontFace.holes[0].position.z
                            );
                        }
                    }
                }
                
                // Create a visual highlight for the front face
                if (model) {
                    createFrontFaceHighlight(frontFacePoint);
                }
            }

            // Load slide faces
            if (data.slideFaces && Array.isArray(data.slideFaces)) {
                data.slideFaces.forEach(group => {
                    if (group.faces && Array.isArray(group.faces)) {
                        group.faces.forEach(faceData => {
                            const face = {
                                normal: new THREE.Vector3(faceData.normal.x, faceData.normal.y, faceData.normal.z),
                                point: new THREE.Vector3(faceData.position.x, faceData.position.y, faceData.position.z),
                                dimensions: faceData.dimensions
                            };

                            // Create proper sized highlight from dimensions
                            const highlight = createSizedFaceHighlight(face.normal, face.point, face.dimensions, 0x4169E1);
                            if (highlight) {
                                face.highlight = highlight;
                                scene.add(highlight);
                                slideFaces.push(face);
                            }
                        });
                    }
                });
            }

            // Update UI
            updateCircleList();
            updateSlideList();
            updateStatus(`Loaded JSON data with ${detectedCircles.length} holes and ${slideFaces.length} slide faces`);
            
            // Prompt user to load corresponding STL file if no model is loaded
            if (!model) {
                updateStatus('JSON loaded. Please load the corresponding STL file to see the mapping.');
                // Highlight the STL file input
                const fileInput = document.getElementById('fileInput');
                fileInput.style.border = '2px solid #ff4500';
                setTimeout(() => {
                    fileInput.style.border = '';
                }, 3000);
            }

        } catch (error) {
            console.error('Error loading JSON:', error);
            updateStatus('Error loading JSON file: ' + error.message);
        }
    };
    reader.readAsText(file);
}

function createTopFaceHighlight(point) {
    if (!topFaceNormal || !model) return;
    
    // Remove existing highlight
    if (topFaceHighlight) {
        scene.remove(topFaceHighlight);
    }

    // Check if we have dimensions from the stored face data
    let dimensions = topFacePoint?.userData?.dimensions;
    let size = 10; // Default size
    
    if (dimensions) {
        const planeGeom = new THREE.PlaneGeometry(dimensions.width, dimensions.height);
        const planeMat = new THREE.MeshBasicMaterial({
            color: 0x4CAF50,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide,
            depthTest: true
        });
        topFaceHighlight = new THREE.Mesh(planeGeom, planeMat);
    } else {
        const planeGeom = new THREE.PlaneGeometry(size, size);
        const planeMat = new THREE.MeshBasicMaterial({
            color: 0x4CAF50,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide,
            depthTest: true
        });
        topFaceHighlight = new THREE.Mesh(planeGeom, planeMat);
    }
    
    // Use provided point, or fallback to model center
    if (point) {
        topFaceHighlight.position.copy(point);
    } else {
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        topFaceHighlight.position.copy(center);
    }
    
    // Orient highlight
    const basis = createLocalBasis(topFaceNormal);
    const rotMatrix = new THREE.Matrix4();
    rotMatrix.makeBasis(basis.tangent, basis.bitangent, basis.normal);
    topFaceHighlight.setRotationFromMatrix(rotMatrix);
    
    scene.add(topFaceHighlight);
}

function createFrontFaceHighlight(point) {
    if (!frontFaceNormal || !model) return;
    
    // Remove existing highlight
    if (frontFaceHighlight) {
        scene.remove(frontFaceHighlight);
    }

    // Check if we have dimensions from the stored face data
    let dimensions = frontFacePoint?.userData?.dimensions;
    let size = 10; // Default size
    
    if (dimensions) {
        const planeGeom = new THREE.PlaneGeometry(dimensions.width, dimensions.height);
        const planeMat = new THREE.MeshBasicMaterial({
            color: 0xff4500,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide,
            depthTest: true
        });
        frontFaceHighlight = new THREE.Mesh(planeGeom, planeMat);
    } else {
        const planeGeom = new THREE.PlaneGeometry(size, size);
        const planeMat = new THREE.MeshBasicMaterial({
            color: 0xff4500,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide,
            depthTest: true
        });
        frontFaceHighlight = new THREE.Mesh(planeGeom, planeMat);
    }
    
    // Use provided point, or fallback to model center
    if (point) {
        frontFaceHighlight.position.copy(point);
    } else {
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        frontFaceHighlight.position.copy(center);
    }
    
    // Orient highlight
    const basis = createLocalBasis(frontFaceNormal);
    const rotMatrix = new THREE.Matrix4();
    rotMatrix.makeBasis(basis.tangent, basis.bitangent, basis.normal);
    frontFaceHighlight.setRotationFromMatrix(rotMatrix);
    
    scene.add(frontFaceHighlight);
}

function exportCircleData() {
    if (!model) {
        updateStatus('No model loaded');
        return;
    }

    const faceGroups = groupHolesByFace(detectedCircles);
    const slideFaceGroups = groupSlideFaces(slideFaces);
    
    // Get author and link from input fields
    const author = document.getElementById('authorName').value.trim();
    const downloadLink = document.getElementById('downloadLink').value.trim();

    const data = {
        credits: {
            author: author || '',
            downloadLink: downloadLink || ''
        },
        faces: faceGroups.map((group, faceIndex) => {
            const faceNormal = group[0]?.normal || {x: 0, y: 0, z: 0};
            return {
                faceId: faceIndex + 1,
                normal: {
                    x: Math.round(faceNormal.x * 100) / 100,
                    y: Math.round(faceNormal.y * 100) / 100,
                    z: Math.round(faceNormal.z * 100) / 100
                },
                holes: group.map((circle, holeIndex) => ({
                    id: holeIndex + 1,
                    diameter: Math.round(circle.radius * 2 * 100) / 100,
                    position: {
                        x: Math.round(circle.center.x * 100) / 100,
                        y: Math.round(circle.center.y * 100) / 100,
                        z: Math.round(circle.center.z * 100) / 100
                    },
                    rotation: calculateRotation(circle.normal)
                })),
                alignedDistances: calculateAlignedDistances(group).map(d => ({
                    from: group.indexOf(d.from) + 1,
                    to: group.indexOf(d.to) + 1,
                    distance: Math.round(d.distance * 100) / 100,
                    axis: d.axis
                }))
            };
        }),
        orientationFace: topFaceNormal ? {
            normal: {
                x: Math.round(topFaceNormal.x * 100) / 100,
                y: Math.round(topFaceNormal.y * 100) / 100,
                z: Math.round(topFaceNormal.z * 100) / 100
            },
            position: topFacePoint ? {
                x: Math.round(topFacePoint.x * 100) / 100,
                y: Math.round(topFacePoint.y * 100) / 100,
                z: Math.round(topFacePoint.z * 100) / 100
            } : null,
            dimensions: topFacePoint?.userData?.dimensions || null,
            rotation: calculateRotation(topFaceNormal)
        } : null,
        frontFace: frontFaceNormal ? {
            normal: {
                x: Math.round(frontFaceNormal.x * 100) / 100,
                y: Math.round(frontFaceNormal.y * 100) / 100,
                z: Math.round(frontFaceNormal.z * 100) / 100
            },
            position: frontFacePoint ? {
                x: Math.round(frontFacePoint.x * 100) / 100,
                y: Math.round(frontFacePoint.y * 100) / 100,
                z: Math.round(frontFacePoint.z * 100) / 100
            } : null,
            dimensions: frontFacePoint?.userData?.dimensions || null,
            rotation: calculateRotation(frontFaceNormal)
        } : null,
        slideFaces: slideFaceGroups.map((group, groupIndex) => ({
            groupId: groupIndex + 1,
            faces: group.map((face, faceIndex) => ({
                id: faceIndex + 1,
                normal: {
                    x: Math.round(face.normal.x * 100) / 100,
                    y: Math.round(face.normal.y * 100) / 100,
                    z: Math.round(face.normal.z * 100) / 100
                },
                rotation: calculateRotation(face.normal),
                position: {
                    x: Math.round(face.point.x * 100) / 100,
                    y: Math.round(face.point.y * 100) / 100,
                    z: Math.round(face.point.z * 100) / 100
                },
                dimensions: {
                    width: face.dimensions.width,
                    height: face.dimensions.height,
                    center2D: face.dimensions.center2D,
                    bounds2D: face.dimensions.bounds2D
                }
            })),
            distances: group.distances || []
        })),
        totalHoles: detectedCircles.length,
        timestamp: new Date().toISOString()
    };

    const fileName = document.getElementById('fileInput').files[0].name;
    const jsonFileName = fileName.replace(/\.stl$/i, '.json');

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = jsonFileName;
    link.click();
    URL.revokeObjectURL(url);
}

function resetView() {
    if (!model) return;
    
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    model.position.sub(center);
    
    const maxDim = Math.max(size.x, size.y, size.z);
    camera.position.set(0, 0, maxDim * 2);
    camera.lookAt(0, 0, 0);
    
    controls.target.set(0, 0, 0);
    controls.update();
}

function updateStatus(message) {
    const status = document.getElementById('status');
    status.textContent = message;
}

function onWindowResize() {
    camera.aspect = window.innerWidth * 0.8 / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth * 0.8, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
function toggleFrontFaceSelection() {
    frontFaceSelectionMode = !frontFaceSelectionMode;
    const button = document.getElementById('selectFrontFace');
    
    if (frontFaceSelectionMode) {
        button.style.background = '#ff4444';
        button.textContent = 'Cancel Front Face Selection';
        updateStatus('Click any face to set it as front face');
        clearCircleHoverHighlight(); // Clear circle preview when selecting faces
    } else {
        button.style.background = '#2196f3';
        button.textContent = 'Select Front Face';
        updateStatus('Front face selection cancelled');
    }
    
    if (highlightedFace) {
        scene.remove(highlightedFace);
        highlightedFace = null;
    }
}
function setFrontFace(normal, point, dimensions = null) {
    frontFaceNormal = normal.clone();
    frontFacePoint = point.clone();
    if (dimensions) {
        frontFacePoint.userData = { dimensions: dimensions };
    }

    // Remove old highlight if it exists
    if (frontFaceHighlight) {
        scene.remove(frontFaceHighlight);
    }

    // Create new highlight plane
    const planeGeom = new THREE.PlaneGeometry(1, 1);
    const planeMat = new THREE.MeshBasicMaterial({
        color: 0xff4500,  // Orange color for front face
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
        depthTest: true
    });
    frontFaceHighlight = new THREE.Mesh(planeGeom, planeMat);

    // Calculate face bounds
    const basis = createLocalBasis(normal);
    const positions = model.geometry.attributes.position;
    const worldMatrix = model.matrixWorld;
    const vertex = new THREE.Vector3();
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i);
        vertex.applyMatrix4(worldMatrix);

        const toPoint = vertex.clone().sub(point);
        const dist = Math.abs(toPoint.dot(normal));

        if (dist < 0.1) {
            const localPoint = vertex.clone().sub(point);
            const x = localPoint.dot(basis.tangent);
            const y = localPoint.dot(basis.bitangent);

            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
    }

    // Position and scale the highlight
    frontFaceHighlight.position.copy(point);
    frontFaceHighlight.scale.set(
        maxX - minX + 1,
        maxY - minY + 1,
        1
    );

    // Orient highlight to match face
    const rotMatrix = new THREE.Matrix4();
    rotMatrix.makeBasis(
        basis.tangent,
        basis.bitangent,
        basis.normal
    );
    frontFaceHighlight.setRotationFromMatrix(rotMatrix);

    scene.add(frontFaceHighlight);
    updateCircleList();
}