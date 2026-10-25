"""Never download a real model in CI. Exercise capacity and progress safely."""
import json
import tempfile
import unittest
from unittest.mock import patch
from store import ollama_manager as m


class FakeResponse:
    def __init__(self, events):
        self.events=[json.dumps(e).encode()+b"\n" for e in events]
    def __enter__(self):return self
    def __exit__(self,*args):return False
    def __iter__(self):return iter(self.events)


class ModelInstallerTests(unittest.TestCase):
    def test_recommendation_follows_ram_and_storage(self):
        with patch.object(m,"total_ram_bytes",return_value=4_000_000_000), \
             patch.object(m,"free_model_disk_bytes",return_value=1_100_000_000), \
             patch.object(m,"request_json",return_value={"models":[]}):
            data=m.ModelManager().catalog()
        self.assertTrue(data["available"])
        self.assertEqual(data["recommended"],"qwen3:0.6b")
        self.assertTrue(data["models"][0]["fits"])
        self.assertFalse(data["models"][1]["fits"])

    def test_unknown_capacity_never_recommends_or_allows_new_download(self):
        with patch.object(m,"total_ram_bytes",return_value=None), \
             patch.object(m,"free_model_disk_bytes",return_value=None), \
             patch.object(m,"request_json",return_value={"models":[]}):
            data=m.ModelManager().catalog()
        self.assertIsNone(data["recommended"])
        self.assertTrue(all(not model["fits"] for model in data["models"]))
        self.assertIn("確認できない",data["models"][0]["reason"])

    def test_no_ollama_does_not_trigger_download(self):
        import urllib.error
        with patch.object(m,"total_ram_bytes",return_value=8_000_000_000), \
             patch.object(m,"free_model_disk_bytes",return_value=15_000_000_000), \
             patch.object(m,"request_json",side_effect=urllib.error.URLError("not running")):
            obj=m.ModelManager()
            self.assertFalse(obj.catalog()["available"])
            with self.assertRaises(RuntimeError):
                obj.start("qwen3:0.6b")
            self.assertEqual(obj.status()["state"],"idle")

    def test_unknown_model_and_capacity_are_blocked(self):
        with patch.object(m,"total_ram_bytes",return_value=3_000_000_000), \
             patch.object(m,"free_model_disk_bytes",return_value=900_000_000), \
             patch.object(m,"request_json",return_value={"models":[]}):
            manager=m.ModelManager()
            with self.assertRaises(ValueError):
                manager.start("unexpected/latest")
            with self.assertRaises(ValueError):
                manager.start("qwen3:8b")
            self.assertEqual(manager.status()["state"],"idle")

    def test_streamed_download_reaches_complete_state(self):
        events=[
            {"status":"pulling manifest"},
            {"status":"downloading sha256:abc","completed":400,"total":1000},
            {"status":"verifying sha256 digest"},
            {"status":"success"}
        ]
        manager=m.ModelManager()
        with patch.object(m._OPENER,"open",return_value=FakeResponse(events)) as fake:
            manager._pull("qwen3:0.6b")
        self.assertEqual(manager.status()["state"],"ready")
        self.assertFalse(manager.status()["busy"])
        self.assertEqual(manager.status()["percent"],100)
        self.assertEqual(manager.status()["phase"],"complete")
        request=fake.call_args.args[0]
        self.assertEqual(request.full_url,"http://127.0.0.1:11434/api/pull")
        payload=json.loads(request.data)
        self.assertEqual(payload["model"],"qwen3:0.6b")
        self.assertIs(payload["insecure"],False)
        self.assertIs(payload["stream"],True)

    def test_error_and_incomplete_stream_never_claim_ready(self):
        for events in ([{"error":"storage error"}],[{"status":"pulling"}]):
            manager=m.ModelManager()
            with patch.object(m._OPENER,"open",return_value=FakeResponse(events)):
                manager._pull("qwen3:0.6b")
            self.assertEqual(manager.status()["state"],"error")
            self.assertFalse(manager.status()["busy"])
            self.assertTrue(manager.status()["status"].startswith("エラー発生"))

    def test_common_failures_have_japanese_cause_and_action(self):
        manager=m.ModelManager()
        self.assertIn("空き容量",manager._friendly_error(RuntimeError("no space left on device")))
        self.assertIn("インターネット接続",manager._friendly_error(TimeoutError("timed out")))
        self.assertIn("Ollama",manager._friendly_error(ConnectionRefusedError("connection refused")))

    def test_installed_custom_models_preserved_but_not_downloadable(self):
        with patch.object(m,"total_ram_bytes",return_value=16_000_000_000), \
             patch.object(m,"free_model_disk_bytes",return_value=15_000_000_000), \
             patch.object(m,"request_json",return_value={"models":[{"name":"gemma3:1b"}]}):
            manager=m.ModelManager()
            data=manager.catalog()
            self.assertIn("gemma3:1b",[v["id"] for v in data["models"]])
            self.assertTrue(next(v for v in data["models"] if v["id"]=="gemma3:1b")["installed"])
            with self.assertRaises(ValueError):
                manager.start("gemma3:1b")


if __name__=="__main__":
    unittest.main()
