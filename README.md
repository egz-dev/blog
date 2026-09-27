# Capa 8

Blog sobre ciberseguridad, privacidad y trucos informáticos construido con [MkDocs Material](https://squidfunk.github.io/mkdocs-material/) y escrito en Markdown.

## Empezar

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
mkdocs serve
```

Abre `http://127.0.0.1:8000`.

## Publicar una nota

Los artículos se cargan dinámicamente desde el repositorio
[`egz-dev/posts`](https://github.com/egz-dev/posts). Para publicar una nota, añade un
archivo `.md` allí y haz push. La página consultará los cambios automáticamente,
sin volver a ejecutar el build de este proyecto.

Cada nota puede incluir front matter compatible con MkDocs, por ejemplo:

```markdown
---
date: 2026-09-27
categories:
  - Ciberseguridad
---

# Título de la nota
```

El repositorio debe ser público para que la web estática pueda consultarlo sin
exponer credenciales.

Para generar la versión estática:

```bash
mkdocs build --strict
```
