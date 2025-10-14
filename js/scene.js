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

    // Create build.json file for reconstructing the build
    const buildData = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        attachments: []
    };

    // Track all attachments
    for (const [point, model] of attachedModels) {
        const attachment = {
            attachmentPoint: {
                type: point.userData.attachmentType,
                name: point.userData.attachmentName,
                faceId: point.userData.faceId
            }
        };

        if (model.userData.isAssembly) {
            // For assemblies, store assembly info
            attachment.isAssembly = true;
            attachment.assemblyFile = model.userData.assemblyFile;
            attachment.modelPath = model.userData.originalModelPath;
        } else {
            // For regular models
            attachment.isAssembly = false;
            attachment.modelPath = model.userData.modelPath;
        }

        // Track parent for secondary attachments
        if (point.userData.parentModel) {
            // Find parent's attachment info
            for (const [parentPoint, parentModel] of attachedModels) {
                if (parentModel === point.userData.parentModel) {
                    attachment.parentAttachment = {
                        type: parentPoint.userData.attachmentType,
                        name: parentPoint.userData.attachmentName,
                        modelPath: parentModel.userData.isAssembly ?
                            parentModel.userData.originalModelPath :
                            parentModel.userData.modelPath
                    };
                    break;
                }
            }
        }

        buildData.attachments.push(attachment);
    }

    zip.file("build.json", JSON.stringify(buildData, null, 2));

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

