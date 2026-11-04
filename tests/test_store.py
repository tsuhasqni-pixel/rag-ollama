import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    "product": "FolioAI",
    "identity_name": "OkinawaDesktopTools.FolioAI",
    "publisher": "CN=46263F21-A700-41DB-8C9B-114C22FB82FC",
    "publisher_display_name": "Okinawa Desktop Tools",
    "version": "1.0.3.0",
    "architecture": "x64",
    "release_status": "STORE_CANDIDATE_UNSIGNED",
}


class StoreConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.config = json.loads((ROOT / "store" / "product.json").read_text(encoding="utf-8"))

    def test_partner_center_identity_is_exact(self):
        for key, value in EXPECTED.items():
            self.assertEqual(self.config[key], value, key)

    def test_store_version_has_reserved_fourth_field_zero(self):
        self.assertRegex(self.config["version"], r"^\d+\.\d+\.\d+\.0$")

    def test_workflow_and_package_label_match_candidate(self):
        workflow = (ROOT / ".github" / "workflows" / "store-msix-candidate.yml").read_text(encoding="utf-8")
        self.assertIn("FolioAI_1.0.3.0_x64_STORE_CANDIDATE_UNSIGNED", workflow)
        self.assertNotRegex(workflow, re.compile(r"FolioAI_1\.0\.2\.1"))
        script = (ROOT / "store" / "build_msix.ps1").read_text(encoding="utf-8")
        self.assertIn("STORE_CANDIDATE_UNSIGNED", script)


if __name__ == "__main__":
    unittest.main()
