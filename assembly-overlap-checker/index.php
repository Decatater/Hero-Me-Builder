<?php
// Handle AJAX request for server scan
if (isset($_GET['action']) && $_GET['action'] === 'scan') {
    header('Content-Type: application/json');

    $heroDir = realpath(__DIR__ . '/../heromedir');

    if (!$heroDir || !is_dir($heroDir)) {
        echo json_encode(['success' => false, 'error' => 'heromedir not found']);
        exit;
    }

    try {
        $stlUsage = [];

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($heroDir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($iterator as $file) {
            if ($file->isFile() && $file->getExtension() === 'json') {
                $content = @file_get_contents($file->getPathname());
                if (!$content) continue;

                $data = @json_decode($content, true);
                if (!$data) continue;

                // Check if this is an assembly JSON
                if (isset($data['models']) && isset($data['assemblyName']) && is_array($data['models'])) {
                    $dir = dirname($file->getPathname());

                    foreach ($data['models'] as $model) {
                        if (!isset($model['name'])) continue;

                        $stlFile = $model['name'];

                        if (!isset($stlUsage[$stlFile])) {
                            $stlUsage[$stlFile] = [];
                        }

                        $stlUsage[$stlFile][] = [
                            'assemblyName' => $data['assemblyName'],
                            'assemblyFile' => basename($file->getPathname()),
                            'modelId' => $model['id'] ?? 'unknown',
                            'directory' => $dir
                        ];
                    }
                }
            }
        }

        echo json_encode(['success' => true, 'assemblies' => $stlUsage]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Assembly +N Namer - Developer Tool</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
        }

        .header h1 {
            font-size: 2.2em;
            margin-bottom: 10px;
        }

        .header p {
            opacity: 0.95;
            font-size: 1.1em;
            line-height: 1.6;
        }

        .content {
            padding: 40px 30px;
        }

        .info-box {
            background: #e7f3ff;
            border-left: 4px solid #2196F3;
            padding: 20px;
            margin-bottom: 30px;
            border-radius: 4px;
        }

        .info-box h3 {
            color: #1976D2;
            margin-bottom: 10px;
        }

        .info-box ol {
            margin-left: 20px;
            color: #333;
            line-height: 1.8;
        }

        .upload-section {
            text-align: center;
            padding: 40px 20px;
            border: 3px dashed #667eea;
            border-radius: 10px;
            background: #f8f9ff;
            margin-bottom: 30px;
            transition: all 0.3s;
        }

        .upload-section:hover {
            border-color: #5568d3;
            background: #f0f2ff;
        }

        .upload-section.dragover {
            background: #e7eaff;
            border-color: #4752c4;
        }

        .upload-icon {
            font-size: 4em;
            margin-bottom: 20px;
            color: #667eea;
        }

        .file-input-wrapper {
            position: relative;
            display: inline-block;
        }

        .file-input {
            display: none;
        }

        .file-label {
            display: inline-block;
            padding: 15px 40px;
            background: #667eea;
            color: white;
            border-radius: 5px;
            cursor: pointer;
            font-size: 1.1em;
            transition: all 0.3s;
        }

        .file-label:hover {
            background: #5568d3;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .selected-file {
            margin-top: 20px;
            padding: 15px;
            background: white;
            border-radius: 5px;
            border: 1px solid #dee2e6;
            display: none;
        }

        .selected-file.show {
            display: block;
        }

        .submit-btn {
            display: none;
            margin-top: 20px;
            padding: 15px 50px;
            background: #28a745;
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 1.1em;
            cursor: pointer;
            transition: all 0.3s;
        }

        .submit-btn.show {
            display: inline-block;
        }

        .submit-btn:hover {
            background: #218838;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(40, 167, 69, 0.4);
        }

        .submit-btn:disabled {
            background: #6c757d;
            cursor: not-allowed;
            transform: none;
        }

        .alert {
            padding: 20px;
            margin-bottom: 30px;
            border-radius: 5px;
            font-size: 1em;
        }

        .alert-error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }

        .alert-success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }

        .example-box {
            background: #fff9e6;
            border-left: 4px solid #ffc107;
            padding: 20px;
            border-radius: 4px;
        }

        .example-box h4 {
            color: #856404;
            margin-bottom: 10px;
        }

        .code {
            font-family: 'Courier New', monospace;
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 0.95em;
        }

        .loading {
            display: none;
            text-align: center;
            padding: 20px;
        }

        .loading.show {
            display: block;
        }

        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 0 auto 15px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .result-box {
            display: none;
            background: #d4edda;
            border: 1px solid #c3e6cb;
            border-radius: 5px;
            padding: 20px;
            margin-top: 20px;
        }

        .result-box.show {
            display: block;
        }

        .result-box h3 {
            color: #155724;
            margin-bottom: 15px;
        }

        .json-list {
            list-style: none;
            padding: 0;
        }

        .json-item {
            background: white;
            padding: 10px 15px;
            margin-bottom: 10px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1><i class="fas fa-hashtag"></i> Assembly +N Namer</h1>
            <p>Upload your assembly ZIP to automatically generate proper +N JSON naming</p>
        </div>

        <div class="content">
            <div class="info-box">
                <h3>How it works:</h3>
                <ol>
                    <li>Upload your assembly ZIP file (created with the pre-aligner tool)</li>
                    <li>The tool scans the server to find which STL files are already used in other assemblies</li>
                    <li>It determines which +N variant numbers are needed for overlapping parts</li>
                    <li>You get back a ZIP with properly named JSON files (Base.json, Base+1.json, etc.)</li>
                    <li>Extract these JSONs to the same folder as your STL files</li>
                </ol>
            </div>

            <div id="errorBox" class="alert alert-error" style="display: none;"></div>

            <div class="upload-section" id="dropZone">
                <div class="upload-icon"><i class="fas fa-file-archive"></i></div>
                <h3>Drop Assembly ZIP Here</h3>
                <p style="margin: 15px 0; color: #6c757d;">or</p>

                <div class="file-input-wrapper">
                    <input type="file" id="fileInput" class="file-input" accept=".zip" required>
                    <label for="fileInput" class="file-label">Choose ZIP File</label>
                </div>

                <div class="selected-file" id="selectedFile">
                    <strong>Selected:</strong> <span id="fileName"></span>
                </div>

                <button type="button" class="submit-btn" id="submitBtn">
                    <i class="fas fa-rocket"></i> Process Assembly
                </button>
            </div>

            <div class="loading" id="loading">
                <div class="spinner"></div>
                <p><strong>Processing assembly...</strong></p>
                <p style="color: #6c757d; margin-top: 10px;">Scanning for overlaps and generating +N files</p>
            </div>

            <div class="result-box" id="resultBox">
                <h3><i class="fas fa-check-circle"></i> Generated JSON Files</h3>
                <ul class="json-list" id="jsonList"></ul>
                <button class="submit-btn show" id="downloadBtn" style="margin-top: 15px;">
                    <i class="fas fa-download"></i> Download ZIP
                </button>
            </div>

            <div class="example-box">
                <h4>Example:</h4>
                <p>If your assembly contains <span class="code">HMG7.3 Plain X Carriage Short Back.stl</span> and it's already used in another assembly, you'll get:</p>
                <ul style="margin: 15px 0 0 20px; line-height: 1.8;">
                    <li><span class="code">HMG7.3 Plain X Carriage Short Back+2.json</span> (if base and +1 already exist)</li>
                    <li>Each JSON will point to your assembly with the correct modelId</li>
                </ul>
            </div>
        </div>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
    <script>
        const fileInput = document.getElementById('fileInput');
        const selectedFile = document.getElementById('selectedFile');
        const fileName = document.getElementById('fileName');
        const submitBtn = document.getElementById('submitBtn');
        const loading = document.getElementById('loading');
        const dropZone = document.getElementById('dropZone');
        const errorBox = document.getElementById('errorBox');
        const resultBox = document.getElementById('resultBox');
        const jsonList = document.getElementById('jsonList');
        const downloadBtn = document.getElementById('downloadBtn');

        let generatedZip = null;

        // File input change
        fileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                fileName.textContent = this.files[0].name;
                selectedFile.classList.add('show');
                submitBtn.classList.add('show');
            }
        });

        // Submit button
        submitBtn.addEventListener('click', async function() {
            if (!fileInput.files.length) return;

            errorBox.style.display = 'none';
            resultBox.classList.remove('show');
            loading.classList.add('show');
            submitBtn.disabled = true;

            try {
                await processAssembly(fileInput.files[0]);
            } catch (error) {
                showError(error.message);
            } finally {
                loading.classList.remove('show');
                submitBtn.disabled = false;
            }
        });

        // Download button
        downloadBtn.addEventListener('click', function() {
            if (generatedZip) {
                generatedZip.generateAsync({type: 'blob'}).then(function(content) {
                    const url = URL.createObjectURL(content);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'assembly_plus_n_jsons.zip';
                    a.click();
                    URL.revokeObjectURL(url);
                });
            }
        });

        async function processAssembly(file) {
            // Verify file is still accessible
            if (!file || !file.size) {
                throw new Error('File is no longer accessible. Please select the file again.');
            }

            // Load and parse uploaded ZIP
            const uploadedZip = new JSZip();
            let zipData;
            try {
                zipData = await uploadedZip.loadAsync(file);
            } catch (e) {
                throw new Error('Failed to read ZIP file: ' + e.message);
            }

            // Find assembly JSON and keep track of original files
            let assemblyJson = null;
            let assemblyJsonFilename = null;
            const originalFiles = {};

            for (const [filename, fileData] of Object.entries(zipData.files)) {
                if (fileData.dir) continue;

                // Store all files for later inclusion
                originalFiles[filename] = fileData;

                // Find the assembly JSON
                if (!assemblyJson && filename.endsWith('.json')) {
                    const content = await fileData.async('string');
                    try {
                        const data = JSON.parse(content);
                        if (data.models && data.assemblyName) {
                            assemblyJson = data;
                            assemblyJsonFilename = filename;
                        }
                    } catch (e) {
                        // Not a valid JSON, skip
                    }
                }
            }

            if (!assemblyJson) {
                throw new Error('No assembly JSON found in ZIP');
            }

            // Fetch existing assemblies from server
            const response = await fetch('?action=scan');
            if (!response.ok) {
                throw new Error(`Failed to scan server assemblies: ${response.status} ${response.statusText}`);
            }

            const responseText = await response.text();
            let serverData;
            try {
                serverData = JSON.parse(responseText);
            } catch (e) {
                console.error('Response text:', responseText);
                throw new Error('Server returned invalid JSON. Check console for details.');
            }

            if (!serverData.success) {
                throw new Error(serverData.error || 'Server scan failed');
            }

            // Generate +N JSON files
            const jsonFiles = generatePlusNJsons(assemblyJson, serverData.assemblies);

            // Create output ZIP
            generatedZip = new JSZip();
            jsonList.innerHTML = '';

            // Get list of base names that got +N variants
            const generatedBaseNames = new Set();
            for (const jsonFile of jsonFiles) {
                const baseName = jsonFile.filename.replace(/\+\d+\.json$/, '.json');
                generatedBaseNames.add(baseName);
            }

            // Copy original files that should be retained
            let retainedCount = 0;
            for (const [filename, fileData] of Object.entries(originalFiles)) {
                // Skip STL files
                if (filename.toLowerCase().endsWith('.stl')) {
                    continue;
                }

                // Skip JSON files that got renamed to +N variants
                if (filename.endsWith('.json') && generatedBaseNames.has(filename)) {
                    continue;
                }

                // Keep everything else (assembly JSON, other files, etc.)
                const content = await fileData.async('uint8array');
                generatedZip.file(filename, content);
                retainedCount++;
            }

            // Add generated +N JSON files
            for (const jsonFile of jsonFiles) {
                generatedZip.file(jsonFile.filename, JSON.stringify(jsonFile.content, null, 2));

                const li = document.createElement('li');
                li.className = 'json-item';
                li.textContent = jsonFile.filename;
                jsonList.appendChild(li);
            }

            // Add a note about what was included
            if (retainedCount > 0) {
                const summary = document.createElement('li');
                summary.style.fontStyle = 'italic';
                summary.style.color = '#6c757d';
                summary.textContent = `+ ${retainedCount} original file${retainedCount !== 1 ? 's' : ''} retained (assembly JSON, etc.)`;
                jsonList.appendChild(summary);
            }

            resultBox.classList.add('show');
        }

        function generatePlusNJsons(assemblyJson, serverAssemblies) {
            const jsonFiles = [];
            const assemblyName = assemblyJson.assemblyName;

            for (const model of assemblyJson.models) {
                const stlFile = model.name;
                const modelId = model.id;
                const baseName = stlFile.replace(/\.(stl|STL)$/, '');

                // Check if this STL exists on server
                const existingUsage = serverAssemblies[stlFile] || [];

                let jsonFilename;
                if (existingUsage.length === 0) {
                    // STL doesn't exist on server - use base name
                    jsonFilename = baseName + '.json';
                } else {
                    // STL exists - use next +N number
                    jsonFilename = baseName + '+' + existingUsage.length + '.json';
                }

                const jsonContent = {
                    version: '1.0',
                    assemblyFile: assemblyName.replace(/\.(json|JSON)$/, '') + '.json',
                    modelId: modelId,
                    modelName: stlFile,
                    message: `This part belongs to the "${assemblyName}" assembly. Load the assembly JSON first, then load this STL to apply positioning.`
                };

                jsonFiles.push({
                    filename: jsonFilename,
                    content: jsonContent,
                    stlFile: stlFile
                });
            }

            return jsonFiles;
        }

        function showError(message) {
            errorBox.textContent = 'Error: ' + message;
            errorBox.style.display = 'block';
        }

        // Drag and drop
        dropZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', function() {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', function(e) {
            e.preventDefault();
            dropZone.classList.remove('dragover');

            if (e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                if (file.name.endsWith('.zip')) {
                    fileInput.files = e.dataTransfer.files;
                    fileName.textContent = file.name;
                    selectedFile.classList.add('show');
                    submitBtn.classList.add('show');
                } else {
                    showError('Please drop a ZIP file');
                }
            }
        });
    </script>
</body>
</html>
