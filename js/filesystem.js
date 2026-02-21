// File System Module
// Functions for directory navigation, file loading, and menu management

// Load and cache directory structure from server
async function loadDirectoryStructure() {
    try {
        console.log('Starting directory structure load...');
        const response = await fetch('list-files.php');
        console.log('Fetch response:', response);
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Raw directory data:', data);
        
        directoryStructure = data;
        console.log('Processed directory structure:', directoryStructure);
        return directoryStructure;
    } catch (error) {
        console.error('Error loading directory structure:', error);
        directoryStructure = [];
        return directoryStructure;
    }
}

// Load geometry data from JSON files
// Show user-visible error message
function showUserError(message, errorType = 'unknown') {
    // Create error message element
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ff4444;
        color: white;
        padding: 15px;
        border-radius: 5px;
        z-index: 10000;
        max-width: 400px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    errorDiv.textContent = message;

    document.body.appendChild(errorDiv);

    // Track error in Google Analytics with specific error type
    if (typeof gtag === 'function') {
        gtag('event', 'error_encountered', {
            'event_category': 'Error',
            'event_label': `${errorType}: ${message}`,
            'error_type': errorType,
            'value': 1
        });
        console.log(`GA Event: error_encountered - ${errorType}`);
    } else {
        console.warn('gtag not available for error tracking');
    }

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 5000);
}

// Show user-visible success message
function showUserSuccess(message) {
    // Create success message element
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 15px;
        border-radius: 5px;
        z-index: 10000;
        max-width: 400px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    successDiv.textContent = message;

    document.body.appendChild(successDiv);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (successDiv.parentNode) {
            successDiv.parentNode.removeChild(successDiv);
        }
    }, 3000);
}

async function loadGeometryData(modelPath) {
    const jsonPath = modelPath.replace('.stl', '.json');
    try {
        const response = await fetch(jsonPath);
        if (!response.ok) {
            const fileName = modelPath.split('/').pop();
            const errorMessage = `Missing geometry data for ${fileName}. This model cannot be attached without its .json file.`;
            console.error(errorMessage);
            showUserError(errorMessage, 'json_not_found');
            return null;
        }
        const data = await response.json();
        // console.log('Loaded JSON data:', data);

        // Check if this is an assembly reference
        if (data.assemblyFile) {
            // console.log('Assembly reference detected:', data.assemblyFile);
            data.isAssemblyReference = true;
        }

        return data;
    } catch (error) {
        const fileName = modelPath.split('/').pop();
        const errorMessage = `Error loading geometry data for ${fileName}: ${error.message}`;
        console.error(errorMessage);
        showUserError(errorMessage, 'json_invalid');
        return null;
    }
}

// Load assembly data from assembly JSON file
async function loadAssemblyData(assemblyFileName, partPath) {
    // Assembly files are in the same directory as the part STL files
    // Extract directory from the part path
    const directory = partPath.substring(0, partPath.lastIndexOf('/') + 1);
    const assemblyPath = `${directory}${assemblyFileName}`;

    try {
        const response = await fetch(assemblyPath);
        if (!response.ok) {
            const errorMessage = `Missing assembly file: ${assemblyFileName}`;
            console.error(errorMessage);
            showUserError(errorMessage, 'assembly_not_found');
            return null;
        }
        const data = await response.json();
        console.log('Loaded assembly data:', data);
        return data;
    } catch (error) {
        const errorMessage = `Error loading assembly data for ${assemblyFileName}: ${error.message}`;
        console.error(errorMessage);
        showUserError(errorMessage, 'assembly_invalid');
        return null;
    }
}

