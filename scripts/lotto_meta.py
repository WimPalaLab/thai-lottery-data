"""ค่าคงที่, การอ่าน config และ hash ของโมเดล (ไลบรารีมาตรฐานเท่านั้น
เพื่อให้ build_site.py ตรวจความสดของผล backtest ได้โดยไม่ต้องติดตั้ง numpy)"""
import hashlib
import json
import os

SIX_PRIZES = ["first", "second", "third", "fourth", "fifth"]
GROUPS = ["digit", "position", "pattern", "time_window", "distribution", "statistical"]

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CONFIG_PATH = os.path.join(ROOT, "config", "model.json")
CODE_FILES = ["lotto_model.py", "lotto_backtest.py"]


def validate_config(cfg):
    w = cfg["feature_weights"]
    if set(w) != set(GROUPS) or any(v < 0 for v in w.values()) or abs(sum(w.values()) - 1) > 1e-9:
        raise ValueError("feature_weights ต้องมีครบทุกกลุ่ม ไม่ติดลบ และรวมกันได้ 1")
    if not cfg["hybrid_experiments"]:
        raise ValueError("ต้องมี hybrid_experiments อย่างน้อย 1 ชุด")
    for k, v in cfg["hybrid_experiments"].items():
        if not (isinstance(k, str) and k.isalnum() and 0 <= v <= 1):
            raise ValueError(f"hybrid weight {k} ต้องอยู่ระหว่าง 0–1")
    if cfg["default_experiment"] not in cfg["hybrid_experiments"]:
        raise ValueError("default_experiment ไม่อยู่ใน hybrid_experiments")
    counts = cfg["candidate_counts"]
    if set(counts) != set(SIX_PRIZES) or any(not 1 <= v <= cfg["report_top_n"] for v in counts.values()):
        raise ValueError("candidate_counts ต้องมีครบรางวัลที่ 1–5 และไม่เกิน report_top_n")
    if any(v <= 0 for v in cfg["smoothing"].values()):
        raise ValueError("ค่า smoothing ต้องมากกว่า 0")
    if cfg["time_window_draws"] < 1 or cfg["report_top_n"] > 100:
        raise ValueError("time_window_draws ต้อง ≥ 1 และ report_top_n ≤ 100")


def load_config(path=CONFIG_PATH):
    with open(path, encoding="utf-8") as f:
        cfg = json.load(f)
    validate_config(cfg)
    return cfg


def canonical_json(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def config_sha(cfg):
    return hashlib.sha256(canonical_json(cfg).encode("utf-8")).hexdigest()


def code_sha():
    """hash ของโค้ดโมเดล (ตัด CRLF ให้เหมือนกันทุกเครื่อง) ใช้ตรวจว่าผล backtest ที่ commit ไว้ยังตรงกับโค้ด"""
    h = hashlib.sha256()
    for name in CODE_FILES:
        with open(os.path.join(HERE, name), "rb") as f:
            h.update(f.read().replace(b"\r\n", b"\n"))
    return h.hexdigest()


def file_sha256(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def backtest_inputs(csv_path, cfg):
    """ค่าที่ต้องตรงกันจึงจะถือว่า backtest.json เป็นปัจจุบัน"""
    return {"csv_sha256": file_sha256(csv_path), "config_sha": config_sha(cfg), "code_sha": code_sha(),
            "model_version": cfg["model_version"]}
