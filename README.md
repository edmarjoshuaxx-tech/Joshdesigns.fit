# Add a project

`projects/template/` matches the other project pages. Copy that one folder, then swap the picture and the placeholder text.

## Copy the folder

1. Copy `projects/template/` to `projects/your-project-name/`.
2. Replace `cover.jpg` with the project image. Add more pictures beside it if you need them.
3. In the new `index.html`, replace `[PROJECT TITLE]`, the one-line story, `[LOCATION]`, `[YEAR]`, `[CATEGORY]`, `[SCOPE]`, `[ROLE, e.g. Designer / Modeler]`, and the two description paragraphs. Update the canonical URL and the Open Graph URL to `https://joshdesigns.fit/projects/your-project-name/`. Point the “Next project” link at another project.
4. In `projects.html`, copy the template card. Point the link at `projects/your-project-name/` and the image at `projects/your-project-name/cover.jpg`. Set `data-category` to `architecture`, `revit`, or `renderings`, and replace `[CATEGORY]`, `[LOCATION]`, `[YEAR]`, and `[SCOPE]`.
5. In `sitemap.xml`, copy the template `<url>` block and set `<loc>` to `https://joshdesigns.fit/projects/your-project-name/`.

## Or copy one file

Copy `projects/project-1.html` to `projects/project-7.html` and copy `images/project-1-01.jpg` to `images/project-7-01.jpg`. Swap the image and the same placeholders, then add a card and a sitemap URL the same way. Use this when the new page should sit next to `project-1.html` through `project-6.html`.
