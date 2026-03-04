# Push CAF Review Console to GitHub

**This project uses the [connectrscom-cpu](https://github.com/connectrscom-cpu) GitHub account only.** Other repos can keep using your default account (e.g. Ecletica-web).

- **Remote:** `origin` → `https://github.com/connectrscom-cpu/caf-review.git`
- **Local config:** `credential.useHttpPath = true` so Git stores credentials per repo URL; connectrscom-cpu login applies only to this project.

## 1. Create the repository (one-time)

- Go to [github.com/new](https://github.com/new) **while logged in as connectrscom-cpu**
- **Owner:** `connectrscom-cpu` · **Repository name:** `caf-review`
- **Public**; leave README / .gitignore / license **unchecked** · Create repository

## 2. Push (from the CAF folder)

```bash
cd "c:\Users\migue\OneDrive\Ambiente de Trabalho\Pessoal\Cursor\CAF"

git push -u origin main
```

When prompted, sign in as **connectrscom-cpu** (or use a [personal access token](https://github.com/settings/tokens) for that account). That credential will be used only for this repo.
