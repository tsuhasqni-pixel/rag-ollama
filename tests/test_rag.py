import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import server


class OfflineRAGTests(unittest.TestCase):
    def test_japanese_keyword_search_without_model(self):
        with tempfile.TemporaryDirectory() as d:
            with patch.object(server,"BASE",Path(d)), patch.object(server,"DB",Path(d)/"test.db"):
                server.add_document("営業会議","2026年の売上について話しました。")
                server.add_document("読書メモ","静かな時間に本を読みました。")
                hits=server.search("2026 売上")
                self.assertEqual(len(hits),1)
                self.assertEqual(hits[0]["title"],"営業会議")
                self.assertEqual(server.search("機械学習"),[])
                self.assertIn("売上",server.read_excerpt([hits[0]["id"]]))

    def test_no_code_or_path_injection_via_sql_search(self):
        with tempfile.TemporaryDirectory() as d:
            with patch.object(server,"BASE",Path(d)), patch.object(server,"DB",Path(d)/"test.db"):
                server.add_document("a","経営会議。")
                self.assertEqual(server.search("' OR 1=1;--"),[])
                self.assertEqual(server.search(""),[])

    def test_no_ollama_call_needed_for_search(self):
        with patch.object(server.urllib.request,"urlopen",side_effect=AssertionError("must not call Ollama")):
            with tempfile.TemporaryDirectory() as d:
                with patch.object(server,"BASE",Path(d)), patch.object(server,"DB",Path(d)/"db.sqlite"):
                    server.add_document("研究","文章検索の練習")
                    self.assertTrue(server.search("文章"))

    def test_ai_requires_existing_refs(self):
        with tempfile.TemporaryDirectory() as d:
            with patch.object(server,"BASE",Path(d)), patch.object(server,"DB",Path(d)/"db.sqlite"):
                with self.assertRaises(ValueError):server.ollama_summary("質問",[],"qwen3:4b")


if __name__=="__main__":unittest.main()
