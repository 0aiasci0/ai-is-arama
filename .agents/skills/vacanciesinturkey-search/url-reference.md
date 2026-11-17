# Vacancies in Turkey — endpoints and parsing anchors (measured 2026-11-17)

Site: WordPress + WP Job Manager, Cloudflare in front (no challenge observed).

## Search

`POST https://vacanciesinturkey.com/jm-ajax/get_listings/` (form-encoded; the call the site's search box makes)

| Field | Value |
|---|---|
| `search_keywords` | query |
| `search_location` | free text (site-side) |
| `per_page` | 50 |
| `page` | 1-based |
| `orderby` / `order` | `date` / `DESC` |

Response JSON: `found_jobs` (bool), `showing` ("Search completed. Found 28 matching records."),
`max_num_pages`, `html` (the `<li>` cards).

Card anchors: `<li class="post-<id> job_listing … status-<publish|expired> …">`, `<a href>` (posting URL;
expired postings use `/?post_type=job_listing&p=<id>`), `<h3>` title, `.company`, `.location`, `<time>`.

Measured: `analyst` → 28 records, 17 `status-expired`. The RSS feed
`/?feed=job_feed&search_keywords=…` returns only 10 items and no status; not used.
WP REST `/wp-json/wp/v2/job-listings` returned 0 items.

## Posting page

`GET /job/<slug>/` (or `/?post_type=job_listing&p=<id>`). A `<script type="application/ld+json">`
block with `@type: JobPosting`: `title`, `hiringOrganization.name`, `occupationalCategory`,
`employmentType`, `datePosted`, `validThrough`, `jobLocation.address.addressLocality`, `description`
(entity-encoded HTML).

- Expired postings: no JobPosting block; page shows "This listing has expired." and `status-expired`.
- `baseSalary` = 1500 USD monthly on every posting checked → placeholder, ignored.
- `addressLocality` is unreliable: "Analyst, Benelux" → "Van, Turkey"; Canada-remote postings → "Çan, Turkey";
  some postings carry free text there ("GIZ Türkiye – CV Template.doc", "Görev Yeri: Adana").

## robots.txt

```
Disallow: /wp-admin/  /wp-includes/  /xmlrpc.php  /wp-content/plugins/  /wp-content/themes/  /?s=  /readme.html
Allow: /wp-admin/admin-ajax.php
```
