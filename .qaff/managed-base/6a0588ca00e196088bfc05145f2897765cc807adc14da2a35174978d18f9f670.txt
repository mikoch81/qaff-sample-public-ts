# Input files for k6

Drop optional provider outputs in this folder before running generated
import helper scripts.

Expected filename pattern:

- `<app-id>.summary.json`

Examples:

- `client-web.summary.json`
- `demo-saas.summary.json`

The helper scripts skip missing files and import only files that exist.
