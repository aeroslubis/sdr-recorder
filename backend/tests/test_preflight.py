"""Tests for backend startup preflight requirement checks."""
from unittest.mock import patch
from fastapi.testclient import TestClient

from backend.main import create_app


def test_preflight_detects_missing_rtlsdr_and_active_dvb_usb_driver(tmp_path):
    from backend.utils.preflight import run_preflight_checks

    modprobe_dir = tmp_path / "modprobe.d"
    modprobe_dir.mkdir()
    sys_driver_dir = tmp_path / "dvb_usb_rtl28xxu"
    sys_driver_dir.mkdir()
    (sys_driver_dir / "1-5.2:1.0").symlink_to(tmp_path)
    sys_module_dir = tmp_path / "sys_module_dvb"
    sys_module_dir.mkdir()
    proc_modules = tmp_path / "proc_modules"
    proc_modules.write_text("dvb_usb_rtl28xxu 40960 0 - Live 0x00000000\n")

    def fake_which(cmd: str):
        if cmd == "ffmpeg":
            return "/usr/bin/ffmpeg"
        return None  # rtl_fm and rtl_test missing

    with patch("backend.utils.preflight.shutil.which", side_effect=fake_which):
        report = run_preflight_checks(
            storage_dir=tmp_path / "storage",
            modprobe_dir=modprobe_dir,
            sys_driver_dir=sys_driver_dir,
            sys_module_dir=sys_module_dir,
            proc_modules_path=proc_modules,
        )

    assert report["ok"] is False
    by_name = {c["name"]: c for c in report["checks"]}
    assert by_name["rtl_sdr"]["status"] == "fail"
    assert "rtl_fm" in by_name["rtl_sdr"]["detail"]
    assert "rtl_test" in by_name["rtl_sdr"]["detail"]
    assert by_name["dvb_usb_blacklist"]["status"] == "fail"
    assert "dvb_usb_rtl28xxu" in by_name["dvb_usb_blacklist"]["detail"]
    assert by_name["ffmpeg"]["status"] == "pass"
    assert by_name["python_packages"]["status"] == "pass"
    assert by_name["storage_writable"]["status"] == "pass"


def test_preflight_passes_when_all_requirements_and_blacklist_met(tmp_path):
    from backend.utils.preflight import run_preflight_checks, format_preflight_report

    modprobe_dir = tmp_path / "modprobe.d"
    modprobe_dir.mkdir()
    (modprobe_dir / "blacklist-rtlsdr.conf").write_text("# comment\nblacklist dvb_usb_rtl28xxu\n")
    sys_driver_dir = tmp_path / "nonexistent_driver"
    sys_module_dir = tmp_path / "nonexistent_module"
    proc_modules = tmp_path / "proc_modules"
    proc_modules.write_text("usbcore 300000 1 - Live 0x00000000\n")

    with patch("backend.utils.preflight.shutil.which", side_effect=lambda cmd: f"/usr/bin/{cmd}"):
        report = run_preflight_checks(
            storage_dir=tmp_path / "storage",
            modprobe_dir=modprobe_dir,
            sys_driver_dir=sys_driver_dir,
            sys_module_dir=sys_module_dir,
            proc_modules_path=proc_modules,
        )

    assert report["ok"] is True
    assert report["failed"] == []
    by_name = {c["name"]: c for c in report["checks"]}
    assert by_name["rtl_sdr"]["status"] == "pass"
    assert by_name["dvb_usb_blacklist"]["status"] == "pass"
    assert by_name["ffmpeg"]["status"] == "pass"
    assert by_name["python_packages"]["status"] == "pass"
    assert by_name["storage_writable"]["status"] == "pass"

    banner = format_preflight_report(report)
    assert "rtl_sdr" in banner
    assert "dvb_usb_blacklist" in banner


