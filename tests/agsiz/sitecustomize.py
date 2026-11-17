"""Ağ engeli: tests/test_tr_pipeline.py alt süreçleri bu klasörü PYTHONPATH'e koyar.

Python başlarken sitecustomize'ı yükler; her soket bağlantısı RuntimeError("AG ENGELI") verir.
Böylece betik sınamaları yanlışlıkla gerçek portala istek atamaz (2026-11-17'de üç kez oldu).
"""
import socket

_orijinal = socket.socket.connect


def _engelle(self, *a, **k):
    raise RuntimeError("AG ENGELI: sınamada ağ bağlantısı yasak")


socket.socket.connect = _engelle
socket.socket.connect_ex = _engelle
socket.create_connection = lambda *a, **k: _engelle(None)