// Find directory by path in structure
function findDirectoryByPath(paths, structure) {
    if (!Array.isArray(paths)) {
        paths = [paths];
    }

    // console.log('Finding directories for paths:', paths);

    // Unwrap the outer array - this is the key fix
    const actualStructure = Array.isArray(structure) && structure.length === 1 ? structure[0] : structure;
    // console.log('Searching in structure:', actualStructure);

    // Filter out any undefined paths
    const validPaths = paths.filter(path => path);
    if (validPaths.length === 0) {
        console.error('No valid paths provided to findDirectoryByPath');
        return null;
    }

    const normalizedSearchPaths = validPaths.map(path => normalizePath(path));
    // console.log('Normalized search paths:', normalizedSearchPaths);
    
    let allContents = [];

    function search(items, searchPath) {
        if (!items || !searchPath) return null;

        let contents = [];

        for (const item of items) {
            if (!item.path) {
                console.log('Item missing path:', item);
                continue;
            }
            
            const normalizedItemPath = normalizePath(item.path);
            // console.log('Comparing paths:', {
            //     searchPath,
            //     itemPath: normalizedItemPath,
            //     match: normalizedItemPath === searchPath
            // });

            if (item.type === 'directory') {
                if (normalizedItemPath === searchPath) {
                    // console.log('Found matching directory:', item);
                    // Found the target directory, return its children
                    return item.children || [];
                }

                // Continue searching in subdirectories
                const found = search(item.children, searchPath);
                if (found) contents = contents.concat(found);
            }
        }
        return contents.length > 0 ? contents : null;
    }

    // Search for each path and combine results
    normalizedSearchPaths.forEach(searchPath => {
        const contents = search(actualStructure, searchPath);
        if (contents) {
            // console.log('Found contents for path', searchPath, ':', contents);
            allContents = [...allContents, ...contents];
        } else {
            console.log('No contents found for path:', searchPath);
        }
    });

    return allContents.length > 0 ? allContents : null;
}

// Get files from cached directory structure
function getFilesFromCache(targetFolder) {
    console.log('Getting files for folder:', targetFolder);
    console.log('Current directory structure:', directoryStructure);

    if (!directoryStructure) {
        console.warn('Directory structure not loaded yet');
        return [];
    }

    function findDirectoryContents(items) {
        for (const item of items) {
            const normalizedPath = item.path.replace(/\\/g, '/');
            const normalizedTarget = targetFolder.replace(/\\/g, '/');

            console.log('Checking path:', normalizedPath, 'against target:', normalizedTarget);

            if (item.type === 'directory' && normalizedPath === normalizedTarget) {
                // console.log('Found matching directory:', item);
                return item.children
                    .filter(child => child.type === 'file' && child.name.toLowerCase().endsWith('.stl'))
                    .map(child => child.name);
            }
            if (item.children) {
                const result = findDirectoryContents(item.children);
                if (result) return result;
            }
        }
        return null;
    }

    const results = findDirectoryContents(directoryStructure) || [];
    console.log('Files found:', results);
    return results;
}

// Legacy file list function (for backward compatibility)
async function getFileList(targetFolder) {
    try {
        const response = await fetch('/list-files');
        if (!response.ok) throw new Error('Network response was not ok');
        const structure = await response.json();
        console.log('Directory structure received:', structure);

        // Direct search for the target folder
        function findDirectoryContents(items) {
            for (const item of items) {
                // Format paths consistently
                const normalizedItemPath = item.path.replace(/\\/g, '/');
                const normalizedTargetPath = targetFolder.replace(/\\/g, '/');

                // Log when we find a potential match
                if (item.type === 'directory') {
                    console.log('Checking directory:', normalizedItemPath, 'against target:', normalizedTargetPath);
                }

                // If we found our target directory, return its STL files
                if (item.type === 'directory' && normalizedItemPath === normalizedTargetPath) {
                    // console.log('Found matching directory:', item.path);
                    console.log('Directory contents:', item.children);

                    const stlFiles = item.children
                        .filter(child => child.type === 'file' && child.name.toLowerCase().endsWith('.stl'))
                        .map(child => child.name);

                    console.log('STL files found:', stlFiles);
                    return stlFiles;
                }

                // If this directory has children, search them
                if (item.children) {
                    const result = findDirectoryContents(item.children);
                    if (result) return result;
                }
            }
            return null;
        }

        const files = findDirectoryContents(structure) || [];
        console.log('Final file list for', targetFolder, ':', files);
        return files;
    } catch (error) {
        console.error('Error fetching file list:', error);
        return [];
    }
}

// Create safe folder ID for DOM elements
function createFolderId(path) {
    return btoa(path).replace(/[=\/+]/g, '');
}

