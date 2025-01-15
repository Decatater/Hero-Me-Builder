<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

function scanDirectory($path) {
    $result = array();
    
    // Get all files and directories in this path
    $items = scandir($path);
    
    foreach ($items as $item) {
        // Skip . and ..
        if ($item == '.' || $item == '..') continue;
        
        $fullPath = $path . '/' . $item;
        $relativePath = str_replace('./', '', $fullPath);
        
        if (is_dir($fullPath)) {
            // It's a directory
            $result[] = array(
                'type' => 'directory',
                'name' => $item,
                'path' => $relativePath,
                'children' => scanDirectory($fullPath)
            );
        } else {
            // Only include .stl and .json files
            if (preg_match('/\.(stl|json)$/i', $item)) {
                $result[] = array(
                    'type' => 'file',
                    'name' => $item,
                    'path' => $relativePath
                );
            }
        }
    }
    
    return $result;
}

try {
    $structure = scanDirectory('./heromedir');
    echo json_encode(array($structure));
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(array('error' => $e->getMessage()));
}