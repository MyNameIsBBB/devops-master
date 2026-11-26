# Rollback and backup
Tags: rollback, revert, backup, restore, volume, tar, cron
- Keep the previous image tag before each deploy; roll back by redeploying that tag.
- Git revert + redeploy works when the image is built from the repo on each deploy.
- Backups: a volume tar is only useful after a test restore. Test restores periodically.
- Never delete volumes as a "fix"; ask the user first.
