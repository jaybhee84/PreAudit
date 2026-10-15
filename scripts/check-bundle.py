"""Verify the native engine is present and can process a request without user data."""
from pathlib import Path
import json, subprocess, sys, tempfile
root=Path(__file__).resolve().parents[1]
if sys.platform=='win32':
    engine=root/'release/PBB PreAudit-win32-x64/resources/backend/roster-engine.exe'
else:
    matches=list((root/'release').glob('PBB PreAudit-darwin-*/PBB PreAudit.app/Contents/Resources/backend/roster-engine'))
    if len(matches)!=1: raise SystemExit('Expected exactly one macOS bundle')
    engine=matches[0]
assert engine.is_file(), f'Missing engine: {engine}'
with tempfile.TemporaryDirectory() as folder:
    result=subprocess.run([str(engine)],input=json.dumps({'pay_folder':folder,'roster_folder':folder,'history_folder':None}),text=True,capture_output=True,timeout=60)
    payload=json.loads(result.stdout)
    assert isinstance(payload,dict) and ('error' in payload or 'results' in payload), result.stderr
print('Native bundled engine starts and returns structured JSON')
