/**
 * TransformControl - Manages model transformations with visual controls
 */
class TransformControlManager {
    constructor(camera, renderer, scene) {
        this.camera = camera;
        this.renderer = renderer;
        this.scene = scene;
        this.control = new THREE.TransformControls(camera, renderer.domElement);
        this.currentMode = 'translate';
        this.snapToGrid = false;
        this.snapAngle = false;
        this.gridSize = 1.0; // 1mm
        this.angleStep = Math.PI / 12; // 15 degrees

        // Use world space for consistent axis orientation
        this.control.setSpace('world');

        this.scene.add(this.control);

        // Event handlers
        this.control.addEventListener('change', () => this.onTransformChange());
        this.control.addEventListener('dragging-changed', (event) => this.onDraggingChanged(event));

        this.onChangeCallback = null;
        this.onDraggingCallback = null;
    }

    /**
     * Attach transform controls to a model
     */
    attach(mesh) {
        if (!mesh) {
            this.detach();
            return;
        }

        this.control.attach(mesh);
        this.control.setMode(this.currentMode);
        this.updateSnapping();
    }

    /**
     * Detach transform controls
     */
    detach() {
        this.control.detach();
    }

    /**
     * Set transform mode (translate, rotate, scale)
     */
    setMode(mode) {
        this.currentMode = mode;
        if (this.control.object) {
            this.control.setMode(mode);
        }
        this.updateSnapping();
    }

    /**
     * Get current mode
     */
    getMode() {
        return this.currentMode;
    }

    /**
     * Enable/disable grid snapping
     */
    setSnapToGrid(enabled) {
        this.snapToGrid = enabled;
        this.updateSnapping();
    }

    /**
     * Enable/disable angle snapping
     */
    setSnapAngle(enabled) {
        this.snapAngle = enabled;
        this.updateSnapping();
    }

    /**
     * Update snapping settings
     */
    updateSnapping() {
        if (this.currentMode === 'translate' && this.snapToGrid) {
            this.control.setTranslationSnap(this.gridSize);
        } else {
            this.control.setTranslationSnap(null);
        }

        if (this.currentMode === 'rotate' && this.snapAngle) {
            this.control.setRotationSnap(this.angleStep);
        } else {
            this.control.setRotationSnap(null);
        }
    }

    /**
     * Set grid size for snapping
     */
    setGridSize(size) {
        this.gridSize = size;
        this.updateSnapping();
    }

    /**
     * Set angle step for rotation snapping
     */
    setAngleStep(radians) {
        this.angleStep = radians;
        this.updateSnapping();
    }

    /**
     * Handle transform change
     */
    onTransformChange() {
        if (this.onChangeCallback && this.control.object) {
            const position = this.control.object.position.clone();
            const rotation = this.control.object.rotation.clone();
            this.onChangeCallback(position, rotation);
        }
    }

    /**
     * Handle dragging state change
     */
    onDraggingChanged(event) {
        if (this.onDraggingCallback) {
            this.onDraggingCallback(event.value);
        }
    }

    /**
     * Set callback for transform changes
     */
    onChange(callback) {
        this.onChangeCallback = callback;
    }

    /**
     * Set callback for dragging state changes
     */
    onDragging(callback) {
        this.onDraggingCallback = callback;
    }

    /**
     * Show/hide the transform control
     */
    setVisible(visible) {
        this.control.visible = visible;
    }

    /**
     * Get the transform control object
     */
    getControl() {
        return this.control;
    }

    /**
     * Keyboard shortcuts handler (disabled)
     */
    handleKeyDown(event) {
        // Keyboard shortcuts disabled to prevent conflicts with text input
        return false;
    }

    /**
     * Reset position of attached object
     */
    resetPosition() {
        if (this.control.object) {
            this.control.object.position.set(0, 0, 0);
            this.onTransformChange();
        }
    }

    /**
     * Reset rotation of attached object
     */
    resetRotation() {
        if (this.control.object) {
            this.control.object.rotation.set(0, 0, 0);
            this.onTransformChange();
        }
    }

    /**
     * Reset transform of attached object
     */
    resetTransform() {
        if (this.control.object) {
            this.control.object.position.set(0, 0, 0);
            this.control.object.rotation.set(0, 0, 0);
            this.control.object.scale.set(1, 1, 1);
            this.onTransformChange();
        }
    }

    /**
     * Clean up
     */
    dispose() {
        this.detach();
        this.scene.remove(this.control);
        this.control.dispose();
    }
}
