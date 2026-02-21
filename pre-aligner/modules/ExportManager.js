/**
 * ExportManager - Handles JSON export/import of assembly data
 */
class ExportManager {
    constructor(modelManager, circleDetector, faceDetector, frontFaces = null) {
        this.modelManager = modelManager;
        this.circleDetector = circleDetector;
        this.faceDetector = faceDetector;
        this.frontFaces = frontFaces;
    }

    /**
     * Export assembly data to JSON
     */
    exportAssembly(assemblyName = 'assembly', author = '', downloadLink = '') {
        const models = this.modelManager.getAllModels();

        if (models.length === 0) {
            throw new Error('No models to export');
        }

        // Use first model as reference (or find designated reference)
        const referenceModel = models[0];

        const exportData = {
            version: "1.0",
            timestamp: new Date().toISOString(),
            assemblyName: assemblyName,
            credits: {
                author: author || '',
                downloadLink: downloadLink || ''
            },
            models: [],
            relationships: [],
            circles: [],
            orientationFaces: [],
            frontFaces: []
        };

        // Export each model
        models.forEach(model => {
            const circles = this.circleDetector.getCircles(model.id);

            const modelData = {
                id: model.id,
                name: model.name,
                transform: {
                    position: model.transform.position,
                    rotation: model.transform.rotation,
                    scale: model.transform.scale
                },
                faces: this.exportFacesWithCircles(model.id, circles)
            };

            exportData.models.push(modelData);

            // Calculate relationship to reference model (if not the reference itself)
            if (model.id !== referenceModel.id) {
                const relativeTransform = this.modelManager.getRelativeTransform(
                    referenceModel.id,
                    model.id
                );

                if (relativeTransform) {
                    exportData.relationships.push({
                        from: referenceModel.id,
                        to: model.id,
                        relativeTransform: relativeTransform
                    });
                }
            }
        });

        // Export circle data in a unified structure
        exportData.circles = this.circleDetector.getAllCircles().map(circle => ({
            modelId: circle.modelId,
            id: circle.id,
            diameter: Math.round(circle.diameter * 100) / 100,
            position: {
                x: Math.round(circle.center.x * 100) / 100,
                y: Math.round(circle.center.y * 100) / 100,
                z: Math.round(circle.center.z * 100) / 100
            },
            rotation: this.circleDetector.calculateRotation(circle.normal)
        }));

        // Export orientation faces
        models.forEach(model => {
            const orientationFace = this.faceDetector.getOrientationFace(model.id);
            if (orientationFace) {
                const rotation = this.faceDetector.calculateRotation(orientationFace.normal);
                exportData.orientationFaces.push({
                    modelId: model.id,
                    normal: {
                        x: Math.round(orientationFace.normal.x * 100) / 100,
                        y: Math.round(orientationFace.normal.y * 100) / 100,
                        z: Math.round(orientationFace.normal.z * 100) / 100
                    },
                    center: {
                        x: Math.round(orientationFace.center.x * 100) / 100,
                        y: Math.round(orientationFace.center.y * 100) / 100,
                        z: Math.round(orientationFace.center.z * 100) / 100
                    },
                    dimensions: {
                        width: Math.round(orientationFace.dimensions.width * 100) / 100,
                        height: Math.round(orientationFace.dimensions.height * 100) / 100
                    },
                    rotation: rotation
                });
            }
        });

        // Export front faces
        models.forEach(model => {
            const frontFace = this.frontFaces ? this.frontFaces.get(model.id) : null;
            if (frontFace) {
                const rotation = this.faceDetector.calculateRotation(frontFace.normal);
                exportData.frontFaces.push({
                    modelId: model.id,
                    normal: {
                        x: Math.round(frontFace.normal.x * 100) / 100,
                        y: Math.round(frontFace.normal.y * 100) / 100,
                        z: Math.round(frontFace.normal.z * 100) / 100
                    },
                    center: {
                        x: Math.round(frontFace.center.x * 100) / 100,
                        y: Math.round(frontFace.center.y * 100) / 100,
                        z: Math.round(frontFace.center.z * 100) / 100
                    },
                    dimensions: {
                        width: Math.round(frontFace.dimensions.width * 100) / 100,
                        height: Math.round(frontFace.dimensions.height * 100) / 100
                    },
                    rotation: rotation
                });
            }
        });

        return exportData;
    }

    /**
     * Export faces with circles for a model (similar to marker app format)
     */
    exportFacesWithCircles(modelId, circles) {
        // Group circles by face normal
        const faceMap = new Map();

        circles.forEach(circle => {
            const normalKey = this.getNormalKey(circle.normal);

            if (!faceMap.has(normalKey)) {
                faceMap.set(normalKey, {
                    normal: {
                        x: Math.round(circle.normal.x * 100) / 100,
                        y: Math.round(circle.normal.y * 100) / 100,
                        z: Math.round(circle.normal.z * 100) / 100
                    },
                    holes: []
                });
            }

            const rotation = this.circleDetector.calculateRotation(circle.normal);

            faceMap.get(normalKey).holes.push({
                id: circle.id,
                diameter: Math.round(circle.diameter * 100) / 100,
                position: {
                    x: Math.round(circle.center.x * 100) / 100,
                    y: Math.round(circle.center.y * 100) / 100,
                    z: Math.round(circle.center.z * 100) / 100
                },
                rotation: rotation
            });
        });

        // Convert to array with face IDs
        const faces = [];
        let faceId = 1;

        faceMap.forEach(faceData => {
            faces.push({
                faceId: faceId++,
                normal: faceData.normal,
                holes: faceData.holes,
                alignedDistances: this.calculateAlignedDistances(faceData.holes, faceData.normal)
            });
        });

        return faces;
    }

