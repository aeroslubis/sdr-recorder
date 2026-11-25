"""Startup preflight requirement checks for SDR-Recorder NVR."""
import importlib.util
import logging
import os
import re
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

REQUIRED_PYTHON_PACKAGES = (
    "fastapi",
    "uvicorn",
    "pydantic",
    "bcrypt",
    "jwt",
    "numpy",
    "websockets",
    "httpx",
)

_SYS_DRIVER_CONTROL_FILES = {"bind", "unbind", "uevent", "new_id", "remove_id", "module"}
_BLACKLIST_RE = re.compile(r"^\s*blacklist\s+dvb_usb_rtl28xxu\b")


def _check_python_packages() -> Dict[str, Any]:
    missing = [pkg for pkg in REQUIRED_PYTHON_PACKAGES if importlib.util.find_spec(pkg) is None]
    if missing:
        return {
            "name": "python_packages",
            "status": "fail",
            "required": True,
            "detail": f"Missing Python packages: {', '.join(missing)}",
            "remediation": "pip install -r requirements.txt",
        }
    return {
        "name": "python_packages",
        "status": "pass",
        "required": True,
        "detail": f"All {len(REQUIRED_PYTHON_PACKAGES)} required Python packages installed",
        "remediation": None,
    }


def _check_rtl_sdr_binaries() -> Dict[str, Any]:
    rtl_fm = shutil.which("rtl_fm")
    rtl_test = shutil.which("rtl_test")
    missing = []
    if not rtl_fm:
        missing.append("rtl_fm")
    if not rtl_test:
        missing.append("rtl_test")

    if missing:
        return {
            "name": "rtl_sdr",
            "status": "fail",
            "required": True,
            "detail": f"Missing rtl-sdr binaries: {', '.join(missing)}",
            "remediation": "sudo apt-get update && sudo apt-get install -y rtl-sdr",
        }
    return {
        "name": "rtl_sdr",
        "status": "pass",
        "required": True,
        "detail": f"rtl_fm={rtl_fm}, rtl_test={rtl_test}",
        "remediation": None,
    }


def _check_ffmpeg_binary() -> Dict[str, Any]:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return {
            "name": "ffmpeg",
            "status": "warn",
            "required": False,
            "detail": "ffmpeg binary not found; recordings will fall back to uncompressed .wav",
            "remediation": "sudo apt-get update && sudo apt-get install -y ffmpeg",
        }
    return {
        "name": "ffmpeg",
        "status": "pass",
        "required": False,
        "detail": f"ffmpeg={ffmpeg}",
        "remediation": None,
    }


def _is_dvb_usb_blacklisted(modprobe_dir: Path) -> bool:
    if not modprobe_dir.exists() or not modprobe_dir.is_dir():
        return False
    try:
        conf_files = sorted(modprobe_dir.glob("*.conf"))
    except OSError:
        return False

    for conf in conf_files:
        try:
            for line in conf.read_text(encoding="utf-8", errors="ignore").splitlines():
                stripped = line.split("#", 1)[0]
                if _BLACKLIST_RE.match(stripped):
                    return True
        except OSError:
            continue
    return False


def _get_bound_dvb_usb_devices(sys_driver_dir: Path) -> List[str]:
    if not sys_driver_dir.exists() or not sys_driver_dir.is_dir():
        return []
    bound: List[str] = []
    try:
        for entry in sorted(sys_driver_dir.iterdir()):
            if entry.name not in _SYS_DRIVER_CONTROL_FILES:
                bound.append(entry.name)
    except OSError:
        return []
    return bound


def _is_dvb_usb_module_loaded(sys_module_dir: Path, proc_modules_path: Path) -> bool:
    if sys_module_dir.exists():
        return True
    if proc_modules_path.exists():
        try:
            for line in proc_modules_path.read_text(encoding="utf-8", errors="ignore").splitlines():
                if line.split(None, 1)[0] == "dvb_usb_rtl28xxu":
                    return True
        except OSError:
            pass
    return False


