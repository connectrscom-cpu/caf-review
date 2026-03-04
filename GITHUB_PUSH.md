# Push CAF Review Console to GitHub

Your project is committed locally. To put it on GitHub:

## 1. Create a new repository on GitHub

- Go to [github.com/new](https://github.com/new)
- **Repository name:** e.g. `caf-review` or `CAF`
- **Public**, no README / .gitignore / license (this repo already has them)
- Click **Create repository**

## 2. Add remote and push (from the CAF folder)

Replace `YOUR_USERNAME` and `YOUR_REPO` with your GitHub username and repo name:

```bash
cd "c:\Users\migue\OneDrive\Ambiente de Trabalho\Pessoal\Cursor\CAF"

git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

Example if your user is `migue` and repo is `caf-review`:

```bash
git remote add origin https://github.com/migue/caf-review.git
git branch -M main
git push -u origin main
```

Done. Your code will be on GitHub and you can clone or deploy from there.
