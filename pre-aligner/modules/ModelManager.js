/**
 * ModelManager - Handles multiple STL models in the scene
 */
class ModelManager {
    constructor(scene) {
        this.scene = scene;
        this.models = new Map(); // id -> model data
        this.activeModelId = null;
        this.nextId = 1;
        this.stlLoader = new THREE.STLLoader();
        this.colors = [
            0x3498db, 0xe74c3c, 0x2ecc71, 0xf39c12,
            0x9b59b6, 0x1abc9c, 0xe67e22, 0x34495e
        ];
    }

    /**
     * Load STL file(s) and add to scene
     */
    loadSTL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (event) => {
                try {
                    const geometry = this.stlLoader.parse(event.target.result);
                    const modelId = `model_${this.nextId++}`;

                    // Center the geometry
                    geometry.computeBoundingBox();
                    const center = new THREE.Vector3();
                    geometry.boundingBox.getCenter(center);
                    geometry.translate(-center.x, -center.y, -center.z);

                    // Create material and mesh
                    const material = new THREE.MeshPhongMaterial({
                        color: this.colors[(this.nextId - 2) % this.colors.length],
                        shininess: 30,
                        transparent: true,
                        opacity: 0.9
                    });

                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    mesh.userData.modelId = modelId;

                    // Create wireframe
                    const wireframe = new THREE.LineSegments(
                        new THREE.EdgesGeometry(geometry),
                        new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.2, transparent: true })
                    );
                    mesh.add(wireframe);

                    // Store model data
                    const modelData = {
                        id: modelId,
                        name: file.name,
                        mesh: mesh,
                        wireframe: wireframe,
                        visible: true,
                        faces: [], // Will be populated by CircleDetector
                        transform: {
                            position: { x: 0, y: 0, z: 0 },
                            rotation: { x: 0, y: 0, z: 0 },
                            scale: { x: 1, y: 1, z: 1 }
                        }
                    };

                    this.models.set(modelId, modelData);
                    this.scene.add(mesh);

                    // Set as active if it's the first model
                    if (this.models.size === 1) {
                        this.setActiveModel(modelId);
                    }

                    resolve({ modelId, modelData });
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Remove a model from the scene
     */
    removeModel(modelId) {
        const modelData = this.models.get(modelId);
        if (!modelData) return false;

        this.scene.remove(modelData.mesh);
        this.models.delete(modelId);

        // If this was the active model, select another
        if (this.activeModelId === modelId) {
            const firstId = this.models.keys().next().value;
            this.setActiveModel(firstId || null);
        }

        return true;
    }

    /**
     * Set active model for transformations
     */
    setActiveModel(modelId) {
        // Clear previous selection
        if (this.activeModelId) {
            const prevModel = this.models.get(this.activeModelId);
            if (prevModel) {
                prevModel.mesh.material.emissive.setHex(0x000000);
            }
        }

        this.activeModelId = modelId;

        // Highlight new selection
        if (modelId) {
            const model = this.models.get(modelId);
            if (model) {
                model.mesh.material.emissive.setHex(0x333333);
            }
        }

        return modelId;
    }

    /**
     * Get active model data
     */
    getActiveModel() {
        return this.activeModelId ? this.models.get(this.activeModelId) : null;
    }

    /**
     * Get model by ID
     */
    getModel(modelId) {
        return this.models.get(modelId);
    }

    /**
     * Get all models
     */
    getAllModels() {
        return Array.from(this.models.values());
    }

    /**
     * Toggle model visibility
     */
    toggleVisibility(modelId) {
        const model = this.models.get(modelId);
        if (!model) return false;

        model.visible = !model.visible;
        model.mesh.visible = model.visible;
        return model.visible;
    }

    /**
     * Update model transform
     */
    updateTransform(modelId, position, rotation) {
        const model = this.models.get(modelId);
        if (!model) return;

        if (position) {
            model.mesh.position.copy(position);
            model.transform.position = { x: position.x, y: position.y, z: position.z };
        }

        if (rotation) {
            model.mesh.rotation.set(rotation.x, rotation.y, rotation.z);
            model.transform.rotation = { x: rotation.x, y: rotation.y, z: rotation.z };
        }
    }

    /**
     * Get relative transform between two models
     */
    getRelativeTransform(fromModelId, toModelId) {
        const fromModel = this.models.get(fromModelId);
        const toModel = this.models.get(toModelId);

        if (!fromModel || !toModel) return null;

        // Calculate relative position
        const relativePos = new THREE.Vector3().subVectors(
            toModel.mesh.position,
            fromModel.mesh.position
        );

        // Calculate relative rotation
        const fromRot = fromModel.mesh.rotation;
        const toRot = toModel.mesh.rotation;

        return {
            position: { x: relativePos.x, y: relativePos.y, z: relativePos.z },
            rotation: {
                x: toRot.x - fromRot.x,
                y: toRot.y - fromRot.y,
                z: toRot.z - fromRot.z
            }
        };
    }

    /**
     * Set model color
     */
    setModelColor(modelId, color) {
        const model = this.models.get(modelId);
        if (model) {
            model.mesh.material.color.setHex(color);
        }
    }

    /**
     * Set model opacity
     */
    setModelOpacity(modelId, opacity) {
        const model = this.models.get(modelId);
        if (model) {
            model.mesh.material.opacity = opacity;
        }
    }

    /**
     * Clear all models
     */
    clear() {
        this.models.forEach(model => {
            this.scene.remove(model.mesh);
        });
        this.models.clear();
        this.activeModelId = null;
        this.nextId = 1;
    }
}
