# Hero Me 3D Printer Cooling System Part Picker and Assembler

This project is a specialized tool designed for the Hero Me 3D printer cooling system. It allows users to quickly and easily find and assemble the parts they need for their setup. The application leverages Three.js for 3D visualization and interaction, making it an intuitive and efficient solution.

## Features

- **Interactive Part Selection**: Choose components such as hotends, skirts, fan guards, and more from categorized dropdown menus.
- **Attachment Visualization**: Highlight predefined attachment points on the base model and visualize part placement.
- **Automatic Alignment**: Automatically aligns and positions parts based on geometric and orientation data.
- **Part Matching**: Matches hole patterns between the base and selected parts to ensure compatibility.
- **Local Directory Integration**: Load parts from a predefined directory structure for easy customization.

## Usage

1. Clone or download the repository.
2. Start a local server by running `server.py`:
   ```bash
   python server.py
   ```
3. Open your browser and navigate to http://localhost:8000/rebuilder.html.
4. Use the following functionalities:
    - **Attachment Points**: Hover over points on the base model to highlight them, and click to display dropdown menus for part selection.
    - **Dropdown Menus**: Select components from categorized options for hotends, skirts, fan guards, part cooling, wings, and gantry adapters.
    - **Alignment**: Automatically aligns parts to the base model based on their geometric data.

## Dependencies

This project uses the following libraries:
- [Three.js](https://threejs.org/): For rendering 3D models and handling interactions.
- [STLLoader](https://threejs.org/docs/#examples/en/loaders/STLLoader): For loading STL files.
- [OrbitControls](https://threejs.org/docs/#examples/en/controls/OrbitControls): For intuitive model interaction.

## Additional Requirements

- [Python 3](https://www.python.org/downloads/): For running the local server.

## Contributing

Feel free to submit issues or feature requests. Pull requests are welcome.