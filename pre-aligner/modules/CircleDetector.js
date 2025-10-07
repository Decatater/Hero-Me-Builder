/**
 * CircleDetector - Detects circles/holes on model faces
 * Ported from marker app
 */
class CircleDetector {
    constructor(scene) {
        this.scene = scene;
        this.detectedCircles = new Map(); // modelId -> circles array
        this.circleMarkers = [];
    }

    /**
     * Detect circle at a specific point on a model
     */
    detectCircleAtPoint(model, point, normal) {
        const geometry = model.mesh.geometry;
        const mesh = model.mesh;

        // Create local coordinate system
        const basis = this.createLocalBasis(normal);
        const searchRadius = 5; // mm

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
            vertex.applyMatrix4(mesh.matrixWorld);

            const distance = vertex.distanceTo(point);
            if (distance > searchRadius) continue;

            vertNormal.fromBufferAttribute(vertexNormals, i);
            vertNormal.applyMatrix3(mesh.normalMatrix);
            vertNormal.normalize();

            toPoint.copy(vertex).sub(point);
            const distanceToPlane = toPoint.dot(normal);

            // More forgiving plane distance
            if (Math.abs(distanceToPlane) > 0.8) continue;

            // Project point to plane
            projectedPoint.copy(vertex).sub(normal.clone().multiplyScalar(distanceToPlane));

            // Convert to 2D coordinates on plane
            const localX = projectedPoint.clone().sub(point).dot(basis.tangent);
            const localY = projectedPoint.clone().sub(point).dot(basis.bitangent);

            candidatePoints.push({
                x: localX,
                y: localY,
                original: vertex.clone(),
                normal: vertNormal.clone()
            });
        }

        if (candidatePoints.length < 15) return null;

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
            const tolerance = 0.3; // More forgiving tolerance

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

            if (score > bestScore && angles.size >= 8) {
                bestScore = score;
                bestCircle = { x: cx, y: cy, radius: radius };
            }
        }

        if (!bestCircle || bestScore < 0.25) {
            return null;
        }

        // Convert back to 3D
        const center3D = point.clone()
            .add(basis.tangent.multiplyScalar(bestCircle.x))
            .add(basis.bitangent.multiplyScalar(bestCircle.y));

        return {
            center: center3D,
            radius: bestCircle.radius,
            diameter: bestCircle.radius * 2,
            normal: normal.clone(),
            quality: bestScore
        };
    }

    /**
     * Create local basis from normal
     */
    createLocalBasis(normal) {
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

    /**
     * Add detected circle to model
     */
    addCircle(modelId, circle) {
        if (!this.detectedCircles.has(modelId)) {
            this.detectedCircles.set(modelId, []);
        }

        const circles = this.detectedCircles.get(modelId);

        // Check if circle already exists nearby
        const exists = circles.some(c => c.center.distanceTo(circle.center) < 2);
        if (exists) return null;

        // Create visual marker
        const marker = this.createCircleMarker(circle);
        this.scene.add(marker);
        this.circleMarkers.push(marker);

        // Store circle with marker reference
        const circleData = {
            ...circle,
            id: circles.length + 1,
            marker: marker
        };

        circles.push(circleData);
        return circleData;
    }

    /**
     * Create visual marker for circle
     */
    createCircleMarker(circle) {
        const group = new THREE.Group();

        // Create ring
        const ringGeometry = new THREE.RingGeometry(
            circle.radius - 0.1,
            circle.radius + 0.1,
            32
        );

        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });

        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        group.add(ring);

        // Create center dot
        const dotGeometry = new THREE.SphereGeometry(0.2, 16, 16);
        const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const dot = new THREE.Mesh(dotGeometry, dotMaterial);
        group.add(dot);

        // Position and orient
        group.position.copy(circle.center);

        const basis = this.createLocalBasis(circle.normal);
        const rotMatrix = new THREE.Matrix4();
        rotMatrix.makeBasis(basis.tangent, basis.bitangent, basis.normal);
        group.setRotationFromMatrix(rotMatrix);

        return group;
    }

    /**
     * Remove circle from model
     */
    removeCircle(modelId, circleId) {
        const circles = this.detectedCircles.get(modelId);
        if (!circles) return false;

        const index = circles.findIndex(c => c.id === circleId);
        if (index === -1) return false;

        // Remove visual marker
        const circle = circles[index];
        if (circle.marker) {
            this.scene.remove(circle.marker);
            const markerIndex = this.circleMarkers.indexOf(circle.marker);
            if (markerIndex !== -1) {
                this.circleMarkers.splice(markerIndex, 1);
            }
        }

        circles.splice(index, 1);
        return true;
    }

    /**
     * Get all circles for a model
     */
    getCircles(modelId) {
        return this.detectedCircles.get(modelId) || [];
    }

    /**
     * Get all circles across all models
     */
    getAllCircles() {
        const allCircles = [];
        this.detectedCircles.forEach((circles, modelId) => {
            circles.forEach(circle => {
                allCircles.push({ ...circle, modelId });
            });
        });
        return allCircles;
    }

    /**
     * Calculate rotation from normal
     */
    calculateRotation(normal) {
        const basis = this.createLocalBasis(normal);
        const rotationMatrix = new THREE.Matrix4();
        rotationMatrix.makeBasis(basis.tangent, basis.bitangent, basis.normal);

        const euler = new THREE.Euler();
        euler.setFromRotationMatrix(rotationMatrix, 'XYZ');

        return {
            x: Math.round(euler.x * (180 / Math.PI) * 100) / 100,
            y: Math.round(euler.y * (180 / Math.PI) * 100) / 100,
            z: Math.round(euler.z * (180 / Math.PI) * 100) / 100
        };
    }

    /**
     * Clear all circles for a model
     */
    clearModel(modelId) {
        const circles = this.detectedCircles.get(modelId);
        if (!circles) return;

        circles.forEach(circle => {
            if (circle.marker) {
                this.scene.remove(circle.marker);
            }
        });

        this.detectedCircles.delete(modelId);
    }

    /**
     * Clear all circles
     */
    clearAll() {
        this.circleMarkers.forEach(marker => {
            this.scene.remove(marker);
        });
        this.circleMarkers = [];
        this.detectedCircles.clear();
    }
}
