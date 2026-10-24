"""Generate the manifest and placeholder assets from verified Partner Center identities.

Never infer the Publisher or Package Identity from the repo name. Only use the
per-product store/product.json derived from the user's Partner Center screenshot.
"""
from __future__ import annotations
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from xml.sax.saxutils import escape
from PIL import Image, ImageDraw, ImageFont

BASE = Path(__file__).resolve().parent
IDENTITY_NAMES = {"OkinawaDesktopTools.DaymarkAI", "OkinawaDesktopTools.FolioAI"}
PUBLISHER = "CN=46263F21-A700-41DB-8C9B-114C22FB82FC"


def icon(path: Path, width: int, height: int, label: str, color: str) -> None:
    image = Image.new("RGB", (width, height), color)
    draw = ImageDraw.Draw(image)
    height_px = min(height, width)
    size = max(14, int(height_px * .67))
    family = Path("C:/Windows/Fonts/segoeuib.ttf")
    try:
        font = ImageFont.truetype(str(family), size)
    except OSError:
        font = ImageFont.load_default()
    bounds = draw.textbbox((0, 0), label, font=font)
    tw, th = bounds[2] - bounds[0], bounds[3] - bounds[1]
    draw.text(((width-tw)/2-bounds[0], (height-th)/2-bounds[1]),
              label, fill="#FFFFFF", font=font)
    image.save(path, format="PNG")


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python store/generate_manifest.py <staging-dir> <exe-relative-path>")
    stage = Path(sys.argv[1]).resolve()
    exe_relative = sys.argv[2].replace("/", "\\")
    config = json.loads((BASE / "product.json").read_text(encoding="utf-8"))
    name = config["identity_name"]
    if name not in IDENTITY_NAMES or config["publisher"] != PUBLISHER:
        raise ValueError("Store Identity/Publisher does not match screenshot-grounded allowlist")
    if config["product"] != name.split(".")[-1]:
        raise ValueError("Product identity differs from executable name")
    if not re.fullmatch(r"\d+\.\d+\.\d+\.\d+", config["version"]):
        raise ValueError("Version is invalid")
    if config["release_status"] != "QA_UNSIGNED_HOLD" or config["architecture"] != "x64":
        raise ValueError("Release status / architecture is not an approved QA candidate")
    if not (stage / exe_relative.replace("\\", "/")).is_file():
        raise FileNotFoundError("MSIX launcher EXE is missing: " + exe_relative)

    stage.mkdir(parents=True, exist_ok=True)
    assets = stage / "Assets"
    assets.mkdir(exist_ok=True)
    for filename, dimensions in [
        ("Logo44.png", (44,44)),
        ("Logo150.png", (150,150)),
        ("StoreLogo.png", (50,50)),
        ("LogoWide.png", (310,150)),
    ]:
        icon(assets / filename, *dimensions, config["logo_mark"], config["brand_color"])

    def val(s: str) -> str:
        return escape(s, {'"': '&quot;', "'": '&apos;'})

    manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
 xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
 xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
 xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
 IgnorableNamespaces="uap uap10 rescap">
 <Identity Name="{val(name)}" Publisher="{val(config["publisher"])}"
   ProcessorArchitecture="x64" Version="{val(config["version"])}"/>
 <Properties>
  <DisplayName>{val(config["display_name"])}</DisplayName>
  <PublisherDisplayName>{val(config["publisher_display_name"])}</PublisherDisplayName>
  <Description>{val(config["description"])}</Description>
  <Logo>Assets\\StoreLogo.png</Logo>
 </Properties>
 <Dependencies>
  <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0"
    MaxVersionTested="10.0.26100.0"/>
 </Dependencies>
 <Resources><Resource Language="ja-jp"/><Resource Language="en-us"/></Resources>
 <Applications>
  <Application Id="App" Executable="{val(exe_relative)}"
    uap10:RuntimeBehavior="packagedClassicApp" uap10:TrustLevel="mediumIL">
    <uap:VisualElements DisplayName="{val(config["display_name"])}"
     Description="{val(config["description"])}" BackgroundColor="{val(config["brand_color"])}"
     Square44x44Logo="Assets\\Logo44.png" Square150x150Logo="Assets\\Logo150.png">
     <uap:DefaultTile Wide310x150Logo="Assets\\LogoWide.png"/>
    </uap:VisualElements>
  </Application>
 </Applications>
 <Capabilities><rescap:Capability Name="runFullTrust"/></Capabilities>
</Package>
'''
    path = stage / "AppxManifest.xml"
    path.write_text(manifest, encoding="utf-8")
    document = ET.parse(path)
    ns = {"msix":"http://schemas.microsoft.com/appx/manifest/foundation/windows10"}
    ident = document.find("msix:Identity", ns)
    if ident is None or ident.attrib["Name"] != name or ident.attrib["Publisher"] != PUBLISHER:
        raise AssertionError("Generated MSIX manifest identity mismatch")
    for file in assets.iterdir():
        with Image.open(file) as im:
            im.verify()
    print("Store screenshot identity verified:", name, config["version"], config["publisher"])
    print("QA_UNSIGNED manifest and PNG resources: PASS")


if __name__ == "__main__":
    main()
