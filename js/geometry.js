// Geometry Utilities Module
// Functions for hole pattern calculations, face matching, and alignment

// Validation functions
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

// Path normalization
function normalizePath(path) {
    if (!path) return '';
    return path.toLowerCase().replace(/[\\\/]+/g, '/').trim();
}

// Distance calculations
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

// Pattern matching functions
function compareHolePatterns(face1, face2, isRiser = false) {
    if (!face1?.holes?.length || !face2?.holes?.length) {
        // console.log('Missing holes in one or both faces');
        return 0;
    }

    // Special case for single holes
    if (face1.holes.length === 1 && face2.holes.length === 1) {
        // For single holes, we just check if the diameters are similar
        const tolerance = 1.0; // 1mm tolerance for hole diameters
        const diameterDiff = Math.abs(face1.holes[0].diameter - face2.holes[0].diameter);
        const score = diameterDiff <= tolerance ? 1.0 : 0.0;
        // console.log(`Single hole comparison - diameters: ${face1.holes[0].diameter} vs ${face2.holes[0].diameter}, score: ${score}`);
        return score;
    }

    // If number of holes doesn't match for multiple holes, patterns can't match
    if (face1.holes.length !== face2.holes.length) {
        // console.log('Different number of holes:', face1.holes.length, 'vs', face2.holes.length);
        return 0;
    }

    // Calculate all inter-hole distances for both faces
    const distances1 = calculateInterHoleDistances(face1.holes);
    const distances2 = calculateInterHoleDistances(face2.holes);

    // console.log('Distances in pattern 1:', distances1);
    // console.log('Distances in pattern 2:', distances2);

    if (distances1.length !== distances2.length) {
        // console.log('Different number of inter-hole distances');
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

    const score = distances1.length > 0 ? bestMatchCount / distances1.length : 1.0;
    // console.log(`Best match score based on distances: ${score} (${bestMatchCount}/${distances1.length} matches)`);
    return score;
}

function compareSlideFaceGroups(group1, group2, orientQuat1, orientQuat2) {
    if (!group1.faces || !group2.faces) {
        // console.log('Missing faces in one or both groups');
        return 0;
    }

    if (group1.faces.length !== group2.faces.length) {
        // console.log('Different number of faces:', group1.faces.length, 'vs', group2.faces.length);
        return 0;
    }

    // Compare distances between faces
    if (group1.distances && group2.distances) {
        // Both groups should have same number of distances
        if (group1.distances.length !== group2.distances.length) {
            // console.log('Different number of distances');
            return 0;
        }

        let distanceScore = 0;
        const tolerance = 2; // 2mm tolerance

        for (let i = 0; i < group1.distances.length; i++) {
            const diff = Math.abs(group1.distances[i] - group2.distances[i]);
            if (diff <= tolerance) {
                distanceScore++;
            }
        }

        const score = group1.distances.length > 0 ? distanceScore / group1.distances.length : 1.0;
        // console.log(`Slide face group comparison score: ${score} (${distanceScore}/${group1.distances.length} matches)`);
        return score;
    }

    return 0;
}

// Alignment calculations
function calculateAlignment(baseFace, attachFace) {
    if (!baseFace || !attachFace) {
        console.error('Invalid faces for alignment');
        return null;
    }

    // console.log('Calculating alignment between faces:',
    //     'Base:', baseFace,
    //     'Attach:', attachFace);

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

    // Create initial rotation to align normals (attachment face should face base face)
    const normalRotation = new THREE.Quaternion();
    normalRotation.setFromUnitVectors(attachNormal, baseNormal.clone().negate());

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

// Face finding functions
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

// Find matching faces between base and attachment models
function findMatchingFaces(baseFace, attachmentFaces, attachmentType) {
    // console.log('\n=== Finding Matches Between Faces ===');
    // console.log('Base face ID:', baseFace.faceId);
    // console.log('Base face holes:', baseFace.holes.length);
    // console.log('Current model path:', window.currentAttachmentPath);
    // console.log('Attachment type:', attachmentType);

    // Get the original type if it exists
    const originalType = selectedPoint?.userData?.originalType || attachmentType;
    
    // Handle spacers while preserving original type
    if (window.currentAttachmentPath && window.currentAttachmentPath.toLowerCase().includes('riser')) {
        // console.log('🚨🚨🚨 SPACER IN FINDMATCHINGFACES');
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

        // For spacers, we need to align with the parent's hole pattern but maintain orientation
        const baseHoles = baseFace.holes;
        const attachHoles = attachFace.holes;
        
        // Calculate the quaternion that aligns the attachment holes with base holes
        const baseNormal = new THREE.Vector3(
            baseFace.normal.x,
            baseFace.normal.y,
            baseFace.normal.z
        );
        const attachNormal = new THREE.Vector3(
            attachFace.normal.x,
            attachFace.normal.y,
            attachFace.normal.z
        );

        // Create quaternion to align normals
        const normalQuat = new THREE.Quaternion();
        normalQuat.setFromUnitVectors(attachNormal, baseNormal);

        attachFace.bestTransform = {
            rotation: normalQuat,
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

    const isRiser = window.currentAttachmentPath && window.currentAttachmentPath.toLowerCase().includes('riser');

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

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        isValidPosition,
        isValidHole,
        normalizePath,
        calculateInterHoleDistances,
        calculatePrimaryAxis,
        calculateHolePatternCenter,
        compareHolePatterns,
        compareSlideFaceGroups,
        calculateAlignment,
        findClosestFace,
        findMatchingFaces
    };
}