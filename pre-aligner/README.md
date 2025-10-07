# STL Pre-Aligner

A client-side web tool for aligning multiple STL models and detecting mounting holes/circles.

## Features

- **Multi-Model Management**: Load and manage multiple STL files
- **Transform Controls**: Translate and rotate models with visual gizmos
- **Orientation Face Selection**: Mark reference faces for alignment
- **Face Alignment Tool**: Automatically align faces to nearest axis plane (±X, ±Y, ±Z)
- **Circle/Hole Detection**: Click-to-detect mounting holes with preview
- **Assembly Export**: Export positioned models with credits to ZIP file

## PHP Safety

✅ **100% Client-Side Application**
- No server-side code (PHP, Python, etc.)
- All processing done in the browser using JavaScript
- Safe to deploy on any PHP server without security concerns
- No eval(), exec(), or dangerous code execution

## Dependencies

### Local Dependencies
- Font Awesome 6.x (from `../fonts/fontawesome/`)

### CDN Dependencies (External)
- Three.js r128 (3D rendering)
- OrbitControls (camera controls)
- TransformControls (model manipulation)
- STLLoader (STL file parsing)
- JSZip 3.10.1 (ZIP file generation)

**Note**: CDN dependencies are loaded from trusted sources (cdnjs.cloudflare.com, cdn.jsdelivr.net) and are standard for client-side 3D applications.

## File Structure

```
pre-aligner/
├── index.html              # Main HTML page
├── app.js                  # Main application logic
├── styles.css              # Application styling
├── modules/
│   ├── ModelManager.js     # Multi-model management
│   ├── TransformControl.js # Position/rotation controls
│   ├── FaceDetector.js     # Face detection and highlighting
│   ├── CircleDetector.js   # Circle/hole detection
│   └── ExportManager.js    # JSON/ZIP export functionality
└── README.md               # This file
```

## Usage

1. **Load Models**: Click "Add STL" to load one or more STL files
2. **Position Models**: Use T (translate) or R (rotate) with the gizmo
3. **Set Orientation Face**: Click the button, hover over a face, click to set
4. **Align Face to Plane**: Click the button, select a tilted face to auto-align it
5. **Detect Circles**: Toggle mode, hover over holes, click to add
6. **Export**: Fill in assembly name, author, and link, then export to ZIP

## Export Format

The tool exports a ZIP file containing:
- Main assembly JSON with all model positions, circles, and orientation faces
- Individual JSON for each model (references the main assembly)

### Assembly JSON Structure
```json
{
  "version": "1.0",
  "assemblyName": "my-assembly",
  "credits": {
    "author": "Your Name",
    "downloadLink": "https://..."
  },
  "models": [...],
  "orientationFaces": [...],
  "circles": [...],
  "relationships": [...]
}
```

## Keyboard Shortcuts

- **ESC**: Cancel current mode/tool (Orientation Face, Align Face, or Circle Detection mode)

## Browser Compatibility

- Chrome/Edge (Recommended)
- Firefox
- Safari (WebGL required)

Requires a modern browser with WebGL support for 3D rendering.

## License

Part of the HeroMeBuilder project.
