<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

function scanDirectory($dir) {
    $stlFiles = [];
    $jsonFiles = [];
    
    if (!is_dir($dir)) {
        return ['stl_count' => 0, 'json_count' => 0, 'matched_count' => 0, 'coverage_percent' => 0];
    }
    
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::LEAVES_ONLY
    );
    
    foreach ($iterator as $file) {
        $filename = $file->getFilename();
        $extension = strtolower($file->getExtension());
        
        if ($extension === 'stl') {
            $basename = pathinfo($filename, PATHINFO_FILENAME);
            $stlFiles[] = $basename;
        } elseif ($extension === 'json') {
            $basename = pathinfo($filename, PATHINFO_FILENAME);
            $jsonFiles[] = $basename;
        }
    }
    
    // Count matches
    $matchedCount = 0;
    foreach ($stlFiles as $stlBasename) {
        if (in_array($stlBasename, $jsonFiles)) {
            $matchedCount++;
        }
    }
    
    $stlCount = count($stlFiles);
    $jsonCount = count($jsonFiles);
    $coveragePercent = $stlCount > 0 ? round(($matchedCount / $stlCount) * 100, 1) : 0;
    
    return [
        'stl_count' => $stlCount,
        'json_count' => $jsonCount,
        'matched_count' => $matchedCount,
        'coverage_percent' => $coveragePercent
    ];
}

// Scan the heromedir folder
$heromedirPath = __DIR__ . '/heromedir';
$result = scanDirectory($heromedirPath);

echo json_encode($result);
?>