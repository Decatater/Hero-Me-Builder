<?php
// Prevent any output before JSON
error_reporting(0);
ini_set('display_errors', 0);

header('Content-Type: application/json');

$heroDir = realpath(__DIR__ . '/../heromedir');

if (!$heroDir || !is_dir($heroDir)) {
    echo json_encode(['success' => false, 'error' => 'heromedir not found']);
    exit;
}

try {
    $assemblies = scanAssemblies($heroDir);
    echo json_encode(['success' => true, 'assemblies' => $assemblies]);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

function scanAssemblies($heroDir) {
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

    return $stlUsage;
}
