// Hotends and Drives Module
// Handles alignment logic for hotend mounts, direct drives, spacers, and risers

// Complete hotend/directdrive/spacer alignment logic - EXACT copy from live_app.js
function alignHotendMount(mesh, attachPoint, baseGeometryData, attachGeometryData, baseNormal, baseCenter, closestFace, matchingFace) {
    HeroMeDebug.log('🚨🚨🚨 USING UNIFIED MOUNT ALIGNMENT');

    if (attachGeometryData.frontFace && attachGeometryData.orientationFace) {
        HeroMeDebug.log('Using explicit front and orientation faces for alignment');

        // Check if we have enhanced face data (new format) or legacy format
        const hasEnhancedData = attachGeometryData.orientationFace.position &&
                              attachGeometryData.orientationFace.dimensions &&
                              attachGeometryData.frontFace &&
                              attachGeometryData.frontFace.position &&
                              attachGeometryData.frontFace.dimensions;

        if (hasEnhancedData) {
            HeroMeDebug.log('Using enhanced face data with position and dimensions');
        } else {
            HeroMeDebug.log('Using legacy face data (normal + rotation only)');
        }

        // Only process front face if it exists
        let frontNormal = null;
        if (attachGeometryData.frontFace) {
            // Get the front normal vector and normalize it
            frontNormal = new THREE.Vector3(
                attachGeometryData.frontFace.normal.x,
                attachGeometryData.frontFace.normal.y,
                attachGeometryData.frontFace.normal.z
            ).normalize();
        }

        // Extract orientation normal and rotation
        const orientNormal = new THREE.Vector3(
            attachGeometryData.orientationFace.normal.x,
            attachGeometryData.orientationFace.normal.y,
            attachGeometryData.orientationFace.normal.z
        ).normalize();

        const orientRotation = attachGeometryData.orientationFace.rotation;

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

        if (hasEnhancedData && frontNormal) {
            // Use enhanced face data with position and dimensions (requires frontFace)
            HeroMeDebug.log('Enhanced alignment for', attachPoint.userData.attachmentType);

            // For direct drive, spacers, and hotend mounts:
            // - Orientation face should be above the first group of holes
            // - Front face should be ahead of them (closer to camera in default position)

            if (attachPoint.userData.attachmentType === 'spacer' ||
                attachPoint.userData.attachmentType === 'directdrive' ||
                attachPoint.userData.attachmentType === 'hotend') {

                HeroMeDebug.log('Using simplified enhanced alignment: align holes + front face toward camera');

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

                HeroMeDebug.log('=== ENHANCED ALIGNMENT DEBUG ===');
                HeroMeDebug.log('Model path:', mesh.userData.modelPath);
                HeroMeDebug.log('Front face position:', frontFacePos);
                HeroMeDebug.log('First hole position:', firstHolePos);
                HeroMeDebug.log('Front face normal (original):', frontNormal);

                const currentFrontNormal = frontNormal.clone().applyQuaternion(normalQuat);
                HeroMeDebug.log('Front face normal after mounting:', currentFrontNormal);

                // Determine correct alignment based on which face should be "more toward front"
                // If front face normal is pointing toward Y- (camera direction), we want front face to be in front
                // If front face normal is pointing away from Y-, the opposite face should be toward front

                const targetForward = new THREE.Vector3(0, -1, 0);

                // Check if the front face normal wants to point toward camera or away
                const frontNormalTowardCamera = Math.abs(frontNormal.y + 1) < 0.1; // Close to (0,-1,0)

                HeroMeDebug.log('Front face normal wants to point toward camera:', frontNormalTowardCamera);

                if (frontNormalTowardCamera) {
                    // Front face should point toward camera, check positions to see if it's correctly positioned
                    const frontFaceInFront = frontFacePos.y < firstHolePos.y; // More negative Y = more toward front
                    HeroMeDebug.log('Front face positioned in front of holes:', frontFaceInFront);

                    if (!frontFaceInFront) {
                        // Front face is behind but should point forward - flip the whole part
                        HeroMeDebug.log('FLIP: Front face marked as front but positioned behind - flipping part');
                        const frontAlignQuat = new THREE.Quaternion();
                        frontAlignQuat.setFromUnitVectors(currentFrontNormal, targetForward.clone().negate());
                        mesh.quaternion.premultiply(frontAlignQuat);
                    } else {
                        // Normal case - front face in front and should point forward
                        HeroMeDebug.log('NORMAL: Front face in front and pointing forward');
                        const frontAlignQuat = new THREE.Quaternion();
                        frontAlignQuat.setFromUnitVectors(currentFrontNormal, targetForward);
                        mesh.quaternion.premultiply(frontAlignQuat);
                    }
                } else {
                    // Front face normal points in other direction, just align it toward camera
                    HeroMeDebug.log('ALIGN: Aligning front face normal toward camera');
                    const frontAlignQuat = new THREE.Quaternion();
                    frontAlignQuat.setFromUnitVectors(currentFrontNormal, targetForward);
                    mesh.quaternion.premultiply(frontAlignQuat);
                }

                HeroMeDebug.log('Applied alignment.');
                HeroMeDebug.log('=== END ALIGNMENT DEBUG ===');

                HeroMeDebug.log('Enhanced alignment complete: holes aligned, front face toward camera');
            }

        } else {
            // Legacy alignment logic (backwards compatibility)
            HeroMeDebug.log('Using legacy alignment for', attachPoint.userData.attachmentType);

            if (attachPoint.userData.attachmentType === 'spacer' || attachPoint.userData.attachmentType === 'directdrive') {
                // Do normal orientation and alignment first
                baseQuat.setFromUnitVectors(orientNormal, orientRotation.x === 0 ? targetUp.clone().negate() : targetUp);
                mesh.quaternion.copy(baseQuat);

                // Only do front alignment if frontFace exists
                if (frontNormal) {
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
                    // For orientationFace-only mounts like Orbiter: just use basic orientation alignment
                    HeroMeDebug.log('No frontFace data - using orientationFace-only alignment');
                }
            } else {
                // Original logic for hotends and other types
                baseQuat.setFromUnitVectors(orientNormal, orientRotation.x === 0 ? targetUp : targetUp.clone().negate());

                // Only align front if frontFace exists
                if (frontNormal) {
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
            }

            // Apply baseQuat - CRITICAL from live_app.js line 2309 (outside any if/else blocks)
            mesh.quaternion.premultiply(baseQuat);

            // Position using holes center - EXACT copy from live_app.js lines 2312-2315
            const mountCenter = calculateHolePatternCenter(matchingFace.holes);
            const transformedMountCenter = mountCenter.clone().applyQuaternion(mesh.quaternion);
            const offset = baseCenter.clone().sub(transformedMountCenter);
            mesh.position.copy(offset);
        }

    } else {
        // EXACT copy from live_app.js lines 2317-2375: Fallback for orientationFace-only mounts
        console.log('Falling back to improved legacy alignment');
        let mountFace = null;
        let maxHoleCount = 0;
        let maxHoleDiameter = 0;

        attachGeometryData.faces.forEach(face => {
            if (face.holes.length > maxHoleCount) {
                maxHoleCount = face.holes.length;
                mountFace = face;
            } else if (face.holes.length === maxHoleCount) {
                // If same number of holes, use the face with larger holes
                const maxDiam = Math.max(...face.holes.map(h => h.diameter));
                if (maxDiam > maxHoleDiameter) {
                    maxHoleDiameter = maxDiam;
                    mountFace = face;
                }
            }
        });

        if (!mountFace) {
            console.error('Could not find appropriate mounting face');
            return;
        }

        // Get mount face normal
        const mountNormal = new THREE.Vector3(
            mountFace.normal.x,
            mountFace.normal.y,
            mountFace.normal.z
        );

        // Align mount face with base
        const normalQuat = new THREE.Quaternion();
        normalQuat.setFromUnitVectors(mountNormal, baseNormal.clone().negate());
        mesh.quaternion.copy(normalQuat);

        // Set orientation to point forward (-Y)
        // For orientationFace-only mounts, use orientationFace as the orientation
        const attachOrientation = new THREE.Vector3(
            attachGeometryData.orientationFace.normal.x,
            attachGeometryData.orientationFace.normal.y,
            attachGeometryData.orientationFace.normal.z
        ).normalize();

        const rotatedAttachOrientation = attachOrientation.clone().applyQuaternion(normalQuat);
        const targetFront = new THREE.Vector3(0, -1, 0);
        const orientQuat = new THREE.Quaternion();
        orientQuat.setFromUnitVectors(rotatedAttachOrientation, targetFront);

        // If we need to flip, just add PI to the angle. THAT'S IT.
        const needsFlip = baseGeometryData.frontFace && baseGeometryData.frontFace.rotation && baseGeometryData.frontFace.rotation.x < 0;
        console.log("Needs flip: ",needsFlip)
        if (needsFlip) {
            const flipQuaternion = new THREE.Quaternion();
            flipQuaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);

            // Combine the original rotation with the flip
            mesh.quaternion.multiply(flipQuaternion);
        }
        // Apply orientation
        const orientPoint = baseCenter.clone();
        mesh.position.sub(orientPoint);
        mesh.position.applyQuaternion(orientQuat);
        mesh.position.add(orientPoint);
        mesh.quaternion.premultiply(orientQuat);
    }

    // Position based on pattern centers - EXACT copy from live_app.js lines 2543-2548
    // This universal positioning applies to ALL mounts (both enhanced/legacy and fallback)
    const attachCenter = calculateHolePatternCenter(matchingFace.holes);
    const transformedAttachCenter = attachCenter.clone().applyQuaternion(mesh.quaternion);
    const offset = baseCenter.clone().sub(transformedAttachCenter);
    const offsetAmount = (attachPoint.userData.attachmentType === 'hotend') ? 0 : 0;
    const normalOffset = baseNormal.clone().multiplyScalar(offsetAmount);
    mesh.position.copy(offset.add(normalOffset));
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        alignHotendMount
    };
}