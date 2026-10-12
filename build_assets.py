"""Copy self-hosted fonts and images into a build directory."""
import os
import shutil


def copy_fonts_and_images(src, dest):
    for extra in ("fonts", "img"):
        source = os.path.join(src, extra)
        if not os.path.isdir(source):
            continue
        target = os.path.join(dest, extra)
        if os.path.isdir(target):
            shutil.rmtree(target)
        shutil.copytree(source, target)
