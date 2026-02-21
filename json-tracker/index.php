<?php
function scanDirectoryDetailed($dir, $basePath = '') {
    $result = [];

    if (!is_dir($dir)) {
        return $result;
    }

    $items = scandir($dir);

    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }

        $fullPath = $dir . DIRECTORY_SEPARATOR . $item;
        $relativePath = $basePath . '/' . $item;

        // Skip "Custom" folders
        if (strpos($relativePath, '/Custom') !== false) {
            continue;
        }

        if (is_dir($fullPath)) {
            $result[$item] = scanDirectoryDetailed($fullPath, $relativePath);
        }
    }

    return $result;
}

function getStlsWithoutJson($dir, &$missing = [], $currentPath = '') {
    if (!is_dir($dir)) {
        return;
    }

    $stlFiles = [];
    $jsonFiles = [];

    $items = scandir($dir);

    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }

        $fullPath = $dir . DIRECTORY_SEPARATOR . $item;
        $relativePath = $currentPath ? $currentPath . '/' . $item : $item;

        // Skip "Custom" folders
        if (strpos($relativePath, '/Custom') !== false) {
            continue;
        }

        if (is_dir($fullPath)) {
            getStlsWithoutJson($fullPath, $missing, $relativePath);
        } else {
            $extension = strtolower(pathinfo($item, PATHINFO_EXTENSION));
            $basename = pathinfo($item, PATHINFO_FILENAME);

            if ($extension === 'stl') {
                $stlFiles[] = ['name' => $item, 'basename' => $basename];
            } elseif ($extension === 'json') {
                $jsonFiles[] = $basename;
            }
        }
    }

    // Find STLs without matching JSON
    foreach ($stlFiles as $stlFile) {
        if (!in_array($stlFile['basename'], $jsonFiles)) {
            if (!isset($missing[$currentPath])) {
                $missing[$currentPath] = [];
            }
            $missing[$currentPath][] = $stlFile['name'];
        }
    }
}

// Cache file path
$cacheFile = __DIR__ . '/cache.json';
$heromedirPath = __DIR__ . '/../heromedir';

// Check if refresh is requested or cache doesn't exist
$forceRefresh = isset($_GET['refresh']);

