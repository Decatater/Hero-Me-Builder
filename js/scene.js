// 3D Scene Management Module
// Functions for Three.js scene setup, rendering, controls, and visualization

// Initialize the 3D scene, camera, renderer, and controls
function initScene() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9c9c9c);

    // Setup camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 0, 10);

    // Create renderer
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

    // Axis helper removed - alignment is working correctly
}

// Animation loop
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

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Visualization functions
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

                // For secondary attachments, attachment points are in local coordinates
                // No need to apply parent transforms - they will inherit naturally through parent-child hierarchy

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

                // For secondary attachments, slide faces are in local coordinates
                // No need to apply parent transforms - they will inherit naturally through parent-child hierarchy

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

// Scene download functionality
async function downloadSceneAsZip() {
    const zip = new JSZip();

    // Function to get model name from path
    const getModelName = (path) => {
        const parts = path.split('/');
        return parts[parts.length - 1];
    };

    // Helper function to fetch STL file
    const fetchSTL = async (path) => {
        try {
            const response = await fetch(path);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.arrayBuffer();
        } catch (error) {
            console.error(`Error fetching STL ${path}:`, error);
            return null;
        }
    };

    // Helper function to fetch JSON file for credits
    const fetchJSON = async (path) => {
        try {
            const response = await fetch(path);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`Error fetching JSON ${path}:`, error);
            return null;
        }
    };

    // Track credits for all models
    const creditsMap = new Map();

    // Default credit info
    const defaultCredit = {
        author: 'MediaMan3D',
        link: 'https://www.printables.com/model/39322-hero-me-gen7-platform-release4/'
    };

    // Helper to get credits from JSON
    const getCredits = async (stlPath) => {
        const jsonPath = stlPath.replace('.stl', '.json');
        const jsonData = await fetchJSON(jsonPath);

        if (jsonData && jsonData.credits) {
            // Check if credits exist and have content
            const hasAuthor = jsonData.credits.author && jsonData.credits.author.trim() !== '';
            const hasLink = jsonData.credits.downloadLink && jsonData.credits.downloadLink.trim() !== '';

            if (hasAuthor || hasLink) {
                return {
                    author: hasAuthor ? jsonData.credits.author : defaultCredit.author,
                    link: hasLink ? jsonData.credits.downloadLink : defaultCredit.link
                };
            }
        }

        // No credits or empty credits - use default
        return defaultCredit;
    };

    // Add base model
    const baseModelPath = 'heromedir/base/UniversalBase.stl';
    const baseSTL = await fetchSTL(baseModelPath);
    if (baseSTL) {
        zip.file("UniversalBase.stl", baseSTL);
        creditsMap.set('UniversalBase.stl', await getCredits(baseModelPath));
    }

    // Track unique models to avoid duplicates
    const addedModels = new Set();

    // Add all attached models (including assemblies)
    for (const [point, model] of attachedModels) {
        // Check if this is an assembly
        if (model.userData.isAssembly) {
            // For assemblies, collect all child meshes first
            const assemblyParts = [];
            model.traverse((child) => {
                if (child.isMesh && child.userData.assemblyPart) {
                    assemblyParts.push(child);
                }
            });

            // Now process them with async operations
            for (const child of assemblyParts) {
                const stlName = child.userData.modelName;

                if (!addedModels.has(stlName)) {
                    // Get the directory from the assembly - we need to track the original path
                    // The assembly should store where it came from
                    let directory = '';

                    // Try to get directory from first attached model or use a stored reference
                    for (const [pt, mdl] of attachedModels) {
                        if (mdl === model) {
                            // This is our assembly, try to find where it was loaded from
                            // We should have stored this when creating the assembly
                            const assemblyModelPath = mdl.userData.originalModelPath || '';
                            directory = assemblyModelPath.substring(0, assemblyModelPath.lastIndexOf('/') + 1);
                            break;
                        }
                    }

                    const fullPath = `${directory}${stlName}`;

                    const modelSTL = await fetchSTL(fullPath);
                    if (modelSTL) {
                        zip.file(stlName, modelSTL);
                        creditsMap.set(stlName, await getCredits(fullPath));
                        addedModels.add(stlName);
                    }
                }
            }
        } else {
            // Regular single model
            const modelPath = model.userData.modelPath;
            if (modelPath && !addedModels.has(modelPath)) {
                const modelSTL = await fetchSTL(modelPath);
                if (modelSTL) {
                    const modelName = getModelName(modelPath);
                    zip.file(modelName, modelSTL);
                    creditsMap.set(modelName, await getCredits(modelPath));
                    addedModels.add(modelPath);
                }
            }
        }
    }

    // Create a README with assembly information
    let readmeContent = "Hero Me Builder Assembly\n";
    readmeContent += "========================\n\n";
    readmeContent += "This zip contains all the STL files for your Hero Me assembly.\n\n";
    readmeContent += "Models included:\n";
    readmeContent += "- UniversalBase.stl (Main carriage base)\n";

    for (const [point, model] of attachedModels) {
        if (model.userData.isAssembly) {
            // List assembly parts
            model.traverse((child) => {
                if (child.isMesh && child.userData.assemblyPart) {
                    const modelName = child.userData.modelName;
                    readmeContent += `- ${modelName} (${model.userData.attachmentType} - assembly part)\n`;
                }
            });
        } else {
            const modelPath = model.userData.modelPath;
            if (modelPath) {
                const modelName = getModelName(modelPath);
                const attachmentType = point.userData?.attachmentType || 'unknown';
                readmeContent += `- ${modelName} (${attachmentType})\n`;
            }
        }
    }

    readmeContent += "\nGenerated by Hero Me Builder - https://heromebuilder.site\n";

    zip.file("README.txt", readmeContent);

    // Create CREDITS.txt file
    let creditsContent = "CREDITS\n";
    creditsContent += "=======\n\n";
    creditsContent += "This assembly includes models created by the following authors:\n\n";

    // Sort credits by filename for consistent output
    const sortedCredits = Array.from(creditsMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    for (const [filename, credit] of sortedCredits) {
        creditsContent += `${filename} - ${credit.author} - ${credit.link}\n`;
    }

    creditsContent += "\n";
    creditsContent += "Generated by Hero Me Builder - https://heromebuilder.site\n";

    zip.file("CREDITS.txt", creditsContent);

    // Generate and download zip
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hero-me-assembly.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        initScene,
        animate,
        onWindowResize,
        visualizeGeometryFeatures,
        visualizeHoles,
        visualizeSlideFaces,
        downloadSceneAsZip
    };
}