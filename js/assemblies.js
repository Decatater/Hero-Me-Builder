// Assembly Module
// Functions for loading and managing multi-part assemblies

// Load and attach an assembly at the selected point
async function attachAssemblyAtPoint(assemblyReference, attachPoint, baseGeometryData, partPath) {
    console.log('Attaching assembly:', assemblyReference);

    if (!assemblyReference.assemblyFile || !assemblyReference.modelId) {
        console.error('Invalid assembly reference - missing assemblyFile or modelId');
        return null;
    }

    try {
        // Load the assembly definition (from same directory as the part)
        const assemblyData = await loadAssemblyData(assemblyReference.assemblyFile, partPath);
        if (!assemblyData) {
            console.error('Failed to load assembly data');
            return null;
        }

        console.log('Assembly data loaded:', assemblyData);

        // Find the primary model in the assembly (the one referenced in the part JSON)
        const primaryModel = assemblyData.models.find(m => m.id === assemblyReference.modelId);
        if (!primaryModel) {
            console.error('Primary model not found in assembly:', assemblyReference.modelId);
            return null;
        }

        console.log('Primary model found:', primaryModel);

        // Create a group to hold all assembly parts
        const assemblyGroup = new THREE.Group();
        assemblyGroup.userData.isAssembly = true;
        assemblyGroup.userData.assemblyName = assemblyData.assemblyName;
        assemblyGroup.userData.assemblyFile = assemblyReference.assemblyFile;
        assemblyGroup.userData.attachmentType = attachPoint.userData.attachmentType;
        assemblyGroup.userData.originalModelPath = partPath; // Store the original path for export

        // Store individual meshes for reference
        const assemblyMeshes = [];

        // Helper function to generate random pastel colors
        const getRandomPastelColor = () => {
            const hue = Math.random() * 360;
            const saturation = 40 + Math.random() * 20; // 40-60%
            const lightness = 70 + Math.random() * 15;  // 70-85%

            // Convert HSL to RGB
            const h = hue / 60;
            const c = (1 - Math.abs(2 * lightness / 100 - 1)) * saturation / 100;
            const x = c * (1 - Math.abs(h % 2 - 1));
            const m = lightness / 100 - c / 2;

            let r, g, b;
            if (h < 1) { r = c; g = x; b = 0; }
            else if (h < 2) { r = x; g = c; b = 0; }
            else if (h < 3) { r = 0; g = c; b = x; }
            else if (h < 4) { r = 0; g = x; b = c; }
            else if (h < 5) { r = x; g = 0; b = c; }
            else { r = c; g = 0; b = x; }

            r = Math.round((r + m) * 255);
            g = Math.round((g + m) * 255);
            b = Math.round((b + m) * 255);

            return (r << 16) | (g << 8) | b;
        };

        // Get the directory from the part path
        const directory = partPath.substring(0, partPath.lastIndexOf('/') + 1);

        // Load all models in the assembly
        for (const modelData of assemblyData.models) {
            const stlPath = `${directory}${modelData.name}`;

            console.log(`Loading assembly part: ${stlPath}`);

            // Load the STL
            const loader = new THREE.STLLoader();
            const geometry = await new Promise((resolve, reject) => {
                loader.load(
                    stlPath,
                    (geo) => resolve(geo),
                    undefined,
                    (error) => reject(error)
                );
            });

            // Create material with random pastel color for each assembly part
            const color = getRandomPastelColor();
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

            // Apply the transform from the assembly definition
            mesh.position.set(
                modelData.transform.position.x,
                modelData.transform.position.y,
                modelData.transform.position.z
            );
            mesh.rotation.set(
                modelData.transform.rotation.x,
                modelData.transform.rotation.y,
                modelData.transform.rotation.z
            );
            mesh.scale.set(
                modelData.transform.scale.x,
                modelData.transform.scale.y,
                modelData.transform.scale.z
            );

            // Store model metadata
            mesh.userData.modelId = modelData.id;
            mesh.userData.modelName = modelData.name;
            mesh.userData.assemblyPart = true;

            assemblyGroup.add(mesh);
            assemblyMeshes.push(mesh);

            console.log(`Added assembly part ${modelData.name} at position:`, mesh.position);
        }

        // Now align the entire assembly group using the assembly-level data
        // Get the circles (mounting holes) from the assembly data
        if (assemblyData.circles && assemblyData.circles.length > 0) {
            console.log('Assembly has', assemblyData.circles.length, 'mounting circles');

            // Determine attachment type from the path (same pattern as regular models)
            const attachmentType = attachPoint.userData.attachmentType;
            console.log('Assembly attachment type:', attachmentType);

            // Use the circles to align the assembly to the base attachment point
            alignAssemblyToBase(assemblyGroup, assemblyData, attachPoint, baseGeometryData, attachmentType);
        }

        // Add the assembly group to the appropriate parent
        const parentModel = attachPoint.userData.parentModel || mainModel;
        parentModel.add(assemblyGroup);

        // Hide the attachment point
        attachPoint.visible = false;

        // Track the assembly
        attachedModels.set(attachPoint, assemblyGroup);

        // Update helper menu if it exists
        if (typeof onModelAttached === 'function') {
            onModelAttached();
        }

        console.log('Assembly attached successfully');
        return assemblyGroup;

    } catch (error) {
        console.error('Error attaching assembly:', error);
        return null;
    }
}

