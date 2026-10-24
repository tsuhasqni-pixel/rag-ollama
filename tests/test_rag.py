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


    def test_generic_records_dates_and_deletion_without_ollama(self):
        with tempfile.TemporaryDirectory() as d:
            with patch.object(server,"BASE",Path(d)),patch.object(server,"DB",Path(d)/"db.sqlite"):
                record=server.add_document("遠足","公園で虫を見つけた",category="メモ・記録",event_date="2026-10-20")
                budget=server.add_document("家計","食費が少し増えた",category="数値・表",event_date="2026-10-22")
                self.assertEqual(server.search("公園",category="数値・表"),[])
                self.assertEqual(server.search("公園",category="メモ・記録",
                                               date_from="2026-10-01",date_to="2026-10-31")[0]["id"],record)
                self.assertEqual(server.search("公園",date_from="2026-10-21"),[])
                listing=server.list_documents(category="数値・表")
                self.assertEqual(len(listing),1)
                self.assertEqual(listing[0]["id"],budget)
                self.assertNotIn("content",listing[0])
                self.assertTrue(server.delete_document(record))
                self.assertFalse(server.delete_document(record))
                self.assertEqual(server.search("公園"),[])
                self.assertEqual(server.read_excerpt([record]),"")

    def test_unknown_category_and_bad_date_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            with patch.object(server,"BASE",Path(d)),patch.object(server,"DB",Path(d)/"db.sqlite"):
                with self.assertRaises(ValueError):server.add_document("a","b",category="secret")
                with self.assertRaises(ValueError):server.add_document("a","b",event_date="2026-02-30")
                with self.assertRaises(ValueError):server.search("x",date_from="2026-10-25",date_to="2026-10-20")
                with self.assertRaises(ValueError):server.delete_document(True)

    def test_migrate_existing_documents_without_losing_text(self):
        import sqlite3
        with tempfile.TemporaryDirectory() as d:
            db=Path(d)/"old.sqlite3"
            con=sqlite3.connect(db)
            con.execute("CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, content TEXT, created_at TEXT)")
            con.execute("INSERT INTO docs VALUES(1,'古い記録','昔の遠足','2026-10-01')")
            con.commit();con.close()
            with patch.object(server,"BASE",Path(d)),patch.object(server,"DB",db):
                hit=server.search("遠足")
                self.assertEqual(hit[0]["title"],"古い記録")
                self.assertEqual(hit[0]["category"],"その他")
                self.assertEqual(hit[0]["event_date"],"")

    def test_evidence_excerpt_contains_record_id_category_and_date(self):
        with tempfile.TemporaryDirectory() as d:
            with patch.object(server,"BASE",Path(d)),patch.object(server,"DB",Path(d)/"db.sqlite"):
                uid=server.add_document("学校","運動会の様子",category="メモ・記録",event_date="2026-10-10")
                excerpt=server.read_excerpt([uid])
                self.assertIn("記録日 2026-10-10",excerpt)
                self.assertIn("資料ID",excerpt)
                self.assertIn("メモ・記録",excerpt)


    def test_existing_categories_migrate_without_losing_content(self):
        import sqlite3
        with tempfile.TemporaryDirectory() as d:
            db=Path(d)/"legacy.sqlite3"
            con=sqlite3.connect(db)
            con.execute("""CREATE TABLE docs (
                id INTEGER PRIMARY KEY, title TEXT, content TEXT, created_at TEXT,
                category TEXT NOT NULL, event_date TEXT NOT NULL, source_key TEXT NOT NULL
            )""")
            con.execute("""INSERT INTO docs VALUES (
                1,'旧分類のメモ','重要な記録を保管した','2026-10-01',
                '子どもの記録','2026-10-01','daymark|2026-10-01')""")
            con.commit()
            con.close()
            with patch.object(server,"BASE",Path(d)),patch.object(server,"DB",db):
                matching=server.search("重要",category="メモ・記録")
                self.assertEqual(len(matching),1)
                self.assertEqual(matching[0]["title"],"旧分類のメモ")
                self.assertEqual(matching[0]["event_date"],"2026-10-01")
                self.assertTrue(server.delete_document(1))
                self.assertEqual(server.list_documents(),[])

    def test_no_app_specific_import_function_or_endpoint(self):
        self.assertFalse(hasattr(server, "import_daymark_backup"))
        # The product's API only exposes general-purpose record workflows.
        self.assertNotIn("/api/import/daymark",server.Handler.do_POST.__code__.co_consts)


    def test_optional_ollama_status_offline_and_online(self):
        import io
        import urllib.error
        with patch.object(server.urllib.request,"urlopen",
                          side_effect=urllib.error.URLError("offline")):
            self.assertEqual(server.ollama_status(),{"available":False,"models":[]})
        class Response:
            def __enter__(self):return self
            def __exit__(self,*args):return False
            def read(self,n):return b'{"models":[{"name":"local-small:4b"}]}'
        with patch.object(server.urllib.request,"urlopen",return_value=Response()) as call:
            self.assertEqual(server.ollama_status(),
                             {"available":True,"models":["local-small:4b"]})
            self.assertEqual(call.call_args.kwargs["timeout"],2)



if __name__=="__main__":unittest.main()