def test_preflight_warns_without_failing_in_container_when_driver_not_loaded_and_no_modprobe_entry(tmp_path):
    from backend.utils.preflight import run_preflight_checks

    modprobe_dir = tmp_path / "modprobe.d"
    modprobe_dir.mkdir()
    proc_modules = tmp_path / "proc_modules"
    proc_modules.write_text("usbcore 300000 1 - Live 0x00000000\n")

    with patch("backend.utils.preflight.shutil.which", side_effect=lambda cmd: f"/usr/bin/{cmd}"):
        report = run_preflight_checks(
            storage_dir=tmp_path / "storage",
            modprobe_dir=modprobe_dir,
            sys_driver_dir=tmp_path / "missing_driver",
            sys_module_dir=tmp_path / "missing_module",
            proc_modules_path=proc_modules,
        )

    assert report["ok"] is True
    by_name = {c["name"]: c for c in report["checks"]}
    assert by_name["dvb_usb_blacklist"]["status"] == "warn"


def test_preflight_ignores_commented_blacklist_line(tmp_path):
    from backend.utils.preflight import run_preflight_checks

    modprobe_dir = tmp_path / "modprobe.d"
    modprobe_dir.mkdir()
    (modprobe_dir / "blacklist-rtlsdr.conf").write_text("# blacklist dvb_usb_rtl28xxu\n")
    proc_modules = tmp_path / "proc_modules"
    proc_modules.write_text("")

    with patch("backend.utils.preflight.shutil.which", side_effect=lambda cmd: f"/usr/bin/{cmd}"):
        report = run_preflight_checks(
            storage_dir=tmp_path / "storage",
            modprobe_dir=modprobe_dir,
            sys_driver_dir=tmp_path / "missing_driver",
            sys_module_dir=tmp_path / "missing_module",
            proc_modules_path=proc_modules,
        )

    by_name = {c["name"]: c for c in report["checks"]}
    assert by_name["dvb_usb_blacklist"]["status"] == "warn"


def test_startup_runs_preflight_and_exposes_health_status(tmp_path):
    import pytest

    db_file = str(tmp_path / "preflight_test.db")
    fake_report = {
        "ok": False,
        "checks": [
            {
                "name": "rtl_sdr",
                "status": "fail",
                "required": True,
                "detail": "Missing rtl_fm, rtl_test",
                "remediation": "apt-get install -y rtl-sdr",
            }
        ],
        "failed": ["rtl_sdr"],
        "warnings": [],
    }

    with patch("backend.main.run_preflight_checks", return_value=fake_report), \
         patch("backend.sdr.receiver.is_hardware_available", return_value=False), \
         patch("backend.main.SDRReceiver.start", return_value=None), \
         patch("backend.main.SDRReceiver.stop", return_value=None):
        app = create_app(db_path=db_file, test_mode=False)
        with TestClient(app) as client:
            res = client.get("/api/health")
            assert res.status_code == 200
            data = res.json()
            assert data["requirements_ok"] is False
            assert data["preflight"]["failed"] == ["rtl_sdr"]

    # Strict mode raises during lifespan when requirements fail
    with patch("backend.main.run_preflight_checks", return_value=fake_report), \
         patch("backend.main.config.STRICT_REQUIREMENTS", True), \
         patch("backend.sdr.receiver.is_hardware_available", return_value=False):
        strict_app = create_app(db_path=str(tmp_path / "strict.db"), test_mode=False)
        with pytest.raises(RuntimeError, match="Startup requirements check failed"):
            with TestClient(strict_app):
                pass


def test_run_cli_check_flag_exits_with_preflight_status(monkeypatch, capsys):
    import sys
    import pytest
    from backend import run as run_mod

    monkeypatch.setattr(sys, "argv", ["run.py", "--check"])
    ok_report = {
        "ok": True,
        "checks": [
            {
                "name": "rtl_sdr",
                "status": "pass",
                "required": True,
                "detail": "rtl_fm=/usr/bin/rtl_fm, rtl_test=/usr/bin/rtl_test",
                "remediation": None,
            }
        ],
        "failed": [],
        "warnings": [],
    }
    with patch("backend.utils.preflight.run_preflight_checks", return_value=ok_report):
        with pytest.raises(SystemExit) as exc_info:
            run_mod.main()
        assert exc_info.value.code == 0

    captured = capsys.readouterr()
    assert "ALL REQUIRED CHECKS PASSED" in captured.out
