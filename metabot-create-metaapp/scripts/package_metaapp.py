#!/usr/bin/env python3
"""
MetaApp Packaging Script

Packages a MetaApp frontend project into a distributable zip archive.
Validates project structure and creates a timestamped zip file.

Usage:
    package_metaapp.py <project_root> [--output <output_dir>]

Examples:
    package_metaapp.py test/thumder
    package_metaapp.py . --output ./dist
"""

import argparse
import os
import sys
import time
import zipfile
from pathlib import Path

# Required files for a valid MetaApp project
METAAPP_REQUIRED_FILES = [
    "index.html",
    "app.js",
    "app.css",
    "idframework.js",
]

# Required directories for a valid MetaApp project
METAAPP_REQUIRED_DIRS = [
    "idcomponents",
    "commands",
]

# Directories to exclude from packaging
EXCLUDE_DIRS = {
    ".git",
    ".idea",
    ".vscode",
    "node_modules",
    "__pycache__",
    "dist",
    "build",
    ".DS_Store",
}

# File patterns to exclude
EXCLUDE_FILE_PREFIXES = {
    ".DS_Store",
    ".gitignore",
    ".gitattributes",
}

# File extensions to exclude (optional - can be customized)
EXCLUDE_EXTENSIONS = {
    ".zip",  # Exclude existing zip files
    ".log",
}


def is_metaapp_project(root: str) -> tuple[bool, list[str]]:
    """
    Validate if a directory is a valid MetaApp project.
    
    Args:
        root: Path to project root directory
        
    Returns:
        Tuple of (is_valid, missing_items)
    """
    root_path = Path(root)
    missing = []
    
    # Check required files
    for file in METAAPP_REQUIRED_FILES:
        if not (root_path / file).is_file():
            missing.append(f"File: {file}")
    
    # Check required directories
    for dir_name in METAAPP_REQUIRED_DIRS:
        if not (root_path / dir_name).is_dir():
            missing.append(f"Directory: {dir_name}")
    
    return len(missing) == 0, missing


def should_exclude(path: Path, root: Path) -> bool:
    """
    Determine if a file or directory should be excluded from packaging.
    
    Args:
        path: Full path to file/directory
        root: Project root path
        
    Returns:
        True if should be excluded, False otherwise
    """
    # Get relative path from root
    try:
        rel_path = path.relative_to(root)
    except ValueError:
        # Path is outside root, exclude it
        return True
    
    # Check path parts
    parts = rel_path.parts
    for part in parts:
        if part in EXCLUDE_DIRS:
            return True
        if part.startswith('.'):
            # Exclude hidden files/dirs except those explicitly needed
            if part not in ['.', '..']:
                return True
    
    # Check file name
    if path.is_file():
        file_name = path.name
        # Check prefixes
        for prefix in EXCLUDE_FILE_PREFIXES:
            if file_name.startswith(prefix):
                return True
        # Check extensions
        suffix = path.suffix.lower()
        if suffix in EXCLUDE_EXTENSIONS:
            return True
    
    return False


def create_zip_archive(src_root: str, zip_path: str) -> None:
    """
    Create a zip archive of the MetaApp project.
    
    Args:
        src_root: Source project root directory
        zip_path: Output zip file path
    """
    src_path = Path(src_root).resolve()
    zip_path_obj = Path(zip_path).resolve()
    
    # Create parent directory if it doesn't exist
    zip_path_obj.parent.mkdir(parents=True, exist_ok=True)
    
    with zipfile.ZipFile(zip_path_obj, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Walk through all files and directories
        for root, dirs, files in os.walk(src_path):
            root_path = Path(root)
            
            # Filter out excluded directories
            dirs[:] = [d for d in dirs if not should_exclude(root_path / d, src_path)]
            
            for file in files:
                file_path = root_path / file
                
                # Skip excluded files
                if should_exclude(file_path, src_path):
                    continue
                
                # Get relative path for zip entry
                try:
                    rel_path = file_path.relative_to(src_path)
                    # Use forward slashes for zip (works on all platforms)
                    zip_entry = str(rel_path).replace(os.sep, '/')
                    
                    # Add file to zip
                    zf.write(file_path, zip_entry)
                except Exception as e:
                    print(f"Warning: Skipping {file_path}: {e}", file=sys.stderr)


def generate_dist_name(root: str) -> str:
    """
    Generate a timestamped dist zip filename.
    
    Args:
        root: Project root directory
        
    Returns:
        Full path to output zip file
    """
    timestamp = int(time.time())
    root_path = Path(root).resolve()
    return str(root_path / f"dist-{timestamp}.zip")


def main():
    parser = argparse.ArgumentParser(
        description="Package a MetaApp project into a distributable zip archive",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  package_metaapp.py test/thumder
  package_metaapp.py . --output ./dist
  package_metaapp.py /path/to/metaapp
        """
    )
    parser.add_argument(
        "project_root",
        nargs="?",
        default=".",
        help="Path to MetaApp project root (default: current directory)"
    )
    parser.add_argument(
        "--output",
        help="Output directory for zip file (default: project root)"
    )
    
    args = parser.parse_args()
    
    # Resolve project root path
    project_root = Path(args.project_root).resolve()
    
    # Validate project root exists
    if not project_root.exists():
        print(f"❌ Error: Project root does not exist: {project_root}", file=sys.stderr)
        sys.exit(1)
    
    if not project_root.is_dir():
        print(f"❌ Error: Project root is not a directory: {project_root}", file=sys.stderr)
        sys.exit(1)
    
    # Validate it's a MetaApp project
    is_valid, missing = is_metaapp_project(str(project_root))
    if not is_valid:
        print(f"❌ Error: Directory does not appear to be a valid MetaApp project: {project_root}", file=sys.stderr)
        print(f"\nMissing required items:", file=sys.stderr)
        for item in missing:
            print(f"  - {item}", file=sys.stderr)
        print(f"\nRequired files: {', '.join(METAAPP_REQUIRED_FILES)}", file=sys.stderr)
        print(f"Required directories: {', '.join(METAAPP_REQUIRED_DIRS)}", file=sys.stderr)
        sys.exit(1)
    
    # Generate output path
    if args.output:
        output_dir = Path(args.output).resolve()
        output_dir.mkdir(parents=True, exist_ok=True)
        timestamp = int(time.time())
        zip_path = str(output_dir / f"dist-{timestamp}.zip")
    else:
        zip_path = generate_dist_name(str(project_root))
    
    # Create zip archive
    print(f"📦 Packaging MetaApp project: {project_root}")
    print(f"📁 Output: {zip_path}")
    
    try:
        create_zip_archive(str(project_root), zip_path)
        
        # Get file size
        zip_size = Path(zip_path).stat().st_size
        size_mb = zip_size / (1024 * 1024)
        
        print(f"✅ Success! MetaApp packaged successfully")
        print(f"   File: {zip_path}")
        print(f"   Size: {size_mb:.2f} MB ({zip_size:,} bytes)")
        
    except Exception as e:
        print(f"❌ Error: Failed to create zip archive: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