def _check_dvb_usb_blacklist(
    modprobe_dir: Path,
    sys_driver_dir: Path,
    sys_module_dir: Path,
    proc_modules_path: Path,
) -> Dict[str, Any]:
    bound = _get_bound_dvb_usb_devices(sys_driver_dir)
    loaded = _is_dvb_usb_module_loaded(sys_module_dir, proc_modules_path)
    blacklisted = _is_dvb_usb_blacklisted(modprobe_dir)

    if bound or loaded:
        reasons = []
        if loaded:
            reasons.append("kernel module dvb_usb_rtl28xxu is loaded")
        if bound:
            reasons.append(f"claiming USB interface(s): {', '.join(bound)}")
        return {
            "name": "dvb_usb_blacklist",
            "status": "fail",
            "required": True,
            "detail": f"dvb_usb_rtl28xxu active ({'; '.join(reasons)})",
            "remediation": (
                "echo 'blacklist dvb_usb_rtl28xxu' | sudo tee /etc/modprobe.d/blacklist-rtlsdr.conf "
                "&& sudo rmmod dvb_usb_rtl28xxu"
            ),
        }

    if blacklisted:
        return {
            "name": "dvb_usb_blacklist",
            "status": "pass",
            "required": True,
            "detail": "dvb_usb_rtl28xxu is blacklisted and not loaded",
            "remediation": None,
        }

    return {
        "name": "dvb_usb_blacklist",
        "status": "warn",
        "required": False,
        "detail": (
            "dvb_usb_rtl28xxu is not loaded, but no blacklist rule found in /etc/modprobe.d "
            "(normal inside containers if blacklisted on host)"
        ),
        "remediation": "echo 'blacklist dvb_usb_rtl28xxu' | sudo tee /etc/modprobe.d/blacklist-rtlsdr.conf",
    }


def _check_storage_writable(storage_dir: Path) -> Dict[str, Any]:
    try:
        storage_dir.mkdir(parents=True, exist_ok=True)
        if os.access(str(storage_dir), os.W_OK | os.X_OK):
            return {
                "name": "storage_writable",
                "status": "pass",
                "required": True,
                "detail": f"Storage directory writable: {storage_dir}",
                "remediation": None,
            }
        return {
            "name": "storage_writable",
            "status": "fail",
            "required": True,
            "detail": f"Storage directory is not writable: {storage_dir}",
            "remediation": f"chmod u+rwx {storage_dir}",
        }
    except OSError as exc:
        return {
            "name": "storage_writable",
            "status": "fail",
            "required": True,
            "detail": f"Cannot prepare storage directory {storage_dir}: {exc}",
            "remediation": None,
        }


def run_preflight_checks(
    storage_dir: Union[str, Path],
    modprobe_dir: Union[str, Path] = "/etc/modprobe.d",
    sys_driver_dir: Union[str, Path] = "/sys/bus/usb/drivers/dvb_usb_rtl28xxu",
    sys_module_dir: Union[str, Path] = "/sys/module/dvb_usb_rtl28xxu",
    proc_modules_path: Union[str, Path] = "/proc/modules",
) -> Dict[str, Any]:
    """Run startup checks for Python packages, rtl-sdr binaries, ffmpeg, dvb_usb blacklist, and storage."""
    checks = [
        _check_python_packages(),
        _check_rtl_sdr_binaries(),
        _check_ffmpeg_binary(),
        _check_dvb_usb_blacklist(
            modprobe_dir=Path(modprobe_dir),
            sys_driver_dir=Path(sys_driver_dir),
            sys_module_dir=Path(sys_module_dir),
            proc_modules_path=Path(proc_modules_path),
        ),
        _check_storage_writable(Path(storage_dir)),
    ]
    failed = [c["name"] for c in checks if c["status"] == "fail"]
    warnings = [c["name"] for c in checks if c["status"] == "warn"]
    return {
        "ok": len(failed) == 0,
        "checks": checks,
        "failed": failed,
        "warnings": warnings,
    }


def format_preflight_report(report: Dict[str, Any]) -> str:
    """Format preflight check results as a readable startup checklist."""
    status_tag = {"pass": "PASS", "warn": "WARN", "fail": "FAIL"}
    lines = ["=== Startup Requirements Check ==="]
    for check in report.get("checks", []):
        tag = status_tag.get(check["status"], check["status"].upper())
        lines.append(f"[{tag}] {check['name']}: {check['detail']}")
        if check["status"] in ("warn", "fail") and check.get("remediation"):
            lines.append(f"       Fix: {check['remediation']}")
    summary = "ALL REQUIRED CHECKS PASSED" if report.get("ok") else f"FAILED ({len(report.get('failed', []))} missing/blocked)"
    lines.append(f"=== Preflight Summary: {summary} ===")
    return "\n".join(lines)


def log_preflight_report(
    report: Dict[str, Any],
    target_logger: Optional[logging.Logger] = None,
) -> None:
    """Print preflight report to stdout and log errors/warnings to dongle & app loggers."""
    formatted = format_preflight_report(report)
    print(formatted, flush=True)

    dongle_logger = logging.getLogger("backend.sdr.dongle")
    app_logger = target_logger or logging.getLogger(__name__)
    for check in report.get("checks", []):
        msg = f"Preflight [{check['status'].upper()}] {check['name']}: {check['detail']}"
        if check["status"] == "fail":
            app_logger.error(msg)
            if check["name"] in ("rtl_sdr", "dvb_usb_blacklist"):
                dongle_logger.warning(msg)
        elif check["status"] == "warn":
            app_logger.warning(msg)
            if check["name"] in ("rtl_sdr", "dvb_usb_blacklist"):
                dongle_logger.warning(msg)