// Align assembly to base using mounting holes and orientation face
function alignAssemblyToBase(assemblyGroup, assemblyData, attachPoint, baseGeometryData, attachmentType) {
    console.log('Aligning assembly to base, attachment type:', attachmentType);

    // Get base face (the face we're attaching to on the base model)
    const baseFace = baseGeometryData.faces.find(face => face.faceId === attachPoint.userData.faceId);
    if (!baseFace) {
        console.error('Base face not found:', attachPoint.userData.faceId);
        return;
    }

    console.log('Base face:', baseFace);
    console.log('Assembly circles:', assemblyData.circles);
    console.log('Assembly orientation faces:', assemblyData.orientationFaces);

    // Validate that assembly has circles defined
    if (!assemblyData.circles || assemblyData.circles.length === 0) {
        const errorMessage = `Assembly "${assemblyData.assemblyName}" has no mounting circles defined. Use the pre-aligner tool to mark the mounting holes.`;
        console.error(errorMessage);
        showUserError(errorMessage);
        // Remove the assembly group from scene
        scene.remove(assemblyGroup);
        return;
    }

    // Validate that base face has holes
    if (!baseFace.holes || baseFace.holes.length === 0) {
        const errorMessage = `Base attachment point has no holes defined. Cannot mount assembly.`;
        console.error(errorMessage);
        showUserError(errorMessage);
        scene.remove(assemblyGroup);
        return;
    }

    // Validate that hole patterns match
    if (baseFace.holes.length !== assemblyData.circles.length) {
        const errorMessage = `Hole pattern mismatch: Assembly has ${assemblyData.circles.length} mounting hole(s) but attachment point has ${baseFace.holes.length} hole(s).`;
        console.error(errorMessage);
        showUserError(errorMessage);
        scene.remove(assemblyGroup);
        return;
    }

    // Calculate center of base mounting holes
    const baseCenter = calculateHolePatternCenter(baseFace.holes);
    const baseNormal = new THREE.Vector3(baseFace.normal.x, baseFace.normal.y, baseFace.normal.z);

    console.log('Base center:', baseCenter);
    console.log('Base normal:', baseNormal);

    // Calculate center of assembly mounting circles
    const assemblyHoleCenter = new THREE.Vector3();
    assemblyData.circles.forEach(circle => {
        assemblyHoleCenter.add(new THREE.Vector3(circle.position.x, circle.position.y, circle.position.z));
    });
    assemblyHoleCenter.divideScalar(assemblyData.circles.length);

    console.log('Assembly hole center:', assemblyHoleCenter);

    // Get the first orientation face from the assembly data
    if (!assemblyData.orientationFaces || assemblyData.orientationFaces.length === 0) {
        const errorMessage = `Assembly "${assemblyData.assemblyName}" has no orientation face defined. Use the pre-aligner tool to mark the orientation face.`;
        console.error(errorMessage);
        showUserError(errorMessage);
        scene.remove(assemblyGroup);
        return;
    }

    const orientationFace = assemblyData.orientationFaces[0];
    const orientNormal = new THREE.Vector3(
        orientationFace.normal.x,
        orientationFace.normal.y,
        orientationFace.normal.z
    );

    console.log('Assembly orientation normal:', orientNormal);

    // Find the mounting face normal by looking at the face data
    const mountingFaceData = assemblyData.models.find(m => m.faces && m.faces.length > 0);
    let mountingNormal = new THREE.Vector3(0, 0, 1); // Default

    if (mountingFaceData && mountingFaceData.faces && mountingFaceData.faces[0]) {
        const face = mountingFaceData.faces[0];
        mountingNormal = new THREE.Vector3(face.normal.x, face.normal.y, face.normal.z);
        console.log('Found mounting face normal from assembly data:', mountingNormal);
    }

    // Step 1: Align mounting face normals (they should oppose each other)
    const normalQuat = new THREE.Quaternion();
    normalQuat.setFromUnitVectors(mountingNormal, baseNormal.clone().negate());
    assemblyGroup.quaternion.copy(normalQuat);

    console.log('Applied mounting normal alignment');

    // Step 2: Rotate assembly based on attachment type
    const rotatedOrientNormal = orientNormal.clone().applyQuaternion(normalQuat);
    let targetOrientation = new THREE.Vector3(0, 0, 1); // Default: orientation face points up (Z+)

    console.log('Using alignment: orientation face -> Z+');

    // Project the rotated orientation normal onto the plane perpendicular to base normal
    // and rotate around base normal to align it with target orientation
    const orientProjected = rotatedOrientNormal.clone().sub(
        baseNormal.clone().multiplyScalar(rotatedOrientNormal.dot(baseNormal))
    ).normalize();

    const targetProjected = targetOrientation.clone().sub(
        baseNormal.clone().multiplyScalar(targetOrientation.dot(baseNormal))
    ).normalize();

    // Calculate angle between projected vectors
    const angle = Math.atan2(
        orientProjected.clone().cross(targetProjected).dot(baseNormal),
        orientProjected.dot(targetProjected)
    );

    const rotQuat = new THREE.Quaternion().setFromAxisAngle(baseNormal, angle);
    assemblyGroup.quaternion.premultiply(rotQuat);

    console.log('Applied orientation alignment, angle:', angle);

    // Step 2.5: If this is a directdrive mount with front face, apply additional front face rotation
    if ((attachmentType === 'directdrive' || attachmentType === 'hotend') && assemblyData.frontFaces && assemblyData.frontFaces.length > 0) {
        console.log('🔧 DIRECT DRIVE: Adding front face alignment');

        // Get front face
        const frontFace = assemblyData.frontFaces[0];
        const frontNormal = new THREE.Vector3(
            frontFace.normal.x,
            frontFace.normal.y,
            frontFace.normal.z
        ).normalize();

        console.log('Front normal (original):', frontNormal);

        // Apply current rotation to see where front face is pointing now
        const currentFrontNormal = frontNormal.clone().applyQuaternion(assemblyGroup.quaternion);
        console.log('Front normal (after base alignment):', currentFrontNormal);

        // We want the front to point toward Y- (camera is at Z+, looking toward -Z, so Y- is "forward" toward camera)
        const targetFront = new THREE.Vector3(0, -1, 0);

        // Project both onto XY plane (perpendicular to Z/up)
        const currentFrontXY = new THREE.Vector3(currentFrontNormal.x, currentFrontNormal.y, 0).normalize();
        const targetFrontXY = new THREE.Vector3(targetFront.x, targetFront.y, 0).normalize();

        console.log('Current front (XY plane):', currentFrontXY);
        console.log('Target front (XY plane):', targetFrontXY);

        // Calculate rotation needed around Z axis
        const dotProduct = currentFrontXY.dot(targetFrontXY);
        const crossProduct = new THREE.Vector3().crossVectors(currentFrontXY, targetFrontXY);
        const rotationAngle = Math.atan2(crossProduct.z, dotProduct);

        console.log('Front rotation angle needed (degrees):', rotationAngle * 180 / Math.PI);

        // Apply rotation around Z axis (up)
        const zAxisRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotationAngle);
        assemblyGroup.quaternion.premultiply(zAxisRotation);

        console.log('✅ Applied front face alignment');
    }

    // Step 3: Position the assembly so mounting holes align
    const transformedAssemblyCenter = assemblyHoleCenter.clone().applyQuaternion(assemblyGroup.quaternion);
    const offset = baseCenter.clone().sub(transformedAssemblyCenter);
    assemblyGroup.position.copy(offset);

    console.log('Final assembly position:', assemblyGroup.position);
    console.log('Final assembly rotation:', assemblyGroup.rotation);
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        attachAssemblyAtPoint,
        alignAssemblyToBase
    };
}