// Menu content and navigation functions
function updateMenuContent(menuElement) {
    const current = currentMenuPath[currentMenuPath.length - 1];
    // console.log('updateMenuContent called, current:', current);
    if (!current || !current.folder) {
        // console.log('No current or no folder, returning');
        return;
    }

    let html = `
        <div class="menu-container">
            <div class="menu-header">
                ${currentMenuPath.length > 1 ?
            `<button class="back-button" onclick="event.stopPropagation(); navigateBack()">
                        <span class="back-arrow"></span>
                        <span>Back</span>
                     </button>` :
            `<div class="menu-title">${current.title}</div>`}
            </div>
            <div class="menu-content">`;

    if (current.isCustomMenu) {
        // Handle custom menu items
        current.folder.forEach(dir => {
            const folderId = createFolderId(dir.customData.path);
            menuState.set(folderId, {
                customData: dir.customData,
                title: dir.customData.title
            });

            const isCustomFolder = dir.customData.title.toLowerCase().includes('custom');
            const icon = isCustomFolder ? '<i class="fas fa-star" style="color: #ffd700; margin-right: 8px;"></i>' : '<i class="fas fa-folder" style="color: #ffd966; margin-right: 8px;"></i>';

            html += `
                <div class="menu-item folder" onclick="event.stopPropagation(); navigateToFolder('${folderId}')">
                    ${icon}
                    ${dir.customData.title}
                </div>`;
        });
    } else {
        // Get the normalized current base path
        const currentBasePath = current.basePath.replace(/\\/g, '/');

        // Filter items to only show direct children
        const currentLevelItems = current.folder.filter(item => {
            if (!item.path) return false;

            const itemPath = item.path.replace(/\\/g, '/');
            const relPath = itemPath.replace(currentBasePath, '').replace(/^\/+/, '');

            // Only include items that are direct children (no additional path separators)
            return !relPath.includes('/');
        });

        // Add directories first
        const directories = currentLevelItems.filter(item => item.type === 'directory');
        directories.forEach(dir => {
            const fullPath = `${current.basePath}/${dir.name}`.replace(/^\/+/, '');
            const folderId = createFolderId(fullPath);

            menuState.set(folderId, {
                folder: dir.children || [],
                basePath: fullPath,
                title: dir.name
            });

            const isCustomFolder = dir.name.toLowerCase().includes('custom');
            const icon = isCustomFolder ? '<i class="fas fa-star" style="color: #ffd700; margin-right: 8px;"></i>' : '<i class="fas fa-folder" style="color: #ffd966; margin-right: 8px;"></i>';

            html += `
                <div class="menu-item folder" onclick="event.stopPropagation(); navigateToFolder('${folderId}')">
                    ${icon}
                    ${dir.name}
                </div>`;
        });

        // Then add STL files
        const files = currentLevelItems.filter(item =>
            item.type === 'file' &&
            item.name.toLowerCase().endsWith('.stl')
        );

        files.forEach(file => {
            const fullPath = `${current.basePath}/${file.name}`.replace(/^\/+/, '');
            html += `
                <div class="menu-item file" onclick="event.stopPropagation(); attachModelAtPoint('${fullPath}')">
                    <i class="fas fa-cube" style="color: #6c9bd1; margin-right: 8px;"></i>
                    <span class="file-name">${file.name.replace('.stl', '')}</span>
                </div>`;
        });
    }

    html += `
            </div>
        </div>`;

    menuElement.innerHTML = html;
}

function hideMenu() {
    document.getElementById('modelSelect').style.display = 'none';
    selectedPoint = null;
}

// Navigation functions
function navigateToFolder(folderId) {
    const folderData = menuState.get(folderId);
    if (!folderData) {
        console.error('No folder data found for ID:', folderId);
        return;
    }

    // Get current menu info
    const currentMenu = currentMenuPath[currentMenuPath.length - 1];
    const currentUserData = selectedPoint?.userData;
    
    if (folderData.customData) {
    // Handle custom menu navigation
    const directory = findDirectoryByPath(folderData.customData.path, directoryStructure);
    if (!directory) return;

    const filteredContents = folderData.customData.filter ?
        directory.filter(item => folderData.customData.filter(item, currentUserData)) :
        directory;

    // Update selectedPoint's attachmentType if one was specified in the custom menu
    // DISABLED: Don't change attachmentType as it affects alignment decisions
    // if (folderData.customData.attachmentType && selectedPoint) {
    //     // Store original type before changing
    //     if (!selectedPoint.userData.originalType) {
    //         selectedPoint.userData.originalType = selectedPoint.userData.attachmentType;
    //     }
    //     selectedPoint.userData.attachmentType = folderData.customData.attachmentType;
    // }

    currentMenuPath.push({
        folder: filteredContents,
        basePath: folderData.customData.path,
        title: folderData.customData.title,
        filter: folderData.customData.filter,
        userData: {
            ...currentUserData,
            attachmentType: folderData.customData.attachmentType || currentUserData?.attachmentType
        }
    });
    } else {
        // Check if we're in a regular menu or custom menu path
        const menuType = selectedPoint?.userData?.attachmentType;
        const menuConfig = categoryMenus[menuType];

        // For regular menu navigation
        if (menuConfig?.filter) {
            // Apply the current menu's filter (handles part cooling)
            const filteredContents = filterContents(folderData.folder, currentUserData);
            
            currentMenuPath.push({
                ...folderData,
                folder: filteredContents,
                basePath: folderData.basePath,
                title: folderData.title,
                filter: menuConfig.filter,
                userData: currentUserData
            });
        } else if (currentMenu?.filter) {
            // Apply custom menu's filter (handles wing/custom menus)
            const filteredContents = folderData.folder.filter(item => 
                currentMenu.filter(item, currentUserData)
            );
            
            currentMenuPath.push({
                ...folderData,
                folder: filteredContents,
                basePath: folderData.basePath,
                title: folderData.title,
                filter: currentMenu.filter,
                userData: currentUserData
            });
        } else {
            currentMenuPath.push(folderData);
        }
    }

    const menuElement = document.getElementById('modelSelect');
    updateMenuContent(menuElement);
    menuElement.style.display = 'block';
}