if ($forceRefresh || !file_exists($cacheFile)) {
    // Get directory structure
    $structure = scanDirectoryDetailed($heromedirPath);

    // Get STLs without JSON organized by folder
    $missingJsons = [];
    getStlsWithoutJson($heromedirPath, $missingJsons);

    // Remove empty paths and sort
    $missingJsons = array_filter($missingJsons);
    ksort($missingJsons);

    // Calculate overall stats
    $totalMissing = 0;
    foreach ($missingJsons as $folder => $files) {
        $totalMissing += count($files);
    }

    // Save to cache
    $cacheData = [
        'missingJsons' => $missingJsons,
        'totalMissing' => $totalMissing,
        'lastUpdated' => time()
    ];
    file_put_contents($cacheFile, json_encode($cacheData));
} else {
    // Load from cache
    $cacheData = json_decode(file_get_contents($cacheFile), true);
    $missingJsons = $cacheData['missingJsons'];
    $totalMissing = $cacheData['totalMissing'];
    $lastUpdated = $cacheData['lastUpdated'];
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-CNLT432CYL"></script>
    <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', 'G-CNLT432CYL');
    </script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JSON Coverage Tracker - Hero Me Builder</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f5f5f5;
            padding-bottom: 40px;
        }

        .header {
            background-color: #2c3e50;
            color: white;
            padding: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        .header-content {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 15px;
        }

        .home-btn {
            background-color: #52c41a;
            color: white;
            padding: 10px 20px;
            border-radius: 6px;
            text-decoration: none;
            font-size: 14px;
            font-weight: 500;
            transition: background-color 0.3s;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }

        .home-btn:hover {
            background-color: #73d13d;
            color: white;
        }

        h1 {
            font-size: 24px;
            margin: 0;
        }

        .stats-badge {
            background-color: rgba(255, 255, 255, 0.1);
            padding: 8px 15px;
            border-radius: 20px;
            font-size: 14px;
        }

        .refresh-btn {
            background-color: #52c41a;
            color: white;
            padding: 10px 20px;
            border-radius: 6px;
            text-decoration: none;
            font-size: 14px;
            font-weight: 500;
            transition: background-color 0.3s;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            border: none;
            cursor: pointer;
        }

        .refresh-btn:hover {
            background-color: #73d13d;
            color: white;
        }

        .last-updated {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.7);
            margin-top: 5px;
        }

        .container {
            max-width: 1200px;
            margin: 30px auto;
            padding: 0 20px;
        }

        .info-box {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 20px;
            margin-bottom: 30px;
        }

        .info-box h2 {
            color: #2c3e50;
            margin-bottom: 10px;
            font-size: 20px;
        }

        .info-box p {
            color: #666;
            line-height: 1.6;
        }

        .folder-section {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 15px;
            overflow: hidden;
        }

        .folder-header {
            background-color: #3498db;
            color: white;
            padding: 15px 20px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: background-color 0.3s;
        }

        .folder-header:hover {
            background-color: #2980b9;
        }

        .folder-header.subfolder {
            background-color: #5dade2;
            padding-left: 40px;
        }

        .folder-header.subfolder:hover {
            background-color: #3498db;
        }

        .folder-name {
            font-weight: 600;
            font-size: 16px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .folder-count {
            background-color: rgba(255, 255, 255, 0.2);
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: bold;
        }

        .folder-content {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
        }

        .folder-content.expanded {
            max-height: 2000px;
            transition: max-height 0.5s ease-in;
        }

        .file-list {
            padding: 20px;
            background-color: #f8f9fa;
        }

        .file-item {
            padding: 10px 15px;
            background-color: white;
            margin-bottom: 8px;
            border-radius: 4px;
            border-left: 4px solid #e74c3c;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            color: #555;
        }

        .chevron {
            transition: transform 0.3s;
            font-size: 12px;
        }

        .chevron.rotated {
            transform: rotate(180deg);
        }

        .no-missing {
            text-align: center;
            padding: 60px 20px;
            color: #27ae60;
            font-size: 18px;
            font-weight: 500;
        }

        .no-missing::before {
            content: '✓';
            display: block;
            font-size: 48px;
            margin-bottom: 15px;
        }

        @media (max-width: 768px) {
            .header-content {
                flex-direction: column;
                align-items: flex-start;
            }

            h1 {
                font-size: 20px;
            }

            .folder-header {
                padding: 12px 15px;
            }

            .folder-header.subfolder {
                padding-left: 30px;
            }

            .folder-name {
                font-size: 14px;
            }

            .file-item {
                font-size: 12px;
                padding: 8px 12px;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-content">
            <a href="/" class="home-btn"><i class="fas fa-home"></i> Home</a>
            <div>
                <h1>JSON Coverage Tracker</h1>
                <?php if (isset($lastUpdated)): ?>
                    <div class="last-updated">Last updated: <?php echo date('M j, Y g:i A', $lastUpdated); ?></div>
                <?php endif; ?>
            </div>
            <div class="stats-badge">
                <?php echo $totalMissing; ?> STL<?php echo $totalMissing !== 1 ? 's' : ''; ?> missing JSON<?php echo $totalMissing !== 1 ? 's' : ''; ?>
            </div>
            <a href="../assembly-overlap-checker" class="home-btn" style="background-color: #1890ff;"><i class="fas fa-tools"></i> Assembly +N Namer</a>
            <a href="?refresh=1" class="refresh-btn"><i class="fas fa-sync-alt"></i> Refresh Data</a>
        </div>
    </div>

    <div class="container">
        <div class="info-box">
            <h2>About This Tracker</h2>
            <p>This page shows all STL files in the heromedir that are missing their corresponding JSON metadata files. Files are organized by folder for easy reference. Click on any folder to expand and see the missing files.</p>
            <p style="margin-top: 10px; font-size: 13px; color: #999;">Data is cached for performance. Click "Refresh Data" to scan for the latest changes.</p>
        </div>

        <?php if (empty($missingJsons)): ?>
            <div class="info-box no-missing">
                All STL files have matching JSON files!
            </div>
        <?php else: ?>
            <?php
            // Group by top-level folder
            $grouped = [];
            foreach ($missingJsons as $path => $files) {
                $parts = explode('/', trim($path, '/'));
                $topLevel = $parts[0] ?? 'root';

                if (!isset($grouped[$topLevel])) {
                    $grouped[$topLevel] = [];
                }

                $grouped[$topLevel][$path] = $files;
            }

            foreach ($grouped as $topFolder => $paths):
                $topFolderCount = 0;
                foreach ($paths as $files) {
                    $topFolderCount += count($files);
                }
            ?>
                <div class="folder-section">
                    <div class="folder-header" onclick="toggleFolder(this)">
                        <div class="folder-name">
                            <span class="chevron">▼</span>
                            <span><?php echo htmlspecialchars($topFolder); ?></span>
                        </div>
                        <div class="folder-count"><?php echo $topFolderCount; ?> file<?php echo $topFolderCount !== 1 ? 's' : ''; ?></div>
                    </div>
                    <div class="folder-content">
                        <?php foreach ($paths as $path => $files): ?>
                            <?php
                            $displayPath = trim($path, '/');
                            $isSubfolder = substr_count($displayPath, '/') > 0;
                            ?>
                            <div class="folder-section" style="margin: 10px; box-shadow: none;">
                                <div class="folder-header subfolder" onclick="toggleFolder(this, event)">
                                    <div class="folder-name">
                                        <span class="chevron">▼</span>
                                        <span><?php echo htmlspecialchars($displayPath); ?></span>
                                    </div>
                                    <div class="folder-count"><?php echo count($files); ?> file<?php echo count($files) !== 1 ? 's' : ''; ?></div>
                                </div>
                                <div class="folder-content">
                                    <div class="file-list">
                                        <?php foreach ($files as $file): ?>
                                            <div class="file-item"><?php echo htmlspecialchars($file); ?></div>
                                        <?php endforeach; ?>
                                    </div>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    </div>
                </div>
            <?php endforeach; ?>
        <?php endif; ?>
    </div>

    <script>
        function toggleFolder(element, event) {
            if (event) {
                event.stopPropagation();
            }

            const content = element.nextElementSibling;
            const chevron = element.querySelector('.chevron');

            if (content.classList.contains('expanded')) {
                content.classList.remove('expanded');
                chevron.classList.remove('rotated');
            } else {
                content.classList.add('expanded');
                chevron.classList.add('rotated');
            }
        }
    </script>
    <script src="../js/cookie-consent.js"></script>
</body>
</html>
