import http.server
import socketserver
import json
import os
from pathlib import Path

class DirectoryHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/list-files':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            # Get directory structure starting from heromedir
            base_path = Path('heromedir')
            directory_structure = self.get_directory_structure(base_path)
            
            self.wfile.write(json.dumps(directory_structure).encode())
            return
        return super().do_GET()
    
    def get_directory_structure(self, path):
        structure = []
        try:
            for entry in path.iterdir():
                if entry.is_dir():
                    structure.append({
                        'type': 'directory',
                        'name': entry.name,
                        'path': str(entry.relative_to('.')),
                        'children': self.get_directory_structure(entry)
                    })
                elif entry.suffix.lower() == '.stl':
                    structure.append({
                        'type': 'file',
                        'name': entry.name,
                        'path': str(entry.relative_to('.'))
                    })
        except Exception as e:
            print(f"Error reading directory {path}: {e}")
        return structure

PORT = 8000
Handler = DirectoryHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at port {PORT}")
    httpd.serve_forever()