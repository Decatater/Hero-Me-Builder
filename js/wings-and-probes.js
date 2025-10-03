// Wings and Probe Mounts Module
// Handles alignment and secondary attachment logic for wings and probe mounts

// Align probe models using slide faces (secondary attachments on wings)
function alignProbeModel(mesh, attachPoint, baseGeometryData, attachGeometryData) {
    // Probe alignment - EXACT copy from OLD/app.js
    const attachOrientation = new THREE.Vector3(
        attachGeometryData.orientationFace.normal.x,
        attachGeometryData.orientationFace.normal.y,
        attachGeometryData.orientationFace.normal.z
    );
    const upVector = new THREE.Vector3(0, 0, 1);
    const baseGroupIndex = 0;
    markPatternAsUsed(baseGeometryData.modelPath || 'heromedir/base/UniversalBase.stl', { groupIndex: baseGroupIndex });
    markPatternAsUsed(attachGeometryData.modelPath, { groupIndex: 0 });

    const baseGroup = baseGeometryData.slideFaces[0];
    const attachGroup = attachGeometryData.slideFaces[0];

    // First align orientations to sky
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
    // For probe mounts, use slide face position from wing geometry (like OLD app.js)
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

    console.log('🔧 Probe Alignment Complete');
}

// Wing alignment logic - uses backup alignment from OLD app.js
function alignWing(mesh, attachPoint, baseGeometryData, attachGeometryData, baseNormal, baseCenter, closestFace, matchingFace) {
    // Wing alignment - EXACT copy of backup alignment from OLD/app.js
    console.log('🚨🚨🚨 USING BACKUP ALIGNMENT (for wings)');

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
    const baseOrientation = new THREE.Vector3(
        baseGeometryData.orientationFace.normal.x,
        baseGeometryData.orientationFace.normal.y,
        baseGeometryData.orientationFace.normal.z
    );

    // First align the mount face normals
    const normalQuat = new THREE.Quaternion();
    normalQuat.setFromUnitVectors(attachNormal, baseNormal.clone().negate());
    mesh.quaternion.copy(normalQuat);

    // Then align orientation after normal alignment
    const orientQuat = new THREE.Quaternion();
    const rotatedAttachOrientation = attachOrientation.clone().applyQuaternion(normalQuat);
    orientQuat.setFromUnitVectors(rotatedAttachOrientation, baseOrientation);
    mesh.quaternion.premultiply(orientQuat);

    // Position using holes center
    const mountCenter = calculateHolePatternCenter(matchingFace.holes);
    const transformedMountCenter = mountCenter.clone().applyQuaternion(mesh.quaternion);
    const offset = baseCenter.clone().sub(transformedMountCenter);
    mesh.position.copy(offset);
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        alignProbeModel,
        alignWing
    };
}