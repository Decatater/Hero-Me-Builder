// Gantry Systems Module
// Handles alignment logic for gantry adapters and gantry clips

// Gantry adapter alignment logic
function alignGantryAdapter(mesh, attachPoint, attachGeometryData, baseNormal, baseCenter, matchingFace) {
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
}

// Gantry clip alignment logic
function alignGantryClip(mesh, attachPoint, attachGeometryData, baseNormal, baseCenter, closestFace, matchingFace) {
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
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        alignGantryAdapter,
        alignGantryClip
    };
}