function navigateBack() {
    // console.log('navigateBack called, currentMenuPath length:', currentMenuPath.length);
    // console.log('currentMenuPath:', currentMenuPath);

    if (currentMenuPath.length > 1) {
        currentMenuPath.pop();
        // console.log('Popped, new length:', currentMenuPath.length);
        // console.log('New current path:', currentMenuPath[currentMenuPath.length - 1]);
        const menuElement = document.getElementById('modelSelect');
        // console.log('Menu element:', menuElement);
        updateMenuContent(menuElement);
        // console.log('After updateMenuContent, display:', menuElement.style.display);
        menuElement.style.display = 'block'; // Ensure menu stays visible
        // console.log('Forced display to block');
    } else {
        // At root level - close the menu
        // console.log('At root or empty, closing menu');
        hideMenu();
    }
}

// Create dropdown menu for attachment type
async function createDropdownForType(type) {
    // Use the original type if it exists, otherwise use the current type
    const menuType = selectedPoint?.userData?.originalType || type;
    // console.log('Creating menu for type:', menuType);

    menuState.clear();
    const menu = categoryMenus[menuType];
    if (!menu) {
        console.error('No menu configuration found for type:', menuType);
        return '';
    }

    // console.log('Found menu config:', menu);

    if (menu.isCustomMenu) {
        // console.log('Creating custom menu');
        const customMenu = menu.createCustomMenu(selectedPoint?.userData);
        if (customMenu.type === 'category') {
            currentMenuPath = [{
                folder: customMenu.items.map(item => ({
                    type: 'directory',
                    name: item.title,
                    customData: item
                })),
                basePath: '',
                title: menu.title,
                isCustomMenu: true
            }];
        }
    } else {
        // Original directory-based menu code
        // console.log('Creating directory-based menu with path:', menu.paths[0]);
        // console.log('Current directory structure:', directoryStructure);

        const directory = findDirectoryByPath(menu.paths[0], directoryStructure);
        // console.log('Directory search result:', directory);

        if (!directory) {
            console.error('No directory found for path:', menu.paths[0]);
            return '';
        }

        const filteredContents = menu.filter ?
            filterContents(directory, selectedPoint?.userData) :
            directory;

        // console.log('Filtered contents:', filteredContents);

        currentMenuPath = [{
            folder: filteredContents,
            basePath: menu.paths[0],
            title: menu.title
        }];
    }

    // console.log('Current menu path:', currentMenuPath);

    const menuElement = document.createElement('div');
    updateMenuContent(menuElement);
    return menuElement.innerHTML;
}

// Content filtering function
function filterContents(contents, userData) {
    const menuType = selectedPoint?.userData?.attachmentType;
    const menuConfig = categoryMenus[menuType];
    
    if (!menuConfig?.filter) {
        return contents;
    }
    
    return contents.filter(item => menuConfig.filter(item, userData));
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        loadDirectoryStructure,
        loadGeometryData,
        findDirectoryByPath,
        getFilesFromCache,
        getFileList,
        createFolderId,
        updateMenuContent,
        hideMenu,
        navigateToFolder,
        navigateBack,
        createDropdownForType,
        filterContents,
        showUserError,
        showUserSuccess
    };
}