// Load a build from a zip file or JSON file
async function loadBuildFromZip() {
    // Create file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Create loading overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            color: white;
            font-size: 24px;
            font-family: Arial, sans-serif;
        `;
        overlay.textContent = 'Loading build...';
        document.body.appendChild(overlay);

        try {
            let buildData;

            // Check if it's a JSON file or ZIP file
            if (file.name.toLowerCase().endsWith('.json')) {
                console.log('Loading build from JSON:', file.name);

                // Read JSON file directly
                const reader = new FileReader();
                const jsonText = await new Promise((resolve, reject) => {
                    reader.onload = (event) => resolve(event.target.result);
                    reader.onerror = reject;
                    reader.readAsText(file);
                });

                buildData = JSON.parse(jsonText);
                console.log('Build data loaded from JSON:', buildData);

            } else {
                console.log('Loading build from zip:', file.name);

                // Read the zip file
                const zip = await JSZip.loadAsync(file);

                // Extract build.json
                const buildJsonFile = zip.file('build.json');
                if (!buildJsonFile) {
                    showUserError('This zip file does not contain a build.json file. Please select a valid Hero Me Builder export.');
                    document.body.removeChild(overlay);
                    return;
                }

                const buildJsonText = await buildJsonFile.async('text');
                buildData = JSON.parse(buildJsonText);
                console.log('Build data loaded from ZIP:', buildData);
            }

            // Clear current build first
            const modelsToRemove = Array.from(attachedModels.entries());
            for (const [point, model] of modelsToRemove) {
                if (!point.userData.parentModel) {
                    removeModel(model);
                }
            }

            // Reconstruct the build
            // Sort attachments so primary attachments come before secondary ones
            const primaryAttachments = buildData.attachments.filter(a => !a.parentAttachment);
            const secondaryAttachments = buildData.attachments.filter(a => a.parentAttachment);

            // Load primary attachments first (sequentially to ensure they complete)
            for (const attachment of primaryAttachments) {
                await loadAttachment(attachment);
                // Delay to ensure attachment points are created, especially on slower servers
                await new Promise(resolve => setTimeout(resolve, 400));
            }

            // Longer delay before secondary attachments to ensure all primary points are ready
            await new Promise(resolve => setTimeout(resolve, 800));

            // Then load secondary attachments (sequentially)
            for (const attachment of secondaryAttachments) {
                await loadAttachment(attachment);
                // Delay to ensure attachment points are created, especially on slower servers
                await new Promise(resolve => setTimeout(resolve, 400));
            }

            console.log('Build loaded successfully');

            // Remove overlay
            document.body.removeChild(overlay);

            showUserSuccess('Build loaded successfully!');

        } catch (error) {
            console.error('Error loading build:', error);

            // Remove overlay
            if (overlay.parentNode) {
                document.body.removeChild(overlay);
            }

            showUserError('Error loading build: ' + error.message);
        }
    };

    input.click();
}

// Helper function to load a single attachment
async function loadAttachment(attachment) {
    console.log('Loading attachment:', attachment);

    // Find the attachment point
    let targetPoint = null;

    if (attachment.parentAttachment) {
        // This is a secondary attachment - find the parent first by its model path
        const parentModelEntry = Array.from(attachedModels.entries()).find(([point, model]) => {
            const modelPath = model.userData.isAssembly ?
                model.userData.originalModelPath :
                model.userData.modelPath;
            return modelPath === attachment.parentAttachment.modelPath;
        });

        if (!parentModelEntry) {
            console.error('Parent model not found for secondary attachment:', attachment);
            console.error('Looking for parent path:', attachment.parentAttachment.modelPath);
            console.error('Available models:', Array.from(attachedModels.values()).map(m =>
                m.userData.isAssembly ? m.userData.originalModelPath : m.userData.modelPath
            ));
            return;
        }

        // Find attachment point on the parent model
        const [parentPoint, parentMesh] = parentModelEntry;

        // For secondary attachments, match by type and name (not faceId, as it may vary)
        targetPoint = attachmentPoints.find(p =>
            p.userData.parentModel === parentMesh &&
            p.userData.attachmentType === attachment.attachmentPoint.type &&
            p.userData.attachmentName === attachment.attachmentPoint.name
        );

        if (!targetPoint) {
            // If not found by exact match, try to be flexible with spacer/directdrive types
            // since risers change the attachment point type
            if (attachment.attachmentPoint.type === 'spacer' || attachment.attachmentPoint.type === 'directdrive') {
                targetPoint = attachmentPoints.find(p =>
                    p.userData.parentModel === parentMesh &&
                    (p.userData.attachmentType === 'spacer' || p.userData.attachmentType === 'directdrive') &&
                    p.userData.attachmentName === attachment.attachmentPoint.name
                );
            }

            if (!targetPoint) {
                console.error('Attachment point not found on parent:', attachment.attachmentPoint);
                console.error('Available attachment points on parent:', attachmentPoints.filter(p =>
                    p.userData.parentModel === parentMesh
                ).map(p => ({ type: p.userData.attachmentType, name: p.userData.attachmentName, faceId: p.userData.faceId })));
            }
        }
    } else {
        // Primary attachment - find on main model
        // First try exact match by type, name, and faceId
        targetPoint = attachmentPoints.find(p =>
            !p.userData.parentModel &&
            p.userData.attachmentType === attachment.attachmentPoint.type &&
            p.userData.attachmentName === attachment.attachmentPoint.name &&
            p.userData.faceId === attachment.attachmentPoint.faceId
        );

        // If not found and this is a wing attachment, use filename to determine left/right
        if (!targetPoint && attachment.attachmentPoint.type === 'wing') {
            const fileName = attachment.modelPath.toLowerCase();
            const isLeft = fileName.includes('left');
            const isRight = fileName.includes('right');

            // Find the correct wing point based on side
            // wing = left side (faceId 6), wing_opposite = right side (faceId 4)
            const targetName = isLeft ? 'wing' : (isRight ? 'wing_opposite' : null);

            if (targetName) {
                targetPoint = attachmentPoints.find(p =>
                    !p.userData.parentModel &&
                    p.userData.attachmentType === 'wing' &&
                    p.userData.attachmentName === targetName
                );
            }
        }

        // If still not found, try by type and faceId (for cases where name changed)
        if (!targetPoint) {
            targetPoint = attachmentPoints.find(p =>
                !p.userData.parentModel &&
                p.userData.attachmentType === attachment.attachmentPoint.type &&
                p.userData.faceId === attachment.attachmentPoint.faceId
            );
        }

        if (!targetPoint) {
            console.error('Primary attachment point not found:', attachment.attachmentPoint);
            console.error('Available primary points:', attachmentPoints.filter(p =>
                !p.userData.parentModel
            ).map(p => ({ type: p.userData.attachmentType, name: p.userData.attachmentName, faceId: p.userData.faceId })));
        }
    }

    if (!targetPoint) {
        console.error('Attachment point not found:', attachment.attachmentPoint);
        return;
    }

    // Set as selected point
    selectedPoint = targetPoint;

    // Attach the model and wait for it to complete
    await attachModelAtPoint(attachment.modelPath);

    console.log('Attachment loaded:', attachment.modelPath);
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
        downloadSceneAsZip,
        loadBuildFromZip
    };
}