    /**
     * Calculate aligned distances between holes on the same face
     */
    calculateAlignedDistances(holes, normal) {
        const distances = [];
        const tolerance = 0.5; // 0.5mm tolerance for alignment

        for (let i = 0; i < holes.length; i++) {
            for (let j = i + 1; j < holes.length; j++) {
                const pos1 = holes[i].position;
                const pos2 = holes[j].position;

                const dx = Math.abs(pos2.x - pos1.x);
                const dy = Math.abs(pos2.y - pos1.y);
                const dz = Math.abs(pos2.z - pos1.z);

                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                // Check if aligned on X, Y, or Z axis
                let axis = null;
                if (dy < tolerance && dz < tolerance) axis = 'X';
                else if (dx < tolerance && dz < tolerance) axis = 'Y';
                else if (dx < tolerance && dy < tolerance) axis = 'Z';

                if (axis) {
                    distances.push({
                        from: holes[i].id,
                        to: holes[j].id,
                        distance: Math.round(distance * 100) / 100,
                        axis: axis
                    });
                }
            }
        }

        return distances;
    }

    /**
     * Get a unique key for a normal vector
     */
    getNormalKey(normal) {
        return `${Math.round(normal.x * 100)}_${Math.round(normal.y * 100)}_${Math.round(normal.z * 100)}`;
    }

    /**
     * Save assembly to file
     */
    saveToFile(filename = 'assembly.json', assemblyName = 'assembly', author = '', downloadLink = '') {
        const data = this.exportAssembly(assemblyName, author, downloadLink);
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();

        URL.revokeObjectURL(url);
    }

    /**
     * Export to ZIP with main assembly and individual model JSONs
     */
    async exportToZip(assemblyName = 'assembly', author = '', downloadLink = '') {
        const zip = new JSZip();
        const models = this.modelManager.getAllModels();

        if (models.length === 0) {
            throw new Error('No models to export');
        }

        // Create main assembly JSON
        const assemblyData = this.exportAssembly(assemblyName, author, downloadLink);
        zip.file(`${assemblyName}.json`, JSON.stringify(assemblyData, null, 2));

        // Create individual JSON for each model
        models.forEach(model => {
            const modelJson = {
                version: "1.0",
                assemblyFile: `${assemblyName}.json`,
                modelId: model.id,
                modelName: model.name,
                message: `This part belongs to the "${assemblyName}" assembly. Load the assembly JSON first, then load this STL to apply positioning.`
            };

            // Remove .stl extension and add .json
            const jsonFileName = model.name.replace(/\.stl$/i, '.json');
            zip.file(jsonFileName, JSON.stringify(modelJson, null, 2));
        });

        // Generate and download ZIP
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `${assemblyName}.zip`;
        link.click();

        URL.revokeObjectURL(url);
    }

    /**
     * Load assembly from JSON data
     */
    async loadAssembly(jsonData, fileLoader) {
        // Clear existing models
        this.modelManager.clear();
        this.circleDetector.clearAll();

        // Note: This requires the original STL files to be available
        // For now, we'll just load the transform and circle data
        // In a full implementation, you'd need to store STL references or data

        if (!jsonData.models || jsonData.models.length === 0) {
            throw new Error('No models found in assembly data');
        }

        // This is a simplified loader - in practice, you'd need to:
        // 1. Load the STL files referenced in the JSON
        // 2. Apply transforms
        // 3. Recreate circle markers

        return {
            success: true,
            modelsCount: jsonData.models.length,
            circlesCount: jsonData.circles ? jsonData.circles.length : 0,
            message: 'Assembly structure loaded. You will need to load the STL files separately.'
        };
    }

    /**
     * Load assembly from file
     */
    loadFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (event) => {
                try {
                    const jsonData = JSON.parse(event.target.result);
                    this.loadAssembly(jsonData).then(resolve).catch(reject);
                } catch (error) {
                    reject(new Error('Invalid JSON file'));
                }
            };

            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    /**
     * Export simplified format (just transforms and circles)
     */
    exportSimplified() {
        const models = this.modelManager.getAllModels();
        const referenceModel = models[0];

        return {
            timestamp: new Date().toISOString(),
            reference: {
                name: referenceModel.name,
                id: referenceModel.id
            },
            models: models.map(model => ({
                id: model.id,
                name: model.name,
                position: model.transform.position,
                rotation: model.transform.rotation
            })),
            circles: this.circleDetector.getAllCircles().map(circle => ({
                modelId: circle.modelId,
                diameter: Math.round(circle.diameter * 100) / 100,
                x: Math.round(circle.center.x * 100) / 100,
                y: Math.round(circle.center.y * 100) / 100,
                z: Math.round(circle.center.z * 100) / 100
            }))
        };
    }
}
