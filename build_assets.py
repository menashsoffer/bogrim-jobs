"""Copy self-hosted fonts, images, and font/icon licenses into a build directory."""
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


def copy_licenses(root, src, dest):
    heebo = os.path.join(src, "fonts", "LICENSE-heebo.txt")
    shipped_heebo = os.path.join(dest, "fonts", "LICENSE-heebo.txt")
    if not os.path.isfile(heebo):
        raise SystemExit("missing Heebo license")
    if not os.path.isfile(shipped_heebo):
        os.makedirs(os.path.dirname(shipped_heebo), exist_ok=True)
        shutil.copy(heebo, shipped_heebo)
    lucide = os.path.join(root, "vendor", "lucide", "LICENSE")
    if not os.path.isfile(lucide):
        raise SystemExit("missing Lucide license")
    shipped_lucide = os.path.join(dest, "vendor", "lucide", "LICENSE")
    os.makedirs(os.path.dirname(shipped_lucide), exist_ok=True)
    shutil.copy(lucide, shipped_lucide)
