# PBB PreAudit Desktop

Open release/PBB PreAudit-win32-x64/PBB PreAudit.exe or Start PreAudit.cmd. The packaged Electron app includes its matching engine. Keep the complete release folder together when copying it.

## Sources

- PBB payfiles: C:/Users/DepEd/Downloads/PBB 2024 WITH IUs
- Current roster: C:/Users/DepEd/Desktop/Psipop/Current/09 SEPTEMBER 2026
- Historical snapshots: C:/Users/DepEd/Desktop/Psipop/Previous Year

Current must contain a single roster month. The historical folder contains December 2024-June 2025; monthly PDF names or parent folders identify their dates. ZIP files must be extracted. PDF page subtotals are reconciled and unverified extraction stays visible. All original files are read only; nothing is uploaded.

## Match and review

Run Compare names. Filter by identity status, Result, IU/SDO, payfile, name, month, or monthly finding. Right-click a row and select Show matches, or use the row button. Search current PSIPOP, historical snapshots, or retirement orders. Same person confirms identity. Different people rejects a suggestion. Once all suggestions are rejected and extraction has no reported problems, the employee is classified as retired under the configured roster rule; this is not an HR retirement order. Repeated payfile names remain flagged separately.

Identity decisions, notes, classification, short-service reason, and HR service verification are saved locally under %APPDATA%/PBB PreAudit Reviews/decisions.json. Changed names, missing identity targets, and changed service/salary inputs require the relevant verification again. You can undo a saved decision. The original workbook is never changed.

## PBB service pre-check

Official basis: EO 61 TWG Memorandum Circular No. 2026-1, items 7.10-7.11 and Table 6, plus the supplied DepEd eligibility memorandum. Official DBM source:
https://www.dbm.gov.ph/wp-content/uploads/Issuances/2026/Resolution/RESOLUTION-NO.-2026-1-and-MEMORANDUM-CIRCULAR-NO.-2026-1-updated.pdf

Retirement is NOT an automatic disqualification. At least 9 qualifying service months may receive the full grant. With an authorized short-service reason, 8 to under 9 months uses 90%, 7 to under 8 uses 80%, 6 to under 7 uses 70%, 5 to under 6 uses 60%, 4 to under 5 uses 50%, and 3 to under 4 uses 40%. Under 3 months does not meet the minimum. These percentages multiply the full PBB amount.

Service months come from the source Form 1.0 column labeled Months in Service in 2024. Monthly snapshots are supporting evidence, not a substitute for actual service records and not a blanket eligibility requirement for retirees. A missing snapshot triggers review, not automatic disqualification. Date/service conflicts are flagged. Retirees and other short-service cases require an HR service-record verification and review note. An authorized short-service reason can be selected in the review screen.

Eligible is a provisional SERVICE pre-check result, not a payment approval. Performance rating, SALN, cash advances, case/leave status, agency eligibility, and isolation conditions still need validation. Pending identifies missing or conflicting evidence. Click any result to see the reason and monthly findings. Indicative PBB uses the payfile monthly salary, DepEd's 48.75% rate, and the service factor; salary basis must be verified. A payfile-amount mismatch is flagged, never overwritten.

## CSV

Download filtered CSV exports all filtered entries across pagination. It includes result, reasons, service months, factor, grant type, indicative amount, HR verification, seven monthly snapshot columns, and saved-review details. Full TINs are not exported. Excel Data > Filter can filter the CSV columns; CSV itself cannot store interactive Excel filter controls.

## Optional TIN reference

Select an Excel or CSV file with Full Name and TIN columns. Reference names must match payfile names after normalization; a TIN is never inferred from a similar name. Matching uses the 9-digit TIN proper and excludes a supplied branch suffix. Invalid/conflicting TINs require review. No TIN column exists in the supplied PBB forms.

## Development

Install requirements.txt and npm ci. Use npm run dev or npm start. Run npm test for regression tests.

Build the engine, then package:

    python -m PyInstaller --noconfirm --onedir --console --name roster-engine --distpath build-engine --workpath tmp/pyinstaller --specpath tmp roster.py
    npm run package

The packaged executable accepts --smoke-test for a real-folder UI workflow check; test reviews use an isolated temporary review store.

## Windows and macOS builds

GitHub Actions builds Windows x64, macOS Intel, and macOS Apple Silicon on native runners. Every main-branch push, pull request, or manual Actions run tests and packages all three. Download ZIP files from the run's Artifacts section. Extract the complete Windows ZIP before opening PBB PreAudit.exe. On macOS extract and move PBB PreAudit.app into Applications.

Push a version tag (for example `git tag v1.0.0` then `git push origin v1.0.0`) to publish all three ZIP files in GitHub Releases after successful builds. Builds are unsigned; macOS distribution is not Apple notarized and may require approval in System Settings > Privacy & Security.

To build locally on the target operating system, install Node.js 22 and Python 3.12, run `npm ci`, `python -m pip install -r requirements-build.txt`, then `npm run build`. Run `python scripts/check-bundle.py` to verify the bundled native engine. Each architecture must be built with matching Node.js and Python architectures. Packaging does not copy any payroll, PSIPOP, TIN, or saved-decision files.

The View eligibility memo button opens the official DBM guidelines when no memorandum is bundled. To include a local PDF in your own build, set PREAUDIT_MEMO to its absolute path before packaging; the PDF remains excluded from Git.

Pre-audited includes unique exact-name or TIN matches whose service checks pass automatically, plus manually confirmed matches whose service checks pass. Each row identifies Automatic match or Manually confirmed. Matched counts identity matches still awaiting service checks. Ambiguous identities and incomplete service evidence remain pending.

Version 1.0.0 uses the supplied Pre-Audit PBB artwork for the sidebar, window, Windows executable, and macOS application icon. Save service review stores classification, short-service reason, HR verification, and notes without changing a saved identity decision. HR verification cannot resolve conflicting TIN identities.
