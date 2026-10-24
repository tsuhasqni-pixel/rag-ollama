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


    def test_family_records_dates_and_deletion_without_ollama(self):
        with tempfile.TemporaryDirectory() as d:
            with patch.object(server,"BASE",Path(d)),patch.object(server,"DB",Path(d)/"db.sqlite"):
                child=server.add_document("遠足","公園で虫を見つけた",category="子どもの記録",event_date="2026-10-20")
                budget=server.add_document("家計","食費が少し増えた",category="家計簿",event_date="2026-10-22")
                self.assertEqual(server.search("公園",category="家計簿"),[])
                self.assertEqual(server.search("公園",category="子どもの記録",
                                               date_from="2026-10-01",date_to="2026-10-31")[0]["id"],child)
                self.assertEqual(server.search("公園",date_from="2026-10-21"),[])
                listing=server.list_documents(category="家計簿")
                self.assertEqual(len(listing),1)
                self.assertEqual(listing[0]["id"],budget)
                self.assertNotIn("content",listing[0])
                self.assertTrue(server.delete_document(child))
                self.assertFalse(server.delete_document(child))
                self.assertEqual(server.search("公園"),[])
                self.assertEqual(server.read_excerpt([child]),"")

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
                uid=server.add_document("学校","運動会の様子",category="子どもの記録",event_date="2026-10-10")
                excerpt=server.read_excerpt([uid])
                self.assertIn("記録日 2026-10-10",excerpt)
                self.assertIn("資料ID",excerpt)
                self.assertIn("子どもの記録",excerpt)


    def test_daymark_import_by_date_and_reimport_updates_same_copy(self):
        with tempfile.TemporaryDirectory() as d:
            with patch.object(server,"BASE",Path(d)),patch.object(server,"DB",Path(d)/"db.sqlite"):
                original={
                    "version":1,
                    "habits":[{"id":"reading","name":"読書","active":True},
                              {"id":"walk","name":"散歩","active":True}],
                    "entries":{"2026-10-22":{
                        "wake":"07:30","sleep":"23:00","mood":4,
                        "text":"昨日は図書館へ行った。","wellbeingNote":"元気",
                        "checks":{"reading":True,"walk":False},
                        "habitNames":{"reading":"読書","walk":"散歩"},
                    }}
                }
                r=server.import_daymark_backup(original)
                self.assertEqual(r["imported"],1)
                results=server.search("図書館",category="日記",date_from="2026-10-22")
                self.assertEqual(len(results),1)
                self.assertEqual(results[0]["event_date"],"2026-10-22")
                src=server.read_excerpt([results[0]["id"]])
                self.assertIn("読書",src)
                self.assertNotIn("散歩",src)
                original["entries"]["2026-10-22"]["text"]="今日の振り返りを追記した。"
                again=server.import_daymark_backup(original)
                self.assertEqual(again["imported"],0)
                self.assertEqual(again["updated"],1)
                self.assertEqual(len(server.list_documents(category="日記")),1)
                self.assertTrue(server.delete_document(results[0]["id"]))
                self.assertEqual(server.search("振り返り"),[])

    def test_invalid_backup_does_not_write_partial_data(self):
        with tempfile.TemporaryDirectory() as d:
            with patch.object(server,"BASE",Path(d)),patch.object(server,"DB",Path(d)/"db.sqlite"):
                invalid={"version":1,"habits":[],
                         "entries":{"2026-10-10":{"text":"valid"},
                                    "2026-02-30":{"text":"invalid"}}}
                with self.assertRaises(ValueError):server.import_daymark_backup(invalid)
                self.assertEqual(server.list_documents(),[])


if __name__=="__main__":unittest.main()
