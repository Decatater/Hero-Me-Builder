# STL Hole Examiner

This project provides a web-based tool to detect circular holes and define the top face of a 3D model in STL format. Designed for use with the Hero Me Builder.

## Features

- Upload STL files for analysis.
- Detect circular holes and group them by face.
- Select a face as the top orientation for further processing.
- Export hole data in JSON format for integration into other tools.

## Usage

1. Clone or download the repository.
2. Open `holeexxaminer.html` in a web browser.
3. Use the following controls:
   - **Upload File**: Load an STL model.
   - **Reset View**: Re-center and resize the view for the loaded model.
   - **Export Data**: Download detected holes and face data as a JSON file.
   - **Clear All**: Remove all detected holes.
   - **Select Top Face**: Enter face selection mode to mark the top orientation.

## Dependencies

This project uses the following libraries:

- [Three.js](https://threejs.org/): For rendering 3D models and handling interactions.
- [STLLoader](https://threejs.org/docs/#examples/en/loaders/STLLoader): For loading STL files.
- [OrbitControls](https://threejs.org/docs/#examples/en/controls/OrbitControls): For intuitive model interaction.

Dependencies are loaded via CDN and do not require additional installation.

## Contributing

Feel free to submit issues or feature requests. Pull requests are welcome.
