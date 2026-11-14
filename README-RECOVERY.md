# Soma Pamoja activity recovery files

Copy these files into the restored complete API tree:

- api/app/activity.py
- api/app/activity_events.py

Do not replace the complete API folder with this ZIP.

The hardened auth overlay must be restored separately from:

```bash
cp ../soma-pamoja-before-v3/api/app/auth.py api/app/auth.py
```

After copying, verify and run the tests before Docker.
