const { useState, useRef, useEffect } = React;

const PartAssemblyViewer = () => {
    const canvasRef = useRef(null);
    const engineRef = useRef(null);
    const sceneRef = useRef(null);
    const [baseModel, setBaseModel] = useState(null);
    const [selectedPart, setSelectedPart] = useState(null);
    const [matchingPoints, setMatchingPoints] = useState([]);

    useEffect(() => {
        if (!canvasRef.current) return;

        // Create engine
        const engine = new BABYLON.Engine(canvasRef.current, true);
        engineRef.current = engine;

        // Create scene
        const scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color4(0.93, 0.93, 0.93, 1);
        sceneRef.current = scene;

        // Create camera
        const camera = new BABYLON.ArcRotateCamera(
            "camera",
            Math.PI / 2,
            Math.PI / 2,
            100,
            BABYLON.Vector3.Zero(),
            scene
        );
        camera.attachControl(canvasRef.current, true);
        camera.wheelPrecision = 50;
        camera.lowerRadiusLimit = 10;
        camera.upperRadiusLimit = 200;

        // Add lights
        const light1 = new BABYLON.HemisphericLight(
            "light1",
            new BABYLON.Vector3(0, 1, 0),
            scene
        );
        light1.intensity = 0.7;

        const light2 = new BABYLON.DirectionalLight(
            "light2",
            new BABYLON.Vector3(0, -1, 1),
            scene
        );
        light2.intensity = 0.5;

        // Create coordinate axes
        const axes = new BABYLON.AxesViewer(scene, 20);

        // Load base model
        loadBaseModel(scene);

        // Start render loop
        engine.runRenderLoop(() => {
            scene.render();
        });

        // Handle window resize
        const handleResize = () => {
            engine.resize();
        };
        window.addEventListener('resize', handleResize);

        // Cleanup
        return () => {
            window.removeEventListener('resize', handleResize);
            engine.dispose();
            scene.dispose();
        };
    }, []);

    const loadBaseModel = async (scene) => {
        try {
            const baseModelResult = await BABYLON.SceneLoader.ImportMeshAsync(
                "",
                "",
                "UniversalBase.stl",
                scene,
                null,
                ".stl"
            );

            const baseMesh = baseModelResult.meshes[0];
            baseMesh.position = BABYLON.Vector3.Zero();

            // Center model
            const boundingBox = baseMesh.getBoundingInfo().boundingBox;
            const center = boundingBox.center;
            baseMesh.position = center.scale(-1);

            // Set material
            const material = new BABYLON.StandardMaterial("baseMaterial", scene);
            material.diffuseColor = new BABYLON.Color3(0.4, 0.4, 0.8);
            material.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            baseMesh.material = material;

            setBaseModel(baseMesh);

            // Load metadata
            const response = await fetch('UniversalBase.json');
            const metadata = await response.json();

            visualizeHoles(metadata, scene, new BABYLON.Color3(1, 0, 0));
            baseMesh.metadata = metadata;

        } catch (error) {
            console.error('Error loading base model:', error);
        }
    };

    const visualizeHoles = (metadata, scene, color) => {
        if (!metadata?.faces) return;

        metadata.faces.forEach(face => {
            face.holes.forEach(hole => {
                const cylinder = BABYLON.MeshBuilder.CreateCylinder("hole", {
                    height: 2,
                    diameter: hole.diameter,
                    tessellation: 32
                }, scene);

                cylinder.position = new BABYLON.Vector3(
                    hole.position.x,
                    hole.position.y,
                    hole.position.z
                );

                const rotation = new BABYLON.Vector3(
                    BABYLON.Tools.ToRadians(hole.rotation.x),
                    BABYLON.Tools.ToRadians(hole.rotation.y),
                    BABYLON.Tools.ToRadians(hole.rotation.z)
                );
                cylinder.rotation = rotation;

                const material = new BABYLON.StandardMaterial("holeMaterial", scene);
                material.diffuseColor = color;
                material.alpha = 0.7;
                cylinder.material = material;

                cylinder.metadata = {
                    holeData: hole,
                    faceId: face.faceId
                };
            });
        });
    };

    const findMatchingPatterns = (partMetadata, baseMetadata) => {
        const matches = [];

        const groupHolesByNormal = (faces) => {
            return _.groupBy(faces, face => {
                const { x, y, z } = face.normal;
                return `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
            });
        };

        const baseGroups = groupHolesByNormal(baseMetadata.faces);
        const partGroups = groupHolesByNormal(partMetadata.faces);

        Object.entries(partGroups).forEach(([normal, partFaces]) => {
            if (baseGroups[normal]) {
                partFaces.forEach(partFace => {
                    baseGroups[normal].forEach(baseFace => {
                        const matchingDistances = _.intersectionBy(
                            partFace.alignedDistances,
                            baseFace.alignedDistances,
                            'distance'
                        );

                        if (matchingDistances.length > 0) {
                            matches.push({
                                baseFace,
                                partFace,
                                matchingDistances
                            });
                        }
                    });
                });
            }
        });

        return matches;
    };

    const handlePartSelect = async (part) => {
        const scene = sceneRef.current;
        if (!scene || !baseModel?.metadata) return;

        setSelectedPart(part);

        try {
            // Remove previous part
            scene.meshes
                .filter(mesh => mesh.metadata?.isPart)
                .forEach(mesh => mesh.dispose());

            // Load part
            const partResult = await BABYLON.SceneLoader.ImportMeshAsync(
                "",
                "",
                part.stlFile,
                scene,
                null,
                ".stl"
            );

            const partMesh = partResult.meshes[0];

            // Set material
            const material = new BABYLON.StandardMaterial("partMaterial", scene);
            material.diffuseColor = new BABYLON.Color3(0.4, 0.8, 0.4);
            material.alpha = 0.8;
            partMesh.material = material;

            // Load metadata
            const response = await fetch(part.jsonFile);
            const metadata = await response.json();

            partMesh.metadata = {
                ...metadata,
                isPart: true
            };

            const matches = findMatchingPatterns(metadata, baseModel.metadata);
            setMatchingPoints(matches);

            visualizeHoles(metadata, scene, new BABYLON.Color3(0, 1, 0));

        } catch (error) {
            console.error('Error loading part:', error);
        }
    };

    return (
        <div className="container">
            <div className="canvas-container">
                <canvas ref={canvasRef} className="canvas" />
            </div>
            <div className="sidebar">
                <h2>Parts</h2>
                <div className="part-list">
                    <button
                        className={`part-button ${selectedPart?.name === 'Part 1' ? 'selected' : ''}`}
                        onClick={() => handlePartSelect({
                            name: 'Part 1',
                            stlFile: 'part1.stl',
                            jsonFile: 'part1.json'
                        })}
                    >
                        Part 1
                    </button>
                </div>
                {matchingPoints.length > 0 && (
                    <div className="matches">
                        <h3>Matching Points</h3>
                        {matchingPoints.map((match, index) => (
                            <div key={index} className="match-item">
                                <p>Base Face: {match.baseFace.faceId}</p>
                                <p>Part Face: {match.partFace.faceId}</p>
                                <p>Matching Distances: {match.matchingDistances.length}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// Render the app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<PartAssemblyViewer />); const App = () => {
    const mountRef = React.useRef(null);
    const [scene, setScene] = React.useState(null);
    const [baseModel, setBaseModel] = React.useState(null);

    React.useEffect(() => {
        if (!mountRef.current) return;

        // Scene setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf0f0f0);

        // Camera setup
        const camera = new THREE.PerspectiveCamera(
            75,
            mountRef.current.clientWidth / mountRef.current.clientHeight,
            0.1,
            1000
        );
        camera.position.set(50, 50, 50);

        // Renderer setup
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
        mountRef.current.appendChild(renderer.domElement);

        // Controls
        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(10, 10, 10);
        scene.add(ambientLight);
        scene.add(directionalLight);

        // Add coordinate axes
        const axesHelper = new THREE.AxesHelper(20);
        scene.add(axesHelper);

        setScene(scene);

        // Load base model
        const loader = new THREE.STLLoader();
        loader.load('UniversalBase.stl', (geometry) => {
            const material = new THREE.MeshPhongMaterial({
                color: 0x7777ff,
                specular: 0x111111,
                shininess: 200
            });
            const mesh = new THREE.Mesh(geometry, material);

            // Center the model
            geometry.computeBoundingBox();
            const center = new THREE.Vector3();
            geometry.boundingBox.getCenter(center);
            mesh.position.sub(center);

            scene.add(mesh);
            setBaseModel(mesh);
        });

        // Animation loop
        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();

        // Handle window resize
        const handleResize = () => {
            camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
        };
        window.addEventListener('resize', handleResize);

        // Cleanup
        return () => {
            window.removeEventListener('resize', handleResize);
            mountRef.current?.removeChild(renderer.domElement);
            renderer.dispose();
        };
    }, []);

    return (
        <div className="container">
            <div className="canvas-container">
                <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
            </div>
            <div className="sidebar">
                <h2>Parts</h2>
                {/* Part selection will go here */}
            </div>
        </div>
    );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);