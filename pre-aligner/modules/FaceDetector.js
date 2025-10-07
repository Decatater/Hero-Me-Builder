/**
 * FaceDetector - Handles face detection and highlighting
 * Ported from marker app
 */
class FaceDetector {
    constructor(scene) {
        this.scene = scene;
        this.highlightedFace = null;
        this.orientationFaces = new Map(); // modelId -> face data
    }

    /**
     * Detect complete face from intersection point
     */
    detectCompleteFace(mesh, clickPoint, normal) {
        const positions = mesh.geometry.attributes.position;
        const indices = mesh.geometry.index;
        const faceCount = indices ? indices.count / 3 : positions.count / 3;

        const tolerance = 0.1; // 0.1mm tolerance
        const normalTolerance = 0.99;

        // Find all coplanar triangles
        const coplanarTriangles = [];

        for (let i = 0; i < faceCount; i++) {
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

            const v1 = new THREE.Vector3().fromBufferAttribute(positions, a);
            const v2 = new THREE.Vector3().fromBufferAttribute(positions, b);
            const v3 = new THREE.Vector3().fromBufferAttribute(positions, c);

            v1.applyMatrix4(mesh.matrixWorld);
            v2.applyMatrix4(mesh.matrixWorld);
            v3.applyMatrix4(mesh.matrixWorld);

            const edge1 = v2.clone().sub(v1);
            const edge2 = v3.clone().sub(v1);
            const faceNormal = edge1.cross(edge2).normalize();

            const normalAlignment = Math.abs(faceNormal.dot(normal));

            if (normalAlignment > normalTolerance) {
                const toFace = v1.clone().sub(clickPoint);
                const distanceToPlane = Math.abs(toFace.dot(normal));

                if (distanceToPlane < tolerance) {
                    coplanarTriangles.push({ v1, v2, v3, normal: faceNormal });
                }
            }
        }

        if (coplanarTriangles.length === 0) return null;

        // Convert triangles to 2D and find bounds
        const basis = this.createLocalBasis(normal);
        const points2D = [];

        coplanarTriangles.forEach(tri => {
            [tri.v1, tri.v2, tri.v3].forEach(v => {
                const localPoint = v.clone().sub(clickPoint);
                const x = localPoint.dot(basis.tangent);
                const y = localPoint.dot(basis.bitangent);
                points2D.push({ x, y, point3D: v });
            });
        });

        // Calculate bounds
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        points2D.forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        });

        const width = maxX - minX;
        const height = maxY - minY;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        // Calculate 3D center
        const center3D = clickPoint.clone()
            .add(basis.tangent.clone().multiplyScalar(centerX))
            .add(basis.bitangent.clone().multiplyScalar(centerY));

        return {
            normal: normal.clone(),
            center: center3D,
            basis: basis,
            dimensions: {
                width: width,
                height: height,
                centerX: centerX,
                centerY: centerY
            },
            triangles: coplanarTriangles
        };
    }

    /**
     * Create face highlight mesh
     */
    createFaceHighlight(faceData, color = 0x4CAF50, opacity = 0.4) {
        const geometry = new THREE.PlaneGeometry(faceData.dimensions.width, faceData.dimensions.height);

        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
            depthTest: true
        });

        const highlight = new THREE.Mesh(geometry, material);

        // Position and orient
        highlight.position.copy(faceData.center);

        const rotMatrix = new THREE.Matrix4();
        rotMatrix.makeBasis(faceData.basis.tangent, faceData.basis.bitangent, faceData.basis.normal);
        highlight.setRotationFromMatrix(rotMatrix);

        // Add border
        const edgeGeom = new THREE.EdgesGeometry(geometry);
        const edgeMat = new THREE.LineBasicMaterial({
            color: 0x000000,
            linewidth: 2,
            opacity: 0.8,
            transparent: true
        });
        const edges = new THREE.LineSegments(edgeGeom, edgeMat);
        highlight.add(edges);

        highlight.userData.faceData = faceData;

        return highlight;
    }

    /**
     * Show face highlight at intersection
     */
    showFaceHighlight(mesh, intersect, color = 0x4CAF50) {
        this.clearHighlight();

        const faceNormal = intersect.face.normal.clone();
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
        faceNormal.applyMatrix3(normalMatrix).normalize();

        const faceData = this.detectCompleteFace(mesh, intersect.point, faceNormal);

        if (faceData) {
            this.highlightedFace = this.createFaceHighlight(faceData, color, 0.4);
            this.scene.add(this.highlightedFace);
        }

        return faceData;
    }

    /**
     * Clear current highlight
     */
    clearHighlight() {
        if (this.highlightedFace) {
            this.scene.remove(this.highlightedFace);
            this.highlightedFace = null;
        }
    }

    /**
     * Get highlighted face data
     */
    getHighlightedFaceData() {
        return this.highlightedFace?.userData?.faceData || null;
    }

    /**
     * Set orientation face for a model
     */
    setOrientationFace(modelId, faceData) {
        // Remove old orientation face highlight if exists
        const oldFace = this.orientationFaces.get(modelId);
        if (oldFace && oldFace.highlight) {
            this.scene.remove(oldFace.highlight);
        }

        // Create permanent highlight for orientation face
        const highlight = this.createFaceHighlight(faceData, 0x4CAF50, 0.3);

        this.orientationFaces.set(modelId, {
            ...faceData,
            highlight: highlight
        });

        this.scene.add(highlight);
    }

    /**
     * Get orientation face for a model
     */
    getOrientationFace(modelId) {
        return this.orientationFaces.get(modelId);
    }

    /**
     * Clear orientation face for a model
     */
    clearOrientationFace(modelId) {
        const face = this.orientationFaces.get(modelId);
        if (face && face.highlight) {
            this.scene.remove(face.highlight);
        }
        this.orientationFaces.delete(modelId);
    }

    /**
     * Create local basis from normal
     */
    createLocalBasis(normal) {
        const tangent = new THREE.Vector3();
        const bitangent = new THREE.Vector3();

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

        return { tangent, bitangent, normal };
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
     * Clear all
     */
    clearAll() {
        this.clearHighlight();
        this.orientationFaces.forEach((face, modelId) => {
            if (face.highlight) {
                this.scene.remove(face.highlight);
            }
        });
        this.orientationFaces.clear();
    }
}
