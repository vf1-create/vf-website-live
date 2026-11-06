The new Virtual Fudge website - complete, ready to load
=======================================================

What this is: the whole site in one folder. index.html (the site), a page
for every industry, project and blog post, the assets folder (all
pictures, films and code), favicon.ico, robots.txt,
the sitemaps, 404.html, and a folder for every address the old site had,
so old links, bookmarks and Google results keep working.

How to load it on Hostinger:

1. Back up the current website files first (Hostinger also keeps its own
   backups), then remove the old site's files from the website folder
   (public_html) - including the hidden .htaccess file.

2. Put everything in this folder into public_html, exactly as it is,
   hidden files included (there is a small .htaccess in here that shows
   the right "page not found" page).

3. Done. The moment the files are in, virtualfudge.com shows the new
   site - so load it at the moment you want to launch.

Good to know:
- No database, no WordPress, no installation. Files only.
- Nothing in the domain or email settings needs touching.
- To go back: restore the backup from step 1.
- The same files are on GitHub (vf-website-live, branch hostinger), which
  Hostinger can deploy by itself; this zip is the fallback.
- The .htaccess also sends www.virtualfudge.com and http:// to
  https://virtualfudge.com (the old WordPress did that and goes with it).
